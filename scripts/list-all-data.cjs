/**
 * List all counselors and counselees in Firestore
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceaccountkey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function listAll() {
  console.log('=== COUNSELORS ===\n');

  const counselorsSnapshot = await db.collection('counselors').get();
  console.log(`Found ${counselorsSnapshot.docs.length} counselors\n`);

  for (const doc of counselorsSnapshot.docs) {
    console.log(`Counselor ID: ${doc.id}`);
    console.log('Data:', JSON.stringify(doc.data(), null, 2));

    const counseleesSnapshot = await db
      .collection('counselors')
      .doc(doc.id)
      .collection('counselees')
      .get();

    console.log(`  Counselees: ${counseleesSnapshot.docs.length}`);
    for (const cDoc of counseleesSnapshot.docs) {
      console.log(`    - ${cDoc.id}:`, JSON.stringify(cDoc.data(), null, 2));
    }
    console.log('');
  }

  console.log('\n=== USERS ===\n');
  const usersSnapshot = await db.collection('users').get();
  console.log(`Found ${usersSnapshot.docs.length} users\n`);
  for (const doc of usersSnapshot.docs) {
    console.log(`User ID: ${doc.id}`);
    console.log('Data:', JSON.stringify(doc.data(), null, 2));
    console.log('');
  }

  console.log('\n=== COUNSELEE LINKS ===\n');
  const linksSnapshot = await db.collection('counseleeLinks').get();
  console.log(`Found ${linksSnapshot.docs.length} links\n`);
  for (const doc of linksSnapshot.docs) {
    console.log(`Link: ${doc.id}`);
    console.log('Data:', JSON.stringify(doc.data(), null, 2));
    console.log('');
  }
}

listAll().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
