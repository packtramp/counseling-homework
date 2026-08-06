#!/usr/bin/env node
/**
 * REVERT: strip all custom claims from every user, returning admin authority to the
 * Firestore `isSuperAdmin` field model (the pre-2026-08-03 behavior).
 *
 * Safe to run any time, including when no claims are set (it is a no-op then).
 * Usage:  node tools/revert-claims.cjs          (from app/)
 *         node tools/revert-claims.cjs --dry    (report only, change nothing)
 */
const admin = require('firebase-admin');
const path = require('path');

const DRY = process.argv.includes('--dry');
const key = path.join(__dirname, '..', 'serviceaccountkey.json');

admin.initializeApp({ credential: admin.credential.cert(require(key)) });

(async () => {
  let cleared = 0, scanned = 0, pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      scanned++;
      const claims = u.customClaims || {};
      if (Object.keys(claims).length === 0) continue;
      console.log(`${DRY ? '[dry] would clear' : 'clearing'}: ${u.email || u.uid} ->`, claims);
      if (!DRY) await admin.auth().setCustomUserClaims(u.uid, null);
      cleared++;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`\nscanned ${scanned} users; ${DRY ? 'would clear' : 'cleared'} ${cleared}.`);
  if (!DRY && cleared > 0) {
    console.log('Affected users should sign out and back in (tokens refresh within 1 hour).');
  }
  process.exit(0);
})().catch(e => { console.error('revert-claims FAILED:', e.message); process.exit(1); });
