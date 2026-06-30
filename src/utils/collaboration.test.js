import { describe, it, expect, vi, beforeEach } from 'vitest';

// Self-mock everything collaboration.js imports (per-file mocks win over tests/setup.js).
// Sentinels let us assert WHAT was written: increment carries its delta, arrayUnion its
// payload, serverTimestamp a fixed token, doc/collection their path.
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ __path: path.join('/') })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  collection: vi.fn((_db, ...path) => ({ __path: path.join('/') })),
  addDoc: vi.fn(async () => ({ id: 'tl-doc' })),
  arrayUnion: vi.fn((x) => ({ __arrayUnion: x })),
  increment: vi.fn((n) => ({ __inc: n })),
  serverTimestamp: vi.fn(() => 'ts'),
  runTransaction: vi.fn(),
}));
vi.mock('./publicProfile', () => ({ bumpPublicProfile: vi.fn(async () => {}) }));
vi.mock('./gemini', () => ({ callGeminiVision: vi.fn() }));

import {
  checkVerificationThreshold,
  isContributor,
  isRemoved,
  joinIssue,
  leaveIssue,
  postUpdate,
  markNeedsVerification,
  submitVerificationVote,
  claimCloseReward,
  uploadEvidence,
  recordIssueCreated,
} from './collaboration';
import { getDoc, updateDoc, addDoc, runTransaction } from 'firebase/firestore';
import { bumpPublicProfile } from './publicProfile';
import { callGeminiVision } from './gemini';
import { CIVIC_SCORE_POINTS } from '../constants/issueTypes';

const user = { uid: 'u1', displayName: 'Asha', photoURL: 'p.png' };
const snapOf = (data) => ({ exists: () => true, data: () => data });
const missing = { exists: () => false, data: () => ({}) };

beforeEach(() => vi.clearAllMocks());

// ── PURE: checkVerificationThreshold ─────────────────────────────────────────────
describe('checkVerificationThreshold (pure)', () => {
  const base = { threshold: 5, positiveRatio: 0.7 };

  it('returns null until the vote threshold is reached', () => {
    expect(checkVerificationThreshold({ ...base, votes: { yes: 3, no: 0, partial: 0 } })).toBeNull();
  });

  it('defaults threshold to 5 when not provided', () => {
    expect(checkVerificationThreshold({ votes: { yes: 4 } })).toBeNull();      // 4 < 5
    expect(checkVerificationThreshold({ votes: { yes: 5 } })).toBe('passed');  // 5/5 = 1.0
  });

  it('passes at exactly the default 0.7 ratio (boundary, >=)', () => {
    // 7 yes + 3 no = 0.7 exactly → passed
    expect(checkVerificationThreshold({ votes: { yes: 7, no: 3 }, threshold: 5 })).toBe('passed');
  });

  it('fails just below 0.7', () => {
    // 6 yes + 4 no = 0.6 → failed
    expect(checkVerificationThreshold({ votes: { yes: 6, no: 4 }, threshold: 5 })).toBe('failed');
  });

  it('passes when enough votes and >= 70% positive', () => {
    expect(checkVerificationThreshold({ ...base, votes: { yes: 4, no: 1, partial: 0 } })).toBe('passed'); // 80%
  });

  it('fails when enough votes but < 70% positive', () => {
    expect(checkVerificationThreshold({ ...base, votes: { yes: 2, no: 3, partial: 0 } })).toBe('failed'); // 40%
  });

  it('counts partial votes as half-positive', () => {
    // (2 + 2*0.5)/5 = 60% → fails
    expect(checkVerificationThreshold({ ...base, votes: { yes: 2, no: 1, partial: 2 } })).toBe('failed');
    // (4 + 2*0.5)/6 = 83% → passes
    expect(checkVerificationThreshold({ ...base, votes: { yes: 4, no: 0, partial: 2 } })).toBe('passed');
    // all-partial: 6*0.5/6 = 0.5 → failed
    expect(checkVerificationThreshold({ votes: { partial: 6 }, threshold: 5 })).toBe('failed');
  });

  it('honours a custom positiveRatio', () => {
    // 5/10 = 0.5: passes at ratio 0.5, fails at 0.51
    expect(checkVerificationThreshold({ votes: { yes: 5, no: 5 }, threshold: 10, positiveRatio: 0.5 })).toBe('passed');
    expect(checkVerificationThreshold({ votes: { yes: 5, no: 5 }, threshold: 10, positiveRatio: 0.51 })).toBe('failed');
  });

  it('treats a missing/empty block as undecided (null)', () => {
    expect(checkVerificationThreshold(undefined)).toBeNull();
    expect(checkVerificationThreshold({})).toBeNull();
  });
});

