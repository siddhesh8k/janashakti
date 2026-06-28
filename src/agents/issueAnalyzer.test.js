import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/gemini', () => ({
  callGeminiVision: vi.fn(),
  callGeminiVisionFunction: vi.fn(),
  logAgent: vi.fn(async () => {}),
}));

import { analyzeIssue } from './issueAnalyzer';
import { callGeminiVision, callGeminiVisionFunction } from '../utils/gemini';

// ── Fallback path: function calling unavailable → prompt-based JSON (callGeminiVision) ──
describe('analyzeIssue self-evaluation + retry (JSON fallback path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Force the function-calling attempt to fail so the analyzer falls back.
    callGeminiVisionFunction.mockRejectedValue(new Error('fn off'));
  });

  it('retries once on low confidence and keeps the more confident result', async () => {
    callGeminiVision
      .mockResolvedValueOnce({ issue_type: 'Pothole', severity: 'High', is_genuine: true, confidence: 40 })
      .mockResolvedValueOnce({ issue_type: 'Pothole', severity: 'High', is_genuine: true, confidence: 78 });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVision).toHaveBeenCalledTimes(2);
    expect(result.confidence).toBe(78);
    expect(result.retried).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });

  it('does not retry when first-pass confidence is already high', async () => {
    callGeminiVision.mockResolvedValueOnce({ issue_type: 'Garbage', is_genuine: true, confidence: 90 });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVision).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
  });

  it('does not retry an outright rejection (is_genuine === false)', async () => {
    callGeminiVision.mockResolvedValueOnce({ is_genuine: false, confidence: 10, reject_reason: 'selfie' });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVision).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
  });

  it('keeps the first result when the retry is not more confident', async () => {
    callGeminiVision
      .mockResolvedValueOnce({ issue_type: 'Pothole', is_genuine: true, confidence: 50 })
      .mockResolvedValueOnce({ issue_type: 'Pothole', is_genuine: true, confidence: 45 });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVision).toHaveBeenCalledTimes(2);
    expect(result.confidence).toBe(50);
  });
});

// ── Function-calling path: callGeminiVisionFunction succeeds → no JSON fallback ──
describe('analyzeIssue via Gemini function calling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the function-call result and does not hit the JSON path', async () => {
    callGeminiVisionFunction.mockResolvedValueOnce({
      issue_type: 'Pothole', severity: 'High', is_genuine: true, confidence: 88,
    });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVisionFunction).toHaveBeenCalledTimes(1);
    expect(callGeminiVision).not.toHaveBeenCalled();
    expect(result.confidence).toBe(88);
    expect(result.retried).toBe(false);
  });

  it('self-retries on the function-call path too and keeps the better result', async () => {
    callGeminiVisionFunction
      .mockResolvedValueOnce({ issue_type: 'Garbage', is_genuine: true, confidence: 42 })
      .mockResolvedValueOnce({ issue_type: 'Garbage', is_genuine: true, confidence: 81 });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVisionFunction).toHaveBeenCalledTimes(2);
    expect(callGeminiVision).not.toHaveBeenCalled();
    expect(result.confidence).toBe(81);
    expect(result.retried).toBe(true);
  });

  it('falls back to JSON only for the attempt that fails', async () => {
    // First attempt: function calling fails → JSON fallback (low confidence) →
    // triggers a retry, second attempt: function calling succeeds (high confidence).
    callGeminiVisionFunction
      .mockRejectedValueOnce(new Error('fn blip'))
      .mockResolvedValueOnce({ issue_type: 'Pothole', is_genuine: true, confidence: 80 });
    callGeminiVision.mockResolvedValueOnce({ issue_type: 'Pothole', is_genuine: true, confidence: 45 });

    const result = await analyzeIssue('b64', 'id1');

    expect(callGeminiVision).toHaveBeenCalledTimes(1);
    expect(callGeminiVisionFunction).toHaveBeenCalledTimes(2);
    expect(result.confidence).toBe(80);
    expect(result.retried).toBe(true);
  });
});
