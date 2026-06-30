import { describe, it, expect, vi, beforeEach } from 'vitest';

// generateCSRReport calls callGeminiText(prompt) and returns its parsed object,
// degrading to a deterministic fallback object when the AI call rejects.
vi.mock('./gemini', () => ({
  callGeminiText: vi.fn(),
}));

import { generateCSRReport } from './csrReport';
import { callGeminiText } from './gemini';

describe('generateCSRReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a prompt from the org name, type and issues summary, then returns the AI result', async () => {
    const aiResult = {
      title: 'Monthly Civic Impact Report — Acme Corp',
      period: 'June 2026',
      summary: 'Acme did great things.',
      highlights: ['a', 'b', 'c'],
      impactScore: 92,
      resolutionRate: '90%',
      topIssueType: 'Pothole',
      recommendation: 'keep going',
      linkedinPost: 'Acme rocks #JanaShakti #CSR',
    };
    callGeminiText.mockResolvedValue(aiResult);

    const summary = { total: 40, resolved: 36, byType: { Pothole: 20 } };
    const out = await generateCSRReport('Acme Corp', 'private company', summary);

    // returns exactly what the AI produced on success
    expect(out).toBe(aiResult);
    expect(out.impactScore).toBe(92);

    // prompt is built deterministically from the inputs
    expect(callGeminiText).toHaveBeenCalledTimes(1);
    const prompt = callGeminiText.mock.calls[0][0];
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('Acme Corp');
    expect(prompt).toContain('private company');
    // the issues summary is serialized into the prompt
    expect(prompt).toContain(JSON.stringify(summary));
    // the requested JSON schema / hashtags are embedded
    expect(prompt).toContain('Monthly Civic Impact Report — Acme Corp');
    expect(prompt).toContain('#JanaShakti #CSR');
  });

  it('degrades to a deterministic fallback report when the AI call rejects', async () => {
    callGeminiText.mockRejectedValue(new Error('all models failed'));

    const out = await generateCSRReport('Beta Trust', 'NGO', { total: 3 });

    // fallback object is fully formed and references the org name
    expect(out.title).toBe('Monthly Civic Impact Report — Beta Trust');
    expect(out.period).toBe('June 2026');
    expect(out.summary).toContain('Beta Trust');
    expect(out.impactScore).toBe(70);
    expect(out.resolutionRate).toBe('75%');
    expect(out.topIssueType).toBe('Various');
    expect(Array.isArray(out.highlights)).toBe(true);
    expect(out.highlights.length).toBeGreaterThan(0);
    expect(out.linkedinPost).toContain('Beta Trust');
    expect(out.linkedinPost).toContain('#JanaShakti');
  });

  it('passes the org name through into the fallback even when other fields are odd', async () => {
    callGeminiText.mockRejectedValue(new Error('boom'));
    const out = await generateCSRReport("O'Reilly Foundation", 'trust', {});
    expect(out.title).toContain("O'Reilly Foundation");
    expect(out.recommendation).toMatch(/adopted zone/i);
  });
});
