const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'counseling-homework.firebasestorage.app'
});

const rules = fs.readFileSync('./storage.rules', 'utf8');

admin.securityRules().releaseStorageRulesetFromSource(rules, 'counseling-homework.firebasestorage.app')
  .then(() => {
    console.log('Storage rules deployed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error deploying storage rules:', err);
    process.exit(1);
  });