// ── PURE helpers ─────────────────────────────────────────────────────────────────
describe('isContributor / isRemoved', () => {
  const issue = { contributors: [{ userId: 'a' }, { userId: 'b' }], removedUids: ['x'] };
  it('isContributor detects membership', () => {
    expect(isContributor(issue, 'a')).toBe(true);
    expect(isContributor(issue, 'z')).toBe(false);
    expect(isContributor(issue, undefined)).toBe(false);
    expect(isContributor({}, 'a')).toBe(false);
  });
  it('isRemoved detects removed users', () => {
    expect(isRemoved(issue, 'x')).toBe(true);
    expect(isRemoved(issue, 'a')).toBe(false);
    expect(isRemoved({}, 'x')).toBe(false);
  });
});

// ── joinIssue ────────────────────────────────────────────────────────────────────
describe('joinIssue', () => {
  it('rejects an unauthenticated user without touching Firestore', async () => {
    const r = await joinIssue('i1', {}, 'Resident');
    expect(r).toEqual({ error: 'Sign in to join.' });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('errors when the issue does not exist', async () => {
    getDoc.mockResolvedValue(missing);
    expect(await joinIssue('i1', user, 'Resident')).toEqual({ error: 'Issue not found.' });
  });

  it('blocks the reporter from joining their own issue', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'u1' }));
    expect(await joinIssue('i1', user, 'Resident')).toEqual({ error: "You reported this — you already lead it." });
  });

  it('blocks a removed user', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'owner', removedUids: ['u1'] }));
    expect(await joinIssue('i1', user, 'Resident')).toEqual({ error: 'You were removed from this collaboration.' });
  });

  it('blocks joining when collaboration is closed', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'owner', collaborationOpen: false }));
    expect(await joinIssue('i1', user, 'Resident')).toEqual({ error: 'Joining is closed for this issue.' });
  });

  it('returns alreadyJoined when the user is already a contributor', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'owner', contributors: [{ userId: 'u1' }] }));
    const r = await joinIssue('i1', user, 'Resident');
    expect(r).toEqual({ alreadyJoined: true });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('adds the contributor, awards JOIN points + issuesJoined, and logs the timeline', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'owner', contributors: [] }));

    const r = await joinIssue('i1', user, 'Volunteer');

    expect(r).toEqual({ ok: true });
    // contributor pushed via arrayUnion with the chosen role + identity
    const contribUpdate = updateDoc.mock.calls.find(([, u]) => u.contributors);
    const added = contribUpdate[1].contributors.__arrayUnion;
    expect(added).toMatchObject({ userId: 'u1', displayName: 'Asha', role: 'Volunteer' });
    expect(typeof added.joinedAt).toBe('string'); // ISO string, not serverTimestamp inside arrayUnion

    // award path: own users doc gets civicScore increment by JOIN_ISSUE + issuesJoined +1
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate[1].civicScore).toEqual({ __inc: CIVIC_SCORE_POINTS.JOIN_ISSUE });
    expect(awardUpdate[1].issuesJoined).toEqual({ __inc: 1 });
    expect(bumpPublicProfile).toHaveBeenCalledWith('u1', { civicScore: CIVIC_SCORE_POINTS.JOIN_ISSUE });
    // timeline event recorded
    expect(addDoc).toHaveBeenCalled();
  });

  it('defaults the role to Resident when none is given', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'owner', contributors: [] }));
    await joinIssue('i1', user);
    const contribUpdate = updateDoc.mock.calls.find(([, u]) => u.contributors);
    expect(contribUpdate[1].contributors.__arrayUnion.role).toBe('Resident');
  });

  it('fail-soft: returns a friendly error if Firestore throws', async () => {
    getDoc.mockRejectedValue(new Error('network'));
    expect(await joinIssue('i1', user, 'Resident')).toEqual({ error: 'Could not join. Try again.' });
  });

  it('does not crash the join when the award write fails (award is swallowed)', async () => {
    getDoc.mockResolvedValue(snapOf({ userId: 'owner', contributors: [] }));
    // first updateDoc (contributors) ok, second (award) rejects
    updateDoc.mockResolvedValueOnce().mockRejectedValueOnce(new Error('rules'));
    const r = await joinIssue('i1', user, 'Resident');
    expect(r).toEqual({ ok: true });
  });
});

