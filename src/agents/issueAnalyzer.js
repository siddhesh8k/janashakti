import { callGeminiVision, callGeminiVisionFunction, logAgent } from '../utils/gemini';
import { RETRY_THRESHOLD } from '../utils/validation';

// Gemini function-calling schema for the analyzer — the model returns these typed
// args directly (no JSON-in-prose to parse). Mirrors the JSON shape in BASE_PROMPT
// so the prompt-based fallback path stays identical.
const ANALYZER_FN = {
  name: 'report_civic_issue',
  description: 'Record the structured analysis of a civic issue photo for JanaShakti.',
  parameters: {
    type: 'OBJECT',
    properties: {
      issue_type: { type: 'STRING', enum: ['Pothole', 'Streetlight', 'Garbage', 'Water Leakage', 'Infrastructure', 'Traffic Signal', 'Other'] },
      severity: { type: 'STRING', enum: ['Low', 'Medium', 'High', 'Critical'] },
      description: { type: 'STRING', description: '2 clear sentences describing the problem' },
      department: { type: 'STRING', description: 'responsible Indian government department' },
      complaint_text: { type: 'STRING', description: 'the BODY only of a formal complaint: 2-3 short paragraphs (problem, impact, request for prompt action). NO subject line, NO salutation, NO sign-off, and NO bracketed placeholders like [Date] or [Location] — refer to the place only as "the location shown in the attached image".' },
      legal_right: { type: 'STRING', description: 'one citizen right under Indian law relevant to this issue' },
      predicted_days: { type: 'NUMBER' },
      is_genuine: { type: 'BOOLEAN', description: 'true only for a genuine outdoor civic issue' },
      confidence: { type: 'NUMBER', description: '0-100 confidence' },
      reject_reason: { type: 'STRING', description: 'short polite reason when is_genuine is false, else empty' },
      tags: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['issue_type', 'severity', 'description', 'is_genuine', 'confidence'],
  },
};

const BASE_PROMPT = `You are an AI assistant for JanaShakti, India's civic
intelligence platform. Analyze this civic issue image.

GUARD RAIL — relevance check FIRST:
This platform is ONLY for real outdoor public/civic infrastructure problems
(potholes, broken streetlights, garbage, water leakage, damaged roads/footpaths,
traffic signals, public infrastructure). If the image is NOT such a problem — e.g.
a selfie or person, food, an indoor/home scene, a screenshot, a document, a meme,
a product, an animal, scenery, or anything unrelated to public infrastructure —
then set "is_genuine": false, "confidence" below 40, and put a short, polite
citizen-facing reason in "reject_reason" (e.g. "This looks like a selfie, not a
civic issue."). Only set "is_genuine": true for a genuine civic issue.

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "issue_type": "Pothole | Streetlight | Garbage | Water Leakage | Infrastructure | Traffic Signal | Other",
  "severity": "Low | Medium | High | Critical",
  "description": "2 clear sentences describing the problem",
  "department": "responsible Indian government department",
  "complaint_text": "BODY ONLY of a formal complaint: 2-3 short paragraphs (problem, impact, request). NO subject, NO salutation, NO sign-off, NO bracketed placeholders like [Date] or [Location] — refer to the place only as 'the location shown in the attached image'",
  "legal_right": "one specific citizen right under Indian law relevant to this issue",
  "predicted_days": 7,
  "is_genuine": true,
  "confidence": 85,
  "reject_reason": "",
  "tags": ["#JanaShakti", "#CivicAlert", "#India"]
}`;

// Second-pass self-critique appended to the base prompt when the first pass is
// genuine-but-uncertain. Makes the model deliberately re-examine the image.
const buildRetrySuffix = (prevConfidence) => `

SELF-REVIEW (second pass): your previous analysis of this exact image returned a LOW
confidence of ${prevConfidence}. Re-examine the image carefully and decide:
- If it IS a genuine outdoor public/civic infrastructure problem, identify the precise
  type and severity and report a confidence that reflects the visible evidence.
- If it is NOT, set "is_genuine": false with a short, polite "reject_reason".
Return the SAME JSON shape, nothing else.`;

export const analyzeIssue = async (base64Image, issueId) => {
  const startTime = Date.now();
  const attempts = [];

  const runAttempt = async (prompt) => {
    // Prefer native Gemini function calling (typed args, no JSON parsing); fall back
    // to the prompt-based JSON path on any failure or non-Gemini provider.
    let out;
    try {
      out = await callGeminiVisionFunction(ANALYZER_FN, prompt, base64Image);
    } catch (fnErr) {
      console.error('[analyzer fn → JSON fallback]:', fnErr.message);
      out = await callGeminiVision(prompt, base64Image);
    }
    attempts.push({ confidence: out?.confidence ?? 0, is_genuine: out?.is_genuine ?? null });
    return out;
  };

  try {
    let result = await runAttempt(BASE_PROMPT);

    // Self-evaluation: if it's not an outright rejection but confidence is low,
    // re-examine ONCE and keep whichever attempt is more confident. Recovers
    // genuine reports from blurry/odd-angle photos and makes the agent's
    // self-correction visible in the pipeline trace.
    let retried = false;
    if (result?.is_genuine !== false && (result?.confidence ?? 0) < RETRY_THRESHOLD) {
      retried = true;
      const second = await runAttempt(BASE_PROMPT + buildRetrySuffix(result?.confidence ?? 0));
      if ((second?.confidence ?? 0) >= (result?.confidence ?? 0)) result = second;
    }

    // attempts/retried are returned for the trace but NOT persisted on the issue
    // doc (ReportScreen copies only the specific analysis fields it needs).
    const enriched = { ...result, attempts, retried };
    await logAgent({
      issueId,
      agentName: 'issue_analyzer',
      input: { hasImage: true, retried },
      output: enriched,
      processingTimeMs: Date.now() - startTime,
      success: true,
    });
    return enriched;
  } catch (err) {
    await logAgent({
      issueId,
      agentName: 'issue_analyzer',
      input: {},
      output: null,
      processingTimeMs: Date.now() - startTime,
      success: false,
      error: err.message,
    });
    throw err;
  }
};
