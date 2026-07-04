import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const rocky = await db.doc('users/gDG5GYzKW1clCa3bk4S2yM1BPy63').get();
console.log('--- Rocky user doc keys ---');
console.log(Object.keys(rocky.data()).sort());
const d = rocky.data();
console.log('email:', d.email);
console.log('counselorId:', d.counselorId);
console.log('counseleeDocId:', d.counseleeDocId);
console.log('isCounselor:', d.isCounselor);
console.log('accountabilityPartnerUids:', d.accountabilityPartnerUids);

// Check: does Rocky have his own counselees subcollection (i.e., is he his own counselor?)
const ownCounseleesSnap = await db.collection(`counselors/${rocky.id}/counselees`).get();
console.log(`\nRocky's own counselees subcollection (counselors/${rocky.id}/counselees): ${ownCounseleesSnap.size} docs`);
for (const c of ownCounseleesSnap.docs) {
  const cd = c.data();
  console.log(`  - docId=${c.id} name=${cd.name} uid=${cd.uid}`);
  // peek homework
  const hw = await db.collection(`counselors/${rocky.id}/counselees/${c.id}/homework`).get();
  console.log(`    homework: ${hw.size} docs`);
}
process.exit(0);
