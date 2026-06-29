// Elected Representative Accountability Scorecard — ward boundaries + the elected
// representative for each ward. Used to auto-tag issues (GPS → ward → representative)
// and to rank representatives purely by resolution rate (factual issue data).
//
// NEUTRAL BY DESIGN: this tracks INDIVIDUAL representative performance, not parties.
// `party` is a neutral metadata label only — no colors/logos/endorsements anywhere.
// In production, ward boundaries would come from Election Commission / municipal GIS;
// the demo approximates each ward as a center point + radius.
//
// DATA SOURCE: at runtime the active list is loaded from the Firestore `representatives`
// collection (ingested from data.gov.in / OGD via scripts/importRepresentatives.mjs and
// swapped in via setRepresentatives). WARD_REPRESENTATIVES below is the built-in FALLBACK
// used until that load resolves, or if the collection is empty/unreachable.

export const WARD_REPRESENTATIVES = [
  // Bangalore wards
  { wardNo: 45, name: 'Koramangala', city: 'Bangalore',
    center: { lat: 12.9352, lng: 77.6245 }, radiusKm: 1.5,
    representative: { name: 'Ramesh Kumar', party: 'INC', since: '2023', phone: null } },
  { wardNo: 12, name: 'Indiranagar', city: 'Bangalore',
    center: { lat: 12.9784, lng: 77.6408 }, radiusKm: 1.2,
    representative: { name: 'Priya Nair', party: 'BJP', since: '2023', phone: null } },
  { wardNo: 23, name: 'Jayanagar', city: 'Bangalore',
    center: { lat: 12.9250, lng: 77.5838 }, radiusKm: 1.5,
    representative: { name: 'Anil Mehta', party: 'JDS', since: '2023', phone: null } },
  { wardNo: 67, name: 'Whitefield', city: 'Bangalore',
    center: { lat: 12.9698, lng: 77.7500 }, radiusKm: 2,
    representative: { name: 'Sunita Devi', party: 'INC', since: '2023', phone: null } },
  { wardNo: 34, name: 'HSR Layout', city: 'Bangalore',
    center: { lat: 12.9116, lng: 77.6474 }, radiusKm: 1.5,
    representative: { name: 'Vikram Singh', party: 'AAP', since: '2023', phone: null } },
  { wardNo: 8, name: 'MG Road', city: 'Bangalore',
    center: { lat: 12.9756, lng: 77.6068 }, radiusKm: 1,
    representative: { name: 'Lakshmi Rao', party: 'BJP', since: '2023', phone: null } },
  { wardNo: 56, name: 'Electronic City', city: 'Bangalore',
    center: { lat: 12.8461, lng: 77.6726 }, radiusKm: 2,
    representative: { name: 'Deepak Gowda', party: 'JDS', since: '2023', phone: null } },
  { wardNo: 15, name: 'Malleshwaram', city: 'Bangalore',
    center: { lat: 13.0035, lng: 77.5647 }, radiusKm: 1.2,
    representative: { name: 'Meena Sharma', party: 'INC', since: '2023', phone: null } },
  { wardNo: 78, name: 'Majestic', city: 'Bangalore',
    center: { lat: 12.9767, lng: 77.5713 }, radiusKm: 1,
    representative: { name: 'Ravi Prasad', party: 'BJP', since: '2023', phone: null } },
  { wardNo: 91, name: 'Banashankari', city: 'Bangalore',
    center: { lat: 12.9255, lng: 77.5468 }, radiusKm: 1.5,
    representative: { name: 'Kavitha Reddy', party: 'INC', since: '2023', phone: null } },
  // Mumbai wards
  { wardNo: 101, name: 'Andheri', city: 'Mumbai',
    center: { lat: 19.1197, lng: 72.8464 }, radiusKm: 2,
    representative: { name: 'Sanjay Patil', party: 'SHS', since: '2022', phone: null } },
  { wardNo: 102, name: 'Bandra', city: 'Mumbai',
    center: { lat: 19.0544, lng: 72.8402 }, radiusKm: 1.5,
    representative: { name: 'Fatima Sheikh', party: 'NCP', since: '2022', phone: null } },
  { wardNo: 103, name: 'Dharavi', city: 'Mumbai',
    center: { lat: 19.0440, lng: 72.8553 }, radiusKm: 1,
    representative: { name: 'Mohan Jadhav', party: 'INC', since: '2022', phone: null } },
  // Delhi wards
  { wardNo: 201, name: 'Connaught Place', city: 'Delhi',
    center: { lat: 28.6315, lng: 77.2167 }, radiusKm: 1.5,
    representative: { name: 'Arvind Gupta', party: 'AAP', since: '2022', phone: null } },
  { wardNo: 202, name: 'Hauz Khas', city: 'Delhi',
    center: { lat: 28.5494, lng: 77.2001 }, radiusKm: 1.5,
    representative: { name: 'Neha Kapoor', party: 'BJP', since: '2022', phone: null } },
  // Thane wards (so the scorecard populates for locally-reported issues). Radii are
  // generous so GPS fixes around Thane reliably map to a ward for the demo.
  { wardNo: 301, name: 'Thane West', city: 'Thane',
    center: { lat: 19.1972, lng: 72.9568 }, radiusKm: 4,
    representative: { name: 'Suresh Bhoir', party: 'SHS', since: '2022', phone: null } },
  { wardNo: 302, name: 'Kalwa', city: 'Thane',
    center: { lat: 19.1900, lng: 72.9970 }, radiusKm: 3,
    representative: { name: 'Anjali More', party: 'NCP', since: '2022', phone: null } },
  { wardNo: 303, name: 'Mumbra', city: 'Thane',
    center: { lat: 19.1790, lng: 73.0230 }, radiusKm: 3,
    representative: { name: 'Imran Sayyed', party: 'INC', since: '2022', phone: null } },
];

