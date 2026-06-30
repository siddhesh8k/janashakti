import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  runTransaction: vi.fn(),
  doc: vi.fn(() => ({ __ref: 'issues/x' })),
  increment: vi.fn((n) => ({ __increment: n })),
  arrayUnion: vi.fn((v) => ({ __arrayUnion: v })),
}));
// social.js exports the real threshold (5) — keep it real so the gate is genuinely tested.
vi.mock('./social', () => ({ POST_CONFIRMATION_THRESHOLD: 5 }));

import { confirmIssue } from './confirmIssue';
import { runTransaction } from 'firebase/firestore';

// Drive runTransaction by feeding it a fake `tx`. The snapshot data is provided per-test;
// `tx.update` is captured so we can assert the writes the module made.
const runWith = (data, exists = true) => {
  const tx = { get: vi.fn(async () => ({ exists: () => exists, data: () => data })), update: vi.fn() };
  runTransaction.mockImplementation(async (_db, cb) => cb(tx));
  return tx;
};

describe('confirmIssue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments confirmations and records the voter on a first confirm', async () => {
    const tx = runWith({ confirmations: 2, confirmedBy: ['alice'], socialConsent: 'tag' });

    const r = await confirmIssue('iss1', 'bob');

    expect(r.added).toBe(true);
    expect(r.alreadyConfirmed).toBe(false);
    expect(r.newCount).toBe(3);
    expect(r.shouldPost).toBe(false); // below the 5-confirmation threshold
    expect(r.issue).toEqual({ id: 'iss1', confirmations: 2, confirmedBy: ['alice'], socialConsent: 'tag' });

    expect(tx.update).toHaveBeenCalledTimes(1);
    const updates = tx.update.mock.calls[0][1];
    expect(updates.confirmations).toEqual({ __increment: 1 });
    expect(updates.confirmedBy).toEqual({ __arrayUnion: 'bob' });
    expect(updates.pressureScore).toEqual({ __increment: 10 });
    expect(updates.socialQueued).toBeUndefined();
  });

  it('is idempotent — a second confirm by the same uid is a no-op', async () => {
    const tx = runWith({ confirmations: 4, confirmedBy: ['bob'], socialConsent: 'tag' });

    const r = await confirmIssue('iss1', 'bob');

    expect(r.added).toBe(false);
    expect(r.alreadyConfirmed).toBe(true);
    expect(r.newCount).toBe(4); // unchanged
    expect(r.shouldPost).toBe(false);
    expect(tx.update).not.toHaveBeenCalled(); // no write made
  });

  it('queues the social post EXACTLY for the confirm that crosses the threshold', async () => {
    // 4 existing confirmations → this 5th crosses POST_CONFIRMATION_THRESHOLD (5).
    const tx = runWith({ confirmations: 4, confirmedBy: ['a', 'b', 'c', 'd'], socialConsent: 'tag' });

    const r = await confirmIssue('iss1', 'e');

    expect(r.newCount).toBe(5);
    expect(r.shouldPost).toBe(true);
    expect(tx.update.mock.calls[0][1].socialQueued).toBe(true);
  });

  it('does not re-queue a post once socialQueued is already set (exactly-once)', async () => {
    const tx = runWith({ confirmations: 9, confirmedBy: ['a'], socialConsent: 'tag', socialQueued: true });

    const r = await confirmIssue('iss1', 'z');

    expect(r.newCount).toBe(10);
    expect(r.shouldPost).toBe(false);
    expect(tx.update.mock.calls[0][1].socialQueued).toBeUndefined();
  });

  it('does not re-queue if the issue was already posted to X', async () => {
    const tx = runWith({ confirmations: 8, confirmedBy: ['a'], socialConsent: 'tag', xPosted: true });

    const r = await confirmIssue('iss1', 'z');

    expect(r.shouldPost).toBe(false);
    expect(tx.update.mock.calls[0][1].socialQueued).toBeUndefined();
  });

  it('never queues a post when the reporter opted out of social (consent none)', async () => {
    const tx = runWith({ confirmations: 7, confirmedBy: ['a'], socialConsent: 'none' });

    const r = await confirmIssue('iss1', 'z');

    expect(r.newCount).toBe(8);
    expect(r.shouldPost).toBe(false);
    expect(tx.update.mock.calls[0][1].socialQueued).toBeUndefined();
  });

  it('treats a missing confirmedBy/confirmations doc as a fresh first confirm', async () => {
    const tx = runWith({}); // no fields at all

    const r = await confirmIssue('iss1', 'first');

    expect(r.added).toBe(true);
    expect(r.alreadyConfirmed).toBe(false);
    expect(r.newCount).toBe(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it('throws when the issue does not exist', async () => {
    runWith({}, /* exists */ false);

    await expect(confirmIssue('missing', 'bob')).rejects.toThrow('Issue not found');
  });
});
