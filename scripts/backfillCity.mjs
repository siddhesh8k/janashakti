// One-off backfill: re-tag existing issues' `city` from their stored `locationText`,
// using the same detection as the app (src/utils/cityDetect.js — mirrored inline here
// because Node ESM can't import the app's extensionless module graph). Bypasses Firestore
// rules (Admin SDK).
//
//   node scripts/backfillCity.mjs          # DRY RUN — prints planned changes, writes nothing
//   node scripts/backfillCity.mjs --apply  # commits the updates
//
// Safe by design: it only PROMOTES an issue to a recognized city; it never downgrades a
// good tag to 'Other' (so issues whose address lacks a city name keep their current city).
// `complaintId` is left untouched (it's a historical reference shown to users).
//
// Prereqs: scripts/serviceAccountKey.json + `npm install` (firebase-admin).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const APPLY = process.argv.includes('--apply');

// ── Mirror of src/utils/cityDetect.js ───────────────────────────────────────────
const CITY_ORDER = ['Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Pune'];
const CITY_ALIASES = {
  Bangalore: ['bangalore', 'bengaluru', 'bengalūru'],
  Mumbai: ['mumbai', 'bombay', 'navi mumbai', 'thane'],
  Delhi: ['new delhi', 'delhi', 'noida', 'gurugram', 'gurgaon'],
  Chennai: ['chennai', 'madras'],
  Hyderabad: ['hyderabad', 'secunderabad'],
  Pune: ['pune', 'poona', 'pimpri', 'chinchwad'],
};
const detectCity = (address) => {
  const a = (address || '').toLowerCase();
  if (!a) return 'Other';
  for (const city of CITY_ORDER) {
    if ((CITY_ALIASES[city] || [city.toLowerCase()]).some((alias) => a.includes(alias))) return city;
  }
  return 'Other';
};

const run = async () => {
  const db = admin.firestore();
  const snap = await db.collection('issues').get();
  console.log(`Scanning ${snap.size} issues… (mode: ${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const changes = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const detected = detectCity(data.locationText || data.address || '');
    // Only promote to a recognized city; never downgrade a good tag to 'Other'.
    if (detected !== 'Other' && detected !== data.city) {
      changes.push({ id: doc.id, from: data.city || '(none)', to: detected, where: data.locationText || '' });
    }
  });

  if (changes.length === 0) {
    console.log('No issues need re-tagging. Nothing to do.');
    process.exit(0);
  }

  // Summarize transitions.
  const byTransition = {};
  changes.forEach((c) => { const k = `${c.from} → ${c.to}`; byTransition[k] = (byTransition[k] || 0) + 1; });
  console.log(`${changes.length} issue(s) would be re-tagged:`);
  Object.entries(byTransition).sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k.padEnd(28)} ${n}`));
  console.log('');
  changes.slice(0, 12).forEach((c) => console.log(`  ${c.id}  ${c.from} → ${c.to}   "${String(c.where).slice(0, 50)}"`));
  if (changes.length > 12) console.log(`  …and ${changes.length - 12} more`);

  if (!APPLY) {
    console.log('\nDRY RUN — no writes made. Re-run with --apply to commit.');
    process.exit(0);
  }

  // Commit in batches (Firestore caps a batch at 500 writes).
  let committed = 0;
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach((c) => batch.update(db.doc(`issues/${c.id}`), { city: c.to }));
    await batch.commit();
    committed += Math.min(400, changes.length - i);
    console.log(`Committed ${committed}/${changes.length}…`);
  }
  console.log(`\nDone. Re-tagged ${committed} issue(s).`);
  process.exit(0);
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
