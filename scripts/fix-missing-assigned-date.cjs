/**
 * One-shot repair: homework created by the Heart Journal "commit to pray" path
 * wrote wrong/missing field names — `assignedAt` instead of `assignedDate`,
 * `repeating` instead of `recurring`, and no `weeklyTarget`. Result: no findable
 * start date (screens guessed differently), silent 7/7 target, and the nightly
 * retire cron never saw them so "1 week" commitments ran forever.
 *
 * Creation path fixed in HeartJournalPage.jsx (weeklyTarget 6, recurring false,
 * assignedDate). This script repairs the legacy items per Roby 2026-07-23:
 *   - assignedDate  = the item's true original assignedAt
 *   - weeklyTarget  = 6 (pray 6 of 7 days, one day of grace)
 *   - recurring     = false (one-week commitment)
 *   - and since every legacy item is already weeks past its one-week life,
 *     retire it exactly as api/_lib/dailyChores.js would: status 'completed'
 *     + completedAt. (Completions stay — they still count toward lifetime days.)
 *
 * Usage:  node scripts/fix-missing-assigned-date.cjs           (dry run)
 *         node scripts/fix-missing-assigned-date.cjs --commit  (write)
 */
const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const COMMIT = process.argv.includes('--commit');

(async () => {
  // NOTE: counselor docs are "phantom" — they hold subcollections but no fields,
  // so `.collection('counselors').get()` returns ZERO. Must use listDocuments().
  const counselors = await db.collection('counselors').listDocuments();
  const found = [];

  for (const co of counselors) {
    const cees = await db.collection(`counselors/${co.id}/counselees`).get();
    for (const c of cees.docs) {
      const hw = await db.collection(`counselors/${co.id}/counselees/${c.id}/homework`).get();
      for (const h of hw.docs) {
        const it = h.data();
        if (['cancelled', 'expired', 'completed'].includes(it.status)) continue;
        if (it.assignedDate) continue;               // already fine
        if (!it.assignedAt) continue;                // nothing to recover from
        found.push({
          ref: h.ref,
          counselee: c.data().name,
          title: (it.title || '').slice(0, 60),
          assignedAt: it.assignedAt.toDate ? it.assignedAt.toDate() : new Date(it.assignedAt),
          completions: (it.completions || []).length
        });
      }
    }
  }

  const now = new Date();
  console.log(`${COMMIT ? 'COMMIT' : 'DRY RUN'} — items missing assignedDate: ${found.length}\n`);
  for (const f of found) {
    const weekOver = new Date(f.assignedAt.getTime() + 7 * 864e5) <= now;
    console.log(`  ${f.counselee} — "${f.title}"`);
    console.log(`     true start date    : ${f.assignedAt.toDateString()}`);
    console.log(`     completions logged : ${f.completions} (kept — still count toward lifetime days)`);
    console.log(`     -> assignedDate=${f.assignedAt.toDateString()}, weeklyTarget=6, recurring=false`);
    console.log(`     -> one-week life ${weekOver ? 'ELAPSED -> retire to Completed (as nightly cron would)' : 'still running -> stays active'}`);
    if (COMMIT) {
      const update = {
        assignedDate: admin.firestore.Timestamp.fromDate(f.assignedAt),
        weeklyTarget: 6,
        recurring: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (weekOver) {
        update.status = 'completed';
        update.completedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await f.ref.update(update);
      console.log('     WRITTEN');
    }
    console.log('');
  }
  if (!COMMIT) console.log('No changes written. Re-run with --commit to apply.');
  process.exit(0);
})();
