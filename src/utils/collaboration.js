// Civic collaboration layer — Join an issue, post updates/evidence, community-verify a
// resolution, and earn Community Reputation. ADDITIVE: it extends the existing issue +
// reputation systems (no representative/authority logic is touched).
//
// Reputation is written ONLY to the current user's own users/{uid} doc (+ public mirror) —
// Firestore rules forbid writing another user's doc, so the on-close reward for other
// contributors is claimed by each of them on view (claimCloseReward), never fanned out.
//
// Timeline + evidence are append-only SUBCOLLECTIONS (issues/{id}/timeline, /evidence) so
// base64 images never bloat the parent issue doc (1 MB limit) — CLAUDE.md: no Cloud Storage.

import { doc, getDoc, updateDoc, collection, addDoc, arrayUnion,
         increment, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { CIVIC_SCORE_POINTS } from '../constants/issueTypes';
import { bumpPublicProfile } from './publicProfile';
import { callGeminiVision } from './gemini';

// ── helpers ─────────────────────────────────────────────────────────────────────
export const isContributor = (issue, uid) =>
  !!uid && (issue?.contributors || []).some((c) => c.userId === uid);

export const isRemoved = (issue, uid) =>
  (issue?.removedUids || []).includes(uid);

// Pure: given a communityVerification block, return 'passed' | 'failed' | null (undecided).
// Partial votes count as half-positive. Needs >= threshold total votes to decide.
export const checkVerificationThreshold = (cv) => {
  const v = cv?.votes || {};
  const total = (v.yes || 0) + (v.no || 0) + (v.partial || 0);
  const threshold = cv?.threshold || 5;
  if (total < threshold) return null;
  const positive = ((v.yes || 0) + (v.partial || 0) * 0.5) / total;
  return positive >= (cv?.positiveRatio || 0.7) ? 'passed' : 'failed';
};

// Award reputation to the CURRENT user only (own doc + public mirror). counters: {field:delta}.
const award = async (uid, points, counters = {}) => {
  if (!uid) return;
  try {
    const update = { civicScore: increment(points) };
    for (const [k, d] of Object.entries(counters)) update[k] = increment(d);
    await updateDoc(doc(db, 'users', uid), update);
    await bumpPublicProfile(uid, { civicScore: points });
  } catch (e) { console.error('[collab award]:', e.message); }
};

// Append an immutable timeline event (serverTimestamp is set on the subcollection doc).
const appendTimeline = (issueId, event) =>
  addDoc(collection(db, 'issues', issueId, 'timeline'), { ...event, createdAt: serverTimestamp() })
    .catch((e) => console.error('[collab timeline]:', e.message));

// Seed the timeline with the reporter's creation event (called from ReportScreen on save).
export const recordIssueCreated = (issueId, user, message = 'reported this issue') =>
  appendTimeline(issueId, {
    userId: user?.uid, displayName: user?.displayName || 'Citizen', photoURL: user?.photoURL || null,
    action: 'issue_created', message,
  });

// ── Join / Leave ──────────────────────────────────────────────────────────────────
export const joinIssue = async (issueId, user, role) => {
  if (!user?.uid) return { error: 'Sign in to join.' };
  try {
    const ref = doc(db, 'issues', issueId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { error: 'Issue not found.' };
    const data = snap.data();
    if (data.userId === user.uid) return { error: "You reported this — you already lead it." };
    if (isRemoved(data, user.uid)) return { error: 'You were removed from this collaboration.' };
    if (data.collaborationOpen === false) return { error: 'Joining is closed for this issue.' };
    if (isContributor(data, user.uid)) return { alreadyJoined: true };

    const contributor = {
      userId: user.uid,
      displayName: user.displayName || 'Citizen',
      photoURL: user.photoURL || null,
      role: role || 'Resident',
      joinedAt: new Date().toISOString(), // serverTimestamp() is not allowed inside arrayUnion
    };
    await updateDoc(ref, { contributors: arrayUnion(contributor), updatedAt: serverTimestamp() });
    await appendTimeline(issueId, {
      userId: user.uid, displayName: contributor.displayName, photoURL: contributor.photoURL,
      action: 'contributor_joined', message: `joined as ${contributor.role}`,
    });
    await award(user.uid, CIVIC_SCORE_POINTS.JOIN_ISSUE, { issuesJoined: 1 });
    return { ok: true };
  } catch (e) { console.error('[joinIssue]:', e); return { error: 'Could not join. Try again.' }; }
};

export const leaveIssue = async (issueId, uid) => {
  if (!uid) return { error: 'Not signed in.' };
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'issues', issueId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Issue not found');
      const contributors = (snap.data().contributors || []).filter((c) => c.userId !== uid);
      tx.update(ref, { contributors, updatedAt: serverTimestamp() });
    });
    return { ok: true };
  } catch (e) { console.error('[leaveIssue]:', e); return { error: 'Could not leave.' }; }
};

