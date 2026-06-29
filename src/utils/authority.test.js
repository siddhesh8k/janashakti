import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
}));

import { isAuthority, enrollAuthority } from './authority';
import { getDoc, setDoc } from 'firebase/firestore';

describe('isAuthority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is true when the allowlist doc exists', async () => {
    getDoc.mockResolvedValue({ exists: () => true });
    expect(await isAuthority('uid1')).toBe(true);
  });

  it('is false when the doc is missing', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    expect(await isAuthority('uid1')).toBe(false);
  });

  it('is false for a missing uid without querying', async () => {
    expect(await isAuthority('')).toBe(false);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('is false on error', async () => {
    getDoc.mockRejectedValue(new Error('denied'));
    expect(await isAuthority('uid1')).toBe(false);
  });
});

describe('enrollAuthority', () => {
  // Default: not yet enrolled → the create path runs.
  beforeEach(() => { vi.clearAllMocks(); getDoc.mockResolvedValue({ exists: () => false }); });

  it('writes the caller\'s own allowlist doc and returns true', async () => {
    const ok = await enrollAuthority('uid1');
    expect(ok).toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = setDoc.mock.calls[0];
    expect(ref).toEqual({ col: 'authorities', id: 'uid1' });
    expect(data).toMatchObject({ uid: 'uid1' });
  });

  it('is idempotent — returns true WITHOUT writing if already enrolled', async () => {
    getDoc.mockResolvedValue({ exists: () => true });
    expect(await enrollAuthority('uid1')).toBe(true);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('returns false for a missing uid without writing', async () => {
    expect(await enrollAuthority('')).toBe(false);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('returns false on write error', async () => {
    setDoc.mockRejectedValueOnce(new Error('denied'));
    expect(await enrollAuthority('uid1')).toBe(false);
  });
});
