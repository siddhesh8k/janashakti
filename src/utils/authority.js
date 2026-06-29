import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Authority allowlist helpers. A uid present in /authorities may update the
// trust-sensitive issue fields (status / resolution) per firestore.rules.
//
// Self-enroll is GATED by gamification: firestore.rules only allows creating the
// /authorities doc once the user's civicScore has reached AUTHORITY_THRESHOLD (the
// "Civic Authority" badge). So authority powers are earned, not free. In production,
// authorities would instead be provisioned via the Admin SDK / custom claims.

export const isAuthority = async (uid) => {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'authorities', uid));
    return snap.exists();
  } catch (err) {
    console.error('[isAuthority]:', err);
    return false;
  }
};

export const enrollAuthority = async (uid) => {
  if (!uid) return false;
  try {
    const ref = doc(db, 'authorities', uid);
    // Already enrolled? Treat as success — re-writing would be an UPDATE, which the rules
    // forbid (create-only). This prevents a permission-denied error on re-enroll.
    const existing = await getDoc(ref);
    if (existing.exists()) return true;
    await setDoc(ref, { uid, enrolledAt: serverTimestamp(), demo: true });
    return true;
  } catch (err) {
    console.error('[enrollAuthority]:', err);
    return false;
  }
};
