const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const userSnap = await db.collection('users').where('email', '==', 'robdorsett@gmail.com').get();
  const userDoc = userSnap.docs[0];
  const uid = userDoc.id;
  const u = userDoc.data();
  console.log('--- USER DOC (users/' + uid + ') ---');
  console.log('  smsReminders:', u.smsReminders, '(type:', typeof u.smsReminders, ')');
  console.log('  emailReminders:', u.emailReminders);
  console.log('  phone:', JSON.stringify(u.phone), '(type:', typeof u.phone, ')');
  console.log('  counselorId:', u.counselorId);
  console.log('  counseleeDocId:', u.counseleeDocId);

  const counselorId = u.counselorId || uid;
  const counseleeDocId = u.counseleeDocId || uid;
  const basePath = `counselors/${counselorId}/counselees/${counseleeDocId}`;
  console.log('\n--- COUNSELEE DOC (' + basePath + ') ---');
  const cee = (await db.doc(basePath).get()).data();
  console.log('  smsReminders:', cee.smsReminders, '(type:', typeof cee.smsReminders, ')');
  console.log('  emailReminders:', cee.emailReminders);
  console.log('  phone:', JSON.stringify(cee.phone));
  console.log('  email:', cee.email);

  console.log('\n--- LIVE COMPUTATION (mirror of line 545-547) ---');
  const email = u.email || cee.email;
  const phone = u.phone || cee.phone;
  const wantsSms = (u.smsReminders || cee.smsReminders) && phone;
  const wantsEmail = email;
  console.log('  email:', JSON.stringify(email));
  console.log('  phone:', JSON.stringify(phone));
  console.log('  (u.smsReminders || cee.smsReminders):', u.smsReminders || cee.smsReminders);
  console.log('  wantsSms:', JSON.stringify(wantsSms), '<-- IF FALSY/EMPTY-STRING, NO SMS SENT');
  console.log('  wantsEmail:', JSON.stringify(wantsEmail));

  process.exit(0);
})();
