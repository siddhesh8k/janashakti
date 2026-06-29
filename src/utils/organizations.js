// Runtime source of truth for adopted-zone organizations.
//
// Loads the `organizations` collection from Firestore once (module-cached). Returns
// ONLY real Firestore data — there is no hardcoded fallback, so the app shows real
// orgs (companies / colleges) the user adds, and nothing when the collection is
// empty. New orgs are created via createOrganization (e.g. the AffiliationPicker).

import { collection, getDocs, doc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// A member earning civic (report / join / evidence / verify / resolve) also lifts their
// college/corporate's civic standing. Best-effort; org leaderboard factors memberCivicScore.
export const bumpOrgCivic = async (orgId, points) => {
  if (!orgId || !points) return;
  try { await updateDoc(doc(db, 'organizations', orgId), { memberCivicScore: increment(points) }); }
  catch (err) { console.error('[bumpOrgCivic]:', err.message); }
};

// Accent palette reused for newly-created orgs (cycled by a simple hash).
const ORG_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#16a34a', '#f97316', '#eab308', '#ec4899', '#14b8a6'];

let cache = null;
let inflight = null;

export const loadOrganizations = () => {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await getDocs(collection(db, 'organizations'));
      cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('[organizations load]:', err);
      // Leave cache null so a later call can retry; return [] for now.
    } finally {
      inflight = null;
    }
    return cache || [];
  })();
  return inflight;
};

// Drop the cache so the next loadOrganizations() re-reads Firestore — call after
// creating a new org so it appears on the map / leaderboard without a hard reload
// of those modules' own state.
export const clearOrganizationsCache = () => { cache = null; inflight = null; };

// NOTE: org activity stats (totalAdopted / resolved) are no longer stored as
// precomputed counters here — they're computed live from the issues collection in
// utils/orgStats.js so the leaderboard always matches real adopted-issue docs.

// Create a user-added organization in Firestore. Used by the manual "add org" path
// in AffiliationPicker. Returns the created org { id, name, type, ... }.
export const createOrganization = async ({ name, type, lat, lng, zoneName }) => {
  const slug = (name || 'org').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  const id = `${slug || 'org'}-${Date.now().toString(36)}`;
  const color = ORG_COLORS[slug.length % ORG_COLORS.length];
  const org = {
    id, name, type,
    zone: { lat, lng, radiusKm: 1.5 },
    zoneName: zoneName || name,
    logo: null,
    memberCount: 1,
    badge: type === 'college' ? 'Civic Campus' : 'Active Adopter',
    color,
  };
  await setDoc(doc(db, 'organizations', id), { ...org, seededAt: serverTimestamp() }, { merge: true });
  clearOrganizationsCache();
  return org;
};

// Pure, synchronous zone check — exported for unit testing without Firestore.
// Euclidean distance (Δ° × 111 km) is good enough at city scale.
export const findAdoptedOrg = (orgs, lat, lng) => {
  if (!lat || !lng) return null;
  for (const org of orgs || []) {
    if (!org.zone) continue;
    const dLat = lat - org.zone.lat;
    const dLng = lng - org.zone.lng;
    const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
    if (distKm <= org.zone.radiusKm) return org;
  }
  return null;
};

// Async adoption lookup against the loaded (Firestore-or-fallback) org list.
export const getAdoptedOrg = async (lat, lng) =>
  findAdoptedOrg(await loadOrganizations(), lat, lng);
