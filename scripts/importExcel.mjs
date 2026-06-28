// Bulk-import the real JanaShakti dataset (Excel) into Firestore via the Admin SDK,
// as if every user logged in and raised their issues. Runs the real 4-agent pipeline
// on a small sample (real agents_log + agent_runs) and synthesizes the rest so every
// app screen is populated.
//
//   node scripts/importExcel.mjs --dry     # plan only, no writes, no AI calls
//   node scripts/importExcel.mjs           # write to Firestore
//
// Prereqs:
//   - scripts/serviceAccountKey.json  (Firebase Console → Project Settings → Service Accounts)
//   - .env with VITE_GEMINI_API_KEY   (only used for the real-pipeline sample)
//   - npm install                      (firebase-admin, xlsx; sharp already present)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import xlsx from 'xlsx';
import sharp from 'sharp';
import { levelFor } from '../src/constants/issueTypes.js';
import { DEPARTMENT_MAP } from '../src/constants/departments.js';
import { buildComplaintLetter } from '../src/utils/complaint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config (tweak volume / fidelity here) ──
const ISSUE_LIMIT = 500;         // total issues to insert (balanced across the 5 regions)
const REAL_PIPELINE_COUNT = 30;  // of those, run the live Gemini pipeline (rest synthesized)
const DRY = process.argv.includes('--dry');

const XLSX_PATH = path.join(ROOT, 'JanaShakti_Dummy_Data_Cloudinary.xlsx');
const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const ENV_PATH = path.join(ROOT, '.env');

const Timestamp = admin.firestore.Timestamp; // available statically (no app init needed)
const REGION_CITY = {
  'Mumbai-NaviMumbai-Thane': 'Mumbai', Bangalore: 'Bangalore',
  Delhi: 'Delhi', Hyderabad: 'Hyderabad', Pune: 'Pune',
};
const ORG_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#16a34a', '#f97316', '#eab308', '#ec4899', '#14b8a6'];
const STATUS_MAP = {
  Reported: 'Reported', Acknowledged: 'Verified', 'In Progress': 'In Progress',
  Escalated: 'In Progress', Resolved: 'Resolved',
};
const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (Number(v) || 0);
function readEnv(key) {
  try { const m = fs.readFileSync(ENV_PATH, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm')); return m ? m[1].trim() : ''; }
  catch { return ''; }
}
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)); // excel serial
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
}
const toTs = (v) => { const d = toDate(v); return d ? Timestamp.fromDate(d) : Timestamp.now(); };

const GEMINI_KEY = readEnv('VITE_GEMINI_API_KEY');

// ── Parse the workbook ──
const wb = xlsx.readFile(XLSX_PATH);
const sheet = (n) => xlsx.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
const orgsRaw = sheet('Organizations');
const usersRaw = sheet('Users');
const issuesRaw = sheet('Issues');

const orgById = new Map(orgsRaw.map((o) => [o['Org ID'], o]));
const userById = new Map(usersRaw.map((u) => [u['User ID'], u]));
const memberCount = new Map();
for (const u of usersRaw) { const o = u['Org ID']; if (o) memberCount.set(o, (memberCount.get(o) || 0) + 1); }
const orgTypeOf = (o) => (o?.['Type'] === 'College' ? 'college' : 'company');

// ── Balanced issue selection: ~ISSUE_LIMIT/5 per region, covering every category &
//    status first (deterministic, so re-runs pick the same set → idempotent). ──
function selectIssues() {
  const per = Math.ceil(ISSUE_LIMIT / 5);
  const byRegion = {};
  for (const r of issuesRaw) (byRegion[r['City Region']] ||= []).push(r);
  const out = [];
  for (const region of Object.keys(byRegion)) {
    const rows = byRegion[region];
    const pick = [], inPick = new Set(), seenCat = new Set(), seenStatus = new Set();
    const add = (r) => { pick.push(r); inPick.add(r['Issue ID']); seenCat.add(r['Category']); seenStatus.add(r['Status']); };
    for (const r of rows) { if (pick.length >= per) break; if (!seenCat.has(r['Category'])) add(r); }
    for (const r of rows) { if (pick.length >= per) break; if (!inPick.has(r['Issue ID']) && !seenStatus.has(r['Status'])) add(r); }
    for (const r of rows) { if (pick.length >= per) break; if (!inPick.has(r['Issue ID'])) add(r); }
    out.push(...pick.slice(0, per));
  }
  return out.slice(0, ISSUE_LIMIT);
}
const issuesSel = selectIssues();

