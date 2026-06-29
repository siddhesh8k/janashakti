import { callGeminiText, callGeminiPlainText, logAgent } from '../utils/gemini';
import { ISSUE_SDG_MAP, IMPACT_ESTIMATES, ESG_WEIGHTS }
  from '../constants/esg';
import { doc, updateDoc, serverTimestamp, increment, arrayUnion }
  from 'firebase/firestore';
import { db } from '../firebase';

export const scoreESGImpact = async (issue, issueId) => {
  const startTime = Date.now();
  const sdgInfo = ISSUE_SDG_MAP[issue.issueType] || ISSUE_SDG_MAP.Other;
  const estimates = IMPACT_ESTIMATES[issue.issueType] || IMPACT_ESTIMATES.Other;
  const daysToResolve = issue.resolvedAt && issue.createdAt
    ? Math.floor((issue.resolvedAt.toDate() - issue.createdAt.toDate()) / 86400000)
    : 0;

  const prompt = `You are an ESG analyst for JanaShakti, India's civic
intelligence platform. Analyze this resolved civic issue.

Issue Type: ${issue.issueType}
Severity was: ${issue.severity}
Location: ${issue.locationText}, ${issue.city}
Community confirmations: ${issue.confirmations}
Days to resolve: ${daysToResolve}
Department: ${issue.routedTo?.departmentName || 'Unknown'}
Estimated ${estimates.eUnit}: ~${estimates.eValue}
People impacted: ~${estimates.sValue} ${estimates.sUnit}
SDGs addressed: ${sdgInfo.sdgs.join(', ')}

Score this issue resolution on ESG criteria.
Return ONLY valid JSON:
{
  "e_score": 7.5,
  "e_impact": "plain English environmental impact",
  "e_metric": "${estimates.eValue} ${estimates.eUnit}",
  "s_score": 8.0,
  "s_impact": "plain English social impact",
  "s_metric": "${estimates.sValue} ${estimates.sUnit}",
  "g_score": 8.5,
  "g_impact": "plain English governance impact",
  "g_metric": "Resolved X% faster than SLA",
  "overall_esg": 8.0,
  "sdg_tags": ${JSON.stringify(sdgInfo.sdgs)},
  "sdg_names": ${JSON.stringify(sdgInfo.names)},
  "highlight": "one impressive sentence summarizing the impact"
}

Score higher for:
- Faster resolution (lower days = better G score)
- More community confirmations (better S score)
- Environmental issue types (better E score)
- Critical severity resolved (better overall)`;

  try {
    const result = await callGeminiText(prompt);

    // Make the overall score deterministic + consistent with the pillar scores
    // (Gemini's own overall_esg can drift). Weighted per ESG_WEIGHTS, clamped 0–10.
    const clamp = (n) => Math.min(10, Math.max(0, Number(n) || 0));
    result.overall_esg = Math.round(
      (clamp(result.e_score) * ESG_WEIGHTS.E
        + clamp(result.s_score) * ESG_WEIGHTS.S
        + clamp(result.g_score) * ESG_WEIGHTS.G) * 10,
    ) / 10;

    // Save ESG data to the issue document
    await updateDoc(doc(db, 'issues', issueId), {
      esgScore: result,
      esgScoredAt: serverTimestamp(),
    });

    // Update the reporter's ESG stats (atomic increments). This is the REPORTER's
    // user doc — Firestore rules only allow the owner to write it, so when an
    // authority (not the reporter) resolves the issue this write is denied. Keep it
    // in its own try/catch so a denied stats write never nullifies the saved score.
    if (issue.userId) {
      try {
        await updateDoc(doc(db, 'users', issue.userId), {
          esgIssuesResolved: increment(1),
          totalPeopleImpacted: increment(estimates.sValue),
          sdgsContributed: arrayUnion(...sdgInfo.sdgs),
        });
      } catch (statErr) {
        console.error('[ESG user-stats]:', statErr.message);
      }
    }

    await logAgent({
      issueId,
      agentName: 'esg_scorer',
      input: { issueType: issue.issueType, daysToResolve },
      output: result,
      processingTimeMs: Date.now() - startTime,
      success: true,
    });

    return result;
  } catch (err) {
    await logAgent({
      issueId, agentName: 'esg_scorer',
      input: {}, output: null,
      processingTimeMs: Date.now() - startTime,
      success: false, error: err.message,
    });
    return null;
  }
};

// Generate corporate ESG report text via Gemini
export const generateCorporateESGReport = async (companyData) => {
  const prompt = `Generate a formal corporate ESG impact report
for the JanaShakti Area Adoption Program.

Company: ${companyData.name}
Area Adopted: ${companyData.area}
Quarter: ${companyData.quarter}
Issues resolved: ${companyData.issuesResolved}
Employees active: ${companyData.employeesActive}
Water saved: ${companyData.waterSaved} litres
Waste addressed: ${companyData.wasteManaged} tonnes
People impacted: ${companyData.peopleImpacted}
Avg resolution days: ${companyData.avgResolutionDays}

Format as a professional ESG report with:
1. Executive Summary (2 sentences)
2. Environmental Impact (E score and metrics)
3. Social Impact (S score and metrics)
4. Governance Impact (G score and metrics)
5. SDG Alignment (list relevant SDGs)
6. Overall ESG Rating (A+/A/B+/B/C/D)
7. BRSR Filing Note (1 sentence)

Make it board-ready and SEBI BRSR compliant.
Return as formatted plain text, not JSON.`;

  const text = await callGeminiPlainText(prompt)
    .catch(() => 'Report generation failed. Please try again.');
  return typeof text === 'string' ? text : JSON.stringify(text);
};
