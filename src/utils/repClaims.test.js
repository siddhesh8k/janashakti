import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ __coll: name })),
  doc: vi.fn((_db, coll, id) => ({ __path: `${coll}/${id}` })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  query: vi.fn((...args) => ({ __query: args })),
  where: vi.fn((field, op, value) => ({ __where: [field, op, value] })),
  getDocs: vi.fn(),
  increment: vi.fn((n) => ({ __inc: n })),
  arrayUnion: vi.fn((x) => ({ __arrayUnion: x })),
  serverTimestamp: vi.fn(() => 'ts'),
}));
// Control ward resolution: by default no known ward matches (forces the loc-* fallback);
// individual tests override to return a known ward.
vi.mock('../constants/representatives', () => ({ getWardRepresentative: vi.fn(() => null) }));

import { claimWard, flagRepresentative, getMyClaim } from './repClaims';
import { getDoc, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { getWardRepresentative } from '../constants/representatives';

const missing = { exists: () => false, data: () => ({}) };
const existsWith = (data) => ({ exists: () => true, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  getWardRepresentative.mockReturnValue(null);
});

describe('claimWard — validation', () => {
  it('requires uid, name and roleCode', async () => {
    expect(await claimWard({ uid: '', name: 'A', roleCode: 'rwa', lat: 1, lng: 2 }))
      .toEqual({ error: 'Add your name and role first.' });
    expect(await claimWard({ uid: 'u1', name: '', roleCode: 'rwa', lat: 1, lng: 2 }))
      .toEqual({ error: 'Add your name and role first.' });
    expect(await claimWard({ uid: 'u1', name: 'A', roleCode: '', lat: 1, lng: 2 }))
      .toEqual({ error: 'Add your name and role first.' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('requires a location', async () => {
    expect(await claimWard({ uid: 'u1', name: 'A', roleCode: 'rwa', lat: null, lng: 2 }))
      .toEqual({ error: 'Location needed to detect your ward.' });
    expect(await claimWard({ uid: 'u1', name: 'A', roleCode: 'rwa', lat: 1, lng: null }))
      .toEqual({ error: 'Location needed to detect your ward.' });
  });
});

describe('claimWard — new claim on a location-derived ward', () => {
  it('writes the self-declared claim and returns the resolved ward', async () => {
    getDoc.mockResolvedValue(missing);
    // lat 12.97, lng 77.59, city "Bengaluru" → loc-bengaluru-1297-7759 ; docId bengaluru-ward-...
    const r = await claimWard({
      uid: 'u1', name: 'Asha', roleCode: 'Ward Volunteer', party: '  ',
      lat: 12.97, lng: 77.59, city: 'Bengaluru', since: '2021',
    });

    expect(r.ok).toBe(true);
    expect(r.ward.city).toBe('Bengaluru');
    expect(r.ward.wardNo).toBe('loc-bengaluru-1297-7759');
    expect(r.ward.docId).toBe('bengaluru-ward-loc-bengaluru-1297-7759');

    const [ref, payload, opts] = setDoc.mock.calls[0];
    expect(ref.__path).toBe(`representatives/bengaluru-ward-loc-bengaluru-1297-7759`);
    expect(opts).toEqual({ merge: true });
    expect(payload.selfDeclared).toBe(true);
    expect(payload.claimedByUid).toBe('u1');
    expect(payload.claimedByName).toBe('Asha');
    expect(payload.representative).toMatchObject({ name: 'Asha', role: 'Ward Volunteer', since: '2021' });
    // blank party trims to null
    expect(payload.representative.party).toBeNull();
    // new doc starts at zero flags
    expect(payload.flagCount).toBe(0);
    expect(payload.flaggedBy).toEqual([]);
    expect(payload.claimedAt).toBe('ts');
  });

  it('keeps a non-blank party label and defaults `since` to the current year', async () => {
    getDoc.mockResolvedValue(missing);
    const r = await claimWard({
      uid: 'u1', name: 'Asha', roleCode: 'Elected Corporator', party: '  Independent  ',
      lat: 1, lng: 2, city: 'Pune',
    });
    expect(r.ok).toBe(true);
    const payload = setDoc.mock.calls[0][1];
    expect(payload.representative.party).toBe('Independent'); // trimmed
    expect(payload.representative.since).toBe(String(new Date().getFullYear()));
  });

  it('uses a known ward when the GPS matches one (claim overrides the seed)', async () => {
    getDoc.mockResolvedValue(missing);
    getWardRepresentative.mockReturnValue({
      wardNo: 45, wardName: 'Koramangala', city: 'Bangalore',
      center: { lat: 12.9352, lng: 77.6245 }, radiusKm: 1.5,
    });
    const r = await claimWard({ uid: 'u1', name: 'Asha', roleCode: 'rwa', lat: 12.9352, lng: 77.6245, city: 'Bangalore' });
    expect(r.ward.wardNo).toBe(45);
    expect(r.ward.wardName).toBe('Koramangala');
    expect(r.ward.docId).toBe('bangalore-ward-45');
    const payload = setDoc.mock.calls[0][1];
    expect(payload.radiusKm).toBe(1.5);
    expect(payload.center).toEqual({ lat: 12.9352, lng: 77.6245 });
  });
});

describe('claimWard — already claimed', () => {
  it('blocks when the ward is claimed by a DIFFERENT user', async () => {
    getDoc.mockResolvedValue(existsWith({ claimedByUid: 'someone-else' }));
    const r = await claimWard({ uid: 'u1', name: 'Asha', roleCode: 'rwa', lat: 1, lng: 2, city: 'Pune' });
    expect(r.error).toMatch(/already represented by someone else/);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('allows the SAME user to re-save their claim, preserving existing flags', async () => {
    getDoc.mockResolvedValue(existsWith({ claimedByUid: 'u1', flagCount: 3, flaggedBy: ['a', 'b', 'c'] }));
    const r = await claimWard({ uid: 'u1', name: 'Asha', roleCode: 'rwa', lat: 1, lng: 2, city: 'Pune' });
    expect(r.ok).toBe(true);
    const payload = setDoc.mock.calls[0][1];
    expect(payload.flagCount).toBe(3);
    expect(payload.flaggedBy).toEqual(['a', 'b', 'c']);
  });
});

describe('claimWard — error path', () => {
  it('returns a friendly error when Firestore throws', async () => {
    getDoc.mockRejectedValue(new Error('offline'));
    expect(await claimWard({ uid: 'u1', name: 'Asha', roleCode: 'rwa', lat: 1, lng: 2, city: 'Pune' }))
      .toEqual({ error: 'Could not save your claim. Try again.' });
  });
});

describe('flagRepresentative', () => {
  it('rejects a missing docId or uid', async () => {
    expect(await flagRepresentative('', 'u1')).toEqual({ error: 'Nothing to flag.' });
    expect(await flagRepresentative('doc1', '')).toEqual({ error: 'Nothing to flag.' });
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('increments flagCount and adds the uid to flaggedBy', async () => {
    const r = await flagRepresentative('doc1', 'u9');
    expect(r).toEqual({ ok: true });
    const [ref, payload] = updateDoc.mock.calls[0];
    expect(ref.__path).toBe('representatives/doc1');
    expect(payload.flagCount).toEqual({ __inc: 1 });
    expect(payload.flaggedBy).toEqual({ __arrayUnion: 'u9' });
    expect(payload.updatedAt).toBe('ts');
  });
  it('fail-soft on a write error', async () => {
    updateDoc.mockRejectedValueOnce(new Error('x'));
    expect(await flagRepresentative('doc1', 'u9')).toEqual({ error: 'Could not flag. Try again.' });
  });
});

describe('getMyClaim', () => {
  it('returns null without a uid (no query)', async () => {
    expect(await getMyClaim(null)).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });
  it('returns null when the user has no claim', async () => {
    getDocs.mockResolvedValue({ empty: true, docs: [] });
    expect(await getMyClaim('u1')).toBeNull();
  });
  it('returns the first claimed ward with its docId merged in', async () => {
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'bangalore-ward-45', data: () => ({ wardNo: 45, claimedByUid: 'u1' }) }],
    });
    const r = await getMyClaim('u1');
    expect(r).toEqual({ docId: 'bangalore-ward-45', wardNo: 45, claimedByUid: 'u1' });
  });
  it('returns null (fail-soft) when the query throws', async () => {
    getDocs.mockRejectedValue(new Error('denied'));
    expect(await getMyClaim('u1')).toBeNull();
  });
});
