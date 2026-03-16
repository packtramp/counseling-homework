const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
db.doc('users/dpmfTQejTFdbJjd1SbJDz73L7rO2').get().then(d => {
  const u = d.data();
  console.log('vacationStart:', u.vacationStart?.toDate?.());
  console.log('vacationEnd:', u.vacationEnd?.toDate?.());
  process.exit(0);
});
