const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const userSnap = await db.collection('users').where('email', '==', 'robdorsett@gmail.com').get();
  const uid = userSnap.docs[0].id;
  const basePath = `counselors/${uid}/counselees/${uid}`;
  await db.doc(basePath).update({ lastSlot1Sent: '2026-01-01' });
  const cee = (await db.doc(basePath).get()).data();
  console.log('Reset slot1 dedup. Now:', JSON.stringify({ lastSlot1Sent: cee.lastSlot1Sent, lastSlot2Sent: cee.lastSlot2Sent }, null, 2));
  process.exit(0);
})();
