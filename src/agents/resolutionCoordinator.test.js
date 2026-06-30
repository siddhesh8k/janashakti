import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async () => ({ id: 'run1' })),
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
}));
vi.mock('../utils/gemini', () => ({
  callGeminiFunction: vi.fn(),
  callGeminiText: vi.fn(),
  generateRTI: vi.fn(async () => 'RTI APPLICATION — formal letter body for the unresolved issue.'),
  logAgent: vi.fn(async () => {}),
}));
vi.mock('../utils/escalation', () => ({
  checkAndEscalate: vi.fn(),
  getEscalationInfo: vi.fn(),
}));
vi.mock('./authorityRouter', () => ({ routeToAuthority: vi.fn() }));
vi.mock('../utils/collaboration', () => ({ markNeedsVerification: vi.fn() }));

import { coordinateResolution } from './resolutionCoordinator';
import { callGeminiFunction, callGeminiText, generateRTI, logAgent } from '../utils/gemini';
import { checkAndEscalate, getEscalationInfo } from '../utils/escalation';
import { routeToAuthority } from './authorityRouter';
import { markNeedsVerification } from '../utils/collaboration';
import { addDoc, updateDoc } from 'firebase/firestore';

// callGeminiFunction returns each decision in turn; once exhausted, repeats the last
// (which must be a terminal 'done' so the loop ends deterministically).
const decisionSequence = (...decisions) => {
  let i = 0;
  callGeminiFunction.mockImplementation(async () => decisions[Math.min(i++, decisions.length - 1)]);
};

const user = { uid: 'u1', displayName: 'Authority' };

