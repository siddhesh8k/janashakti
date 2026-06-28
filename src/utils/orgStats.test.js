import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  getCountFromServer: vi.fn(),
}));

import { getOrgStats, getOrgTopTypes } from './orgStats';
import { getCountFromServer } from 'firebase/firestore';

// Helper: a fake aggregation snapshot.
const countSnap = (n) => ({ data: () => ({ count: n }) });

describe('getOrgStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns live totalAdopted + resolved from aggregation counts', async () => {
    getCountFromServer
      .mockResolvedValueOnce(countSnap(12)) // total adopted
      .mockResolvedValueOnce(countSnap(5)); // resolved
    const stats = await getOrgStats('rvce');
    expect(stats).toEqual({ totalAdopted: 12, resolved: 5 });
    expect(stats.resolved).toBeLessThanOrEqual(stats.totalAdopted);
  });

  it('returns zeros for a missing orgId without querying', async () => {
    const stats = await getOrgStats('');
    expect(stats).toEqual({ totalAdopted: 0, resolved: 0 });
    expect(getCountFromServer).not.toHaveBeenCalled();
  });

  it('returns zeros on query error', async () => {
    getCountFromServer.mockRejectedValue(new Error('permission-denied'));
    expect(await getOrgStats('rvce')).toEqual({ totalAdopted: 0, resolved: 0 });
  });
});

describe('getOrgTopTypes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ranks non-zero issue types by count and caps the list', async () => {
    // Key counts to the queried issueType so the test is robust to the ISSUE_TYPES list growing.
    const counts = { Garbage: 9, 'Water Leakage': 4, Pothole: 2, 'Traffic Signal': 1 };
    getCountFromServer.mockImplementation((q) => {
      const f = q.args.find((a) => a && a.field === 'issueType');
      return Promise.resolve(countSnap(counts[f?.val] || 0));
    });
    const top = await getOrgTopTypes('rvce', 3);
    expect(top).toEqual(['Garbage', 'Water Leakage', 'Pothole']);
  });

  it('returns an empty list when the org has no adopted issues', async () => {
    getCountFromServer.mockResolvedValue(countSnap(0));
    expect(await getOrgTopTypes('rvce')).toEqual([]);
  });

  it('returns an empty list on error', async () => {
    getCountFromServer.mockRejectedValue(new Error('nope'));
    expect(await getOrgTopTypes('rvce')).toEqual([]);
  });
});
