import { callGeminiText, logAgent } from '../utils/gemini';

export const predictResolution = async (issue, issueId) => {
  const startTime = Date.now();
  try {
    const daysOpen = issue.createdAt?.toDate
      ? Math.floor((Date.now() - issue.createdAt.toDate()) / 86400000) : 0;

    const prompt = `You are a civic AI analyst for JanaShakti India.
Predict resolution likelihood for this civic issue:

Type: ${issue.issueType}
Severity: ${issue.severity}
City: ${issue.city || 'Unknown'}
Community confirmations: ${issue.confirmations || 0}
Days open: ${daysOpen}
Escalation level: ${issue.escalationLevel || 0} of 3
Department: ${issue.routedTo?.departmentName || 'Unknown'}

Return ONLY valid JSON:
{
  "priority_score": 72,
  "predicted_days": 10,
  "escalation_risk": "Low | Medium | High | Critical",
  "recommendation": "one specific actionable sentence",
  "confidence": 80,
  "factors": [
    "factor 1",
    "factor 2",
    "factor 3"
  ]
}`;

    const result = await callGeminiText(prompt);
    await logAgent({ issueId, agentName: 'resolution_predictor',
      input: { severity: issue.severity, daysOpen, confirmations: issue.confirmations },
      output: result, processingTimeMs: Date.now() - startTime, success: true });
    return result;
  } catch (err) {
    await logAgent({ issueId, agentName: 'resolution_predictor',
      input: issue, output: null,
      processingTimeMs: Date.now() - startTime,
      success: false, error: err.message });
    return {
      priority_score: 50, predicted_days: 14,
      escalation_risk: 'Medium',
      recommendation: 'Monitor for community confirmations',
      confidence: 50, factors: [],
    };
  }
};
