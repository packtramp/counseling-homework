/**
 * Admin authorization — DUAL-ACCEPT during the custom-claims migration.
 *
 * WHY THIS EXISTS (2026-08-03 security review):
 * `users/{uid}.isSuperAdmin` is a Firestore field the client can write. A user could delete
 * and recreate their own user doc with `isSuperAdmin: true` and gain the full admin surface,
 * including deleteUser. Custom claims live in the signed auth token and CANNOT be written by
 * the client, so they are the durable fix.
 *
 * MIGRATION SAFETY: during rollout this accepts EITHER source, so there is never a window
 * where a legitimate admin is locked out. Once every admin holds the claim
 * (`node tools/sync-admin-claims.cjs`), set ALLOW_FIRESTORE_FALLBACK = false to close the hole.
 *
 * Revert: `node tools/revert-claims.cjs` (strips claims; fallback keeps admins working).
 */

// Flip to false once all admins hold claims — that is what actually closes the escalation.
export const ALLOW_FIRESTORE_FALLBACK = true;

/**
 * Is the caller a superAdmin?
 * @param {object} decodedToken - result of admin.auth().verifyIdToken()
 * @param {object} db - admin.firestore() instance
 * @returns {Promise<boolean>}
 */
export async function isCallerSuperAdmin(decodedToken, db) {
  if (!decodedToken?.uid) return false;

  // 1) Unforgeable source: the custom claim in the signed token.
  if (decodedToken.isSuperAdmin === true) return true;

  // 2) Legacy source: the client-writable Firestore field. Removed once migration completes.
  if (!ALLOW_FIRESTORE_FALLBACK) return false;
  const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
  return callerDoc.exists && callerDoc.data().isSuperAdmin === true;
}

/**
 * Is the TARGET user a superAdmin? Used to protect admins from deletion.
 * Checks both sources so an admin is protected even if one is out of sync.
 */
export async function isTargetSuperAdmin(targetUid, db, auth) {
  if (!targetUid) return false;
  try {
    const rec = await auth.getUser(targetUid);
    if (rec.customClaims?.isSuperAdmin === true) return true;
  } catch (e) { /* user may not exist in Auth; fall through to Firestore */ }
  const doc = await db.collection('users').doc(targetUid).get();
  return doc.exists && doc.data().isSuperAdmin === true;
}