// ── postUpdate ───────────────────────────────────────────────────────────────────
describe('postUpdate', () => {
  it('requires sign-in', async () => {
    expect(await postUpdate('i1', {}, 'hi')).toEqual({ error: 'Sign in.' });
  });
  it('requires non-empty trimmed text', async () => {
    expect(await postUpdate('i1', user, '   ')).toEqual({ error: 'Write an update first.' });
    expect(addDoc).not.toHaveBeenCalled();
  });
  it('appends the trimmed update, marks the user as a contributor, and awards POST_UPDATE', async () => {
    const r = await postUpdate('i1', user, '  fixed half of it  ');
    expect(r).toEqual({ ok: true });
    // timeline event carries the trimmed message
    const ev = addDoc.mock.calls[0][1];
    expect(ev.message).toBe('fixed half of it');
    expect(ev.action).toBe('update_posted');
    // contributedUids arrayUnion(uid)
    const contribUpdate = updateDoc.mock.calls.find(([, u]) => u.contributedUids);
    expect(contribUpdate[1].contributedUids).toEqual({ __arrayUnion: 'u1' });
    // award
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate[1].civicScore).toEqual({ __inc: CIVIC_SCORE_POINTS.POST_UPDATE });
    expect(awardUpdate[1].updatesPosted).toEqual({ __inc: 1 });
  });
  it('fail-soft on error', async () => {
    addDoc.mockRejectedValueOnce(new Error('boom'));
    // make the contributedUids updateDoc also fail so the try block rejects after addDoc
    updateDoc.mockRejectedValueOnce(new Error('boom'));
    const r = await postUpdate('i1', user, 'text');
    expect(r).toEqual({ error: 'Could not post.' });
  });
});

// ── markNeedsVerification ──────────────────────────────────────────────────────────
describe('markNeedsVerification', () => {
  it('requires sign-in', async () => {
    expect(await markNeedsVerification('i1', {})).toEqual({ error: 'Sign in.' });
  });
  it("sets status 'Needs Verification' and pending community verification", async () => {
    const r = await markNeedsVerification('i1', user);
    expect(r).toEqual({ ok: true });
    const u = updateDoc.mock.calls[0][1];
    expect(u.status).toBe('Needs Verification');
    expect(u['communityVerification.status']).toBe('pending');
    expect(u.updatedAt).toBe('ts');
    // a resolution_requested timeline event is appended
    expect(addDoc.mock.calls[0][1].action).toBe('resolution_requested');
  });
  it('fail-soft on error', async () => {
    updateDoc.mockRejectedValueOnce(new Error('x'));
    expect(await markNeedsVerification('i1', user)).toEqual({ error: 'Could not update.' });
  });
});

// ── submitVerificationVote ─────────────────────────────────────────────────────────
// Drive runTransaction by invoking the callback with a fake tx whose get() returns our
// snapshot and whose update() records what was written.
const makeTx = (snap) => {
  const updates = [];
  const tx = { get: vi.fn(async () => snap), update: vi.fn((_ref, u) => updates.push(u)) };
  return { tx, updates };
};

