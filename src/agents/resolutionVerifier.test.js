import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/gemini', () => ({
  callGeminiVision: vi.fn(),
  logAgent: vi.fn(async () => {}),
}));

import { verifyResolution } from './resolutionVerifier';
import { callGeminiVision } from '../utils/gemini';

const issue = { issueType: 'Pothole', description: 'Big pothole on MG Road' };

describe('verifyResolution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the parsed verdict on success', async () => {
    callGeminiVision.mockResolvedValueOnce({
      is_genuine: true, is_resolved: true, confidence: 88, reasoning: 'Road looks repaired.',
    });
    const v = await verifyResolution('b64', issue, 'iss1');
    expect(callGeminiVision).toHaveBeenCalledTimes(1);
    expect(v).toEqual({ is_genuine: true, is_resolved: true, confidence: 88, reasoning: 'Road looks repaired.' });
  });

  it('flags a non-genuine / unresolved photo', async () => {
    callGeminiVision.mockResolvedValueOnce({
      is_genuine: false, is_resolved: false, confidence: 20, reasoning: 'Unrelated indoor photo.',
    });
    const v = await verifyResolution('b64', issue, 'iss1');
    expect(v.is_genuine).toBe(false);
    expect(v.is_resolved).toBe(false);
  });

  it('defaults missing fields sensibly', async () => {
    callGeminiVision.mockResolvedValueOnce({});
    const v = await verifyResolution('b64', issue, 'iss1');
    expect(v.is_genuine).toBe(true);
    expect(v.is_resolved).toBe(true);
    expect(v.confidence).toBe(70);
    expect(typeof v.reasoning).toBe('string');
  });

  it('falls back to an accepting verdict on AI error (never blocks)', async () => {
    callGeminiVision.mockRejectedValueOnce(new Error('vision down'));
    const v = await verifyResolution('b64', issue, 'iss1');
    expect(v.is_genuine).toBe(true);
    expect(v.is_resolved).toBe(true);
    expect(v.reasoning).toMatch(/unavailable/i);
  });
});
