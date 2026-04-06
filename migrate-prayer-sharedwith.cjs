/**
 * Migration: backfill `sharedWith` on every existing prayer request doc.
 * For each PR owner, snapshot their current accountabilityPartnerUids into sharedWith.
 * Idempotent: skips docs that already have sharedWith.
 *
 * Run: node migrate-prayer-sharedwith.cjs
 */
const admin = require('firebase-admin');
const sa = require('./serviceaccountkey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function migrate() {
  const usersSnap = await db.collection('users').get();
  let usersScanned = 0;
  let prsChecked = 0;
  let prsUpdated = 0;
  let prsAlreadyMigrated = 0;

  for (const userDoc of usersSnap.docs) {
    usersScanned++;
    const userData = userDoc.data();
    const apUids = Array.isArray(userData.accountabilityPartnerUids) ? userData.accountabilityPartnerUids : [];

    const prSnap = await db.collection(`users/${userDoc.id}/prayerRequests`).get();
    if (prSnap.empty) continue;

    for (const prDoc of prSnap.docs) {
      prsChecked++;
      const pr = prDoc.data();
      if (Array.isArray(pr.sharedWith)) {
        prsAlreadyMigrated++;
        continue;
      }
      await prDoc.ref.update({ sharedWith: apUids });
      prsUpdated++;
      console.log(`  updated ${userDoc.id}/${prDoc.id} -> sharedWith=[${apUids.length}]`);
    }
  }

  console.log('\n=== Migration complete ===');
  console.log(`Users scanned:        ${usersScanned}`);
  console.log(`PRs checked:          ${prsChecked}`);
  console.log(`PRs updated:          ${prsUpdated}`);
  console.log(`PRs already migrated: ${prsAlreadyMigrated}`);
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
