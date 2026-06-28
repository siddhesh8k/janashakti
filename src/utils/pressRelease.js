import { callGeminiText } from './gemini';

export const generatePressRelease = async (issue) => {
  const daysOpen = issue.createdAt
    ? Math.floor((Date.now() - (issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt)).getTime()) / 86400000)
    : 0;

  const prompt = `You are a press officer for JanaShakti, India's civic accountability platform.
Generate a professional press release for this unresolved civic issue:

Issue Type: ${issue.issueType}
Location: ${issue.locationText || 'Not specified'}
City: ${issue.city || 'Unknown'}
Severity: ${issue.severity}
Days Open: ${daysOpen}
Community Confirmations: ${issue.confirmations || 0}
Department Notified: ${issue.routedTo?.departmentName || 'Municipal Corporation'}
Email Sent: ${issue.routedTo?.emailSent ? 'Yes' : 'No'}
Escalation Level: ${issue.escalationLevel || 0} of 3
Description: ${issue.description || 'No description'}
Complaint ID: ${issue.complaintId || 'N/A'}

Return ONLY valid JSON:
{
  "headline": "Attention-grabbing headline under 15 words",
  "subheadline": "One sentence context",
  "dateline": "CITY, Date —",
  "body": "3 paragraphs: paragraph 1 states the problem with specifics. Paragraph 2 describes citizen action and authority non-response. Paragraph 3 calls for accountability with legal context (RTI Act, municipal obligations). Separate paragraphs with double newline.",
  "citizenQuote": "A quote attributed to 'A concerned citizen via JanaShakti platform'",
  "dataPoints": [
    "${daysOpen} days without resolution",
    "${issue.confirmations || 0} citizens have confirmed this issue",
    "Department notified: ${issue.routedTo?.departmentName || 'Unknown'}"
  ],
  "editorNote": "One sentence about JanaShakti platform for the editor's reference",
  "tags": ["civic", "accountability", "India"]
}`;

  try {
    return await callGeminiText(prompt);
  } catch (err) {
    console.error('[PressRelease]:', err);
    return {
      headline: `${issue.issueType} Ignored for ${daysOpen}+ Days in ${issue.city || 'City'}`,
      subheadline: 'Citizens demand accountability through JanaShakti platform',
      dateline: `${issue.city || 'INDIA'}, June 2026 —`,
      body: `A ${issue.severity?.toLowerCase()} ${issue.issueType?.toLowerCase()} issue at ${issue.locationText || 'an undisclosed location'} has remained unresolved for ${daysOpen} days despite ${issue.confirmations || 0} citizen confirmations through the JanaShakti civic platform.\n\nThe responsible department (${issue.routedTo?.departmentName || 'Municipal Corporation'}) was formally notified but has not taken action.\n\nCitizens are calling for immediate resolution under municipal obligations and the Right to Information Act 2005.`,
      citizenQuote: 'We have reported this multiple times. The authorities must act now.',
      dataPoints: [`${daysOpen} days unresolved`, `${issue.confirmations || 0} confirmations`],
      editorNote: 'JanaShakti is an AI-powered civic accountability platform connecting citizens, authorities, and media.',
      tags: ['civic', 'accountability'],
    };
  }
};
