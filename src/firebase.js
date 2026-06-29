import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously,
         createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache,
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

const googleProvider = new GoogleAuthProvider();

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
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await createUserProfile(result.user, { authMethod: 'google' });
    return result.user;
  } catch (err) {
    console.error('[signInWithGoogle]:', err);
    throw err;
  }
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
