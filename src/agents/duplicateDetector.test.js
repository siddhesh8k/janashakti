import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDocs: vi.fn(),
}));
// checkRecurrence doesn't call Gemini; checkDuplicate (ReAct) uses both fn + text.
vi.mock('../utils/gemini', () => ({
  callGeminiFunction: vi.fn(),
  callGeminiText: vi.fn(),
  logAgent: vi.fn(async () => {}),
}));

import { checkRecurrence, checkDuplicate } from './duplicateDetector';
import { getDocs } from 'firebase/firestore';
import { callGeminiFunction, callGeminiText } from '../utils/gemini';

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

// ── checkDuplicate: the bounded ReAct loop ──────────────────────────────────────
const dupSnap = (rows) => ({ docs: rows.map((r) => ({ id: r.id, data: () => r })) });
const newDup = { issueType: 'Pothole', location: HERE, description: 'Deep pothole near MG Road junction' };

describe('checkDuplicate (ReAct loop)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns not-duplicate with ZERO AI calls when nothing is nearby', async () => {
    getDocs.mockResolvedValue(dupSnap([]));

    const r = await checkDuplicate(newDup, 'new1');

    expect(r.isDuplicate).toBe(false);
    expect(r.existingIssueId).toBeNull();
    expect(callGeminiFunction).not.toHaveBeenCalled();
    expect(r.trace).toHaveLength(1);
  });

  it('flags a duplicate after comparing the nearest candidate', async () => {
    getDocs.mockResolvedValue(dupSnap([
      { id: 'open1', issueType: 'Pothole', status: 'Reported', location: HERE, description: 'Large pothole on MG Road' },
    ]));
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'compare', candidateIndex: 0, reasoning: 'check nearest' })
      .mockResolvedValueOnce({ action: 'decide', isDuplicate: true, existingIndex: 0, similarity: 88, reasoning: 'same pothole' });
    callGeminiText.mockResolvedValue({ isDuplicate: true, similarity: 88, reasoning: 'same spot' });

    const r = await checkDuplicate(newDup, 'new1');

    expect(r.isDuplicate).toBe(true);
    expect(r.existingIssueId).toBe('open1');
    expect(r.similarity).toBe(88);
    expect(r.trace).toHaveLength(2);
  });

  it('decides unique when similarity is below threshold', async () => {
    getDocs.mockResolvedValue(dupSnap([
      { id: 'open2', issueType: 'Pothole', status: 'Reported', location: HERE, description: 'Streetlight flickering' },
    ]));
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'compare', candidateIndex: 0, reasoning: 'check' })
      .mockResolvedValueOnce({ action: 'decide', isDuplicate: false, similarity: 30, reasoning: 'different problem' });
    callGeminiText.mockResolvedValue({ isDuplicate: false, similarity: 30, reasoning: 'unrelated' });

    const r = await checkDuplicate(newDup, 'new1');

    expect(r.isDuplicate).toBe(false);
    expect(r.existingIssueId).toBeNull();
  });

  it('enforces the 65% threshold even if the model claims a duplicate', async () => {
    getDocs.mockResolvedValue(dupSnap([
      { id: 'open3', issueType: 'Pothole', status: 'Reported', location: HERE, description: 'pothole-ish' },
    ]));
    callGeminiFunction
      .mockResolvedValueOnce({ action: 'compare', candidateIndex: 0, reasoning: 'check' })
      .mockResolvedValueOnce({ action: 'decide', isDuplicate: true, existingIndex: 0, similarity: 60, reasoning: 'maybe' });
    callGeminiText.mockResolvedValue({ isDuplicate: true, similarity: 60, reasoning: 'borderline' });

    const r = await checkDuplicate(newDup, 'new1');

    expect(r.isDuplicate).toBe(false);
  });

  it('falls back to the best comparison when the loop never explicitly decides', async () => {
    getDocs.mockResolvedValue(dupSnap([
      { id: 'open4', issueType: 'Pothole', status: 'Reported', location: HERE, description: 'same pothole' },
    ]));
    callGeminiFunction.mockResolvedValue({ action: 'compare', candidateIndex: 0, reasoning: 'compare again' });
    callGeminiText.mockResolvedValue({ isDuplicate: true, similarity: 90, reasoning: 'identical' });

    const r = await checkDuplicate(newDup, 'new1');

    expect(r.isDuplicate).toBe(true);
    expect(r.existingIssueId).toBe('open4');
    expect(r.similarity).toBe(90);
  });
});
