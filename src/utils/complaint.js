// Strip the model's own subject/salutation/sign-off and any leftover bracketed
// placeholders (e.g. [Date], [Specific Location ... XYZ]) from the AI complaint body —
// the envelope below already supplies the real date, subject, location, and signature.
function cleanBody(raw) {
  if (!raw) return '';
  let t = String(raw)
    // Location placeholders → neutral real phrasing; date/other placeholders → removed.
    .replace(/\[[^\]\n]*\b(location|area|address|place|spot|site)\b[^\]\n]*\]/gi, 'the location shown in the attached image')
    .replace(/\[[^\]\n]*\]/g, '')
    // Tidy artifacts left behind (e.g. "today, , at" → "today, at"; "at ." → fallback).
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',')
    .replace(/\bat\s*\./g, 'at the reported location.')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ');

  // Drop the model's own subject line / greeting / sign-off (the envelope has them).
  const drop = (line) => {
    const l = line.trim();
    return /^subject\s*:/i.test(l)
      || /^(dear|respected|to whom it may concern|hello|hi)\b/i.test(l)
      || /^(yours faithfully|yours sincerely|yours truly|sincerely|warm regards|regards|thanking you|thank you for your (immediate )?attention)/i.test(l)
      || /^\[?(your name|name|signature|sender|concerned citizen)\]?[:,]?$/i.test(l);
  };
  return t.split('\n').filter((line) => !drop(line)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Compose a personalized, formal complaint letter from live report state.
// The Gemini-generated body is wrapped with the reporter's name, the actual
// (editable) location address, and their email as the contact.
export function buildComplaintLetter({ name, contact, address, issueType, severity, department, body }) {
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const contactLine = contact ? `Email: ${contact}` : '';
  const cleanedBody = cleanBody(body);
  return `To,
The Concerned Officer,
${department || 'Municipal Corporation'}

Date: ${today}

Subject: Complaint regarding ${issueType || 'a civic issue'}${severity ? ` (${severity} severity)` : ''}

Respected Sir/Madam,

${cleanedBody || 'I wish to report the civic issue described above for your urgent attention.'}

Location of the issue: ${address || 'As per attached details'}

I request you to kindly take prompt action to resolve this matter at the earliest. I look forward to your timely response.

Yours faithfully,
${name || 'Concerned Citizen'}
${contactLine}`.trim();
}
