import { describe, it, expect, vi, beforeEach } from 'vitest';

// generatePressRelease builds a prompt from an issue, calls callGeminiText, and
// returns its parsed object — falling back to a deterministic press release on failure.
vi.mock('./gemini', () => ({
  callGeminiText: vi.fn(),
}));

import { generatePressRelease } from './pressRelease';
import { callGeminiText } from './gemini';

const baseIssue = {
  issueType: 'Pothole',
  locationText: 'MG Road junction',
  city: 'Bangalore',
  severity: 'High',
  confirmations: 7,
  routedTo: { departmentName: 'BBMP Roads Dept', emailSent: true },
  escalationLevel: 1,
  description: 'Deep crater swallowing two-wheelers',
  complaintId: 'JS-BLR-2026-00042',
};

describe('generatePressRelease', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a prompt from issue fields and returns the AI result on success', async () => {
    const aiResult = {
      headline: 'Pothole Peril on MG Road',
      subheadline: 'Citizens demand action',
      dateline: 'BANGALORE, June 2026 —',
      body: 'p1\n\np2\n\np3',
      citizenQuote: 'Fix it now.',
      dataPoints: ['x', 'y'],
      editorNote: 'about JanaShakti',
      tags: ['civic', 'accountability', 'India'],
    };
    callGeminiText.mockResolvedValue(aiResult);

    const out = await generatePressRelease(baseIssue);
    expect(out).toBe(aiResult);

    expect(callGeminiText).toHaveBeenCalledTimes(1);
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Pothole');
    expect(prompt).toContain('MG Road junction');
    expect(prompt).toContain('Bangalore');
    expect(prompt).toContain('High');
    expect(prompt).toContain('BBMP Roads Dept');
    expect(prompt).toContain('JS-BLR-2026-00042');
    // emailSent:true → "Yes"; escalation level rendered "1 of 3"
    expect(prompt).toContain('Email Sent: Yes');
    expect(prompt).toContain('Escalation Level: 1 of 3');
    expect(prompt).toContain('Community Confirmations: 7');
  });

  it('computes days-open from a Firestore-style createdAt (toDate) and injects it into the prompt', async () => {
    callGeminiText.mockResolvedValue({ ok: true });
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
    await generatePressRelease({ ...baseIssue, createdAt: { toDate: () => tenDaysAgo } });

    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Days Open: 10');
    expect(prompt).toContain('10 days without resolution');
  });

  it('treats a missing createdAt as 0 days open', async () => {
    callGeminiText.mockResolvedValue({ ok: true });
    await generatePressRelease({ ...baseIssue, createdAt: undefined });
    expect(callGeminiText.mock.calls[0][0]).toContain('Days Open: 0');
  });

  it('uses sensible placeholders for missing optional fields in the prompt', async () => {
    callGeminiText.mockResolvedValue({ ok: true });
    await generatePressRelease({ issueType: 'Garbage', severity: 'Low' });

    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Location: Not specified');
    expect(prompt).toContain('City: Unknown');
    expect(prompt).toContain('Email Sent: No');
    expect(prompt).toContain('Department Notified: Municipal Corporation');
    expect(prompt).toContain('Complaint ID: N/A');
    expect(prompt).toContain('Description: No description');
  });

  it('degrades to a deterministic fallback press release when the AI call rejects', async () => {
    callGeminiText.mockRejectedValue(new Error('all models failed'));

    const out = await generatePressRelease(baseIssue);

    expect(out.headline).toContain('Pothole');
    expect(out.headline).toContain('Bangalore');
    expect(out.subheadline).toContain('JanaShakti');
    expect(out.dateline).toContain('Bangalore');
    expect(out.body).toContain('7 citizen confirmations');
    expect(out.body).toContain('BBMP Roads Dept');
    expect(out.body).toContain('Right to Information Act 2005');
    expect(Array.isArray(out.dataPoints)).toBe(true);
    expect(out.dataPoints[1]).toContain('7 confirmations');
    expect(out.tags).toEqual(['civic', 'accountability']);
  });

  it('fallback tolerates a minimal issue with missing city/department/confirmations', async () => {
    callGeminiText.mockRejectedValue(new Error('boom'));
    const out = await generatePressRelease({ issueType: 'Streetlight', severity: 'Medium' });

    expect(out.headline).toContain('City'); // `${issue.city || 'City'}`
    expect(out.dateline).toContain('INDIA');
    expect(out.body).toContain('0 citizen confirmations');
    expect(out.body).toContain('Municipal Corporation');
  });
});
