// Public, display-only mirror of a user profile, used by the Wall of Fame leaderboard.
// The `users` collection holds private fields (email, mobile) and is owner-read-only,
// so the leaderboard reads this `publicProfiles` collection instead.
//
// Kept in sync entirely client-side (no Cloud Functions): each user may write only
// their own publicProfiles/{uid} doc (see firestore.rules). Every call here is
// best-effort and swallows errors — a mirror failure must NEVER block the primary
// users/{uid} write.

import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// (Initial identity mirror is written inline in firebase.js createUserProfile to
// avoid a circular import — firebase.js does not import this module.)

// Authoritative full upsert with ABSOLUTE values. Called on login from the real
// users/{uid} snapshot — this also backfills users who predate the mirror and
// corrects any drift from increment-on-missing-doc.
export const syncPublicProfile = async (uid, { displayName, photoURL, civicScore, issuesReported } = {}) => {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'publicProfiles', uid), {
      displayName: displayName ?? 'Citizen',
      photoURL: photoURL ?? null,
      civicScore: civicScore ?? 0,
      issuesReported: issuesReported ?? 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('[publicProfile sync]:', err);
  }
};

// Refresh just the display identity (name/photo) in the mirror — call right after
// a profile-affecting save (onboarding, profile edit) so the leaderboard reflects
// the change immediately instead of only after the user's next login.
export const mirrorPublicIdentity = async (uid, { displayName, photoURL } = {}) => {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'publicProfiles', uid), {
      displayName: displayName ?? 'Citizen',
      photoURL: photoURL ?? null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('[publicProfile identity]:', err);
  }
};

// Apply the same increment deltas that were just applied to users/{uid}.
// Only mirrors fields the leaderboard displays (civicScore, issuesReported).
export const bumpPublicProfile = async (uid, { civicScore, issuesReported } = {}) => {
  if (!uid) return;
  const payload = {};
  if (civicScore) payload.civicScore = increment(civicScore);
  if (issuesReported) payload.issuesReported = increment(issuesReported);
  if (Object.keys(payload).length === 0) return;
  payload.updatedAt = serverTimestamp();
  try {
    await setDoc(doc(db, 'publicProfiles', uid), payload, { merge: true });
  } catch (err) {
    console.error('[publicProfile bump]:', err);
  }
};
