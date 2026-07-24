/**
 * One-shot backfill for the 7/24 comms policy: counselor-created accounts are
 * silent (no email/SMS reminders) until FIRST LOGIN, which activates both.
 *
 * Targets: users with a counselorId (counselor-created) that have NEVER logged
 * in (no lastLogin). Sets reminders off + activateRemindersOnFirstLogin:true,
 * and syncs the counselee-doc mirror flags to match.
 *
 * Usage: node scripts/backfill-first-login-activation.cjs [--commit]
 */
const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const COMMIT = process.argv.includes('--commit');

(async () => {
  const users = await db.collection('users').get();
  let n = 0;
  console.log(`${COMMIT ? 'COMMIT' : 'DRY RUN'}\n`);
  for (const d of users.docs) {
    const u = d.data();
    if (!u.counselorId) continue;          // not counselor-created/linked
    if (u.lastLogin) continue;             // has logged in — leave their settings alone
    n++;
    console.log(`${u.name || u.email} | created=${u.createdAt?.toDate?.().toDateString?.() || '?'} | email=${u.emailReminders} sms=${u.smsReminders}`);
    console.log('  -> reminders OFF + activateRemindersOnFirstLogin:true (+ mirror synced)');
    if (COMMIT) {
      await d.ref.update({ emailReminders: false, smsReminders: false, activateRemindersOnFirstLogin: true });
      if (u.counseleeDocId) {
        await db.doc(`counselors/${u.counselorId}/counselees/${u.counseleeDocId}`)
          .update({ emailReminders: false, smsReminders: false }).catch(() => {});
      }
      console.log('  WRITTEN');
    }
  }
  console.log(`\n${n} never-logged-in counselor-created account(s).`);
  if (!COMMIT) console.log('Re-run with --commit to apply.');
  process.exit(0);
})();
