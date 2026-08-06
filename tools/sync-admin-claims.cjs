#!/usr/bin/env node
/**
 * Sync admin authority from the Firestore `isSuperAdmin` field into Firebase custom claims.
 *
 * WHY: a custom claim lives in the signed auth token and CANNOT be written by the client.
 * The Firestore field can (see the 2026-08-03 review: a user could recreate their own doc
 * with isSuperAdmin:true). Endpoints move to trusting the claim; the field stays for UI.
 *
 * This script is ADDITIVE and idempotent — it only grants claims to users who already hold
 * isSuperAdmin:true in Firestore. It never grants anyone new authority.
 *
 * Usage:  node tools/sync-admin-claims.cjs --dry     (report only)
 *         node tools/sync-admin-claims.cjs           (apply)
 * Revert: node tools/revert-claims.cjs
 */
const admin = require('firebase-admin');
const path = require('path');

const DRY = process.argv.includes('--dry');
admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', 'serviceaccountkey.json'))) });

(async () => {
  const db = admin.firestore();
  const snap = await db.collection('users').where('isSuperAdmin', '==', true).get();

  if (snap.empty) { console.log('No users hold isSuperAdmin:true. Nothing to do.'); process.exit(0); }

  console.log(`Found ${snap.size} superAdmin(s) in Firestore:\n`);
  for (const doc of snap.docs) {
    const email = doc.data().email || '(no email)';
    const before = (await admin.auth().getUser(doc.id)).customClaims || {};
    if (before.isSuperAdmin === true) { console.log(`  = ${email} — claim already set, skipping`); continue; }
    if (DRY) { console.log(`  [dry] would set claim isSuperAdmin:true -> ${email}`); continue; }

    await admin.auth().setCustomUserClaims(doc.id, { isSuperAdmin: true });
    const after = (await admin.auth().getUser(doc.id)).customClaims || {};
    console.log(`  + ${email} -> claim now:`, after, after.isSuperAdmin === true ? '✅' : '❌ FAILED');
  }

  console.log(`\n${DRY ? 'Dry run — nothing changed.' : 'Done. Claims take effect on next token refresh (sign out/in = instant).'}`);
  process.exit(0);
})().catch(e => { console.error('sync-admin-claims FAILED:', e.message); process.exit(1); });
