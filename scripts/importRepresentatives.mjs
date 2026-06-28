// Import elected-representative / ward data into the Firestore `representatives`
// collection via the Admin SDK. The app loads this at runtime (utils/representatives.js)
// and falls back to the built-in list (src/constants/representatives.js) when empty.
//
//   node scripts/importRepresentatives.mjs                              # seed from built-in fallback
//   node scripts/importRepresentatives.mjs wards.geojson --city=Pune    # real ward boundaries (centroid+radius)
//   node scripts/importRepresentatives.mjs wards.geojson --city=Pune --names=corporators.csv  # + join names
//   node scripts/importRepresentatives.mjs reps.csv                     # flat row file (cols below)
//   node scripts/importRepresentatives.mjs <file> ... --dry             # plan only, no writes
//
// RECOMMENDED OPEN-DATA SOURCES (no single one has names + coordinates together):
//   • Ward BOUNDARIES (geometry): DataMeet Municipal_Spatial_Data — real ward GeoJSON for
//     ~29 cities (github.com/datameet/Municipal_Spatial_Data). This script turns each
//     polygon into a ward centre (centroid) + radius (bbox half-diagonal).
//   • Representative NAMES (per city): a corporator/councillor CSV (e.g. DataMeet Pune_wards,
//     a State Election Commission list, or MyNeta/ADR). Join via --names by ward number.
//   • Official ward CODES: lgdirectory.gov.in (join key only — no names, no coordinates).
// Wards without a matched representative name are still written (geometry preserved); the
// app simply skips them until a names file is joined in a later run (merge-safe).
//
// Flat-file columns (CSV/XLSX/JSON rows; case-insensitive, first present variant wins):
//   wardNo|ward · wardName|name|area · city · lat|latitude · lng|lon|longitude ·
//   radiusKm|radius (default 2) · repName|representative|councillor|corporator · party ·
//   since|year · phone|contact
//
// Prereqs: scripts/serviceAccountKey.json (Firebase Console → Project Settings →
//          Service Accounts → Generate new private key), and `npm install`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import xlsx from 'xlsx';
import { WARD_REPRESENTATIVES } from '../src/constants/representatives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');

const DRY = process.argv.includes('--dry');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const flag = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : '';
};
const cityArg = flag('city');
const namesArg = flag('names');

