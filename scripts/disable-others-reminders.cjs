/**
 * Disable SMS reminders for ALL users except Roby — during SMS testing window.
 *
 * Usage:
 *   node scripts/disable-others-sms.cjs              # dry-run audit (no writes)
 *   node scripts/disable-others-sms.cjs --commit     # actually flip
 *
 * Roby identified by email match (KEEP_EMAIL). Everyone else gets:
 *   smsReminders = false
 *
 * Email reminders + AP/counselor summary emails are untouched — they keep flowing.
 *
 * Re-enable later: each user can flip smsReminders back on via Settings, or run
 * the restore companion using the audit JSON this script writes.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../serviceaccountkey.json');

const KEEP_EMAIL = 'robdorsett@gmail.com';
const COMMIT = process.argv.includes('--commit');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').get();
  console.log(`\nFound ${snap.size} users in collection.\n`);

  const audit = [];
  let keptCount = 0;
  let flippedCount = 0;
  let alreadyOffCount = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const email = (d.email || '').toLowerCase();
    const isRoby = email === KEEP_EMAIL.toLowerCase();
    const before = { smsReminders: d.smsReminders === true };

    if (isRoby) {
      keptCount++;
      console.log(`KEEP   ${email}  (smsReminders=${before.smsReminders})`);
      continue;
    }

    if (!before.smsReminders) {
      alreadyOffCount++;
      continue;
    }

    audit.push({ uid: doc.id, email, name: d.name || null, before });
    flippedCount++;
    console.log(`FLIP   ${email}  (was smsReminders=${before.smsReminders})`);

    if (COMMIT) {
      await doc.ref.update({ smsReminders: false });
    }
  }

  console.log(`\nSummary: kept=${keptCount}, flipped=${flippedCount}, already-off=${alreadyOffCount}, total=${snap.size}`);

  if (COMMIT) {
    const auditPath = path.join(__dirname, `disable-others-reminders-audit-${Date.now()}.json`);
    fs.writeFileSync(auditPath, JSON.stringify({ committedAt: new Date().toISOString(), keepEmail: KEEP_EMAIL, flipped: audit }, null, 2));
    console.log(`\nAudit written to: ${auditPath}`);
    console.log('Restore later with the companion script using this file.');
  } else {
    console.log('\nDRY-RUN — no writes. Re-run with --commit to apply.');
  }

  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