// Per-user counts (for the user profile docs).
const reportedBy = new Map(), resolvedBy = new Map();
for (const r of issuesSel) {
  const u = r['User ID']; reportedBy.set(u, (reportedBy.get(u) || 0) + 1);
  if (STATUS_MAP[r['Status']] === 'Resolved') resolvedBy.set(u, (resolvedBy.get(u) || 0) + 1);
}

// ── Doc builders ──
function buildOrg(o) {
  const id = o['Org ID']; const idx = parseInt(String(id).replace(/\D/g, ''), 10) || 0;
  const type = orgTypeOf(o);
  return {
    id, name: o['Organization Name'], type,
    zone: { lat: num(o['Latitude']), lng: num(o['Longitude']), radiusKm: 2 },
    zoneName: o['Area/Locality'] || o['City Region'] || '',
    logo: null, memberCount: memberCount.get(id) || 0,
    badge: type === 'college' ? 'Civic Campus' : 'Civic Champion',
    color: ORG_COLORS[idx % ORG_COLORS.length],
    contactEmail: o['Contact Email'] || '', contactPhone: o['Contact Phone'] || '',
    seededAt: Timestamp.now(),
  };
}
function buildUser(u) {
  const uid = u['User ID']; const t = u['User Type'];
  const role = t === 'Student' ? 'student' : t === 'Employee' ? 'employee' : 'civilian';
  const orgId = u['Org ID'] || null; const org = orgId ? orgById.get(orgId) : null;
  const score = num(u['Civic Score']);
  return {
    uid, displayName: u['Full Name'], email: u['Email'] || null, phone: u['Phone'] || '',
    photoURL: null, authMethod: 'import', civicScore: score,
    issuesReported: reportedBy.get(uid) || 0, issuesVerified: 0,
    issuesResolved: resolvedBy.get(uid) || 0, issuesShared: 0,
    badges: [], level: levelFor(score), streak: 0,
    lastActiveDate: new Date().toISOString().split('T')[0],
    xHandle: '', linkedinUrl: '', city: REGION_CITY[u['City Region']] || u['City Region'] || '',
    affiliation: orgId
      ? { role, orgId, orgName: u['Organization'], orgType: orgTypeOf(org) }
      : { role, orgId: null, orgName: null, orgType: null },
    notificationsSeenAt: null, createdAt: toTs(u['Registration Date']),
    lastSeen: Timestamp.now(), onboardingComplete: true,
  };
}
const buildPublicProfile = (u) => ({
  displayName: u['Full Name'], photoURL: null, civicScore: num(u['Civic Score']), updatedAt: Timestamp.now(),
});
function statusHistory(statusRaw, created, resolved, uid) {
  const h = [{ status: 'Reported', changedAt: created.toISOString(), changedBy: uid, note: 'Reported via JanaShakti' }];
  if (statusRaw && statusRaw !== 'Reported') {
    const when = resolved || created;
    h.push({ status: STATUS_MAP[statusRaw], changedAt: when.toISOString(), changedBy: 'authority', note: `Marked ${statusRaw}` });
  }
  return h;
}
function buildIssue(r, idx) {
  const uid = r['User ID']; const u = userById.get(uid);
  const region = r['City Region']; const city = REGION_CITY[region] || region;
  const orgId = u?.['Org ID'] || null; const org = orgId ? orgById.get(orgId) : null;
  const adoptedBy = orgId ? { id: orgId, name: u['Organization'], type: orgTypeOf(org) } : null;
  const category = r['Category']; const severity = r['Priority']; const statusRaw = r['Status'];
  const status = STATUS_MAP[statusRaw] || 'Reported';
  const created = toDate(r['Created Date']) || new Date();
  const resolved = toDate(r['Resolved Date']);
  const daysOpen = Math.floor((Date.now() - created.getTime()) / 86400000);
  const upvotes = num(r['Upvotes']);
  const dept = DEPARTMENT_MAP[category] || DEPARTMENT_MAP.Other;
  const hasVideo = !!r['Video URL (Cloudinary)'];
  const isVideo = hasVideo && idx % 5 === 0;            // ~1 in 5 → video scenario
  const isResolved = status === 'Resolved';
  return {
    userId: uid, userName: r['Reported By'], userPhoto: null, userEmail: u?.['Email'] || '',
    complaintId: r['Issue ID'],
    photoUrl: r['Image URL 1 (Cloudinary)'] || '',
    mediaType: isVideo ? 'video' : 'photo',
    videoUrl: isVideo ? r['Video URL (Cloudinary)'] : null,
    videoDuration: isVideo ? 10 : null,
    issueType: category, severity, title: r['Title'] || '', description: r['Description'] || '',
    department: dept.name,
    complaintText: buildComplaintLetter({
      name: r['Reported By'], contact: u?.['Email'] || '', address: r['Area'],
      issueType: category, severity, department: dept.name, body: r['Description'],
    }),
    legalRight: '', isGenuine: true, confidence: 80 + (idx % 15),
    tags: ['#JanaShakti', `#${String(city).replace(/\s+/g, '')}`, `#${String(category).replace(/\s+/g, '')}`],
    isDuplicate: false, originalIssueId: null,
    location: { lat: num(r['Latitude']), lng: num(r['Longitude']) },
    locationText: r['Area'] || '', city, adoptedBy, ward: '',
    status, statusHistory: statusHistory(statusRaw, created, resolved, uid),
    confirmations: upvotes, confirmedBy: [], pressureScore: Math.min(100, 10 + upvotes),
    escalationLevel: statusRaw === 'Escalated' ? 2 : daysOpen > 14 ? 2 : daysOpen > 7 ? 1 : 0,
    wallOfShame: daysOpen >= 30 && !isResolved,
    isRecurring: false, recurringCount: 0, previousReportIds: [],
    socialConsent: 'anonymous', userXHandle: '',
    xPosted: upvotes > 50, xPostUrl: null, linkedinPosted: false, linkedinPostUrl: null, socialReach: upvotes * 50,
    resolutionPhotoUrl: isResolved ? (r['Image URL 2 (Cloudinary)'] || '') : null,
    resolutionVerified: isResolved, resolutionGenuine: isResolved,
    resolvedAt: isResolved && resolved ? Timestamp.fromDate(resolved) : null,
    rtiGenerated: false, rtiDocUrl: null,
    createdAt: Timestamp.fromDate(created), updatedAt: Timestamp.fromDate(resolved || created),
  };
}

