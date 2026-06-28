import { describe, it, expect } from 'vitest';
import { daysOpenOf, storyCriteria, isStoryReady, claimStatus, CLAIM_WINDOW_MS } from './story';

const NOW = 1_700_000_000_000; // fixed reference time
const daysAgo = (n) => ({ createdAt: { toDate: () => new Date(NOW - n * 86400000) } });

describe('daysOpenOf', () => {
  it('returns 0 when createdAt is missing', () => {
    expect(daysOpenOf({}, NOW)).toBe(0);
  });
  it('counts whole days from a Firestore Timestamp-like value', () => {
    expect(daysOpenOf(daysAgo(20), NOW)).toBe(20);
  });
  it('accepts a plain date/ISO createdAt', () => {
    expect(daysOpenOf({ createdAt: new Date(NOW - 5 * 86400000).toISOString() }, NOW)).toBe(5);
  });
});

describe('storyCriteria / isStoryReady', () => {
  // Exactly 3 signals: not resolved, 14+ days, Critical severity.
  const threeSignals = { ...daysAgo(20), status: 'Reported', severity: 'Critical', confirmations: 0, escalationLevel: 0 };
  // Only 2 signals: not resolved + Critical (fresh, no confirmations/escalation/email).
  const twoSignals = { ...daysAgo(1), status: 'Reported', severity: 'Critical', confirmations: 0, escalationLevel: 0 };

  it('counts met signals', () => {
    expect(storyCriteria(threeSignals, NOW).met).toBe(3);
    expect(storyCriteria(twoSignals, NOW).met).toBe(2);
  });
  it('is story-ready at >= 3 met signals', () => {
    expect(isStoryReady(threeSignals, NOW)).toBe(true);
    expect(isStoryReady(twoSignals, NOW)).toBe(false);
  });
});

describe('claimStatus', () => {
  const mine = 'me', other = 'someone-else';
  it('is open when unclaimed', () => {
    expect(claimStatus({}, mine, NOW)).toEqual({ state: 'open' });
  });
  it('is mine when I hold a fresh claim', () => {
    const issue = { storyClaimedBy: mine, storyClaimedAt: { toDate: () => new Date(NOW - 3600000) } };
    const r = claimStatus(issue, mine, NOW);
    expect(r.state).toBe('mine');
    expect(r.hoursRemaining).toBe(47);
  });
  it('is locked when someone else holds a fresh claim', () => {
    const issue = { storyClaimedBy: other, storyClaimedAt: { toDate: () => new Date(NOW - 3600000) } };
    expect(claimStatus(issue, mine, NOW).state).toBe('locked');
  });
  it('reopens after the 48h window expires', () => {
    const issue = { storyClaimedBy: other, storyClaimedAt: { toDate: () => new Date(NOW - CLAIM_WINDOW_MS - 1) } };
    expect(claimStatus(issue, mine, NOW)).toEqual({ state: 'open' });
  });
});
