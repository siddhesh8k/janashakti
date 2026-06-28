import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Authority allowlist helpers. A uid present in /authorities may update the
// trust-sensitive issue fields (status / resolution) per firestore.rules.
//
// DEMO NOTE: enrollAuthority lets a signed-in user self-enroll so the Authority
// Dashboard demo works without an admin backend. In production, authorities should
// be provisioned via the Admin SDK / custom claims and self-enroll removed.

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
    await setDoc(doc(db, 'authorities', uid), {
      uid,
      enrolledAt: serverTimestamp(),
      demo: true,
    });
    return true;
  } catch (err) {
    console.error('[enrollAuthority]:', err);
    return false;
  }
};