// The active ward list the helpers read from. Defaults to the built-in fallback; the
// runtime loader (utils/representatives.js) swaps in the Firestore/OGD data once loaded.
// Helpers stay synchronous, so no consumer screen needs an async rewrite.
let ACTIVE = WARD_REPRESENTATIVES;

// Neutral party labels for the self-enrollment dropdown. Metadata only — NO colors,
// logos, or endorsements anywhere (keeps the scorecard non-partisan by design).
export const PARTIES = [
  { code: 'INC',         name: 'Indian National Congress' },
  { code: 'BJP',         name: 'Bharatiya Janata Party' },
  { code: 'AAP',         name: 'Aam Aadmi Party' },
  { code: 'JDS',         name: 'Janata Dal (Secular)' },
  { code: 'SHS',         name: 'Shiv Sena' },
  { code: 'NCP',         name: 'Nationalist Congress Party' },
  { code: 'DMK',         name: 'Dravida Munnetra Kazhagam' },
  { code: 'AITC',        name: 'All India Trinamool Congress' },
  { code: 'Independent', name: 'Independent' },
  { code: 'Other',       name: 'Other / Local' },
];

const wardKey = (city, wardNo) => `${String(city || '').toLowerCase()}-${wardNo}`;

// MERGE community-claimed / imported reps OVER the built-in fallback (claims win by
// ward), instead of replacing it — so the scorecard stays populated for the demo while
// real self-enrolled reps take precedence in their wards. Empty list → pure fallback.
export const setRepresentatives = (list) => {
  if (!Array.isArray(list) || !list.length) { ACTIVE = WARD_REPRESENTATIVES; return; }
  const byKey = new Map(WARD_REPRESENTATIVES.map((w) => [wardKey(w.city, w.wardNo), w]));
  list.forEach((w) => byKey.set(wardKey(w.city, w.wardNo), w));
  ACTIVE = Array.from(byKey.values());
};

