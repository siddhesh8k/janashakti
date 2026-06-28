// Runtime loader for elected-representative / ward data.
//
// Loads the Firestore `representatives` collection (ingested from data.gov.in / OGD via
// scripts/importRepresentatives.mjs), caches it module-level, and swaps it into the
// synchronous helpers in constants/representatives.js via setRepresentatives(). If the
// collection is empty or unreachable, the built-in WARD_REPRESENTATIVES fallback stays
// active — so the app never breaks.

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { setRepresentatives } from '../constants/representatives';

let cache = null;
let inflight = null;

// Normalize a Firestore doc into the ward shape the helpers expect. Tolerant of either a
// nested { center, representative } shape or flat columns (lat/lng/repName/party/since).
const toWard = (id, d) => ({
  wardNo: d.wardNo ?? id,
  name: d.name || d.wardName || '',
  city: d.city || '',
  center: d.center || { lat: Number(d.lat), lng: Number(d.lng) },
  radiusKm: Number(d.radiusKm) || 2,
  representative: d.representative || {
    name: d.repName || d.representativeName || '',
    party: d.party || '',
    since: d.since || '',
    phone: d.phone ?? null,
  },
});

export const loadRepresentatives = () => {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await getDocs(collection(db, 'representatives'));
      const list = snap.docs
        .map((d) => toWard(d.id, d.data()))
        .filter((w) => w.center?.lat != null && w.center?.lng != null && w.representative?.name);
      if (list.length) {
        cache = list;
        setRepresentatives(list); // helpers now read the live OGD data
      }
    } catch (err) {
      console.error('[representatives load]:', err);
      // Leave cache null so a later call can retry; fallback list stays active.
    } finally {
      inflight = null;
    }
    return cache || [];
  })();
  return inflight;
};

// Drop the cache (and revert helpers to fallback) so the next load re-reads Firestore.
export const clearRepresentativesCache = () => {
  cache = null;
  inflight = null;
  setRepresentatives([]); // reverts ACTIVE to the built-in fallback
};