// First present key (case-insensitive) from a plain object (row or GeoJSON properties).
const pick = (obj, keys) => {
  const lower = {};
  for (const k of Object.keys(obj || {})) lower[k.toLowerCase().trim()] = obj[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const repFrom = (obj) => ({
  name: pick(obj, ['repName', 'representative', 'councillor', 'corporator', 'member', 'name']) || '',
  party: pick(obj, ['party', 'partyName']) || '',
  since: String(pick(obj, ['since', 'year', 'electedSince']) || ''),
  phone: pick(obj, ['phone', 'contact', 'mobile']) ?? null,
});

// ── Flat row (CSV/XLSX/JSON-array) → ward ──
const rowToWard = (row, idx) => ({
  wardNo: pick(row, ['wardNo', 'ward', 'wardnumber']) ?? idx + 1,
  name: pick(row, ['wardName', 'name', 'area', 'locality']) || '',
  city: cityArg || pick(row, ['city', 'district', 'corporation']) || '',
  center: { lat: num(pick(row, ['lat', 'latitude'])), lng: num(pick(row, ['lng', 'lon', 'long', 'longitude'])) },
  radiusKm: num(pick(row, ['radiusKm', 'radius'])) || 2,
  representative: repFrom(row),
});

// ── GeoJSON polygon → centroid + radius ──
// Flatten every [lng,lat] pair out of a Polygon/MultiPolygon coordinate tree.
const collectCoords = (geometry) => {
  const out = [];
  const walk = (a) => {
    if (!Array.isArray(a)) return;
    if (typeof a[0] === 'number' && typeof a[1] === 'number') { out.push(a); return; }
    for (const x of a) walk(x);
  };
  walk(geometry?.coordinates);
  return out;
};

// Centroid (mean of vertices) + radius = half the bbox diagonal in km.
const centroidRadius = (coords) => {
  let sx = 0, sy = 0, n = 0;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of coords) {
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    sx += lng; sy += lat; n++;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (!n) return null;
  const lat = sy / n, lng = sx / n;
  const latKm = (maxLat - minLat) * 111;
  const lngKm = (maxLng - minLng) * 111 * Math.cos((lat * Math.PI) / 180);
  const radiusKm = Math.max(0.3, Math.round((Math.sqrt(latKm * latKm + lngKm * lngKm) / 2) * 10) / 10);
  return { lat, lng, radiusKm };
};

const featureToWard = (feature, idx) => {
  const cr = centroidRadius(collectCoords(feature?.geometry));
  if (!cr) return null;
  const props = feature.properties || {};
  return {
    wardNo: pick(props, ['wardNo', 'ward_no', 'ward', 'no', 'wardnumber', 'ward_id', 'prabhag_no']) ?? idx + 1,
    name: pick(props, ['wardName', 'ward_name', 'name', 'prabhag', 'area', 'label']) || '',
    city: cityArg || pick(props, ['city', 'corporation', 'ulb']) || '',
    center: { lat: cr.lat, lng: cr.lng },
    radiusKm: cr.radiusKm,
    representative: { name: '', party: '', since: '', phone: null },
  };
};

const isFeatureCollection = (o) => o && (o.type === 'FeatureCollection' || Array.isArray(o.features));

// Build a { wardNo → representative } map from the --names file.
const loadNamesMap = () => {
  if (!namesArg) return null;
  const ext = path.extname(namesArg).toLowerCase();
  let rows;
  if (ext === '.json') {
    const raw = JSON.parse(fs.readFileSync(namesArg, 'utf8'));
    rows = Array.isArray(raw) ? raw : raw.records || raw.data || [];
  } else {
    const wb = xlsx.readFile(namesArg);
    rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }
  const map = {};
  for (const r of rows) {
    const wardNo = pick(r, ['wardNo', 'ward', 'wardnumber', 'no']);
    if (wardNo === undefined || wardNo === '') continue;
    map[String(wardNo)] = repFrom(r);
  }
  return map;
};

const joinNames = (wards, namesMap) => {
  if (!namesMap) return;
  for (const w of wards) {
    const m = namesMap[String(w.wardNo)];
    if (m && m.name) w.representative = m;
  }
};

const loadWards = () => {
  if (!fileArg) {
    console.log('No source file given — seeding from the built-in fallback list.');
    return WARD_REPRESENTATIVES;
  }
  const ext = path.extname(fileArg).toLowerCase();
  const namesMap = loadNamesMap();
  let wards;

  if (ext === '.geojson' || ext === '.json') {
    const raw = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
    if (isFeatureCollection(raw)) {
      wards = (raw.features || []).map(featureToWard).filter(Boolean);
    } else {
      const rows = Array.isArray(raw) ? raw : raw.records || raw.data || [];
      wards = rows.map(rowToWard);
    }
  } else {
    const wb = xlsx.readFile(fileArg);
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    wards = rows.map(rowToWard);
  }
  joinNames(wards, namesMap);
  return wards;
};

async function main() {
  console.log(`\nJanaShakti representatives import  (${DRY ? 'DRY RUN — no writes' : 'LIVE'})`);
  console.log(`Source: ${fileArg ? path.basename(fileArg) : 'built-in fallback'}` +
    `${cityArg ? ` | city=${cityArg}` : ''}${namesArg ? ` | names=${path.basename(namesArg)}` : ''}`);

  // Geometry is required; representative names are filled where available.
  const wards = loadWards().filter((w) => w.center?.lat != null && w.center?.lng != null);
  const withNames = wards.filter((w) => w.representative?.name).length;
  console.log(`Wards with coordinates: ${wards.length} | with a representative name: ${withNames}`);

  if (!wards.length) {
    console.error('No wards with coordinates. Check the file / column (or --city) mapping.');
    process.exit(1);
  }
  if (!withNames) {
    console.warn('\n⚠ No representative names matched. The app only shows wards that have a\n' +
      '  representative — provide --names=corporators.csv (matched by ward number) to add them.\n' +
      '  Geometry is still written now; a later --names run merges names in.');
  }

  if (DRY) {
    console.log('\nSample ward doc:');
    console.log(JSON.stringify(wards[0], null, 2));
    console.log(`\nWould write ${wards.length} docs to collection "representatives". Re-run without --dry to write.`);
    return;
  }

  if (!fs.existsSync(KEY_PATH)) {
    console.error('\nMissing scripts/serviceAccountKey.json — generate it in Firebase Console → Project Settings → Service Accounts → Generate new private key.');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))) });
  const db = admin.firestore();

  const writes = wards.map((w) => ({
    ref: db.collection('representatives').doc(String(w.wardNo)),
    data: w,
  }));
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 450)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }
  console.log(`\nWrote ${writes.length} representatives. Done.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