// ── Synthesized agent outputs (deterministic, no AI) ──
function synthRouting(issue) {
  const d = DEPARTMENT_MAP[issue.issueType] || DEPARTMENT_MAP.Other;
  const urgency = issue.severity === 'Critical' ? 'Emergency' : issue.severity === 'High' ? 'Urgent' : 'Routine';
  return {
    departmentName: d.name, departmentCode: d.code, wardOffice: `${issue.city} Ward Office`,
    officerTitle: 'Executive Engineer', emailSubject: `Civic Issue: ${issue.issueType} at ${issue.locationText}`,
    urgencyLevel: urgency, slaHours: d.slaHours, escalationPath: 'ward office to department head to commissioner',
    emailSent: false,
  };
}
function synthPrediction(issue) {
  const sev = { Low: 30, Medium: 55, High: 75, Critical: 90 }[issue.severity] || 50;
  return {
    priority_score: Math.round(Math.min(100, sev + Math.min(20, issue.confirmations / 5))),
    predicted_days: issue.severity === 'Critical' ? 5 : issue.severity === 'High' ? 9 : 14,
    escalation_risk: issue.severity === 'Critical' ? 'High' : issue.severity === 'High' ? 'Medium' : 'Low',
    recommendation: 'Monitor community pressure and pursue the responsible department for timely action.',
    confidence: 75, factors: ['Issue severity', 'Community confirmations', 'Department SLA'],
  };
}
function steps(issue, routing, prediction, dupSummary, real) {
  return [
    { agent: 'analyzer', name: 'Issue Analyzer', status: 'done', summary: `${issue.issueType} · ${issue.severity}`, detail: `Confidence ${issue.confidence}%${real ? ' (live)' : ''}`, confidence: issue.confidence },
    { agent: 'detector', name: 'Duplicate Detector', status: 'done', summary: dupSummary || 'No duplicate — new report', detail: 'Checked 200m radius.' },
    { agent: 'router', name: 'Authority Router', status: 'done', summary: routing.departmentName, detail: `${routing.urgencyLevel} · SLA ${routing.slaHours}h` },
    { agent: 'predictor', name: 'Resolution Predictor', status: 'done', summary: `~${prediction.predicted_days} days · priority ${prediction.priority_score}`, detail: prediction.recommendation, confidence: prediction.confidence },
  ];
}
const logDoc = (issueId, agentName, input, output, model) => ({
  issueId, agentName, input, output: output || null,
  processingTimeMs: 150 + (issueId.length * 7) % 400, success: true,
  geminiModel: model || 'synth', createdAt: Timestamp.now(),
});

