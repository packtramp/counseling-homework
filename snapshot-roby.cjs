const admin = require('firebase-admin');
const fs = require('fs');
const sa = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function snapshot() {
  const uid = 'dpmfTQejTFdbJjd1SbJDz73L7rO2';

  const userDoc = await db.doc('users/' + uid).get();
  const userData = userDoc.data();

  const counselorId = userData.counselorId || uid;
  const counseleeDocId = userData.counseleeDocId || uid;
  const basePath = 'counselors/' + counselorId + '/counselees/' + counseleeDocId;

  const counseleeDoc = await db.doc(basePath).get();

  const hwSnap = await db.collection(basePath + '/homework').get();
  const homework = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const snap = {
    timestamp: new Date().toISOString(),
    uid,
    basePath,
    userProfile: userData,
    counseleeDoc: counseleeDoc.data(),
    homework: homework,
    homeworkCount: homework.length
  };

  fs.writeFileSync('../docs/roby-snapshot-2026-03-10.json', JSON.stringify(snap, null, 2));
  console.log('Snapshot saved.');
  console.log('Path:', basePath);
  console.log('Homework items:', homework.length);
  console.log('Current streak:', counseleeDoc.data()?.currentStreak);
  console.log('Behind count:', counseleeDoc.data()?.behindCount);
  console.log('Vacation start:', userData.vacationStart);
  console.log('Vacation end:', userData.vacationEnd);
}

snapshot().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