// ── Owner / authority moderation ───────────────────────────────────────────────────
export const removeContributor = async (issueId, targetUid, actor) => {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'issues', issueId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Issue not found');
      const contributors = (snap.data().contributors || []).filter((c) => c.userId !== targetUid);
      tx.update(ref, { contributors, removedUids: arrayUnion(targetUid), updatedAt: serverTimestamp() });
    });
    // Timeline event must carry the actor's real uid (immutable-timeline rule requires
    // userId == auth.uid) — skip the audit line if we somehow don't have the actor.
    if (actor?.uid) {
      await appendTimeline(issueId, {
        userId: actor.uid, displayName: actor.displayName || 'Lead',
        action: 'update_posted', message: 'removed a contributor from the collaboration',
      });
    }
    return { ok: true };
  } catch (e) { console.error('[removeContributor]:', e); return { error: 'Could not remove.' }; }
};

export const setCollaborationOpen = async (issueId, open) => {
  try {
    await updateDoc(doc(db, 'issues', issueId), { collaborationOpen: !!open, updatedAt: serverTimestamp() });
    return { ok: true };
  } catch (e) { console.error('[setCollaborationOpen]:', e); return { error: 'Could not update.' }; }
};

// ── Updates / Evidence ──────────────────────────────────────────────────────────────
export const postUpdate = async (issueId, user, message) => {
  if (!user?.uid) return { error: 'Sign in.' };
  if (!message?.trim()) return { error: 'Write an update first.' };
  try {
    await appendTimeline(issueId, {
      userId: user.uid, displayName: user.displayName || 'Citizen', photoURL: user.photoURL || null,
      action: 'update_posted', message: message.trim(),
    });
    await updateDoc(doc(db, 'issues', issueId),
      { contributedUids: arrayUnion(user.uid), updatedAt: serverTimestamp() });
    await award(user.uid, CIVIC_SCORE_POINTS.POST_UPDATE, { updatesPosted: 1 });
    return { ok: true };
  } catch (e) { console.error('[postUpdate]:', e); return { error: 'Could not post.' }; }
};

// Gemini-Vision relevance gate (loophole #2). Fail-open on AI error so downtime never blocks
// a genuine contributor — but an explicit "not relevant" verdict stores the evidence WITHOUT
// awarding points.
const checkEvidenceRelevance = async (imageBase64, issueType) => {
  try {
    const out = await callGeminiVision(
      `This image is submitted as evidence for a civic issue of type "${issueType}". ` +
      `Is it plausibly a real photo of that kind of civic problem or its resolution (not a ` +
      `selfie, meme, screenshot, or unrelated image)? Return ONLY JSON: ` +
      `{"isRelevant": true/false, "reason": "short"}`,
      imageBase64,
    );
    return { isRelevant: out?.isRelevant !== false, reason: out?.reason || '' };
  } catch (e) {
    console.error('[evidence relevance]:', e.message);
    return { isRelevant: true, reason: 'auto-accepted (AI check unavailable)' };
  }
};

export const uploadEvidence = async (issueId, user, { imageBase64, type = 'photo', caption = '', issueType = 'civic issue' }) => {
  if (!user?.uid) return { error: 'Sign in.' };
  if (!imageBase64) return { error: 'Attach an image.' };
  try {
    const relevance = await checkEvidenceRelevance(imageBase64, issueType);
    await addDoc(collection(db, 'issues', issueId, 'evidence'), {
      userId: user.uid, displayName: user.displayName || 'Citizen',
      type, imageBase64: `data:image/jpeg;base64,${imageBase64}`, caption: caption.trim(),
      verified: false, relevant: relevance.isRelevant, relevanceReason: relevance.reason,
      createdAt: serverTimestamp(),
    });
    await appendTimeline(issueId, {
      userId: user.uid, displayName: user.displayName || 'Citizen', photoURL: user.photoURL || null,
      action: 'evidence_uploaded', message: caption.trim() || `uploaded ${type}`,
    });
    await updateDoc(doc(db, 'issues', issueId),
      { contributedUids: arrayUnion(user.uid), updatedAt: serverTimestamp() });
    // Only award when the AI accepts the evidence as relevant (loophole defense #2).
    if (relevance.isRelevant) await award(user.uid, CIVIC_SCORE_POINTS.POST_EVIDENCE, { evidenceUploaded: 1 });
    return { ok: true, relevant: relevance.isRelevant, reason: relevance.reason };
  } catch (e) { console.error('[uploadEvidence]:', e); return { error: 'Could not upload.' }; }
};

