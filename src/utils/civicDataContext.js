import { collection, getDocs, getCountFromServer, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { distanceKm } from './geo';
import { getWardRepresentative, getRepresentativeForCity, calculateScorecard } from '../constants/representatives';

// Major Indian cities/towns we recognise inside a free-text address. Ordered so a
// more-specific name matches before the metro it sits near (e.g. "Navi Mumbai" and
// "Thane" before "Mumbai"). This lets the assistant answer "issues in Thane" even
// though the coarse `city` field only ever stores Bangalore / Mumbai / Delhi / Other.
const KNOWN_CITIES = [
  'Navi Mumbai', 'New Delhi', 'Thane', 'Mumbai', 'Pune', 'Delhi',
  'Bengaluru', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata',
  'Ahmedabad', 'Nagpur', 'Nashik', 'Surat', 'Jaipur', 'Gurugram',
  'Gurgaon', 'Noida', 'Kalyan', 'Dombivli', 'Bhiwandi',
];
const CITY_ALIAS = { Bengaluru: 'Bangalore', Gurgaon: 'Gurugram', 'New Delhi': 'Delhi' };
const normalizeCity = (c) => CITY_ALIAS[c] || c;

const cityFromText = (text) => {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const c of KNOWN_CITIES) if (lower.includes(c.toLowerCase())) return normalizeCity(c);
  return null;
};

// Best-effort city for an issue: prefer a real city name found in the address text
// (most specific), then the stored `city` field, then "Other".
const deriveCity = (issue) => {
  const fromText = cityFromText(issue.locationText);
  if (fromText) return fromText;
  const c = issue.city;
  if (c && c !== 'Other' && c !== 'Unknown') return c;
  return c || 'Other';
};

// First (most specific) segment of the address, skipping bare coordinates.
const localityOf = (issue) => {
  const t = (issue.locationText || '').trim();
  if (!t) return null;
  const first = t.split(',')[0].trim();
  if (!first || /^-?\d+(\.\d+)?$/.test(first)) return null;
  return first;
};

// How close (km) an issue must be to count as "near you".
const NEAR_RADIUS_KM = 3;

// Cache the raw Firestore reads briefly so rapid follow-up questions don't re-hit the
// database. The per-question context (including the location-specific "near you"
// section) is rebuilt from this snapshot each call — cheap, and always location-fresh.
let rawCache = null;
let rawCacheTime = 0;
const RAW_TTL = 60000;