// ── Live Gemini calls (real pipeline sample) ──
async function geminiCall(parts) {
  for (const model of MODEL_CHAIN) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, topK: 1, topP: 0.95 } }),
      });
      if ([429, 404, 503].includes(res.status)) continue;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('empty');
      return { text: text.replace(/```json|```/g, '').trim(), model };
    } catch { /* try next model */ }
  }
  throw new Error('all Gemini models failed');
}
const geminiJSON = async (prompt) => { const { text, model } = await geminiCall([{ text: prompt }]); return { json: JSON.parse(text), model }; };
async function geminiVisionJSON(prompt, b64) {
  const { text, model } = await geminiCall([{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }]);
  return { json: JSON.parse(text), model };
}
async function fetchImageB64(url) {
  const res = await fetch(url); if (!res.ok) throw new Error('img HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return (await sharp(buf).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 60 }).toBuffer()).toString('base64');
}

// Prompts mirror src/agents/* (kept here because those modules import the Vite client SDK).
const ANALYZER_PROMPT = `You are an AI assistant for JanaShakti, India's civic intelligence platform. Analyze this civic issue image.
Respond ONLY with valid JSON: {"issue_type":"...","severity":"Low|Medium|High|Critical","description":"2 sentences","department":"responsible Indian dept","is_genuine":true,"confidence":85,"reject_reason":""}`;
const routerPrompt = (i) => `For this civic issue in India:
City: ${i.city}
Issue Type: ${i.issueType}
Severity: ${i.severity}
Description: ${i.description}
Return ONLY valid JSON: {"departmentName":"full official department name","departmentCode":"${(DEPARTMENT_MAP[i.issueType] || DEPARTMENT_MAP.Other).code}","wardOffice":"ward office name","officerTitle":"officer title","emailSubject":"formal subject","urgencyLevel":"Routine|Urgent|Emergency","slaHours":${(DEPARTMENT_MAP[i.issueType] || DEPARTMENT_MAP.Other).slaHours},"escalationPath":"ward to dept head to commissioner"}`;
const predictorPrompt = (i, routing) => `You are a civic AI analyst for JanaShakti India. Predict resolution for this issue:
Type: ${i.issueType}
Severity: ${i.severity}
City: ${i.city}
Community confirmations: ${i.confirmations}
Department: ${routing?.departmentName || 'Unknown'}
Return ONLY valid JSON: {"priority_score":72,"predicted_days":10,"escalation_risk":"Low|Medium|High|Critical","recommendation":"one sentence","confidence":80,"factors":["f1","f2","f3"]}`;
const dupPrompt = (a, b, type) => `Are these two civic issue reports the same problem?
Report A (new): "${a}"
Report B (existing): "${b}"
Both are: ${type} in the same area.
Return ONLY valid JSON: {"isDuplicate":true,"similarity":85,"reasoning":"one sentence"}`;

// Run the real pipeline for one issue → { routing, prediction, logs[], run }.
async function runRealPipeline(db, issue) {
  const id = issue.complaintId; const logs = []; const start = Date.now();

  // 1) Analyzer (vision) — logged for the trace; does NOT overwrite the Excel category.
  let aOut = null, aModel = '';
  try { const b64 = await fetchImageB64(issue.photoUrl); const r = await geminiVisionJSON(ANALYZER_PROMPT, b64); aOut = r.json; aModel = r.model; }
  catch (e) { aOut = { error: String(e.message) }; }
  logs.push(logDoc(id, 'issue_analyzer', { hasImage: true }, aOut, aModel || 'gemini'));

  // 2) Duplicate — only call AI if a nearby same-type issue already exists.
  let dupSummary = 'No duplicate — new report';
  try {
    const snap = await db.collection('issues')
      .where('status', 'in', ['Reported', 'Verified', 'In Progress']).where('issueType', '==', issue.issueType).get();
    const near = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) =>
      x.id !== id && x.location && Math.abs(x.location.lat - issue.location.lat) < 0.002 && Math.abs(x.location.lng - issue.location.lng) < 0.002);
    if (near.length) {
      const r = await geminiJSON(dupPrompt(issue.description, near[0].description, issue.issueType));
      logs.push(logDoc(id, 'duplicate_detector', { issueType: issue.issueType }, { isDuplicate: !!r.json.isDuplicate, similarity: r.json.similarity }, r.model));
      dupSummary = r.json.isDuplicate ? `Possible duplicate (${r.json.similarity}% match)` : 'No duplicate — new report';
    } else {
      logs.push(logDoc(id, 'duplicate_detector', { issueType: issue.issueType }, { isDuplicate: false }, 'gemini'));
    }
  } catch (e) { logs.push(logDoc(id, 'duplicate_detector', { issueType: issue.issueType }, { isDuplicate: false, error: String(e.message) }, 'gemini')); }

  // 3) Router (no n8n side-effects).
  let routing;
  try { const r = await geminiJSON(routerPrompt(issue)); routing = { ...r.json, emailSent: false }; logs.push(logDoc(id, 'authority_router', { issueType: issue.issueType, city: issue.city }, routing, r.model)); }
  catch { routing = synthRouting(issue); logs.push(logDoc(id, 'authority_router', { issueType: issue.issueType }, routing, 'synth-fallback')); }

  // 4) Predictor — fed the router output (agent-to-agent context).
  let prediction;
  try { const r = await geminiJSON(predictorPrompt(issue, routing)); prediction = r.json; logs.push(logDoc(id, 'resolution_predictor', { severity: issue.severity }, prediction, r.model)); }
  catch { prediction = synthPrediction(issue); logs.push(logDoc(id, 'resolution_predictor', { severity: issue.severity }, prediction, 'synth-fallback')); }

  const run = { issueId: id, issueType: issue.issueType, severity: issue.severity, locationText: issue.locationText, steps: steps(issue, routing, prediction, dupSummary, true), durationMs: Date.now() - start, createdAt: Timestamp.now() };
  return { routing, prediction, logs, run };
}

