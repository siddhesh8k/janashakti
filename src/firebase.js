import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
         getRedirectResult, signInAnonymously, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, initializeFirestore, connectFirestoreEmulator, persistentLocalCache,
         persistentMultipleTabManager, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Persistent IndexedDB cache → reads are served instantly from local cache on
// revisit (revalidated in the background), so navigating back to a screen feels
// instant instead of re-fetching from the network. Falls back to the default
// in-memory Firestore if IndexedDB is unavailable (e.g. private browsing).
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Auto-detect when the default WebChannel streaming transport is being blocked
    // (common on Android Chrome behind certain carrier/corporate networks & proxies)
    // and transparently fall back to HTTP long-polling. Without this, cached READS
    // still work but WRITES hang/error on those Android clients — which showed up as
    // "can't save profile edits on Android, fine on iOS/desktop". Safe on all
    // platforms: it's a no-op where WebChannel works.
    experimentalAutoDetectLongPolling: true,
  });
} catch (err) {
  console.error('[firestore cache]:', err);
  firestore = getFirestore(app);
}
export const db = firestore;

// Local development / deterministic E2E against the Firebase Emulator Suite. Enabled by
// VITE_FIREBASE_EMULATOR=1 — routes Auth + Firestore to the local emulators instead of the
// production project, so tests can sign up, write, and resolve issues without touching real
// data or quota. A no-op in normal builds (the flag is unset).
if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    console.info('[firebase] Using local emulators (auth:9099, firestore:8080)');
  } catch (e) {
    console.error('[firebase emulator]:', e.message);
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// An installed PWA runs in a standalone window. A Google sign-in POPUP cannot return
// its result to that window (there's no opener to postMessage back to) — on iOS this
// hangs/crashes the app and on desktop the popup is blocked — so in standalone mode we
// must use a full-page REDIRECT instead. matchMedia covers Android/desktop installed
// PWAs; navigator.standalone covers iOS Safari "Add to Home Screen".
const isStandalonePWA = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.matchMedia?.('(display-mode: fullscreen)')?.matches === true
    || window.matchMedia?.('(display-mode: minimal-ui)')?.matches === true
    || window.navigator?.standalone === true;
};

// Popup errors that mean "this environment can't do popups" — fall back to redirect.
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/popup-closed-by-user',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
]);

const createUserProfile = async (user, extra = {}) => {
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      // Returning user — refresh identity/auth fields ONLY. Never re-write the
      // score/gamification fields (doing so with merge:true would reset earned
      // civicScore/badges/streak to 0 on every sign-in).
      await setDoc(ref, {
        displayName: user.displayName || extra.displayName || snap.data().displayName || 'Citizen',
        email: user.email || snap.data().email || null,
        photoURL: user.photoURL || snap.data().photoURL || null,
        lastSeen: serverTimestamp(),
      }, { merge: true });
    } else {
      // Brand-new account — write full defaults.
      await setDoc(ref, {
        uid: user.uid,
        displayName: user.displayName || extra.displayName || 'Citizen',
        email: user.email || null,
        photoURL: user.photoURL || null,
        authMethod: extra.authMethod || 'google',
        civicScore: 0,
        issuesReported: 0,
        issuesVerified: 0,
        issuesResolved: 0,
        issuesShared: 0,
        // Collaboration-layer reputation counters
        issuesJoined: 0,
        evidenceUploaded: 0,
        updatesPosted: 0,
        verificationsGiven: 0,
        verificationAccuracy: 0,
        esgIssuesResolved: 0,
        totalPeopleImpacted: 0,
        sdgsContributed: [],
        rtiFiled: 0,
        badges: [],
        level: 'Newcomer',
        streak: 0,
        lastActiveDate: new Date().toISOString().split('T')[0],
        xHandle: '',
        linkedinUrl: '',
        city: '',
        affiliation: { role: 'civilian', orgId: null, orgName: null, orgType: null },
        notificationsSeenAt: null,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        onboardingComplete: false,
      }, { merge: true });
    }

    // Public, display-only mirror for the Wall of Fame leaderboard (identity only;
    // score is synced from the real profile on login). Inline to avoid a circular
    // import with utils/publicProfile.js. Best-effort — never block sign-in.
    await setDoc(doc(db, 'publicProfiles', user.uid), {
      displayName: user.displayName || extra.displayName || 'Citizen',
      photoURL: user.photoURL || null,
      // Initialize score fields ONLY for a brand-new account, so the leaderboard rank
      // query + display are consistent. NEVER write these for returning users — a
      // merge:true with 0 would wipe earned civicScore on every sign-in.
      ...(snap.exists() ? {} : { civicScore: 0, issuesReported: 0 }),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('[createUserProfile]:', err);
  }
};

export const signInWithGoogle = async () => {
  // Installed PWA → go straight to a full-page redirect (popups can't return here).
  if (isStandalonePWA()) {
    await signInWithRedirect(auth, googleProvider);
    return null; // page navigates away; completeRedirectSignIn() finishes on return.
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await createUserProfile(result.user, { authMethod: 'google' });
    return result.user;
  } catch (err) {
    // Popup unsupported/blocked in this browser context — fall back to redirect.
    if (POPUP_FALLBACK_CODES.has(err?.code)) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    console.error('[signInWithGoogle]:', err);
    throw err;
  }
};

// Completes a redirect-based Google sign-in after the app reloads, and provisions the
// user profile (the popup path does this inline; the redirect path lands here instead).
// Memoized so the many useAuth() consumers all share a single getRedirectResult call.
let redirectPromise = null;
export const completeRedirectSignIn = () => {
  if (!redirectPromise) {
    redirectPromise = (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          await createUserProfile(result.user, { authMethod: 'google' });
          return result.user;
        }
      } catch (err) {
        console.error('[completeRedirectSignIn]:', err);
      }
      return null;
    })();
  }
  return redirectPromise;
};

export const signInAsGuest = async () => {
  try {
    const result = await signInAnonymously(auth);
    await createUserProfile(result.user, {
      authMethod: 'anonymous',
      displayName: 'Anonymous Citizen',
    });
    return result.user;
  } catch (err) {
    console.error('[signInAsGuest]:', err);
    throw err;
  }
};

export const signUpWithEmail = async (email, password, displayName) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(result.user, { authMethod: 'email', displayName });
    return result.user;
  } catch (err) {
    console.error('[signUpWithEmail]:', err);
    throw err;
  }
};

export const signInWithEmail = async (email, password) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    console.error('[signInWithEmail]:', err);
    throw err;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('[logOut]:', err);
    throw err;
  }
};
