const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const userSnap = await db.collection('users').where('email', '==', 'robdorsett@gmail.com').get();
  const userDoc = userSnap.docs[0];
  const uid = userDoc.id;
  const u = userDoc.data();
  console.log('Saturday schedule (live from Firestore):', JSON.stringify(u.reminderSchedule.saturday));

  const basePath = `counselors/${uid}/counselees/${uid}`;
  await db.doc(basePath).update({ lastSlot1Sent: '2026-01-01' });
  const cee = (await db.doc(basePath).get()).data();
  console.log('Slot 1 dedup cleared. Now:', cee.lastSlot1Sent);

  console.log('\nNow waiting for cron at 14:00 CT (19:00 UTC).');
  process.exit(0);
})();