// ── Main ──
async function main() {
  console.log(`\nJanaShakti import  (${DRY ? 'DRY RUN — no writes' : 'LIVE'})`);
  console.log(`Source: ${path.basename(XLSX_PATH)}`);
  console.log(`Orgs: ${orgsRaw.length} | Users: ${usersRaw.length} | Issues in file: ${issuesRaw.length}`);

  const perRegion = {};
  for (const r of issuesSel) perRegion[r['City Region']] = (perRegion[r['City Region']] || 0) + 1;
  console.log(`\nSelected ${issuesSel.length} issues (balanced):`);
  for (const [k, v] of Object.entries(perRegion)) console.log(`  ${k}: ${v}`);
  const cats = new Set(issuesSel.map((r) => r['Category'])); const stats = new Set(issuesSel.map((r) => r['Status']));
  console.log(`  categories covered: ${cats.size}/15 | statuses covered: ${[...stats].join(', ')}`);
  console.log(`  real pipeline on first ${Math.min(REAL_PIPELINE_COUNT, issuesSel.length)} | synthesized for the rest`);
  console.log(`  Gemini key for real pipeline: ${GEMINI_KEY ? 'present' : 'MISSING → all synthesized'}`);

  const issueDocs = issuesSel.map((r, i) => ({ id: r['Issue ID'], data: buildIssue(r, i) }));

  if (DRY) {
    console.log('\nSample issue doc:'); console.log(JSON.stringify(issueDocs[0]?.data, null, 2).slice(0, 1600));
    console.log(`\nWould write: ${orgsRaw.length} orgs, ${usersRaw.length} users + publicProfiles, ${issueDocs.length} issues, agent logs/runs.`);
    console.log('Dry run complete. Re-run without --dry to write.'); return;
  }

  if (!fs.existsSync(KEY_PATH)) {
    console.error('\nMissing scripts/serviceAccountKey.json — generate it in Firebase Console → Project Settings → Service Accounts → Generate new private key.');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))) });
  const db = admin.firestore();

  async function commit(writes) {
    for (let i = 0; i < writes.length; i += 450) {
      const batch = db.batch();
      for (const w of writes.slice(i, i + 450)) batch.set(w.ref, w.data, { merge: true });
      await batch.commit();
    }
  }

  // 1) Organizations
  await commit(orgsRaw.map((o) => ({ ref: db.collection('organizations').doc(o['Org ID']), data: buildOrg(o) })));
  console.log(`\n✓ ${orgsRaw.length} organizations`);

  // 2) Users + publicProfiles
  await commit(usersRaw.map((u) => ({ ref: db.collection('users').doc(u['User ID']), data: buildUser(u) })));
  await commit(usersRaw.map((u) => ({ ref: db.collection('publicProfiles').doc(u['User ID']), data: buildPublicProfile(u) })));
  console.log(`✓ ${usersRaw.length} users + publicProfiles`);

  // 3) Issues (base docs first, so the duplicate detector can query them)
  await commit(issueDocs.map((d) => ({ ref: db.collection('issues').doc(d.id), data: d.data })));
  console.log(`✓ ${issueDocs.length} issues`);

  // 4) Agent pipeline — real for the sample, synthesized for the rest
  let real = 0, synth = 0;
  for (let i = 0; i < issueDocs.length; i++) {
    const { id, data: issue } = issueDocs[i];
    let routing, prediction, logs, run;
    if (i < REAL_PIPELINE_COUNT && GEMINI_KEY) {
      const res = await runRealPipeline(db, issue);
      ({ routing, prediction, logs, run } = res); real++;
      await sleep(1200); // gentle on rate limits
    } else {
      routing = synthRouting(issue); prediction = synthPrediction(issue);
      logs = [
        logDoc(id, 'issue_analyzer', { hasImage: true }, { issue_type: issue.issueType, severity: issue.severity, confidence: issue.confidence, is_genuine: true }, 'synth'),
        logDoc(id, 'duplicate_detector', { issueType: issue.issueType }, { isDuplicate: false, similarity: 0 }, 'synth'),
        logDoc(id, 'authority_router', { issueType: issue.issueType, city: issue.city }, routing, 'synth'),
        logDoc(id, 'resolution_predictor', { severity: issue.severity }, prediction, 'synth'),
      ];
      run = { issueId: id, issueType: issue.issueType, severity: issue.severity, locationText: issue.locationText, steps: steps(issue, routing, prediction, null, false), durationMs: 900 + i, createdAt: Timestamp.now() };
      synth++;
    }
    const writes = [
      { ref: db.collection('issues').doc(id), data: { routedTo: routing, prediction } },
      { ref: db.collection('agent_runs').doc(`run_${id}`), data: run },
      ...logs.map((l) => ({ ref: db.collection('agents_log').doc(`${id}_${l.agentName}`), data: l })),
    ];
    await commit(writes);
    if ((i + 1) % 10 === 0 || i === issueDocs.length - 1) console.log(`  pipeline ${i + 1}/${issueDocs.length} (real ${real}, synth ${synth})`);
  }

  console.log(`\n✓ Done. Agent pipeline executed: ${real} real, ${synth} synthesized.`);
  console.log('All collections populated. Refresh the app to see the data.');
  process.exit(0);
}

main().catch((e) => { console.error('Import failed:', e); process.exit(1); });
