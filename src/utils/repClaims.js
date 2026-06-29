// Self-enrollment for ward representatives — the "college/corporate-style" process for
// reps. A signed-in user CLAIMS the representative seat for the ward they're standing in
// (one claim per ward), declaring the party they represent. Their ward's resolution
// performance then shows on the public accountability scorecard.
//
// SELF-DECLARED, never official: claims are community-tracked, one-per-ward, and any
// other user can add a community flag (the lightweight verification signal). Real
// election-commission data, where it ever exists, can still be seeded via the Admin SDK.

import { collection, doc, getDoc, setDoc, updateDoc, query, where, getDocs,
         increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getWardRepresentative } from '../constants/representatives';

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Resolve the ward a coordinate falls in. Reuses the known wards when the GPS matches one
// (so a claim overrides the seeded sample); otherwise pins a new ward on the coordinate.
const resolveWard = (lat, lng, city) => {
  const matched = getWardRepresentative(lat, lng);
  if (matched) {
    return { wardNo: matched.wardNo, wardName: matched.wardName, city: matched.city,
             center: matched.center || { lat, lng }, radiusKm: matched.radiusKm || 1.5 };
  }
  const wardNo = `loc-${slug(city) || 'ward'}-${Math.round(lat * 100)}-${Math.round(lng * 100)}`;
  return { wardNo, wardName: city || 'My Ward', city: city || '', center: { lat, lng }, radiusKm: 1.5 };
};

// Claim the ward seat. Returns { ok, ward } on success, or { error } with a message.
export const claimWard = async ({ uid, name, partyCode, lat, lng, city, since }) => {
  if (!uid || !name || !partyCode) return { error: 'Add your name and party first.' };
  if (lat == null || lng == null) return { error: 'Location needed to detect your ward.' };
  try {
    const w = resolveWard(lat, lng, city);
    const docId = `${slug(w.city) || 'city'}-ward-${w.wardNo}`;
    const ref = doc(db, 'representatives', docId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().claimedByUid && snap.data().claimedByUid !== uid) {
      return { error: `Ward ${w.wardNo} (${w.wardName}) is already represented by someone else.` };
    }
    await setDoc(ref, {
      wardNo: w.wardNo, name: w.wardName, city: w.city,
      center: w.center, radiusKm: w.radiusKm,
      representative: { name, party: partyCode, since: since || `${new Date().getFullYear()}`, phone: null },
      selfDeclared: true,
      claimedByUid: uid,
      claimedByName: name,
      flagCount: snap.exists() ? (snap.data().flagCount || 0) : 0,
      flaggedBy: snap.exists() ? (snap.data().flaggedBy || []) : [],
      claimedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { ok: true, ward: { wardNo: w.wardNo, wardName: w.wardName, city: w.city, docId } };
  } catch (err) {
    console.error('[claimWard]:', err);
    return { error: 'Could not save your claim. Try again.' };
  }
};

// Community verification signal — any signed-in user may flag a self-declared rep once.
export const flagRepresentative = async (docId, uid) => {
  if (!docId || !uid) return { error: 'Nothing to flag.' };
  try {
    await updateDoc(doc(db, 'representatives', docId), {
      flagCount: increment(1),
      flaggedBy: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error('[flagRepresentative]:', err);
    return { error: 'Could not flag. Try again.' };
  }
};

// The ward (if any) the current user already represents — drives the "you represent…" UI.
export const getMyClaim = async (uid) => {
  if (!uid) return null;
  try {
    const snap = await getDocs(query(collection(db, 'representatives'), where('claimedByUid', '==', uid)));
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { docId: d.id, ...d.data() };
  } catch (err) {
    console.error('[getMyClaim]:', err);
    return null;
  }
};
