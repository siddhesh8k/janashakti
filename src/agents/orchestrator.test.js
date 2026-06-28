import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async () => ({ id: 'run1' })),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
}));
vi.mock('./duplicateDetector', () => ({ checkDuplicate: vi.fn() }));
vi.mock('./authorityRouter', () => ({ routeToAuthority: vi.fn() }));
vi.mock('./resolutionPredictor', () => ({ predictResolution: vi.fn() }));

import { orchestrateIssue } from './orchestrator';
import { checkDuplicate } from './duplicateDetector';
import { routeToAuthority } from './authorityRouter';
import { predictResolution } from './resolutionPredictor';
import { updateDoc } from 'firebase/firestore';

const analysis = { issue_type: 'Pothole', severity: 'High', confidence: 88 };
const issueData = { issueType: 'Pothole', severity: 'High', locationText: 'MG Road' };

describe('orchestrateIssue', () => {
  beforeEach(() => vi.clearAllMocks());

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
