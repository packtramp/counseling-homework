const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function setupCounselor() {
  const uid = 'dpmfTQejTFdbJjd1SbJDz73L7rO2';

  await db.collection('users').doc(uid).set({
    email: 'robdorsett@gmail.com',
    name: 'Roby Dorsett',
    role: 'counselor',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('Counselor profile created for robdorsett@gmail.com');
  process.exit(0);
}

setupCounselor().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