// City-level fallback: when a GPS fix doesn't fall inside any ward radius, return a
// representative for that city (first ward listed). Lets the assistant still answer
// "who is my representative?" for a known city even without a precise ward match.
export const getRepresentativeForCity = (city) => {
  if (!city) return null;
  const c = String(city).toLowerCase();
  const ward = ACTIVE.find((w) => w.city?.toLowerCase() === c);
  if (!ward) return null;
  return { wardNo: ward.wardNo, wardName: ward.name, city: ward.city,
           center: ward.center, radiusKm: ward.radiusKm, representative: ward.representative,
           selfDeclared: !!ward.selfDeclared, docId: ward.docId || null, flagCount: ward.flagCount || 0 };
};

// Find which ward a location falls in (first match by Euclidean radius — same approach
// as corporate zone adoption). Returns { wardNo, wardName, city, representative } or null.
export const getWardRepresentative = (lat, lng) => {
  if (!lat || !lng) return null;
  for (const ward of ACTIVE) {
    const dLat = lat - ward.center.lat;
    const dLng = lng - ward.center.lng;
    const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
    if (distKm <= ward.radiusKm) {
      return {
        wardNo: ward.wardNo,
        wardName: ward.name,
        city: ward.city,
        center: ward.center,
        radiusKm: ward.radiusKm,
        representative: ward.representative,
        selfDeclared: !!ward.selfDeclared,
        docId: ward.docId || null,
        flagCount: ward.flagCount || 0,
      };
    }
  }
  return null;
};

// Build the representative scorecard from an issues list, ranked by resolution rate.
// Each issue's ward is taken from its stored `wardInfo` (set at report time) or, for
// older issues that predate tagging, derived on-the-fly from its GPS — so the scorecard
// reflects ALL existing data, not just newly reported issues.
export const calculateScorecard = (issues) => {
  const repMap = {};

  issues.forEach((issue) => {
    const ward = issue.wardInfo ||
      getWardRepresentative(issue.location?.lat, issue.location?.lng);
    if (!ward?.representative) return;

    const key = `${ward.wardNo}-${ward.representative.name}`;
    if (!repMap[key]) {
      repMap[key] = {
        ...ward,
        totalIssues: 0,
        resolved: 0,
        totalDaysOpen: 0,
        criticalOpen: 0,
        wallOfShame: 0,
      };
    }
    repMap[key].totalIssues++;
    if (issue.status === 'Resolved') repMap[key].resolved++;
    if (issue.wallOfShame) repMap[key].wallOfShame++;
    if (issue.severity === 'Critical' && issue.status !== 'Resolved') repMap[key].criticalOpen++;

    const daysOpen = issue.createdAt
      ? Math.floor((Date.now() - (issue.createdAt.toDate ? issue.createdAt.toDate() : new Date(issue.createdAt)).getTime()) / 86400000)
      : 0;
    repMap[key].totalDaysOpen += daysOpen;
  });

  return Object.values(repMap)
    .map((rep) => ({
      ...rep,
      resolutionRate: rep.totalIssues > 0 ? Math.round((rep.resolved / rep.totalIssues) * 100) : 0,
      avgDays: rep.totalIssues > 0 ? Math.round(rep.totalDaysOpen / rep.totalIssues) : 0,
    }))
    .sort((a, b) => b.resolutionRate - a.resolutionRate);
};

// Neutral party-level rollup of the individual scorecard. Surfaces "which party is most
// responsive in this locality" as a TRANSPARENT AGGREGATE (sum of resolved / total
// across that party's tracked reps) — a responsiveness signal, not an endorsement or an
// official ranking. Methodology is the same factual issue data as the individual cards.
export const aggregateByParty = (scorecard) => {
  const map = {};
  scorecard.forEach((r) => {
    const party = r.representative?.party || 'Unknown';
    if (!map[party]) map[party] = { party, reps: 0, totalIssues: 0, resolved: 0, wallOfShame: 0 };
    map[party].reps += 1;
    map[party].totalIssues += r.totalIssues || 0;
    map[party].resolved += r.resolved || 0;
    map[party].wallOfShame += r.wallOfShame || 0;
  });
  return Object.values(map)
    .map((p) => ({
      ...p,
      resolutionRate: p.totalIssues > 0 ? Math.round((p.resolved / p.totalIssues) * 100) : 0,
    }))
    .sort((a, b) => b.resolutionRate - a.resolutionRate);
};
