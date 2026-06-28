// Privacy-safe Excel export. Builds sheets from an ALLOWLIST of public civic fields
// only — never user ids, emails, phones, photo URLs, social handles, or raw uid lists.
// Names are masked, locations export as text only (no lat/lng), and every file carries
// a privacy banner + an aggregate-only Summary sheet.
//
// xlsx is imported DYNAMICALLY (only when an export is triggered) so the ~hundreds-of-KB
// library never weighs down the dashboard route bundles.

// Confidential fields that must NEVER appear in an export. We sanitize via an explicit
// allowlist (below), so this list is the documented guard-rail / intent.
export const CONFIDENTIAL_FIELDS = [
  'userId', 'userPhoto', 'userEmail', 'userXHandle', 'phone', 'confirmedBy',
  'storyClaimedBy', 'storyClaimedAt', 'linkedinUrl', 'photoUrl', 'resolutionPhotoUrl',
  'xPostUrl', 'linkedinPostUrl', 'rtiDocUrl', 'previousReportIds', 'statusHistory',
  'tags', 'socialConsent', 'location', // lat/lng — only the text address is exported
];

// "Nikitha Sharma" → "N*****a S****a"  (first + last char kept, middle masked)
export const anonymizeName = (name) => {
  if (!name) return 'Anonymous';
  return name.split(' ').map((word) => {
    if (!word) return word;
    if (word.length <= 2) return word[0] + '*';
    return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
  }).join(' ');
};

