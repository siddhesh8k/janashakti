// Admin helper: set a user's Community Reputation (civicScore) to an absolute value,
// looked up by email. Updates both users/{uid} and the publicProfiles/{uid} leaderboard
// mirror. Bypasses Firestore rules (Admin SDK).
//
//   node scripts/setCivicScore.mjs <email> <score>
//   node scripts/setCivicScore.mjs sidh8k@gmail.com 200
//
// Prereqs: scripts/serviceAccountKey.json + `npm install` (firebase-admin).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const email = process.argv[2] || 'sidh8k@gmail.com';
const score = Number(process.argv[3] || 200);

const run = async () => {
  if (!email || Number.isNaN(score)) { console.error('Usage: node scripts/setCivicScore.mjs <email> <score>'); process.exit(1); }
  const user = await admin.auth().getUserByEmail(email);
  const uid = user.uid;
  const db = admin.firestore();
  const before = (await db.doc(`users/${uid}`).get()).data()?.civicScore;
  await db.doc(`users/${uid}`).set({ civicScore: score }, { merge: true });
  await db.doc(`publicProfiles/${uid}`).set({ civicScore: score }, { merge: true });
  console.log(`OK  email=${email}  uid=${uid}  civicScore: ${before ?? '(none)'} -> ${score}  (users + publicProfiles)`);
  process.exit(0);
};

run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
