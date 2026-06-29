// Comprehensive demo dump from JanaShakti_Dummy_Data_Cloudinary.xlsx (Admin SDK — bypasses
// login). Dumps the real USERS (→ publicProfiles + users), and attributes a weighted set of
// issues to them — MAJORITY Pothole / Streetlight / Water — covering every scenario
// (all statuses, escalation, Wall of Shame, recurrence, ESG, the full collaboration layer),
// writing the agent pipeline logs (agents_log) + run traces (agent_runs) for each, with the
// LOCAL public photos (pothole.jpg / streetlight.jpg / water .jpg) converted to base64.
// Includes the signed-in user (sidh8k) as reporter + contributor on a few.
//
//   node scripts/seedDemoData.mjs --dry     # plan only, no writes
//   node scripts/seedDemoData.mjs --wipe    # delete previous demo-bulk docs, then reseed
//   node scripts/seedDemoData.mjs
//
// Prereqs: scripts/serviceAccountKey.json, firebase-admin + xlsx + sharp (installed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import xlsx from 'xlsx';
import sharp from 'sharp';
import { DEPARTMENT_MAP } from '../src/constants/departments.js';
import { ISSUE_SDG_MAP, IMPACT_ESTIMATES, ESG_WEIGHTS } from '../src/constants/esg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
const WIPE = process.argv.includes('--wipe');
const REAL_EMAIL = 'sidh8k@gmail.com';
const SEED_TAG = 'demo-bulk';
const PER_GROUP = { pothole: 17, streetlight: 17, water: 16 }; // 50 total, image-backed only (xlsx Cloudinary URLs IGNORED)

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const iso = (d) => d.toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const REGION_CITY = { 'Mumbai-NaviMumbai-Thane': 'Mumbai', Bangalore: 'Bangalore', Delhi: 'Delhi', Hyderabad: 'Hyderabad', Pune: 'Pune' };

// ── local photos → base64 (sharp-compressed), by category group ───────────────────
const PHOTO = {
  Pothole: 'pothole.jpg', 'Broken Road': 'pothole.jpg',
  'Broken Streetlight': 'streetlight.jpg', Streetlight: 'streetlight.jpg',
  'Water Supply Issue': 'water .jpg', 'Water Logging': 'water .jpg', 'Sewage Overflow': 'water .jpg', 'Water Leakage': 'water .jpg',
};
const TYPE_COLOR = { Pothole: '#f97316', 'Broken Road': '#f59e0b', 'Broken Streetlight': '#eab308',
  'Garbage Dumping': '#22c55e', Other: '#64748b' };
const imgCache = new Map();
async function imageFor(type) {
  if (imgCache.has(type)) return imgCache.get(type);
  let dataUrl;
  const file = PHOTO[type];
  if (file && fs.existsSync(path.join(ROOT, 'public', file))) {
    const buf = await sharp(fs.readFileSync(path.join(ROOT, 'public', file)))
      .resize(760, null, { withoutEnlargement: true }).jpeg({ quality: 52 }).toBuffer();
    dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  } else {
    const accent = TYPE_COLOR[type] || '#00d4ff';
    const svg = `<svg width="720" height="460" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="460" fill="#0d1b2e"/><rect width="720" height="10" fill="${accent}"/><text x="360" y="245" font-family="sans-serif" font-size="34" font-weight="700" fill="${accent}" text-anchor="middle">${type}</text></svg>`;
    const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 60 }).toBuffer();
    dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
  imgCache.set(type, dataUrl);
  return dataUrl;
}

// ── ESG (same weighting as esgScorer.js) ──────────────────────────────────────────
const E_BASE = { 'Water Leakage': 8.6, 'Water Supply Issue': 8.4, 'Water Logging': 8.2, 'Sewage Overflow': 8.0,
  'Garbage Dumping': 7.8, 'Broken Streetlight': 7.2, Streetlight: 7.2, Pothole: 6.6, 'Broken Road': 6.4, Other: 5.8 };
