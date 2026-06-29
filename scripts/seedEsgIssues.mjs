// Seed a handful of RESOLVED issues that already carry an `esgScore`, so the ESG
// dashboards (City ESG chip, Analytics ESG tab, Top Environmental Impact, Issue
// Detail card) have real data without waiting on the live Gemini scorer.
//
//   node scripts/seedEsgIssues.mjs          # write the demo issues
//   node scripts/seedEsgIssues.mjs --dry    # print what would be written, no writes
//
// Scores are computed deterministically from the app's own constants (ISSUE_SDG_MAP,
// IMPACT_ESTIMATES, ESG_WEIGHTS) — the same weighting esgScorer.js uses — so the
// numbers are consistent with what the app produces. Every doc is tagged
// `seedTag: 'esg-demo'` so you can find/remove them later.
//
// Prereqs: scripts/serviceAccountKey.json + `npm install` (firebase-admin).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { ISSUE_SDG_MAP, IMPACT_ESTIMATES, ESG_WEIGHTS } from '../src/constants/esg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');

const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const E_BASE = { 'Water Leakage': 8.6, Garbage: 7.8, Streetlight: 7.2, Pothole: 6.6, Infrastructure: 6.2, Other: 5.6 };

function buildEsg({ type, severity, days, confirmations, city }) {
  const sdg = ISSUE_SDG_MAP[type] || ISSUE_SDG_MAP.Other;
  const est = IMPACT_ESTIMATES[type] || IMPACT_ESTIMATES.Other;
  const sevBoost = severity === 'Critical' ? 1.0 : severity === 'High' ? 0.5 : 0;
  const e = round1(clamp((E_BASE[type] ?? 6) + sevBoost - days * 0.1, 4, 9.8));
  const s = round1(clamp(6 + confirmations * 0.22 + sevBoost, 5, 9.7));
  const g = round1(clamp(9.6 - days * 0.45, 5, 9.6));
  const overall = round1(e * ESG_WEIGHTS.E + s * ESG_WEIGHTS.S + g * ESG_WEIGHTS.G);
  return {
    e_score: e,
    e_impact: `Fixing this ${type.toLowerCase()} cut local environmental harm and advanced ${sdg.names[0].toLowerCase()} in ${city}.`,
    e_metric: `${est.eValue} ${est.eUnit}`,
    s_score: s,
    s_impact: `Around ${est.sValue} ${est.sUnit}, backed by ${confirmations} citizen confirmations.`,
    s_metric: `${est.sValue} ${est.sUnit}`,
    g_score: g,
    g_impact: `The responsible department closed this complaint in ${days} day${days === 1 ? '' : 's'} — a strong governance response.`,
    g_metric: `Resolved in ${days} day${days === 1 ? '' : 's'}`,
    overall_esg: overall,
    sdg_tags: sdg.sdgs,
    sdg_names: sdg.names,
    highlight: `A ${severity.toLowerCase()} ${type.toLowerCase()} in ${city} was resolved in ${days} day${days === 1 ? '' : 's'}, scoring ${overall}/10 on civic ESG impact.`,
  };
}

const CITY_GEO = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Pune:      { lat: 18.5204, lng: 73.8567 },
  Mumbai:    { lat: 19.0760, lng: 72.8777 },
  Chennai:   { lat: 13.0827, lng: 80.2707 },
  Delhi:     { lat: 28.6139, lng: 77.2090 },
};

// type, severity, city, area, days-to-resolve, resolved-N-days-ago, confirmations
const SEED = [
  ['Water Leakage', 'High',     'Bengaluru', 'MG Road',            2,  3,  9],
  ['Garbage',        'Medium',   'Pune',      'FC Road',            3,  6,  6],
  ['Streetlight',    'High',     'Mumbai',    'Bandra West',        1,  4, 11],
  ['Pothole',        'Critical', 'Bengaluru', 'Outer Ring Road',   4,  8, 14],
  ['Water Leakage',  'Critical', 'Chennai',   'T. Nagar',          2,  2,  8],
  ['Infrastructure', 'High',     'Delhi',     'Connaught Place',    6, 12,  7],
  ['Garbage',        'High',     'Bengaluru', 'Koramangala',        2,  5, 10],
  ['Pothole',        'Medium',   'Pune',      'Baner',              3, 16,  5],
];

const run = async () => {
  let n = 0;
  for (const [type, severity, city, area, days, resolvedAgo, confirmations] of SEED) {
    const resolvedAt = new Date(Date.now() - resolvedAgo * 86400000);
    const createdAt = new Date(resolvedAt.getTime() - days * 86400000);
    const esgScore = buildEsg({ type, severity, days, confirmations, city });
    const complaintId = `JS-2026-${String(9000 + n).padStart(4, '0')}`;
    const doc = {
      userId: 'demo-esg-seed',
      userName: 'Demo Citizen',
      userPhoto: null,
      userEmail: '',
      complaintId,
      photoUrl: '',
      mediaType: 'photo',
      issueType: type,
      severity,
      description: `${severity} ${type.toLowerCase()} reported at ${area}, ${city}. Resolved by the responsible civic authority.`,
      department: ISSUE_SDG_MAP[type] ? '' : '',
      complaintText: '',
      location: CITY_GEO[city],
      locationText: `${area}, ${city}`,
      city,
      status: 'Resolved',
      statusHistory: [
        { status: 'Reported', changedAt: createdAt.toISOString(), changedBy: 'demo-esg-seed', note: 'Initial report' },
        { status: 'Resolved', changedAt: resolvedAt.toISOString(), changedBy: 'demo-authority', note: 'Resolved — AI-verified photo (demo)' },
      ],
      confirmations,
      confirmedBy: [],
      pressureScore: confirmations * 10,
      escalationLevel: 0,
      wallOfShame: false,
      resolutionPhotoUrl: '',
      resolutionVerified: true,
      resolutionGenuine: true,
      resolutionConfidence: 92,
      resolutionNote: 'AI-verified resolution (demo seed).',
      resolvedAt: Timestamp.fromDate(resolvedAt),
      resolutionCelebrated: true,
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt: Timestamp.fromDate(resolvedAt),
      esgScore,
      esgScoredAt: Timestamp.fromDate(resolvedAt),
      seedTag: 'esg-demo',
    };
    if (DRY) {
      console.log(`• ${complaintId} ${type}/${severity} @ ${city} → ESG ${esgScore.overall_esg}/10 (E ${esgScore.e_score} S ${esgScore.s_score} G ${esgScore.g_score})`);
    } else {
      const ref = await db.collection('issues').add(doc);
      console.log(`✔ ${complaintId} ${type} @ ${city} → ESG ${esgScore.overall_esg}/10  [${ref.id}]`);
    }
    n += 1;
  }
  console.log(`\n${DRY ? 'DRY RUN — ' : ''}${n} resolved ESG-scored issues ${DRY ? 'planned' : 'written'}.`);
  process.exit(0);
};

run().catch((e) => { console.error('[seedEsgIssues]:', e); process.exit(1); });
