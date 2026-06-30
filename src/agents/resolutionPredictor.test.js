import { describe, it, expect, vi, beforeEach } from 'vitest';

// Self-mock Gemini exactly as the module under test imports it.
vi.mock('../utils/gemini', () => ({
  callGeminiText: vi.fn(),
  logAgent: vi.fn(async () => {}),
}));

import { predictResolution } from './resolutionPredictor';
import { callGeminiText, logAgent } from '../utils/gemini';

const baseIssue = {
  issueType: 'Pothole',
  severity: 'High',
  city: 'Bangalore',
  confirmations: 3,
  escalationLevel: 1,
  routedTo: { departmentName: 'BBMP Roads' },
};

const aiPrediction = {
  priority_score: 72,
  predicted_days: 10,
  escalation_risk: 'Medium',
  recommendation: 'Dispatch a road crew within 48 hours',
  confidence: 80,
  factors: ['high severity', 'multiple confirmations', 'urban arterial road'],
};

describe('predictResolution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the parsed model prediction on the happy path', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);

    const r = await predictResolution(baseIssue, 'issue1');

    expect(r).toEqual(aiPrediction);
    expect(callGeminiText).toHaveBeenCalledTimes(1);
  });

  it('embeds the routed department into the model prompt', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);

    await predictResolution(baseIssue, 'issue1');

    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Department: BBMP Roads');
    expect(prompt).toContain('Type: Pothole');
    expect(prompt).toContain('Severity: High');
    expect(prompt).toContain('City: Bangalore');
    expect(prompt).toContain('Community confirmations: 3');
    expect(prompt).toContain('Escalation level: 1 of 3');
  });

  it('falls back to Unknown department when routedTo is absent', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);

    await predictResolution({ issueType: 'Garbage', severity: 'Low' }, 'issue2');

    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Department: Unknown');
    expect(prompt).toContain('City: Unknown');
    expect(prompt).toContain('Community confirmations: 0');
  });

  it('computes days open from a Firestore timestamp and surfaces it in the prompt', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
    const issue = { ...baseIssue, createdAt: { toDate: () => fiveDaysAgo } };

    await predictResolution(issue, 'issue3');

    expect(callGeminiText.mock.calls[0][0]).toContain('Days open: 5');
  });

  it('reflects collaboration signals (contributors / evidence / activity) in the prompt', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);
    const issue = {
      ...baseIssue,
      contributorCount: 4,
      evidenceCount: 7,
      timelineDensity: 9,
    };

    await predictResolution(issue, 'issue4');

    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Contributors collaborating: 4');
    expect(prompt).toContain('Evidence items uploaded: 7');
    expect(prompt).toContain('Recent activity events (last 7 days): 9');
  });

  it('derives contributor count from a contributors array when no explicit count is set', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);
    const issue = { ...baseIssue, contributors: ['a', 'b', 'c'] };

    await predictResolution(issue, 'issue5');

    expect(callGeminiText.mock.calls[0][0]).toContain('Contributors collaborating: 3');
  });

  it('logs a successful agent run to agents_log', async () => {
    callGeminiText.mockResolvedValue(aiPrediction);

    await predictResolution(baseIssue, 'issue6');

    expect(logAgent).toHaveBeenCalledTimes(1);
    const logged = logAgent.mock.calls[0][0];
    expect(logged.agentName).toBe('resolution_predictor');
    expect(logged.issueId).toBe('issue6');
    expect(logged.success).toBe(true);
    expect(logged.output).toEqual(aiPrediction);
    expect(typeof logged.processingTimeMs).toBe('number');
  });

  it('returns the safe deterministic default when the model call throws', async () => {
    callGeminiText.mockRejectedValue(new Error('429 rate limited'));

    const r = await predictResolution(baseIssue, 'issue7');

    expect(r).toEqual({
      priority_score: 50,
      predicted_days: 14,
      escalation_risk: 'Medium',
      recommendation: 'Monitor for community confirmations',
      confidence: 50,
      factors: [],
    });
  });

  it('logs a failed agent run (success:false + error message) on the fallback path', async () => {
    callGeminiText.mockRejectedValue(new Error('boom'));

    await predictResolution(baseIssue, 'issue8');

    expect(logAgent).toHaveBeenCalledTimes(1);
    const logged = logAgent.mock.calls[0][0];
    expect(logged.agentName).toBe('resolution_predictor');
    expect(logged.success).toBe(false);
    expect(logged.error).toBe('boom');
    expect(logged.output).toBeNull();
  });
});
