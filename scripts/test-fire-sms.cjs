const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const targetSlotTime = process.argv[2]; // e.g. "13:30"
const restoreOriginal = process.argv.includes('--restore');

(async () => {
  const userSnap = await db.collection('users').where('email', '==', 'robdorsett@gmail.com').get();
  const userDoc = userSnap.docs[0];
  const uid = userDoc.id;
  const u = userDoc.data();
  const sched = u.reminderSchedule;

  if (restoreOriginal) {
    sched.saturday.slot1 = '10:30';
    await userDoc.ref.update({ reminderSchedule: sched });
    console.log('Restored saturday.slot1 to 10:30');
    process.exit(0);
  }

  if (!targetSlotTime) { console.error('Usage: test-fire-sms.cjs HH:MM'); process.exit(1); }
  console.log('Current saturday schedule:', JSON.stringify(sched.saturday));
  sched.saturday.slot1 = targetSlotTime;
  await userDoc.ref.update({ reminderSchedule: sched });

  const basePath = `counselors/${uid}/counselees/${uid}`;
  await db.doc(basePath).update({ lastSlot1Sent: '2026-01-01' });
  console.log(`Set saturday.slot1=${targetSlotTime}, cleared dedup. Now go fire the cron.`);
  process.exit(0);
})();
