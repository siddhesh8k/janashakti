import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDocs: vi.fn(),
}));
// checkRecurrence doesn't call Gemini, but the module imports these at top.
vi.mock('../utils/gemini', () => ({ callGeminiText: vi.fn(), logAgent: vi.fn(async () => {}) }));

import { checkRecurrence } from './duplicateDetector';
import { getDocs } from 'firebase/firestore';

// Same spot as the new report; ±0.002° (~200 m) counts as "the same place".
const HERE = { lat: 12.9716, lng: 77.5946 };
const newIssue = { issueType: 'Pothole', location: HERE };

const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString();
const resolvedSnap = (rows) => ({ docs: rows.map(r => ({ id: r.id, data: () => r })) });

describe('checkRecurrence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags a same-type issue resolved at the same spot within the 1-year window', async () => {
    getDocs.mockResolvedValue(resolvedSnap([
      { id: 'old1', status: 'Resolved', issueType: 'Pothole', location: HERE,
        complaintId: 'JS-BLR-2025-0007', resolvedAt: daysAgoISO(120) },
    ]));

    const r = await checkRecurrence(newIssue);

    expect(r.isRecurrence).toBe(true);
    expect(r.priorIssueId).toBe('old1');
    expect(r.priorComplaintId).toBe('JS-BLR-2025-0007');
    expect(r.daysSinceResolved).toBeGreaterThanOrEqual(119);
    expect(r.daysSinceResolved).toBeLessThanOrEqual(121);
    expect(r.recurrenceCount).toBe(1);
  });

  it('ignores a fix that is older than the window (resolved > 365 days ago)', async () => {
    getDocs.mockResolvedValue(resolvedSnap([
      { id: 'stale', status: 'Resolved', issueType: 'Pothole', location: HERE,
        resolvedAt: daysAgoISO(400) },
    ]));
    expect((await checkRecurrence(newIssue)).isRecurrence).toBe(false);
  });

  it('ignores a resolved issue that is not at the same location', async () => {
    getDocs.mockResolvedValue(resolvedSnap([
      { id: 'far', status: 'Resolved', issueType: 'Pothole',
        location: { lat: HERE.lat + 0.01, lng: HERE.lng + 0.01 }, resolvedAt: daysAgoISO(30) },
    ]));
    expect((await checkRecurrence(newIssue)).isRecurrence).toBe(false);
  });

  it('picks the most recently resolved candidate when several qualify', async () => {
    getDocs.mockResolvedValue(resolvedSnap([
      { id: 'older',  status: 'Resolved', issueType: 'Pothole', location: HERE, resolvedAt: daysAgoISO(200) },
      { id: 'recent', status: 'Resolved', issueType: 'Pothole', location: HERE, resolvedAt: daysAgoISO(20)  },
    ]));
    expect((await checkRecurrence(newIssue)).priorIssueId).toBe('recent');
  });

  it('chains the recurrence count from the prior issue', async () => {
    getDocs.mockResolvedValue(resolvedSnap([
      { id: 'old', status: 'Resolved', issueType: 'Pothole', location: HERE,
        resolvedAt: daysAgoISO(50), recurrenceCount: 2 },
    ]));
    expect((await checkRecurrence(newIssue)).recurrenceCount).toBe(3);
  });

  it('returns false (and does not query) when the new report has no location', async () => {
    const r = await checkRecurrence({ issueType: 'Pothole' });
    expect(r.isRecurrence).toBe(false);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