const fetchRaw = async () => {
  if (rawCache && Date.now() - rawCacheTime < RAW_TTL) return rawCache;
  const issuesSnap = await getDocs(
    query(collection(db, 'issues'), orderBy('createdAt', 'desc'), limit(100))
  );
  const issues = issuesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Citizen count from the PUBLIC mirror (the `users` collection is owner-read-only,
  // so a getDocs there would be permission-denied). Aggregation = 1 cheap read.
  let userCount = 0;
  try {
    const c = await getCountFromServer(collection(db, 'publicProfiles'));
    userCount = c.data().count;
  } catch (e) {
    console.error('[CivicContext] citizen count:', e);
  }

  rawCache = { issues, userCount };
  rawCacheTime = Date.now();
  return rawCache;
};

// Builds the location-aware "NEAR YOU" block from the user's live GPS fix. Distances
// are computed on-device; only the resulting text summary (counts + km) is sent to the
// model — never the raw coordinates.
const buildNearby = (issues, userLocation, scorecard) => {
  if (!userLocation || userLocation.lat == null || userLocation.lng == null) return '';
  const detected = cityFromText(userLocation.locationText) ||
    (userLocation.locationText ? userLocation.locationText.split(',')[0].trim() : null);
  const header = `NEAR YOU (within ${NEAR_RADIUS_KM} km of the user's current location${detected ? `, around ${detected}` : ''}):`;

  // Elected representative responsible for the user's ward (neutral accountability —
  // party is just a metadata label). Includes their ward's resolution record.
  let repLine = '';
  const wardRep = getWardRepresentative(userLocation.lat, userLocation.lng)
    || getRepresentativeForCity(detected);
  if (wardRep?.representative) {
    const sc = (scorecard || []).find(
      (s) => s.wardNo === wardRep.wardNo && s.representative.name === wardRep.representative.name
    );
    repLine = `\nYOUR ELECTED REPRESENTATIVE (responsible for civic issues in your ward): ${wardRep.representative.name}, Ward ${wardRep.wardNo} — ${wardRep.wardName}, ${wardRep.city} (${wardRep.representative.party}, since ${wardRep.representative.since}).`;
    repLine += sc
      ? ` Ward record: ${sc.totalIssues} issues received, ${sc.resolved} resolved (${sc.resolutionRate}% resolution rate), average ${sc.avgDays} days to act${sc.wallOfShame ? `, ${sc.wallOfShame} ignored 30+ days` : ''}.`
      : ` No civic issues recorded in this ward yet.`;
  }

  const nearby = issues
    .filter((i) => i.location?.lat != null && i.location?.lng != null)
    .map((i) => ({ i, d: distanceKm(userLocation.lat, userLocation.lng, i.location.lat, i.location.lng) }))
    .filter((x) => x.d <= NEAR_RADIUS_KM)
    .sort((a, b) => a.d - b.d);

  if (!nearby.length) {
    return `${header}\n- No issues reported within ${NEAR_RADIUS_KM} km right now.${repLine}`;
  }

  let open = 0, resolved = 0;
  const typeCount = {};
  nearby.forEach(({ i }) => {
    if ((i.status || '') === 'Resolved') resolved++; else open++;
    const t = i.issueType || 'Unknown';
    typeCount[t] = (typeCount[t] || 0) + 1;
  });
  const topTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k} (${v})`).join(', ');
  const closest = nearby.slice(0, 5).map(({ i, d }) =>
    `- ${i.issueType} at ${i.locationText?.split(',')[0] || 'nearby'} — ${d.toFixed(1)} km away, ${i.severity || 'Unknown'}, ${i.status || 'Reported'}`
  ).join('\n');

  return `${header}
- Issues nearby: ${nearby.length} (${open} open, ${resolved} resolved)
- Nearby issue types: ${topTypes}
- Closest issues:
${closest}${repLine}`;
};

// Top of the elected-representative accountability scorecard (ranked by resolution
// rate). Neutral: party shown only as a metadata label, no opinions/endorsements.
const buildRepSection = (scorecard) => {
  if (!scorecard || !scorecard.length) return '- No ward-mapped issues yet';
  return scorecard.slice(0, 10).map((r) =>
    `- ${r.representative.name} (Ward ${r.wardNo} ${r.wardName}, ${r.city}; ${r.representative.party}): ${r.totalIssues} issues, ${r.resolved} resolved, ${r.resolutionRate}% resolution rate, avg ${r.avgDays} days`
  ).join('\n');
};

// Builds an AGGREGATE-ONLY context string about the live civic data for the voice
// assistant. Never includes user ids, names, emails, or photos — only counts, rates,
// distances, and (for critical/nearby issues) the issue type + area text. Pass the
// caller's live { lat, lng, locationText } to enable the "near you" section.
export const fetchCivicContext = async (userLocation) => {
  try {
    const { issues, userCount } = await fetchRaw();

    const total = issues.length;
    const byStatus = {}, byType = {}, bySeverity = {};
    const cityAgg = {};  // { [city]: { total, open, resolved } }
    const areaAgg = {};  // { [locality]: count }
    let totalConfirmations = 0, wallOfShameCount = 0, resolvedCount = 0;

    issues.forEach((issue) => {
      const status = issue.status || 'Unknown';
      const type = issue.issueType || 'Unknown';
      const severity = issue.severity || 'Unknown';
      const isResolved = status === 'Resolved';
      byStatus[status] = (byStatus[status] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;

      const city = deriveCity(issue);
      const ca = (cityAgg[city] = cityAgg[city] || { total: 0, open: 0, resolved: 0 });
      ca.total++;
      if (isResolved) ca.resolved++; else ca.open++;

      const area = localityOf(issue);
      if (area) areaAgg[area] = (areaAgg[area] || 0) + 1;

      totalConfirmations += issue.confirmations || 0;
      if (issue.wallOfShame) wallOfShameCount++;
      if (isResolved) resolvedCount++;
    });

    const openCount = total - resolvedCount;
    const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
    const avgConfirmations = total > 0 ? Math.round(totalConfirmations / total) : 0;
    const sortedCities = Object.entries(cityAgg).sort((a, b) => b[1].total - a[1].total);
    const topCity = sortedCities[0];
    const topAreas = Object.entries(areaAgg).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const topIssueType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

    const scorecard = calculateScorecard(issues);
    const nearbySection = buildNearby(issues, userLocation, scorecard);
    const repSection = buildRepSection(scorecard);

    const criticalIssues = issues
      .filter((i) => i.severity === 'Critical' && i.status !== 'Resolved')
      .slice(0, 5)
      .map((i) => ({
        type: i.issueType,
        location: i.locationText?.split(',')[0] || 'Unknown',
        confirmations: i.confirmations || 0,
        daysOpen: i.createdAt
          ? Math.floor((Date.now() - (i.createdAt.toDate ? i.createdAt.toDate() : new Date(i.createdAt)).getTime()) / 86400000)
          : 0,
      }));

    const context = `
JANASHAKTI CIVIC DATA (live from database):

OVERVIEW:
- Total issues reported: ${total}
- Open/pending issues: ${openCount}
- Resolved issues: ${resolvedCount}
- Resolution rate: ${resolutionRate}%
- Total citizens: ${userCount}
- Total community confirmations: ${totalConfirmations}
- Average confirmations per issue: ${avgConfirmations}
- Wall of Shame issues (30+ days ignored): ${wallOfShameCount}
${nearbySection ? '\n' + nearbySection + '\n' : ''}
BY STATUS:
${Object.entries(byStatus).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

BY ISSUE TYPE:
${Object.entries(byType).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

BY SEVERITY:
${Object.entries(bySeverity).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

BY CITY (total — open / resolved):
${sortedCities.map(([k, v]) => `- ${k}: ${v.total} total — ${v.open} open, ${v.resolved} resolved`).join('\n')}

TOP LOCALITIES / AREAS (by report count):
${topAreas.length ? topAreas.map(([k, v]) => `- ${k}: ${v}`).join('\n') : '- N/A'}

TOP PROBLEM AREA: ${topCity ? `${topCity[0]} with ${topCity[1].total} issues` : 'N/A'}
MOST COMMON ISSUE: ${topIssueType ? `${topIssueType[0]} with ${topIssueType[1]} reports` : 'N/A'}

ELECTED REPRESENTATIVE ACCOUNTABILITY (ward-level, ranked by resolution rate; "received" = issues in their ward; party is a neutral metadata label only, never an endorsement):
${repSection}

CURRENT CRITICAL ISSUES (unresolved):
${criticalIssues.length > 0
  ? criticalIssues.map((i) => `- ${i.type} at ${i.location}: ${i.confirmations} confirmations, ${i.daysOpen} days open`).join('\n')
  : '- No critical issues currently open'}
`;

    return { context, stats: { total, openCount, resolvedCount, resolutionRate, userCount, wallOfShameCount } };
  } catch (err) {
    console.error('[CivicContext]:', err);
    return {
      context: 'Unable to fetch live data. The database may be temporarily unavailable.',
      stats: { total: 0, openCount: 0, resolvedCount: 0, resolutionRate: 0, userCount: 0, wallOfShameCount: 0 },
    };
  }
};