describe('submitVerificationVote', () => {
  it('rejects an unauthenticated user', async () => {
    expect(await submitVerificationVote('i1', {}, 'yes')).toEqual({ error: 'Sign in to vote.' });
  });
  it('rejects an invalid vote value', async () => {
    expect(await submitVerificationVote('i1', user, 'maybe')).toEqual({ error: 'Invalid vote.' });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('records a vote once and returns ok with no outcome before threshold', async () => {
    const { tx, updates } = makeTx(snapOf({ communityVerification: { votes: { yes: 1 }, voters: ['x'] } }));
    runTransaction.mockImplementation(async (_db, cb) => cb(tx));

    const r = await submitVerificationVote('i1', user, 'yes');

    expect(r).toEqual({ ok: true, outcome: null });
    expect(updates[0]['communityVerification.votes.yes']).toEqual({ __inc: 1 });
    expect(updates[0]['communityVerification.voters']).toEqual({ __arrayUnion: 'u1' });
    // no status flip below threshold
    expect(updates[0].status).toBeUndefined();
    // vote timeline event recorded + award
    expect(addDoc).toHaveBeenCalled();
  });

  it('returns alreadyVoted and writes nothing when the user already voted', async () => {
    const { tx, updates } = makeTx(snapOf({ communityVerification: { votes: { yes: 1 }, voters: ['u1'] } }));
    runTransaction.mockImplementation(async (_db, cb) => cb(tx));

    const r = await submitVerificationVote('i1', user, 'yes');

    expect(r).toEqual({ alreadyVoted: true });
    expect(tx.update).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    // no timeline / award for a no-op (result.ok is falsy)
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('flips to Resolved + resolvedAt when the deciding vote passes the threshold', async () => {
    // existing 4 yes (4 voters) → this 5th yes hits threshold 5 at 5/5 = passed
    const { tx, updates } = makeTx(snapOf({
      communityVerification: { votes: { yes: 4 }, voters: ['a', 'b', 'c', 'd'], threshold: 5 },
    }));
    runTransaction.mockImplementation(async (_db, cb) => cb(tx));

    const r = await submitVerificationVote('i1', user, 'yes');

    expect(r).toEqual({ ok: true, outcome: 'passed' });
    expect(updates[0].status).toBe('Resolved');
    expect(updates[0]['communityVerification.status']).toBe('passed');
    expect(updates[0].resolvedAt).toBe('ts');
    // resolved timeline event appended (in addition to the vote event)
    const actions = addDoc.mock.calls.map((c) => c[1].action);
    expect(actions).toContain('issue_resolved');
    // award given
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate[1].civicScore).toEqual({ __inc: CIVIC_SCORE_POINTS.CORRECT_VOTE });
  });

  it('reopens (In Progress) when the deciding vote fails the threshold', async () => {
    // 4 no (4 voters), this 5th no → 0/5 positive = failed
    const { tx, updates } = makeTx(snapOf({
      communityVerification: { votes: { no: 4 }, voters: ['a', 'b', 'c', 'd'], threshold: 5 },
    }));
    runTransaction.mockImplementation(async (_db, cb) => cb(tx));

    const r = await submitVerificationVote('i1', user, 'no');

    expect(r).toEqual({ ok: true, outcome: 'failed' });
    expect(updates[0].status).toBe('In Progress');
    expect(updates[0]['communityVerification.status']).toBe('failed');
    const actions = addDoc.mock.calls.map((c) => c[1].action);
    expect(actions).toContain('issue_reopened');
  });

  it('errors when the issue is missing inside the transaction', async () => {
    const { tx } = makeTx(missing);
    runTransaction.mockImplementation(async (_db, cb) => cb(tx));
    expect(await submitVerificationVote('i1', user, 'yes')).toEqual({ error: 'Could not record your vote.' });
  });

  it('fail-soft when the transaction throws', async () => {
    runTransaction.mockRejectedValue(new Error('tx failed'));
    expect(await submitVerificationVote('i1', user, 'yes')).toEqual({ error: 'Could not record your vote.' });
  });
});

// ── leaveIssue ─────────────────────────────────────────────────────────────────────
describe('leaveIssue', () => {
  it('requires a uid', async () => {
    expect(await leaveIssue('i1', null)).toEqual({ error: 'Not signed in.' });
  });
  it('removes the user from contributors in a transaction', async () => {
    const { tx, updates } = makeTx(snapOf({ contributors: [{ userId: 'u1' }, { userId: 'u2' }] }));
    runTransaction.mockImplementation(async (_db, cb) => cb(tx));
    const r = await leaveIssue('i1', 'u1');
    expect(r).toEqual({ ok: true });
    expect(updates[0].contributors).toEqual([{ userId: 'u2' }]);
  });
  it('fail-soft on a transaction error', async () => {
    runTransaction.mockRejectedValue(new Error('x'));
    expect(await leaveIssue('i1', 'u1')).toEqual({ error: 'Could not leave.' });
  });
});

// ── uploadEvidence (AI relevance gate) ───────────────────────────────────────────────
describe('uploadEvidence', () => {
  it('requires sign-in and an image', async () => {
    expect(await uploadEvidence('i1', {}, { imageBase64: 'x' })).toEqual({ error: 'Sign in.' });
    expect(await uploadEvidence('i1', user, { imageBase64: '' })).toEqual({ error: 'Attach an image.' });
  });

  it('stores relevant evidence and AWARDS points when Gemini accepts it', async () => {
    callGeminiVision.mockResolvedValue({ isRelevant: true, reason: 'real pothole' });
    const r = await uploadEvidence('i1', user, { imageBase64: 'b64', issueType: 'Pothole' });
    expect(r).toEqual({ ok: true, relevant: true, reason: 'real pothole' });
    // evidence stored with data-url prefix + relevant flag
    const evDoc = addDoc.mock.calls.find(([ref]) => ref.__path?.includes('evidence'));
    expect(evDoc[1].imageBase64).toBe('data:image/jpeg;base64,b64');
    expect(evDoc[1].relevant).toBe(true);
    // award happened
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate[1].civicScore).toEqual({ __inc: CIVIC_SCORE_POINTS.POST_EVIDENCE });
  });

  it('stores irrelevant evidence WITHOUT awarding points', async () => {
    callGeminiVision.mockResolvedValue({ isRelevant: false, reason: 'selfie' });
    const r = await uploadEvidence('i1', user, { imageBase64: 'b64', issueType: 'Pothole' });
    expect(r).toEqual({ ok: true, relevant: false, reason: 'selfie' });
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate).toBeUndefined(); // no award write
  });

  it('fails open (treats as relevant) when the AI check throws', async () => {
    callGeminiVision.mockRejectedValue(new Error('AI down'));
    const r = await uploadEvidence('i1', user, { imageBase64: 'b64', issueType: 'Pothole' });
    expect(r.ok).toBe(true);
    expect(r.relevant).toBe(true); // fail-open
    // still awards because it's treated as relevant
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate[1].civicScore).toEqual({ __inc: CIVIC_SCORE_POINTS.POST_EVIDENCE });
  });

  it('fail-soft when storing the evidence throws', async () => {
    callGeminiVision.mockResolvedValue({ isRelevant: true });
    addDoc.mockRejectedValueOnce(new Error('write fail'));
    expect(await uploadEvidence('i1', user, { imageBase64: 'b64' })).toEqual({ error: 'Could not upload.' });
  });
});

