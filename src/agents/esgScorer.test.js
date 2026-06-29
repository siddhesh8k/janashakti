import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
  increment: vi.fn((n) => ({ __increment: n })),
  arrayUnion: vi.fn((...vals) => ({ __arrayUnion: vals })),
}));
vi.mock('../utils/gemini', () => ({
  callGeminiText: vi.fn(),
  callGeminiPlainText: vi.fn(),
  logAgent: vi.fn(async () => {}),
}));

import { scoreESGImpact, generateCorporateESGReport } from './esgScorer';
import { callGeminiText, callGeminiPlainText, logAgent } from '../utils/gemini';
import { updateDoc } from 'firebase/firestore';
import { ISSUE_SDG_MAP, IMPACT_ESTIMATES } from '../constants/esg';

// A resolved Water Leakage issue (SDGs: SDG6/SDG3/SDG11; sValue 340).
const resolvedIssue = {
  issueType: 'Water Leakage', severity: 'Critical', locationText: 'T. Nagar', city: 'Chennai',
  confirmations: 8, userId: 'reporter-1', routedTo: { departmentName: 'Water Board' },
  createdAt: { toDate: () => new Date('2026-06-01') },
  resolvedAt: { toDate: () => new Date('2026-06-05') },
};

// Gemini returns pillar scores + a deliberately-wrong overall_esg, to prove the agent
// recomputes overall deterministically rather than trusting the model.
const geminiScore = {
  e_score: 6, e_impact: 'env', e_metric: '45000 litres/month',
  s_score: 8, s_impact: 'soc', s_metric: '340 households benefited',
  g_score: 10, g_impact: 'gov', g_metric: 'fast',
  overall_esg: 2.0, sdg_tags: ['WRONG'], sdg_names: ['wrong'], highlight: 'h',
};

describe('scoreESGImpact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a weighted ESG score to the issue + increments reporter stats (happy path)', async () => {
    callGeminiText.mockResolvedValue({ ...geminiScore });

    const result = await scoreESGImpact(resolvedIssue, 'issue-1');

    // Returned + overall recomputed: 6*0.35 + 8*0.35 + 10*0.30 = 7.9 (not the model's 2.0).
    expect(result).not.toBeNull();
    expect(result.overall_esg).toBe(7.9);

    // 1st updateDoc → the issue doc gets esgScore + esgScoredAt.
    const issueCall = updateDoc.mock.calls[0];
    expect(issueCall[0]).toEqual({ col: 'issues', id: 'issue-1' });
    expect(issueCall[1].esgScore.overall_esg).toBe(7.9);
    expect(issueCall[1].esgScoredAt).toBe('ts');

    // 2nd updateDoc → reporter's user doc, atomic increments + SDG arrayUnion (real mapping).
    const userCall = updateDoc.mock.calls[1];
    expect(userCall[0]).toEqual({ col: 'users', id: 'reporter-1' });
    expect(userCall[1].esgIssuesResolved).toEqual({ __increment: 1 });
    expect(userCall[1].totalPeopleImpacted).toEqual({ __increment: IMPACT_ESTIMATES['Water Leakage'].sValue });
    expect(userCall[1].sdgsContributed).toEqual({ __arrayUnion: ISSUE_SDG_MAP['Water Leakage'].sdgs });

    // Logged as a successful agent run.
    expect(logAgent).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'esg_scorer', success: true }));
  });

  it('still returns the score when the cross-user stats write is denied by rules', async () => {
    callGeminiText.mockResolvedValue({ ...geminiScore });
    // issue write resolves; reporter-stats write (different user) is rejected by rules.
    updateDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('permission-denied'));

    const result = await scoreESGImpact(resolvedIssue, 'issue-1');

    expect(result).not.toBeNull();
    expect(result.overall_esg).toBe(7.9);
    expect(logAgent).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'esg_scorer', success: true }));
  });

  it('returns null and logs a failure when Gemini errors', async () => {
    callGeminiText.mockRejectedValue(new Error('AI unavailable'));

    const result = await scoreESGImpact(resolvedIssue, 'issue-1');

    expect(result).toBeNull();
    expect(logAgent).toHaveBeenCalledWith(expect.objectContaining({ agentName: 'esg_scorer', success: false }));
  });

  it('falls back to ISSUE_SDG_MAP.Other for an unknown issue type', async () => {
    callGeminiText.mockResolvedValue({ ...geminiScore });

    await scoreESGImpact({ ...resolvedIssue, issueType: 'Nonexistent' }, 'issue-2');

    const userCall = updateDoc.mock.calls[1];
    expect(userCall[1].sdgsContributed).toEqual({ __arrayUnion: ISSUE_SDG_MAP.Other.sdgs });
  });
});

describe('generateCorporateESGReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the plain-text report via callGeminiPlainText (not JSON)', async () => {
    callGeminiPlainText.mockResolvedValue('## ESG Report\nExecutive summary…');

    const text = await generateCorporateESGReport({ name: 'Acme', area: 'Koramangala', quarter: 'Q2' });

    expect(callGeminiPlainText).toHaveBeenCalledTimes(1);
    expect(text).toContain('ESG Report');
  });

  it('returns a graceful fallback string when generation fails', async () => {
    callGeminiPlainText.mockRejectedValue(new Error('down'));

    const text = await generateCorporateESGReport({ name: 'Acme' });

    expect(typeof text).toBe('string');
    expect(text).toMatch(/failed/i);
  });
});