function buildEsg({ type, severity, days, confirmations, city }) {
  const sdg = ISSUE_SDG_MAP[type] || ISSUE_SDG_MAP.Other;
  const est = IMPACT_ESTIMATES[type] || IMPACT_ESTIMATES.Other;
  const sevBoost = severity === 'Critical' ? 1.0 : severity === 'High' ? 0.5 : 0;
  const e = round1(clamp((E_BASE[type] ?? 6) + sevBoost - days * 0.1, 4, 9.8));
  const s = round1(clamp(6 + confirmations * 0.12 + sevBoost, 5, 9.7));
  const g = round1(clamp(9.6 - days * 0.4, 5, 9.6));
  const overall = round1(e * ESG_WEIGHTS.E + s * ESG_WEIGHTS.S + g * ESG_WEIGHTS.G);
  return { e_score: e, e_impact: `Fixing this ${type.toLowerCase()} advanced ${sdg.names[0].toLowerCase()} in ${city}.`, e_metric: `${est.eValue} ${est.eUnit}`,
    s_score: s, s_impact: `~${est.sValue} ${est.sUnit}, backed by ${confirmations} confirmations.`, s_metric: `${est.sValue} ${est.sUnit}`,
    g_score: g, g_impact: `Closed in ${days} day${days === 1 ? '' : 's'} — strong governance.`, g_metric: `Resolved in ${days} day${days === 1 ? '' : 's'}`,
    overall_esg: overall, sdg_tags: sdg.sdgs, sdg_names: sdg.names,
    highlight: `A ${severity.toLowerCase()} ${type.toLowerCase()} in ${city} resolved in ${days} day${days === 1 ? '' : 's'} — ${overall}/10 civic ESG.` };
}

const dept = (type) => DEPARTMENT_MAP[type] || DEPARTMENT_MAP.Other;
const routedTo = (type, city, sev) => { const d = dept(type); return { departmentName: d.name, departmentCode: d.code, wardOffice: `${city} Ward Office`, officerTitle: 'Executive Engineer', emailSubject: `Civic complaint: ${type} in ${city}`, urgencyLevel: sev === 'Critical' ? 'Emergency' : sev === 'High' ? 'Urgent' : 'Routine', slaHours: d.slaHours, escalationPath: 'ward office → department head → commissioner', emailSent: true, emailSentAt: iso(new Date()) }; };
const prediction = (sev, days, conf, contribN, evN) => ({ priority_score: clamp((sev === 'Critical' ? 78 : sev === 'High' ? 66 : 52) + contribN * 3 + Math.min(20, conf), 0, 100), predicted_days: Math.max(2, days || 9), escalation_risk: sev === 'Critical' ? 'High' : sev === 'High' ? 'Medium' : 'Low', recommendation: 'Coordinate the responsible department with on-site community evidence.', confidence: 80, factors: [`${conf} confirmations`, `${contribN} contributors`, `${evN} evidence items`] });

// ── writes queue + reputation accumulation ─────────────────────────────────────────
const writes = [];
const q = (ref, data, merge = false) => writes.push({ ref, data, merge });
const repDelta = {}; // userId → {reports, joined, evidence, resolved, civic}
const bump = (uid, field, n = 1) => { const r = repDelta[uid] || (repDelta[uid] = { reports: 0, joined: 0, evidence: 0, resolved: 0, verified: 0, civic: 0 }); r[field] += n; };

