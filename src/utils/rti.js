// Compose a formal RTI (Right to Information Act, 2005) application from a live
// issue document. Like buildComplaintLetter, the document STRUCTURE is fixed and
// every identity / location / reference / date field binds to real issue data —
// so nothing is duplicated and there are no unfilled [placeholders]. Only the list
// of information points is AI-tailored to the issue type (see generateRTI).

// Default information requests if the AI list is unavailable — generic but valid
// for any civic issue under the Act.
export const DEFAULT_RTI_POINTS = [
  'Certified copies of the work order(s) or administrative sanction issued for resolving this issue.',
  'Details of the budget allocated and the expenditure incurred on the said work.',
  'Name, designation and contact details of the officer and/or contractor responsible.',
  'Copies of any inspection or site-verification reports prepared in respect of this issue.',
  'The current status and the expected timeline for resolution.',
  'Reasons for the delay, if the issue remains unresolved beyond the stipulated period.',
];

// Format a Firestore timestamp / Date / ISO string as an Indian-style date.
export function formatINDate(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildRTIApplication({
  name, email, address, city, issueType, department,
  complaintId, reportedOn, infoPoints,
}) {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const points = (Array.isArray(infoPoints) && infoPoints.length ? infoPoints : DEFAULT_RTI_POINTS)
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  // Signature block — drop blank lines when a field is missing.
  const signature = [
    name || 'Concerned Citizen',
    email ? `Email: ${email}` : '',
    city ? `Place: ${city}` : '',
    `Date: ${today}`,
  ].filter(Boolean).join('\n');

  return `To,
The Public Information Officer (PIO),
${department || 'Municipal Corporation'}

Date: ${today}

Subject: Application under the Right to Information Act, 2005 — seeking information regarding ${issueType || 'a civic issue'} at ${address || 'the location stated below'}

Respected Sir/Madam,

Under Section 6(1) of the Right to Information Act, 2005, I, ${name || 'a concerned citizen'}, a citizen of India, hereby request the following information regarding an unresolved civic issue, the particulars of which are:

  Issue: ${issueType || 'Civic issue'}
  Location: ${address || 'As per attached details'}
  Complaint Reference: ${complaintId || 'N/A'}
  Reported on: ${reportedOn || 'As per platform records'}

Information sought:
${points}

I am a citizen of India and am eligible to seek the above information under the Act. I am enclosing the prescribed application fee of Rs. 10/- (Rupees Ten only) as required under Section 7. (If applicable, being a Below Poverty Line cardholder, I claim exemption from the fee under the Act and enclose a copy of my BPL certificate.)

If any part of the information sought is held by or more closely concerns another public authority, I request that this application be transferred to the appropriate Public Information Officer under Section 6(3) of the Act, and that I be informed of such transfer.

I request that the information be furnished to me within 30 days as mandated under Section 7(1) of the Act.

Yours faithfully,

${signature}`.trim();
}
