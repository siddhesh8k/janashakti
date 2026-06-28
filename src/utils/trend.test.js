import { describe, it, expect } from 'vitest';
import { trendSeries } from './trend';

const day = 86400000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

describe('trendSeries', () => {
  it('returns [] for no issues', () => {
    expect(trendSeries([])).toEqual([]);
  });

  it('produces the requested number of buckets with week labels', () => {
    const issues = [
      { createdAt: iso(60 * day), status: 'Reported' },
      { createdAt: iso(1 * day), status: 'Reported' },
    ];
    const out = trendSeries(issues, 8);
    expect(out).toHaveLength(8);
    expect(out[0]).toHaveProperty('week');
    expect(out[0]).toHaveProperty('reported');
    expect(out[0]).toHaveProperty('resolved');
  });

  it('counts reported in the first bucket and resolved in a later one', () => {
    const issues = [
      // reported at the start of the range, resolved near the end
      { createdAt: iso(70 * day), resolvedAt: iso(2 * day), status: 'Resolved' },
      // reported only, near the start
      { createdAt: iso(69 * day), status: 'Reported' },
    ];
    const out = trendSeries(issues, 8);
    const totalReported = out.reduce((s, b) => s + b.reported, 0);
    const totalResolved = out.reduce((s, b) => s + b.resolved, 0);
    expect(totalReported).toBe(2);
    expect(totalResolved).toBe(1);
    // resolved should land in the last bucket (most recent), reported in the first
    expect(out[0].reported).toBeGreaterThan(0);
    expect(out[out.length - 1].resolved).toBe(1);
  });

  it('does not count resolved for non-resolved issues', () => {
    const issues = [{ createdAt: iso(10 * day), status: 'In Progress' }];
    const out = trendSeries(issues, 4);
    expect(out.reduce((s, b) => s + b.resolved, 0)).toBe(0);
    expect(out.reduce((s, b) => s + b.reported, 0)).toBe(1);
  });

  it('accepts Firestore-style timestamps (toDate)', () => {
    const ts = (msAgo) => ({ toDate: () => new Date(Date.now() - msAgo) });
    const out = trendSeries([{ createdAt: ts(5 * day), status: 'Reported' }], 4);
    expect(out.reduce((s, b) => s + b.reported, 0)).toBe(1);
  });
});