// ── claimCloseReward (claim-on-view) ────────────────────────────────────────────────
describe('claimCloseReward', () => {
  const base = { status: 'Resolved', userId: 'owner', contributedUids: ['u1'], closeRewardedBy: [] };

  it('does nothing without a user or issue', async () => {
    expect(await claimCloseReward('i1', null, base)).toBeUndefined();
    expect(await claimCloseReward('i1', user, null)).toBeUndefined();
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('skips when the issue is not Resolved', async () => {
    await claimCloseReward('i1', user, { ...base, status: 'In Progress' });
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('skips the reporter (already rewarded)', async () => {
    await claimCloseReward('i1', { ...user, uid: 'owner' }, base);
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('skips a removed user', async () => {
    await claimCloseReward('i1', user, { ...base, removedUids: ['u1'] });
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('skips a non-active contributor (not in contributedUids)', async () => {
    await claimCloseReward('i1', user, { ...base, contributedUids: ['someone-else'] });
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('skips when already rewarded once', async () => {
    await claimCloseReward('i1', user, { ...base, closeRewardedBy: ['u1'] });
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('awards the contributor exactly once on first eligible view', async () => {
    const r = await claimCloseReward('i1', user, base);
    expect(r).toEqual({ rewarded: true });
    // marks closeRewardedBy + awards CONTRIBUTOR_RESOLVED
    const flag = updateDoc.mock.calls.find(([, u]) => u.closeRewardedBy);
    expect(flag[1].closeRewardedBy).toEqual({ __arrayUnion: 'u1' });
    const awardUpdate = updateDoc.mock.calls.find(([, u]) => u.civicScore);
    expect(awardUpdate[1].civicScore).toEqual({ __inc: CIVIC_SCORE_POINTS.CONTRIBUTOR_RESOLVED });
    expect(awardUpdate[1].issuesResolved).toEqual({ __inc: 1 });
  });
  it('swallows a write error (returns undefined, no throw)', async () => {
    updateDoc.mockRejectedValueOnce(new Error('rules'));
    await expect(claimCloseReward('i1', user, base)).resolves.toBeUndefined();
  });
});

// ── recordIssueCreated ──────────────────────────────────────────────────────────────
describe('recordIssueCreated', () => {
  it('seeds an issue_created timeline event with the reporter identity', () => {
    recordIssueCreated('i1', user);
    const ev = addDoc.mock.calls[0][1];
    expect(ev.action).toBe('issue_created');
    expect(ev.userId).toBe('u1');
    expect(ev.displayName).toBe('Asha');
    expect(ev.message).toBe('reported this issue');
    expect(ev.createdAt).toBe('ts'); // serverTimestamp token
  });
  it('falls back to Citizen when displayName is missing and honours a custom message', () => {
    recordIssueCreated('i1', { uid: 'x' }, 'opened a recurrence');
    const ev = addDoc.mock.calls[0][1];
    expect(ev.displayName).toBe('Citizen');
    expect(ev.message).toBe('opened a recurrence');
  });
});
