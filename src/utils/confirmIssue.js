import { runTransaction, doc, increment, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { POST_CONFIRMATION_THRESHOLD } from './social';

// Atomically add a user's confirmation to an issue (used by both "verify" and the
// duplicate-report path). Runs in a transaction so the social-amplification trigger
// fires EXACTLY ONCE — the confirmation that crosses the threshold sets a
// `socialQueued` flag inside the same transaction, so concurrent verifiers can't
// double-post.
//
// Returns: { added, alreadyConfirmed, newCount, shouldPost, issue }
//   - alreadyConfirmed: the user was already in confirmedBy (no write made)
//   - shouldPost: true for the single caller that should trigger the social post
//   - issue: the pre-update issue data (for building the post payload)
export const confirmIssue = async (issueId, uid) => {
  let result = { added: false, alreadyConfirmed: false, newCount: 0, shouldPost: false, issue: null };

  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'issues', issueId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Issue not found');
    const data = snap.data();

    if ((data.confirmedBy || []).includes(uid)) {
      result = { added: false, alreadyConfirmed: true, newCount: data.confirmations || 0,
                 shouldPost: false, issue: { id: issueId, ...data } };
      return;
    }

    const newCount = (data.confirmations || 0) + 1;
    const updates = {
      confirmations: increment(1),
      confirmedBy: arrayUnion(uid),
      pressureScore: increment(10),
    };

    const shouldPost = newCount >= POST_CONFIRMATION_THRESHOLD
      && data.socialConsent !== 'none'
      && !data.xPosted
      && !data.socialQueued;
    if (shouldPost) updates.socialQueued = true;

    tx.update(ref, updates);
    result = { added: true, alreadyConfirmed: false, newCount, shouldPost, issue: { id: issueId, ...data } };
  });

  return result;
};
