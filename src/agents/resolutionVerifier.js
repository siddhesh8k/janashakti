import { callGeminiVision, logAgent } from '../utils/gemini';

// Agent 5 — Resolution Verifier. Given the original issue and an uploaded "fix"
// photo, Gemini judges whether the photo genuinely shows THIS civic issue resolved
// (vs an unrelated / fake / still-broken photo). Flags, never blocks: on any failure
// it returns an optimistic verdict so the resolve flow can't break.
export const verifyResolution = async (base64Image, issue, issueId) => {
  const startTime = Date.now();
  const prompt = `You are the resolution verifier for JanaShakti, India's civic platform.
An authority uploaded a photo claiming this civic issue is now FIXED.

Original issue: ${issue?.issueType || 'civic issue'}
Original description: ${issue?.description || 'N/A'}

Look at the photo and judge whether it plausibly shows THIS type of civic issue in a
RESOLVED / fixed state (e.g. a repaired road for a Pothole, a clean spot for Garbage,
a working light for a Streetlight). Be skeptical of unrelated photos, selfies, indoor
shots, or images that still clearly show the problem.

Respond ONLY with valid JSON, no markdown:
{
  "is_genuine": true,
  "is_resolved": true,
  "confidence": 85,
  "reasoning": "one short sentence a citizen can read"
}`;

  try {
    const result = await callGeminiVision(prompt, base64Image);
    const verdict = {
      is_genuine: result?.is_genuine !== false,
      is_resolved: result?.is_resolved !== false,
      confidence: typeof result?.confidence === 'number' ? result.confidence : 70,
      reasoning: result?.reasoning || 'Resolution photo reviewed.',
    };
    await logAgent({
      issueId,
      agentName: 'resolution_verifier',
      input: { issueType: issue?.issueType, hasImage: true },
      output: verdict,
      processingTimeMs: Date.now() - startTime,
      success: true,
    });
    return verdict;
  } catch (err) {
    await logAgent({
      issueId,
      agentName: 'resolution_verifier',
      input: { issueType: issue?.issueType, hasImage: true },
      output: null,
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: err.message,
    });
    // Graceful fallback — accept the resolution so the flow never breaks.
    return { is_genuine: true, is_resolved: true, confidence: 70,
      reasoning: 'Auto-accepted (AI verification unavailable).' };
  }
};
