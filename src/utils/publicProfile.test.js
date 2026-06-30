import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => ({ __path: `${coll}/${id}` })),
  setDoc: vi.fn(async () => {}),
  increment: vi.fn((n) => ({ __inc: n })),
  serverTimestamp: vi.fn(() => 'ts'),
}));

import { syncPublicProfile, mirrorPublicIdentity, bumpPublicProfile } from './publicProfile';
import { setDoc } from 'firebase/firestore';

beforeEach(() => vi.clearAllMocks());

describe('syncPublicProfile', () => {
  it('no-ops without a uid', async () => {
    await syncPublicProfile(null, { displayName: 'X' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('writes the full absolute-value mirror with merge', async () => {
    await syncPublicProfile('u1', { displayName: 'Asha', photoURL: 'p.png', civicScore: 120, issuesReported: 4 });
    const [ref, payload, opts] = setDoc.mock.calls[0];
    expect(ref.__path).toBe('publicProfiles/u1');
    expect(opts).toEqual({ merge: true });
    expect(payload).toMatchObject({ displayName: 'Asha', photoURL: 'p.png', civicScore: 120, issuesReported: 4, updatedAt: 'ts' });
    // absolute values, NOT increments
    expect(payload.civicScore).toBe(120);
  });

  it('applies defaults for missing fields', async () => {
    await syncPublicProfile('u1', {});
    const payload = setDoc.mock.calls[0][1];
    expect(payload).toMatchObject({ displayName: 'Citizen', photoURL: null, civicScore: 0, issuesReported: 0 });
  });

  it('uses defaults when called with no data object at all', async () => {
    await syncPublicProfile('u1');
    const payload = setDoc.mock.calls[0][1];
    expect(payload.displayName).toBe('Citizen');
    expect(payload.civicScore).toBe(0);
  });

  it('preserves a zero score (nullish-coalescing, not falsy-OR)', async () => {
    await syncPublicProfile('u1', { civicScore: 0, issuesReported: 0 });
    const payload = setDoc.mock.calls[0][1];
    expect(payload.civicScore).toBe(0);
    expect(payload.issuesReported).toBe(0);
  });

  it('swallows a write error', async () => {
    setDoc.mockRejectedValueOnce(new Error('rules'));
    await expect(syncPublicProfile('u1', { displayName: 'A' })).resolves.toBeUndefined();
  });
});

describe('mirrorPublicIdentity', () => {
  it('no-ops without a uid', async () => {
    await mirrorPublicIdentity(null, { displayName: 'X' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('writes only identity fields (name/photo) + timestamp', async () => {
    await mirrorPublicIdentity('u1', { displayName: 'Asha', photoURL: 'p.png' });
    const [ref, payload, opts] = setDoc.mock.calls[0];
    expect(ref.__path).toBe('publicProfiles/u1');
    expect(opts).toEqual({ merge: true });
    expect(payload).toEqual({ displayName: 'Asha', photoURL: 'p.png', updatedAt: 'ts' });
    // never touches the score fields
    expect(payload).not.toHaveProperty('civicScore');
    expect(payload).not.toHaveProperty('issuesReported');
  });

  it('defaults name/photo when omitted', async () => {
    await mirrorPublicIdentity('u1', {});
    const payload = setDoc.mock.calls[0][1];
    expect(payload).toEqual({ displayName: 'Citizen', photoURL: null, updatedAt: 'ts' });
  });

  it('swallows a write error', async () => {
    setDoc.mockRejectedValueOnce(new Error('x'));
    await expect(mirrorPublicIdentity('u1', { displayName: 'A' })).resolves.toBeUndefined();
  });
});

describe('bumpPublicProfile', () => {
  it('no-ops without a uid', async () => {
    await bumpPublicProfile(null, { civicScore: 5 });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('no-ops when there is nothing to bump (no/zero deltas)', async () => {
    await bumpPublicProfile('u1', {});
    await bumpPublicProfile('u1', { civicScore: 0, issuesReported: 0 });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('increments civicScore only', async () => {
    await bumpPublicProfile('u1', { civicScore: 10 });
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref.__path).toBe('publicProfiles/u1');
    expect(payload.civicScore).toEqual({ __inc: 10 });
    expect(payload).not.toHaveProperty('issuesReported');
    expect(payload.updatedAt).toBe('ts');
  });

  it('increments both fields when both deltas are present', async () => {
    await bumpPublicProfile('u1', { civicScore: 10, issuesReported: 1 });
    const payload = setDoc.mock.calls[0][1];
    expect(payload.civicScore).toEqual({ __inc: 10 });
    expect(payload.issuesReported).toEqual({ __inc: 1 });
  });

  it('increments issuesReported only', async () => {
    await bumpPublicProfile('u1', { issuesReported: 2 });
    const payload = setDoc.mock.calls[0][1];
    expect(payload.issuesReported).toEqual({ __inc: 2 });
    expect(payload).not.toHaveProperty('civicScore');
  });

  it('merges the write', async () => {
    await bumpPublicProfile('u1', { civicScore: 5 });
    expect(setDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('swallows a write error', async () => {
    setDoc.mockRejectedValueOnce(new Error('x'));
    await expect(bumpPublicProfile('u1', { civicScore: 5 })).resolves.toBeUndefined();
  });
});
