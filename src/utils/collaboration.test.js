import { describe, it, expect, vi } from 'vitest';

// collaboration.js imports firebase/gemini/publicProfile at load — mock them so the pure
// helpers can be imported and tested in isolation.
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(), collection: vi.fn(), addDoc: vi.fn(),
  arrayUnion: vi.fn(), increment: vi.fn(), serverTimestamp: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock('./publicProfile', () => ({ bumpPublicProfile: vi.fn() }));
vi.mock('./gemini', () => ({ callGeminiVision: vi.fn() }));

import { checkVerificationThreshold, isContributor, isRemoved } from './collaboration';

describe('checkVerificationThreshold', () => {
  const base = { threshold: 5, positiveRatio: 0.7 };

  it('returns null until the vote threshold is reached', () => {
    expect(checkVerificationThreshold({ ...base, votes: { yes: 3, no: 0, partial: 0 } })).toBeNull();
  });

  it('passes when enough votes and >= 70% positive', () => {
    expect(checkVerificationThreshold({ ...base, votes: { yes: 4, no: 1, partial: 0 } })).toBe('passed'); // 4/5 = 80%
  });

  it('fails when enough votes but < 70% positive', () => {
    expect(checkVerificationThreshold({ ...base, votes: { yes: 2, no: 3, partial: 0 } })).toBe('failed'); // 2/5 = 40%
  });

  it('counts partial votes as half-positive', () => {
    // (2 + 2*0.5) / 5 = 60% → fails
    expect(checkVerificationThreshold({ ...base, votes: { yes: 2, no: 1, partial: 2 } })).toBe('failed');
    // (3 + 2*0.5) / 6 = 66.7%? use threshold 5: (4 + 2*0.5)/6 = 83% → passed
    expect(checkVerificationThreshold({ ...base, votes: { yes: 4, no: 0, partial: 2 } })).toBe('passed');
  });

  it('defaults threshold/ratio when missing', () => {
    expect(checkVerificationThreshold({ votes: { yes: 5, no: 0, partial: 0 } })).toBe('passed');
  });
});

describe('contributor helpers', () => {
  const issue = { contributors: [{ userId: 'a' }, { userId: 'b' }], removedUids: ['x'] };
  it('isContributor detects membership', () => {
    expect(isContributor(issue, 'a')).toBe(true);
    expect(isContributor(issue, 'z')).toBe(false);
    expect(isContributor(issue, undefined)).toBe(false);
  });
  it('isRemoved detects removed users', () => {
    expect(isRemoved(issue, 'x')).toBe(true);
    expect(isRemoved(issue, 'a')).toBe(false);
  });
});