function logAgents(issueId, issue, at, resolved) {
  const base = { issueId, processingTimeMs: 600 + (issueId.length * 7) % 900, success: true, geminiModel: 'gemini-2.5-flash', createdAt: Timestamp.fromDate(at) };
  q(db.collection('agents_log').doc(), { ...base, agentName: 'issue_analyzer', input: { issueType: issue.issueType }, output: { issue_type: issue.issueType, severity: issue.severity, confidence: issue.confidence }, seedTag: SEED_TAG });
  q(db.collection('agents_log').doc(), { ...base, agentName: 'duplicate_detector', input: { issueType: issue.issueType }, output: { isDuplicate: false }, seedTag: SEED_TAG });
  q(db.collection('agents_log').doc(), { ...base, agentName: 'authority_router', input: { issueType: issue.issueType, city: issue.city }, output: issue.routedTo, seedTag: SEED_TAG });
  q(db.collection('agents_log').doc(), { ...base, agentName: 'resolution_predictor', input: { severity: issue.severity }, output: issue.prediction, seedTag: SEED_TAG });
  if (resolved) {
    q(db.collection('agents_log').doc(), { ...base, agentName: 'resolution_verifier', input: { issueId }, output: { is_genuine: true, is_resolved: true, confidence: 92, reasoning: 'Fix photo matches (demo).' }, seedTag: SEED_TAG });
    if (issue.esgScore) q(db.collection('agents_log').doc(), { ...base, agentName: 'esg_scorer', input: { issueType: issue.issueType }, output: { overall_esg: issue.esgScore.overall_esg }, seedTag: SEED_TAG });
  }
}
function agentRun(issueId, issue, at) {
  q(db.collection('agent_runs').doc(), { issueId, issueType: issue.issueType, severity: issue.severity, locationText: issue.locationText, seedTag: SEED_TAG, durationMs: 4200, createdAt: Timestamp.fromDate(at),
    steps: [
      { agent: 'analyzer', name: 'Issue Analyzer', status: 'done', summary: `${issue.issueType} · ${issue.severity}`, detail: `Confidence ${issue.confidence}%`, confidence: issue.confidence },
      { agent: 'detector', name: 'Duplicate Detector', status: 'done', summary: 'No duplicate — new report', detail: 'Unique within 200m.' },
      { agent: 'router', name: 'Authority Router', status: 'done', summary: issue.routedTo.departmentName, detail: `${issue.routedTo.urgencyLevel} · SLA ${issue.routedTo.slaHours}h · email sent` },
      { agent: 'predictor', name: 'Resolution Predictor', status: 'done', summary: `~${issue.prediction.predicted_days}d · priority ${issue.prediction.priority_score}`, detail: issue.prediction.recommendation, confidence: 80 },
    ] });
}

// status mapping + per-status age
const STATUS_MAP = { Reported: 'Reported', Acknowledged: 'Verified', 'In Progress': 'In Progress', Escalated: 'In Progress', Resolved: 'Resolved' };
function ageFor(xlStatus, i) {
  if (xlStatus === 'Escalated') return 34 + (i % 22);
  if (xlStatus === 'Resolved') return 6 + (i % 16);
  if (xlStatus === 'In Progress') return 5 + (i % 11);
  if (xlStatus === 'Acknowledged') return 2 + (i % 6);
  return 1 + (i % 5);
}