describe('coordinateResolution (autonomous ReAct loop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A stalled, mid-tier issue by default. daysOpen high enough to justify action.
    getEscalationInfo.mockReturnValue({
      currentLevel: 1, currentAuthority: 'Department Head', daysOpen: 18,
      daysUntilNextEscalation: 0, nextAuthority: 'Commissioner Office',
      isWallOfShame: false, color: '#f97316',
    });
    checkAndEscalate.mockResolvedValue({ escalated: true, from: 1, to: 2, escalatedTo: 'Commissioner Office', daysOpen: 18 });
    routeToAuthority.mockResolvedValue({ departmentName: 'BBMP Roads', urgencyLevel: 'Urgent', slaHours: 72, emailSent: true });
    markNeedsVerification.mockResolvedValue({ ok: true });
  });

  const baseIssue = () => ({
    id: 'i1', issueType: 'Pothole', severity: 'High', status: 'In Progress',
    escalationLevel: 1, recurrenceOf: 'old1', recurrenceCount: 2, locationText: 'MG Road',
  });

  it('executes the decided sequence (escalate → draft_rti → done) and feeds each observation forward', async () => {
    decisionSequence(
      { action: 'escalate', reasoning: '18 days open and overdue at this tier.' },
      { action: 'draft_rti', reasoning: 'It recurred — compel disclosure with an RTI.' },
      { action: 'done', reasoning: 'Pressure applied; nothing more to do now.' },
    );
    const snapshots = [];
    const res = await coordinateResolution(baseIssue(), { user, onStep: (s) => snapshots.push(s) });

    // Tools ran exactly as decided.
    expect(checkAndEscalate).toHaveBeenCalledTimes(1);
    expect(generateRTI).toHaveBeenCalledTimes(1);
    expect(markNeedsVerification).not.toHaveBeenCalled();
    expect(routeToAuthority).not.toHaveBeenCalled();
    expect(callGeminiFunction).toHaveBeenCalledTimes(3);

    // The escalate observation is fed into the SECOND decision's prompt (observe → reason).
    const secondPrompt = callGeminiFunction.mock.calls[1][1];
    expect(secondPrompt).toContain('Escalated to Commissioner Office');

    // Result surfaces the drafted RTI + an action summary.
    expect(res.rtiDraft).toContain('RTI APPLICATION');
    expect(res.summary).toMatch(/Escalate/);
    expect(res.error).toBeUndefined();

    // Persistence + audit: coordination written, agent_run logged, agent logged.
    expect(updateDoc).toHaveBeenCalled();
    const persisted = updateDoc.mock.calls.find((c) => c[1] && c[1].coordination);
    expect(persisted[1].coordination.actions.map((a) => a.action)).toEqual(['escalate', 'draft_rti', 'done']);
    expect(persisted[1].coordination.rtiDraft).toContain('RTI APPLICATION');
    expect(addDoc).toHaveBeenCalledTimes(1); // agent_runs trace
    expect(logAgent).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'resolution_coordinator', success: true }));

    // Live trace streamed to the UI.
    expect(snapshots.length).toBeGreaterThan(1);
    expect(snapshots.at(-1).every((s) => s.agent === 'coordinator')).toBe(true);
  });

  it('self-corrects: when already at the top tier, escalate no-ops and the agent pivots', async () => {
    getEscalationInfo.mockReturnValue({
      currentLevel: 3, currentAuthority: 'Media & Public Alert', daysOpen: 40,
      daysUntilNextEscalation: null, nextAuthority: null, isWallOfShame: true, color: '#7f1d1d',
    });
    decisionSequence(
      { action: 'escalate', reasoning: 'try to escalate' },
      { action: 'draft_rti', reasoning: 'escalation maxed — switch to RTI' },
      { action: 'done', reasoning: 'done' },
    );
    const issue = { ...baseIssue(), escalationLevel: 3 };
    await coordinateResolution(issue, { user });

    // The real escalation tool is NOT invoked (guarded), yet the loop continues.
    expect(checkAndEscalate).not.toHaveBeenCalled();
    expect(generateRTI).toHaveBeenCalledTimes(1);
    // The "no escalation possible" observation reached the next decision.
    expect(callGeminiFunction.mock.calls[1][1]).toContain('No escalation possible');
  });

  it('guardrail: a repeated mutating action terminates the run instead of looping', async () => {
    decisionSequence(
      { action: 'escalate', reasoning: 'first' },
      { action: 'escalate', reasoning: 'again (should be suppressed)' },
    );
    const res = await coordinateResolution(baseIssue(), { user });

    expect(checkAndEscalate).toHaveBeenCalledTimes(1);   // escalate ran once only
    expect(callGeminiFunction).toHaveBeenCalledTimes(2);
    // The final step is a terminal 'Plan complete', not a second escalate.
    expect(res.steps.at(-1).name).toBe('Plan complete');
  });

  it('guardrail: never exceeds the iteration cap (forces done on the 4th)', async () => {
    getEscalationInfo.mockReturnValue({
      currentLevel: 0, currentAuthority: 'Ward Officer', daysOpen: 18,
      daysUntilNextEscalation: 0, nextAuthority: 'Department Head', isWallOfShame: false, color: '#16a34a',
    });
    // Four DISTINCT mutating actions, none terminal → the cap must stop it.
    decisionSequence(
      { action: 'escalate', reasoning: 'a' },
      { action: 'reroute', reasoning: 'b' },
      { action: 'request_verification', reasoning: 'c' },
      { action: 'draft_rti', reasoning: 'd' },
      { action: 'reroute', reasoning: 'should never be reached' },
    );
    const res = await coordinateResolution({ ...baseIssue(), escalationLevel: 0 }, { user });

    expect(callGeminiFunction).toHaveBeenCalledTimes(4); // capped — 5th decision never requested
    expect(checkAndEscalate).toHaveBeenCalledTimes(1);
    expect(routeToAuthority).toHaveBeenCalledTimes(1);
    expect(markNeedsVerification).toHaveBeenCalledTimes(1);
    expect(generateRTI).toHaveBeenCalledTimes(1);
    expect(res.steps.at(-1).name).toBe('Plan complete'); // explicit close after the cap
  });

  it("'wait' is terminal and mutates nothing", async () => {
    getEscalationInfo.mockReturnValue({
      currentLevel: 0, currentAuthority: 'Ward Officer', daysOpen: 1,
      daysUntilNextEscalation: 6, nextAuthority: 'Department Head', isWallOfShame: false, color: '#16a34a',
    });
    decisionSequence({ action: 'wait', reasoning: 'Fresh report, still within SLA.' });
    const res = await coordinateResolution({ ...baseIssue(), status: 'Reported', escalationLevel: 0 }, { user });

    expect(callGeminiFunction).toHaveBeenCalledTimes(1);
    expect(checkAndEscalate).not.toHaveBeenCalled();
    expect(generateRTI).not.toHaveBeenCalled();
    expect(res.summary).toMatch(/SLA|track|monitor|Fresh/i);
  });

  it('falls back to the JSON path when function-calling is unavailable', async () => {
    callGeminiFunction.mockRejectedValue(new Error('function-calling: unsupported via proxy'));
    callGeminiText.mockResolvedValue({ action: 'request_verification', reasoning: 'Looks fixed on the ground.' });
    // Second loop turn: end cleanly.
    callGeminiText.mockResolvedValueOnce({ action: 'request_verification', reasoning: 'Looks fixed on the ground.' });

    const res = await coordinateResolution(baseIssue(), { user });

    expect(callGeminiText).toHaveBeenCalled();
    expect(markNeedsVerification).toHaveBeenCalledTimes(1);
    expect(res.error).toBeUndefined();
  });

  it('returns gracefully without an issue id', async () => {
    const res = await coordinateResolution({}, { user });
    expect(res.error).toBe('missing issue');
    expect(callGeminiFunction).not.toHaveBeenCalled();
  });
});
