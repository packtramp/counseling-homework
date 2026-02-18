const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./counseling-homework-firebase-adminsdk-fbsvc-ef8bdcbfea.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const rules = fs.readFileSync('./firestore.rules', 'utf8');

admin.securityRules().releaseFirestoreRulesetFromSource(rules)
  .then(() => {
    console.log('Firestore rules deployed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