const run = async () => {
  // real user
  let me = { uid: 'demo-me', displayName: 'You (sidh8k)', photoURL: null };
  try { const u = await admin.auth().getUserByEmail(REAL_EMAIL); me = { uid: u.uid, displayName: u.displayName || 'You', photoURL: u.photoURL || null }; }
  catch { console.warn(`(could not resolve ${REAL_EMAIL})`); }

  // load Excel
  const wb = xlsx.readFile(path.join(ROOT, 'JanaShakti_Dummy_Data_Cloudinary.xlsx'));
  const users = xlsx.utils.sheet_to_json(wb.Sheets.Users);
  const issuesAll = xlsx.utils.sheet_to_json(wb.Sheets.Issues);
  const userById = new Map(users.map((u) => [u['User ID'], u]));
  const cityOf = (region) => REGION_CITY[region] || 'Bangalore';
  const userObj = (id) => { const u = userById.get(id); return u ? { uid: u['User ID'], displayName: u['Full Name'], photoURL: null, city: cityOf(u['City Region']) } : null; };
  // contributor pools by city (for realistic same-locality collaboration)
  const poolByCity = {};
  for (const u of users) { const c = cityOf(u['City Region']); (poolByCity[c] || (poolByCity[c] = [])).push(u['User ID']); }

  // Only categories that HAVE a local image (xlsx Cloudinary URLs are ignored entirely).
  const bucketOf = (cat) => PHOTO[cat] === 'pothole.jpg' ? 'pothole' : PHOTO[cat] === 'streetlight.jpg' ? 'streetlight' : PHOTO[cat] === 'water .jpg' ? 'water' : null;
  const buckets = { pothole: [], streetlight: [], water: [] };
  for (const r of issuesAll) { const b = bucketOf(r.Category); if (b && userById.has(r['User ID']) && r.Latitude) buckets[b].push(r); }
  // Round-robin across the 5 Excel statuses within each group so EVERY scenario appears,
  // and sort each status list by region so all cities are represented.
  const XL_STATUSES = ['Reported', 'Acknowledged', 'In Progress', 'Escalated', 'Resolved'];
  const selected = [];
  for (const [b, target] of Object.entries(PER_GROUP)) {
    // For each status, bucket rows by CITY, then round-robin across statuses AND cities so
    // every status appears AND all regions are represented.
    const CITY_ORDER = ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune'];
    const byStatus = XL_STATUSES.map((st, si) => {
      const byCity = {};
      for (const r of buckets[b].filter((x) => x.Status === st)) { const c = cityOf(r['City Region']); (byCity[c] || (byCity[c] = [])).push(r); }
      // start each status's city cursor at a different offset so all 5 regions get reached
      return { byCity, cities: CITY_ORDER.filter((c) => byCity[c]), ci: si, idx: {} };
    });
    let added = 0; let guard = 0;
    while (added < target && guard < 10000) {
      for (let si = 0; si < XL_STATUSES.length && added < target; si++) {
        const s = byStatus[si]; if (!s.cities.length) continue;
        let picked = null; let tries = 0;
        while (tries < s.cities.length) {
          const city = s.cities[s.ci % s.cities.length]; s.ci++;
          const i = s.idx[city] || 0;
          if (i < s.byCity[city].length) { s.idx[city] = i + 1; picked = s.byCity[city][i]; break; }
          tries++;
        }
        if (picked) { selected.push({ r: picked, bucket: b }); added++; }
      }
      guard++;
    }
  }

  // inject sidh8k: 3 as reporter, 3 as contributor-target (mark)
  const mineReporter = new Set([0, 7, 23].map((k) => selected[k]).filter(Boolean));
  const mineContrib = new Set([4, 14, 31, 38].map((k) => selected[k]).filter(Boolean));

  const built = [];
  let n = 0; let ipCount = 0;
  for (const sel of selected) {
    const { r } = sel;
    const xlStatus = r.Status;
    let status = STATUS_MAP[xlStatus] || 'Reported';
    const escalated = xlStatus === 'Escalated';
    // Convert every 2nd non-escalated In-Progress into Needs Verification (community-verify scenario).
    let needsVerif = false;
    if (status === 'In Progress' && !escalated) { ipCount++; if (ipCount % 2 === 0) { needsVerif = true; status = 'Needs Verification'; } }
    const resolved = status === 'Resolved';
    const sev = ['Critical', 'High', 'Medium', 'Low'].includes(r.Priority) ? r.Priority : 'Medium';
    const type = r.Category;
    const city = cityOf(r['City Region']);
    const age = ageFor(xlStatus, n);
    const resolvedDays = resolved ? 1 + (n % 5) : 0;
    const createdAt = daysAgo(age);
    const resolvedAt = resolved ? daysAgo(Math.min(age - 1, resolvedDays)) : null;
    const reporter = mineReporter.has(sel) ? me : (userObj(r['User ID']) || { uid: r['User ID'], displayName: r['Reported By'], photoURL: null, city });
    const conf = clamp(Number(r.Upvotes) || 1, 1, 60);

    // collaboration on a subset (resolved / needs-verification / some in-progress)
    const wantsCollab = resolved || needsVerif || (status === 'In Progress' && n % 3 === 0);
    let contributors = [];
    if (wantsCollab) {
      const pool = (poolByCity[city] || []).filter((id) => id !== reporter.uid);
      const picks = [pool[n % pool.length], pool[(n * 3 + 1) % pool.length], pool[(n * 7 + 2) % pool.length]]
        .filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 2 + (n % 2));
      contributors = picks.map((id) => userObj(id)).filter(Boolean)
        .map((p) => ({ userId: p.uid, displayName: p.displayName, photoURL: null, role: ['Volunteer', 'Resident', 'NGO Member', 'Student'][p.uid.length % 4], joinedAt: iso(daysAgo(Math.max(1, age - 1))) }));
      if (mineContrib.has(sel)) contributors.unshift({ userId: me.uid, displayName: me.displayName, photoURL: me.photoURL, role: 'Volunteer', joinedAt: iso(daysAgo(Math.max(2, age - 1))) });
    }
    const evN = wantsCollab ? 1 + (n % 3) : 0;
    const contributedUids = contributors.map((c) => c.userId);
    // verification votes attributed to REAL users (verifiers earn civic → their org civic too)
    const votes = needsVerif ? { yes: 1 + (n % 2), no: n % 3 === 0 ? 1 : 0, partial: n % 2 }
      : (resolved && contributors.length ? { yes: 3, no: 0, partial: 0 } : { yes: 0, no: 0, partial: 0 });
    const voteTotal = votes.yes + votes.no + votes.partial;
    let voters = [];
    if (voteTotal > 0) {
      const excl = new Set([reporter.uid, ...contributedUids]);
      const pool = (poolByCity[city] || []).filter((id) => !excl.has(id));
      for (let vi = n; voters.length < voteTotal && pool.length && vi < n + pool.length + voteTotal; vi++) {
        const id = pool[vi % pool.length]; if (!voters.includes(id)) voters.push(id);
      }
    }
    const photoUrl = await imageFor(type);
    const resPhoto = resolved ? photoUrl : null;
    const esg = resolved ? buildEsg({ type, severity: sev, days: Math.max(1, age - resolvedDays), confirmations: conf, city }) : null;

    const statusHistory = [{ status: 'Reported', changedAt: iso(createdAt), changedBy: reporter.uid, note: 'Initial report' }];
    if (['Verified', 'In Progress', 'Needs Verification', 'Resolved'].includes(status)) statusHistory.push({ status: 'Verified', changedAt: iso(daysAgo(age - 1)), changedBy: 'demo-authority', note: 'Authority verified' });
    if (['In Progress', 'Needs Verification', 'Resolved'].includes(status)) statusHistory.push({ status: 'In Progress', changedAt: iso(daysAgo(Math.max(1, age - 2))), changedBy: 'demo-authority', note: 'Work underway' });
    if (status === 'Needs Verification') statusHistory.push({ status: 'Needs Verification', changedAt: iso(daysAgo(1)), changedBy: contributors[0]?.userId || reporter.uid, note: 'Contributor marked resolved' });
    if (resolved) statusHistory.push({ status: 'Resolved', changedAt: iso(resolvedAt), changedBy: contributors.length ? (contributors[0].userId) : 'demo-authority', note: contributors.length ? 'Community-verified resolution' : 'Resolved — AI-verified fix photo' });

    const ref = db.collection('issues').doc();
    const issue = {
      userId: reporter.uid, userName: reporter.displayName, userPhoto: reporter.photoURL || null, userEmail: '',
      complaintId: `JS-DEMO-${String(1000 + n).padStart(4, '0')}`, photoUrl, mediaType: 'photo', videoUrl: null, videoDuration: null,
      issueType: type, severity: sev, description: r.Description || `${sev} ${type} at ${r.Area}, ${city}.`,
      department: dept(type).name, complaintText: `Formal complaint: ${r.Title || type} at ${r.Area}, ${city}.`,
      legalRight: 'Right to civic services under municipal law.', isGenuine: true, confidence: 84 + (n % 12),
      tags: ['#JanaShakti', `#${city}`], isDuplicate: false, originalIssueId: null,
      location: { lat: Number(r.Latitude), lng: Number(r.Longitude) }, locationText: `${r.Area}`, city,
      adoptedBy: null, ward: '', wardInfo: null, status, statusHistory,
      confirmations: conf, confirmedBy: [], pressureScore: conf * 10,
      escalationLevel: escalated ? 2 + (n % 2) : 0, wallOfShame: escalated || (status !== 'Resolved' && age >= 30),
      isRecurring: false, recurringCount: 0, previousReportIds: [],
      socialConsent: 'anonymous', userXHandle: '', xPosted: conf >= 25, xPostUrl: conf >= 25 ? 'https://x.com/JanaShaktiApp/status/demo' : null,
      linkedinPosted: false, linkedinPostUrl: null, socialReach: conf >= 25 ? conf * 80 : 0, socialQueued: conf >= 25,
      routedTo: routedTo(type, city, sev), prediction: prediction(sev, Math.max(1, age - resolvedDays), conf, contributors.length, evN),
      resolutionPhotoUrl: resPhoto, resolutionVerified: resolved, resolutionGenuine: resolved, resolutionConfidence: resolved ? 92 : 0,
      resolutionNote: resolved ? 'AI-verified resolution (demo).' : '', resolvedAt: resolved ? Timestamp.fromDate(resolvedAt) : null, resolutionCelebrated: resolved,
      rtiGenerated: n % 9 === 0, rtiDocUrl: null, esgScore: esg, esgScoredAt: esg ? Timestamp.fromDate(resolvedAt) : null,
      contributors, contributedUids, removedUids: [], collaborationOpen: true, closeRewardedBy: resolved ? contributedUids : [],
      communityVerification: { votes, voters, threshold: 3, positiveRatio: 0.7, status: needsVerif ? 'pending' : (resolved && contributors.length ? 'passed' : 'pending') },
      createdAt: Timestamp.fromDate(createdAt), updatedAt: Timestamp.fromDate(resolvedAt || createdAt), seedTag: SEED_TAG,
    };
    built.push({ ref, issue, createdAt, resolvedAt, reporter, contributors, voters, type, evN, status, resolved, age });
    n++;
  }

  // recurrence: link 2 fresh reports to a prior resolved issue of the same type+city
  let recLinked = 0;
  for (const b of built) {
    if (recLinked >= 2 || b.status !== 'Reported') continue;
    const prior = built.find((p) => p.resolved && p.type === b.type && p.issue.city === b.issue.city && p.ref.id !== b.ref.id);
    if (!prior) continue;
    Object.assign(b.issue, { isRecurring: true, recurrenceOf: prior.ref.id, recurrenceOfComplaintId: prior.issue.complaintId, recurrenceResolvedAt: prior.resolvedAt ? iso(prior.resolvedAt) : iso(daysAgo(10)), recurrenceDaysSince: 10, recurrenceCount: 1 });
    recLinked++;
  }

  // queue issue + logs + run + subcollections + reputation deltas
  for (const b of built) {
    q(b.ref, b.issue);
    logAgents(b.ref.id, b.issue, b.createdAt, b.resolved);
    agentRun(b.ref.id, b.issue, b.createdAt);
    const tl = (uid, name, action, message, at) => q(b.ref.collection('timeline').doc(), { userId: uid, displayName: name, photoURL: null, action, message, createdAt: Timestamp.fromDate(at) });
    tl(b.reporter.uid, b.reporter.displayName, 'issue_created', `reported a ${b.type}`, b.createdAt);
    bump(b.reporter.uid, 'reports'); bump(b.reporter.uid, 'civic', 10);
    let t = b.createdAt.getTime();
    for (const c of b.contributors) { t += 6 * 3600000; tl(c.userId, c.displayName, 'contributor_joined', `joined as ${c.role}`, new Date(t)); bump(c.userId, 'joined'); bump(c.userId, 'civic', 5); }
    for (let i = 0; i < b.evN; i++) {
      const c = b.contributors[i % Math.max(1, b.contributors.length)] || { userId: b.reporter.uid, displayName: b.reporter.displayName };
      t += 3 * 3600000; const img = await imageFor(b.type);
      q(b.ref.collection('evidence').doc(), { userId: c.userId, displayName: c.displayName, type: ['photo', 'receipt', 'rti_response'][i % 3], imageBase64: img, caption: `${b.type} evidence #${i + 1}`, verified: false, relevant: true, relevanceReason: 'relevant (demo)', createdAt: Timestamp.fromDate(new Date(t)) });
      tl(c.userId, c.displayName, 'evidence_uploaded', `${b.type} evidence #${i + 1}`, new Date(t)); bump(c.userId, 'evidence'); bump(c.userId, 'civic', 15);
    }
    // verifiers — each earns civic (+5) for verifying; this civic flows to their org below
    for (const vid of (b.voters || [])) {
      t += 3600000; const vu = userById.get(vid);
      tl(vid, vu ? vu['Full Name'] : 'Citizen', 'verification_vote', 'verified the resolution', new Date(t));
      bump(vid, 'verified'); bump(vid, 'civic', 5);
    }
    if (b.status === 'Needs Verification' || (b.resolved && b.contributors.length)) { t += 3600000; tl(b.contributors[0]?.userId || b.reporter.uid, b.contributors[0]?.displayName || b.reporter.displayName, 'resolution_requested', 'marked as resolved — needs verification', new Date(t)); }
    if (b.resolved) {
      bump(b.reporter.uid, 'resolved'); bump(b.reporter.uid, 'civic', 25);
      for (const uid of b.issue.closeRewardedBy) { if (uid !== b.reporter.uid) { bump(uid, 'resolved'); bump(uid, 'civic', 25); } }
      tl('demo-community', 'Community', 'issue_resolved', 'Issue resolved', b.resolvedAt);
    }
  }

  // dump ALL users → publicProfiles (leaderboard) with Excel civicScore + seeded deltas;
  // users docs only for the involved (so their profile works if they ever log in).
  const involved = new Set(Object.keys(repDelta));
  const orgCivic = {}; const orgMembers = {};
  for (const u of users) {
    const id = u['User ID']; const d = repDelta[id] || { reports: 0, joined: 0, evidence: 0, resolved: 0, verified: 0, civic: 0 };
    const score = (Number(u['Civic Score']) || 0) + d.civic;
    q(db.collection('publicProfiles').doc(id), { displayName: u['Full Name'], photoURL: null, civicScore: score, issuesReported: d.reports, updatedAt: FieldValue.serverTimestamp(), seedTag: SEED_TAG }, true);
    if (involved.has(id)) q(db.collection('users').doc(id), { uid: id, displayName: u['Full Name'], email: u.Email || '', photoURL: null, civicScore: score, issuesReported: d.reports, issuesJoined: d.joined, evidenceUploaded: d.evidence, issuesResolved: d.resolved, issuesVerified: d.verified, city: cityOf(u['City Region']), affiliation: { role: (u['User Type'] || 'civilian').toLowerCase(), orgId: u['Org ID'] || null, orgName: u.Organization || null, orgType: null }, seedTag: SEED_TAG }, true);
    const oid = u['Org ID']; if (oid) { orgCivic[oid] = (orgCivic[oid] || 0) + score; orgMembers[oid] = (orgMembers[oid] || 0) + 1; }
  }
  // dump ORGANIZATIONS (college/corporate leaderboard) — memberCivicScore aggregates the
  // civic of all member users (incl. the verification civic credited above).
  const ORG_COLORS = ['#00d4ff', '#16a34a', '#8b5cf6', '#f97316', '#3b82f6', '#ec4899'];
  const orgsXl = xlsx.utils.sheet_to_json(wb.Sheets.Organizations);
  let oi = 0;
  for (const o of orgsXl) {
    const oid = o['Org ID']; if (!oid) continue;
    const type = /college|campus|school|institute|university/i.test(String(o.Type)) ? 'college' : 'company';
    q(db.collection('organizations').doc(oid), {
      id: oid, name: o['Organization Name'], type,
      zone: { lat: Number(o.Latitude), lng: Number(o.Longitude), radiusKm: 2 }, zoneName: o['Area/Locality'] || o['City Region'],
      logo: null, color: ORG_COLORS[oi++ % ORG_COLORS.length], badge: type === 'college' ? 'Civic Campus' : 'Active Adopter',
      memberCount: orgMembers[oid] || 0, memberCivicScore: orgCivic[oid] || 0, seedTag: SEED_TAG,
    }, true);
  }
  console.log(`Organizations dumped: ${orgsXl.length}`);
  // sidh8k reputation increments (real account)
  const myD = repDelta[me.uid];
  if (myD && me.uid !== 'demo-me') {
    q(db.collection('users').doc(me.uid), { civicScore: FieldValue.increment(myD.civic), issuesReported: FieldValue.increment(myD.reports), issuesJoined: FieldValue.increment(myD.joined), evidenceUploaded: FieldValue.increment(myD.evidence), issuesResolved: FieldValue.increment(myD.resolved) }, true);
    q(db.collection('publicProfiles').doc(me.uid), { civicScore: FieldValue.increment(myD.civic), issuesReported: FieldValue.increment(myD.reports), updatedAt: FieldValue.serverTimestamp() }, true);
  }

  const byType = built.reduce((m, b) => (m[b.type] = (m[b.type] || 0) + 1, m), {});
  const byStatus = built.reduce((m, b) => (m[b.status] = (m[b.status] || 0) + 1, m), {});
  console.log(`Users dumped: ${users.length}  | Issues: ${built.length}`);
  console.log(`byType: ${JSON.stringify(byType)}`);
  console.log(`byStatus: ${JSON.stringify(byStatus)}  recurrences=${recLinked}  mine(reporter/contrib): ${[...mineReporter].length}/${[...mineContrib].length}`);
  const cov = {
    needsVerification: built.filter((b) => b.status === 'Needs Verification').length,
    escalated: built.filter((b) => b.issue.escalationLevel > 0).length,
    wallOfShame: built.filter((b) => b.issue.wallOfShame).length,
    resolvedEsg: built.filter((b) => b.issue.esgScore).length,
    collaboration: built.filter((b) => b.contributors.length).length,
    communityResolved: built.filter((b) => b.issue.communityVerification?.status === 'passed').length,
    social: built.filter((b) => b.issue.xPosted).length,
    rti: built.filter((b) => b.issue.rtiGenerated).length,
    recurrence: built.filter((b) => b.issue.recurrenceOf).length,
    cities: [...new Set(built.map((b) => b.issue.city))],
  };
  console.log(`coverage: ${JSON.stringify(cov)}`);
  console.log(`Queued writes: ${writes.length}`);
  if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }

  if (WIPE) {
    for (const coll of ['issues', 'agents_log', 'agent_runs']) {
      const snap = await db.collection(coll).where('seedTag', '==', SEED_TAG).get();
      for (const d of snap.docs) { for (const sub of ['timeline', 'evidence']) { const ss = await d.ref.collection(sub).get(); for (const x of ss.docs) await x.ref.delete(); } await d.ref.delete(); }
      console.log(`wiped ${snap.size} ${coll}`);
    }
  }
  let done = 0;
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) w.merge ? batch.set(w.ref, w.data, { merge: true }) : batch.set(w.ref, w.data);
    await batch.commit(); done += Math.min(400, writes.length - i); console.log(`  committed ${done}/${writes.length}`);
  }
  console.log(`\n✔ Done. ${users.length} users + ${built.length} issues (+pipeline logs/runs/collaboration) seeded. tag='${SEED_TAG}'.`);
  process.exit(0);
};

run().catch((e) => { console.error('[seedDemoData]:', e); process.exit(1); });