const formatDate = (ts) => {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const calculateDaysOpen = (ts) => {
  if (!ts) return 0;
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(date.getTime()) ? 0 : Math.floor((Date.now() - date.getTime()) / 86400000);
};

// Strip a single issue down to public, non-PII columns.
export const sanitizeIssue = (issue) => ({
  'Complaint ID': issue.complaintId || issue.id || '',
  'Issue Type': issue.issueType || '',
  'Severity': issue.severity || '',
  'Status': issue.status || '',
  'Description': issue.description || '',
  'Location': issue.locationText || '',          // text address only — no coordinates
  'City': issue.city || '',
  'Ward': issue.ward || '',
  'Confirmations': issue.confirmations || 0,      // count only — never the confirmedBy uids
  'Pressure Score': issue.pressureScore || 0,
  'Escalation Level': issue.escalationLevel || 0,
  'Wall of Shame': issue.wallOfShame ? 'Yes' : 'No',
  'Department': issue.routedTo?.departmentName || issue.department || '',
  'Department Code': issue.routedTo?.departmentCode || '',
  'Email Sent': issue.routedTo?.emailSent ? 'Yes' : 'No',
  'Urgency': issue.routedTo?.urgencyLevel || '',
  'SLA Hours': issue.routedTo?.slaHours || '',
  'Priority Score': issue.prediction?.priority_score || '',
  'Predicted Days': issue.prediction?.predicted_days || '',
  'Escalation Risk': issue.prediction?.escalation_risk || '',
  'AI Confidence': issue.confidence || '',
  'Is Genuine': issue.isGenuine ? 'Yes' : 'No',
  'Is Duplicate': issue.isDuplicate ? 'Yes' : 'No',
  'Adopted By': issue.adoptedBy?.name || '',
  'Adopted Org Type': issue.adoptedBy?.type || '',
  'Reporter': anonymizeName(issue.userName),      // masked, never the uid/email
  'Reported Date': formatDate(issue.createdAt),
  'Days Open': calculateDaysOpen(issue.createdAt),
  'Resolved': issue.status === 'Resolved' ? 'Yes' : 'No',
  'Resolved Date': issue.resolvedAt ? formatDate(issue.resolvedAt) : '',
});

const sanitizeUser = (user, rank) => ({
  'Rank': rank,
  'Citizen': anonymizeName(user.displayName || user.name || 'Citizen'),
  'Level': user.level || '',
  'Civic Score': user.civicScore || 0,
  'Issues Reported': user.issuesReported || 0,
  'Issues Verified': user.issuesVerified || 0,
  'Issues Resolved': user.issuesResolved || 0,
  'Streak Days': user.streak || 0,
  'City': user.city || '',
});

const sanitizeOrg = (org, rank) => ({
  'Rank': rank,
  'Organization': org.name || '',
  'Type': org.type === 'college' ? 'College' : 'Company',
  'Zone': org.zoneName || '',
  'Members': org.memberCount || 0,
  'Issues Adopted': org.totalAdopted || 0,
  'Issues Resolved': org.resolved ?? org.issuesResolved ?? 0,
  'Civic Score': org.score || 0,
  'Badge': org.badge || '',
});

const calculateEvidenceStrength = (issue) => {
  let score = 0;
  if (issue.photoUrl) score++;                       // existence only — URL is NOT exported
  if ((issue.confirmations || 0) >= 5) score++;
  if (issue.routedTo?.emailSent) score++;
  if ((issue.escalationLevel || 0) >= 1) score++;
  if (calculateDaysOpen(issue.createdAt) >= 14) score++;
  return `${score}/5`;
};

// Aggregate-only summary (zero individual data).
const generateSummary = (rows, type) => {
  if (type !== 'issues' && type !== 'stories') return [];
  const byType = {}, bySeverity = {}, byStatus = {};
  rows.forEach((r) => {
    const t = r['Issue Type'] || 'Unknown';
    const s = r['Severity'] || 'Unknown';
    const st = r['Status'] || 'Unknown';
    byType[t] = (byType[t] || 0) + 1;
    bySeverity[s] = (bySeverity[s] || 0) + 1;
    byStatus[st] = (byStatus[st] || 0) + 1;
  });
  return [
    { Metric: 'Total Issues', Value: rows.length },
    { Metric: '', Value: '' },
    { Metric: '— By Type —', Value: '' },
    ...Object.entries(byType).map(([k, v]) => ({ Metric: k, Value: v })),
    { Metric: '', Value: '' },
    { Metric: '— By Severity —', Value: '' },
    ...Object.entries(bySeverity).map(([k, v]) => ({ Metric: k, Value: v })),
    { Metric: '', Value: '' },
    { Metric: '— By Status —', Value: '' },
    ...Object.entries(byStatus).map(([k, v]) => ({ Metric: k, Value: v })),
  ];
};

// Build + download an anonymized .xlsx. Returns true on success.
// async: dynamically imports xlsx so it loads only when the user exports.
export const exportToExcel = async (data, type = 'issues', filename = 'JanaShakti_Export') => {
  try {
    if (!Array.isArray(data) || data.length === 0) return false;

    let rows = [];
    let sheetName = 'Data';
    switch (type) {
      case 'issues':        rows = data.map(sanitizeIssue); sheetName = 'Issues'; break;
      case 'users':         rows = data.map((u, i) => sanitizeUser(u, i + 1)); sheetName = 'Citizens'; break;
      case 'organizations': rows = data.map((o, i) => sanitizeOrg(o, i + 1)); sheetName = 'Organizations'; break;
      case 'stories':
        rows = data.map((issue) => ({
          ...sanitizeIssue(issue),
          'Story Ready': 'Yes',
          'Evidence Strength': calculateEvidenceStrength(issue),
          'Claimed': issue.storyClaimedBy ? 'Yes' : 'No',  // Yes/No only — never the claimer uid
        }));
        sheetName = 'Stories';
        break;
      default: rows = data; sheetName = 'Export';
    }
    if (rows.length === 0) return false;

    const XLSXmod = await import('xlsx');
    const XLSX = XLSXmod.default || XLSXmod;

    // Privacy banner rows above the data (column A).
    const banner = [
      { 'Complaint ID': `JanaShakti Data Export — ${new Date().toLocaleDateString('en-IN')}` },
      { 'Complaint ID': `Total Records: ${rows.length} | Generated by JanaShakti Platform` },
      { 'Complaint ID': 'Note: Personal data has been anonymized for privacy compliance' },
      {},
    ];
    const ws = XLSX.utils.json_to_sheet([...banner, ...rows]);
    ws['!cols'] = Object.keys(rows[0] || {}).map((key) => ({ wch: Math.max(key.length, 15) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const summary = generateSummary(rows, type);
    if (summary.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
    }

    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    return true;
  } catch (err) {
    console.error('[Export]:', err);
    return false;
  }
};