// ── Resolution + community verification ─────────────────────────────────────────────
export const markNeedsVerification = async (issueId, user) => {
  if (!user?.uid) return { error: 'Sign in.' };
  try {
    await updateDoc(doc(db, 'issues', issueId), {
      status: 'Needs Verification',
      'communityVerification.status': 'pending',
      updatedAt: serverTimestamp(),
    });
    await appendTimeline(issueId, {
      userId: user.uid, displayName: user.displayName || 'Citizen', photoURL: user.photoURL || null,
      action: 'resolution_requested', message: 'marked as resolved — needs community verification',
    });
    return { ok: true };
  } catch (e) { console.error('[markNeedsVerification]:', e); return { error: 'Could not update.' }; }
};

// One vote per user; flips status at threshold. Geo + 24h gating is enforced in the UI
// (browser geolocation + contributor.joinedAt) before this is called.
export const submitVerificationVote = async (issueId, user, vote) => {
  if (!user?.uid) return { error: 'Sign in to vote.' };
  if (!['yes', 'no', 'partial'].includes(vote)) return { error: 'Invalid vote.' };
  let outcome = null; let result = { ok: false };
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'issues', issueId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Issue not found');
      const data = snap.data();
      const cv = data.communityVerification || {};
      if ((cv.voters || []).includes(user.uid)) { result = { alreadyVoted: true }; return; }
      const votes = { yes: cv.votes?.yes || 0, no: cv.votes?.no || 0, partial: cv.votes?.partial || 0 };
      votes[vote] += 1;
      outcome = checkVerificationThreshold({ votes, threshold: cv.threshold || 5, positiveRatio: cv.positiveRatio || 0.7 });
      const update = {
        [`communityVerification.votes.${vote}`]: increment(1),
        'communityVerification.voters': arrayUnion(user.uid),
        updatedAt: serverTimestamp(),
      };
      if (outcome === 'passed') {
        update.status = 'Resolved';
        update['communityVerification.status'] = 'passed';
        update.resolvedAt = serverTimestamp();
      } else if (outcome === 'failed') {
        update.status = 'In Progress';
        update['communityVerification.status'] = 'failed';
      }
      tx.update(ref, update);
      result = { ok: true, outcome };
    });
    if (result.ok) {
      await appendTimeline(issueId, {
        userId: user.uid, displayName: user.displayName || 'Citizen', photoURL: user.photoURL || null,
        action: 'verification_vote', message: `voted "${vote}"`,
      });
      if (outcome === 'passed') await appendTimeline(issueId, { userId: user.uid, displayName: 'Community', action: 'issue_resolved', message: 'Verification passed — issue resolved' });
      if (outcome === 'failed') await appendTimeline(issueId, { userId: user.uid, displayName: 'Community', action: 'issue_reopened', message: 'Verification failed — reopened' });
      await award(user.uid, CIVIC_SCORE_POINTS.CORRECT_VOTE, { verificationsGiven: 1 });
    }
    return result;
  } catch (e) { console.error('[submitVerificationVote]:', e); return { error: 'Could not record your vote.' }; }
};

// Claim-on-view: an ACTIVE contributor (joined + posted ≥1 evidence/update), not the reporter
// and not removed, self-awards the close reward exactly once when they view a Resolved issue.
export const claimCloseReward = async (issueId, user, issue) => {
  if (!user?.uid || !issue) return;
  if (issue.status !== 'Resolved') return;
  if (issue.userId === user.uid) return;                       // reporter already rewarded
  if (isRemoved(issue, user.uid)) return;
  if (!(issue.contributedUids || []).includes(user.uid)) return; // active contributors only
  if ((issue.closeRewardedBy || []).includes(user.uid)) return;  // once
  try {
    await updateDoc(doc(db, 'issues', issueId), { closeRewardedBy: arrayUnion(user.uid) });
    await award(user.uid, CIVIC_SCORE_POINTS.CONTRIBUTOR_RESOLVED, { issuesResolved: 1 });
    return { rewarded: true };
  } catch (e) { console.error('[claimCloseReward]:', e.message); }
};
