import { DEPARTMENT_MAP } from '../constants/departments';
import { callGeminiText, logAgent } from '../utils/gemini';
import { triggerN8N } from '../utils/n8n';

export const routeToAuthority = async (issue, issueId) => {
  const startTime = Date.now();
  try {
    const defaultDept = DEPARTMENT_MAP[issue.issueType] || DEPARTMENT_MAP.Other;

    const recurrenceNote = issue.recurrenceOf
      ? `\nIMPORTANT — RECURRENCE: this issue was previously reported and marked RESOLVED ${issue.recurrenceDaysSince} days ago (Complaint ${issue.recurrenceOfComplaintId || 'on record'}), but it has RECURRED at the same location. The earlier fix did not hold — treat with higher urgency.`
      : '';

    const prompt = `For this civic issue in India:
City: ${issue.city || 'Not specified'}
Ward: ${issue.ward || 'Not specified'}
Issue Type: ${issue.issueType}
Severity: ${issue.severity}
Description: ${issue.description}${recurrenceNote}

Return ONLY valid JSON:
{
  "departmentName": "full official department name",
  "departmentCode": "${defaultDept.code}",
  "wardOffice": "ward office name",
  "officerTitle": "officer title to address (e.g. Executive Engineer)",
  "emailSubject": "formal email subject line",
  "urgencyLevel": "Routine | Urgent | Emergency",
  "slaHours": ${defaultDept.slaHours},
  "escalationPath": "ward office to department head to commissioner"
}`;

    const result = await callGeminiText(prompt);

    await triggerN8N('authority_email', {
      issueId,
      departmentName: result.departmentName,
      emailSubject: result.emailSubject,
      issueDetails: {
        type: issue.issueType,
        severity: issue.severity,
        description: issue.description,
        location: issue.locationText,
        address: issue.locationText,
        photoUrl: issue.photoUrl,
        reporterName: issue.userName,
        reporterEmail: issue.userEmail || '',
        complaintText: issue.complaintText || '',
        issueUrl: `${window.location.origin}/issue/${issueId}`,
        // Set only when this report is a recurrence of a previously resolved issue, so
        // the authority email can cite the prior complaint and flag the failed fix.
        recurrence: issue.recurrenceOf ? {
          priorComplaintId: issue.recurrenceOfComplaintId || null,
          resolvedAt: issue.recurrenceResolvedAt || null,
          daysSinceResolved: issue.recurrenceDaysSince ?? null,
          count: issue.recurrenceCount ?? 1,
        } : null,
      },
    });

    const output = { ...result, emailSent: true, emailSentAt: new Date().toISOString() };
    await logAgent({ issueId, agentName: 'authority_router',
      input: { issueType: issue.issueType, city: issue.city },
      output, processingTimeMs: Date.now() - startTime, success: true });
    return output;
  } catch (err) {
    await logAgent({ issueId, agentName: 'authority_router',
      input: issue, output: null,
      processingTimeMs: Date.now() - startTime,
      success: false, error: err.message });
    const fallback = DEPARTMENT_MAP[issue.issueType] || DEPARTMENT_MAP.Other;
    return {
      departmentName: fallback.name,
      departmentCode: fallback.code,
      emailSent: false,
      slaHours: fallback.slaHours,
      urgencyLevel: 'Routine',
    };
  }
};
