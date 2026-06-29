import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async () => ({ id: 'run1' })),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
}));
vi.mock('./duplicateDetector', () => ({ checkDuplicate: vi.fn(), checkRecurrence: vi.fn() }));
vi.mock('./authorityRouter', () => ({ routeToAuthority: vi.fn() }));
vi.mock('./resolutionPredictor', () => ({ predictResolution: vi.fn() }));

import { orchestrateIssue } from './orchestrator';
import { checkDuplicate, checkRecurrence } from './duplicateDetector';
import { routeToAuthority } from './authorityRouter';
import { predictResolution } from './resolutionPredictor';
import { updateDoc } from 'firebase/firestore';

const analysis = { issue_type: 'Pothole', severity: 'High', confidence: 88 };
const issueData = { issueType: 'Pothole', severity: 'High', locationText: 'MG Road' };

describe('orchestrateIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: not a recurrence — individual tests override when exercising that path.
    checkRecurrence.mockResolvedValue({ isRecurrence: false });
  });

  it('passes Agent 3 routing output into Agent 4 (fixes the Unknown-department bug)', async () => {
    checkDuplicate.mockResolvedValue({ isDuplicate: false, existingIssueId: null });
    routeToAuthority.mockResolvedValue({ departmentName: 'BBMP Roads', slaHours: 72, urgencyLevel: 'Urgent', emailSent: true });
    predictResolution.mockResolvedValue({ predicted_days: 9, priority_score: 70, confidence: 80, recommendation: 'Escalate' });
    const saveIssue = vi.fn(async () => 'doc123');

    const run = await orchestrateIssue({ analysis, issueData, tempId: 't', onStep: () => {}, saveIssue });

    expect(saveIssue).toHaveBeenCalledTimes(1);
    const predArg = predictResolution.mock.calls[0][0];
    expect(predArg.routedTo).toEqual(expect.objectContaining({ departmentName: 'BBMP Roads' }));
    expect(predArg.id).toBe('doc123');
    expect(run.routing.departmentName).toBe('BBMP Roads');
    expect(run.prediction.predicted_days).toBe(9);
    // routedTo + prediction persisted onto the issue doc.
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('produces a step trace covering all four agents, all done', async () => {
    checkDuplicate.mockResolvedValue({ isDuplicate: false, existingIssueId: null });
    routeToAuthority.mockResolvedValue({ departmentName: 'X', slaHours: 24 });
    predictResolution.mockResolvedValue({ predicted_days: 5 });

    const run = await orchestrateIssue({ analysis, issueData, tempId: 't', onStep: () => {}, saveIssue: async () => 'd' });

    expect(run.steps.map(s => s.agent)).toEqual(['analyzer', 'detector', 'router', 'predictor']);
    expect(run.steps.every(s => s.status === 'done')).toBe(true);
  });

  it('short-circuits on a duplicate — no save, no routing, no prediction', async () => {
    checkDuplicate.mockResolvedValue({ isDuplicate: true, existingIssueId: 'old1', similarity: 92 });
    const saveIssue = vi.fn(async () => 'doc123');

    const run = await orchestrateIssue({ analysis, issueData, tempId: 't', onStep: () => {}, saveIssue });

    expect(saveIssue).not.toHaveBeenCalled();
    expect(routeToAuthority).not.toHaveBeenCalled();
    expect(predictResolution).not.toHaveBeenCalled();
    expect(run.duplicate.isDuplicate).toBe(true);
    expect(run.docId).toBeNull();
  });

  it('flags a recurrence — saves the prior-issue link and routes it to the authority', async () => {
    checkDuplicate.mockResolvedValue({ isDuplicate: false, existingIssueId: null });
    checkRecurrence.mockResolvedValue({
      isRecurrence: true, priorIssueId: 'old99', priorComplaintId: 'JS-BLR-2025-0007',
      resolvedAtISO: '2025-08-01T00:00:00.000Z', daysSinceResolved: 120, recurrenceCount: 1,
    });
    routeToAuthority.mockResolvedValue({ departmentName: 'BBMP Roads', slaHours: 72 });
    predictResolution.mockResolvedValue({ predicted_days: 5 });
    const saveIssue = vi.fn(async () => 'newDoc');

    const run = await orchestrateIssue({ analysis, issueData, tempId: 't', onStep: () => {}, saveIssue });

    // The saved issue carries the recurrence linkage…
    const saved = saveIssue.mock.calls[0][0];
    expect(saved.recurrenceOf).toBe('old99');
    expect(saved.recurrenceOfComplaintId).toBe('JS-BLR-2025-0007');
    expect(saved.recurrenceCount).toBe(1);
    // …and Agent 3 receives it so the email can cite the prior complaint.
    expect(routeToAuthority.mock.calls[0][0].recurrenceOf).toBe('old99');
    // The detector step communicates the recurrence to the user.
    const detector = run.steps.find(s => s.agent === 'detector');
    expect(detector.summary.toLowerCase()).toContain('recurrence');
  });

  it('a non-recurrence does NOT add recurrence fields to the saved issue', async () => {
    checkDuplicate.mockResolvedValue({ isDuplicate: false, existingIssueId: null });
    checkRecurrence.mockResolvedValue({ isRecurrence: false });
    routeToAuthority.mockResolvedValue({ departmentName: 'X' });
    predictResolution.mockResolvedValue({ predicted_days: 5 });
    const saveIssue = vi.fn(async () => 'd');

    await orchestrateIssue({ analysis, issueData, tempId: 't', onStep: () => {}, saveIssue });

    expect(saveIssue.mock.calls[0][0].recurrenceOf).toBeUndefined();
  });

  it('emits live step snapshots through onStep', async () => {
    checkDuplicate.mockResolvedValue({ isDuplicate: false, existingIssueId: null });
    routeToAuthority.mockResolvedValue({ departmentName: 'X' });
    predictResolution.mockResolvedValue({ predicted_days: 5 });
    const snapshots = [];

    await orchestrateIssue({ analysis, issueData, tempId: 't', onStep: (s) => snapshots.push(s), saveIssue: async () => 'd' });

    expect(snapshots.length).toBeGreaterThan(1);
    // Each snapshot is an independent array copy (not the same mutated reference).
    expect(snapshots[0]).not.toBe(snapshots[snapshots.length - 1]);
  });
});
