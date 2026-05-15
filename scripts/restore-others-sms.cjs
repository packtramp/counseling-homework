/**
 * Restore smsReminders=true for users flipped by disable-others-reminders.cjs.
 *
 * Reads the audit JSON written by the disable script and sets each user's
 * smsReminders back to whatever it was before. Only flips users whose CURRENT
 * smsReminders is false (so if a user already re-enabled themselves via Settings,
 * we don't trample their newer choice).
 *
 * Usage:
 *   node scripts/restore-others-sms.cjs <audit-file.json>             # dry-run
 *   node scripts/restore-others-sms.cjs <audit-file.json> --commit    # write
 */

const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('../serviceaccountkey.json');

const auditPath = process.argv.find(a => a.endsWith('.json'));
const COMMIT = process.argv.includes('--commit');

if (!auditPath || !fs.existsSync(auditPath)) {
  console.error('Pass the audit JSON file path as first arg.');
  process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
console.log(`Audit from ${audit.committedAt}, keep=${audit.keepEmail}, ${audit.flipped.length} entries.\n`);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  let restoredCount = 0;
  let skippedCount = 0;

  for (const entry of audit.flipped) {
    const doc = await db.doc(`users/${entry.uid}`).get();
    if (!doc.exists) {
      console.log(`SKIP   ${entry.email}  (user doc missing)`);
      skippedCount++;
      continue;
    }
    const cur = doc.data();
    if (cur.smsReminders === true) {
      console.log(`SKIP   ${entry.email}  (already on — user re-enabled themselves)`);
      skippedCount++;
      continue;
    }
    if (entry.before.smsReminders !== true) {
      console.log(`SKIP   ${entry.email}  (audit says they were off before too)`);
      skippedCount++;
      continue;
    }
    console.log(`RESTORE ${entry.email}  (smsReminders → true)`);
    restoredCount++;
    if (COMMIT) {
      await doc.ref.update({ smsReminders: true });
    }
  }

  console.log(`\nSummary: restored=${restoredCount}, skipped=${skippedCount}`);
  if (!COMMIT) console.log('\nDRY-RUN — no writes. Re-run with --commit to apply.');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
