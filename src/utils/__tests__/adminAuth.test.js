/**
 * Tests for the admin dual-accept authorization helper (api/_lib/adminAuth.js).
 *
 * Context (2026-08-03 security review): `isSuperAdmin` in Firestore is client-writable —
 * a user could recreate their own user doc with it set. Custom claims live in the signed
 * token and cannot be forged. During migration BOTH are accepted so no admin is locked out.
 */
import { describe, it, expect } from 'vitest';
import { isCallerSuperAdmin, isTargetSuperAdmin } from '../../../api/_lib/adminAuth.js';

// Minimal Firestore stub: db.collection('users').doc(uid).get()
const makeDb = (docs) => ({
  collection: () => ({
    doc: (uid) => ({
      get: async () => ({
        exists: Object.prototype.hasOwnProperty.call(docs, uid),
        data: () => docs[uid],
      }),
    }),
  }),
});

// Minimal Auth stub: auth.getUser(uid) -> { customClaims }
const makeAuth = (claimsByUid) => ({
  getUser: async (uid) => {
    if (!Object.prototype.hasOwnProperty.call(claimsByUid, uid)) throw new Error('no user');
    return { customClaims: claimsByUid[uid] };
  },
});

describe('isCallerSuperAdmin — the unforgeable path', () => {
  it('accepts a caller whose TOKEN carries the claim, without touching Firestore', async () => {
    // db that would throw if consulted proves the claim short-circuits the lookup
    const explodingDb = { collection: () => { throw new Error('should not read Firestore'); } };
    const ok = await isCallerSuperAdmin({ uid: 'roby', isSuperAdmin: true }, explodingDb);
    expect(ok).toBe(true);
  });

  it('rejects a token whose claim is not exactly true', async () => {
    const db = makeDb({});
    expect(await isCallerSuperAdmin({ uid: 'x', isSuperAdmin: 'true' }, db)).toBe(false);
    expect(await isCallerSuperAdmin({ uid: 'x', isSuperAdmin: 1 }, db)).toBe(false);
  });
});

describe('isCallerSuperAdmin — the legacy fallback (keeps admins working mid-migration)', () => {
  it('accepts an admin who has the Firestore field but NOT yet the claim', async () => {
    const db = makeDb({ legacy: { isSuperAdmin: true } });
    expect(await isCallerSuperAdmin({ uid: 'legacy' }, db)).toBe(true);
  });

  it('rejects a normal user with neither', async () => {
    const db = makeDb({ normal: { isSuperAdmin: false } });
    expect(await isCallerSuperAdmin({ uid: 'normal' }, db)).toBe(false);
  });

  it('rejects a user with no profile doc at all', async () => {
    expect(await isCallerSuperAdmin({ uid: 'ghost' }, makeDb({}))).toBe(false);
  });

  it('rejects a missing/!invalid token outright', async () => {
    const db = makeDb({ any: { isSuperAdmin: true } });
    expect(await isCallerSuperAdmin(null, db)).toBe(false);
    expect(await isCallerSuperAdmin({}, db)).toBe(false);
    expect(await isCallerSuperAdmin(undefined, db)).toBe(false);
  });
});

describe('isTargetSuperAdmin — admins stay protected from deletion', () => {
  it('protects a target holding only the CLAIM (Firestore field missing)', async () => {
    const db = makeDb({ t: { isSuperAdmin: false } });
    const auth = makeAuth({ t: { isSuperAdmin: true } });
    expect(await isTargetSuperAdmin('t', db, auth)).toBe(true);
  });

  it('protects a target holding only the FIRESTORE FIELD (claim missing)', async () => {
    const db = makeDb({ t: { isSuperAdmin: true } });
    const auth = makeAuth({ t: {} });
    expect(await isTargetSuperAdmin('t', db, auth)).toBe(true);
  });

  it('still protects when the target is absent from Auth (getUser throws)', async () => {
    const db = makeDb({ t: { isSuperAdmin: true } });
    const auth = makeAuth({}); // getUser throws -> must fall through, not crash
    expect(await isTargetSuperAdmin('t', db, auth)).toBe(true);
  });

  it('allows deleting an ordinary user', async () => {
    const db = makeDb({ t: { isSuperAdmin: false } });
    const auth = makeAuth({ t: {} });
    expect(await isTargetSuperAdmin('t', db, auth)).toBe(false);
  });

  it('returns false for a missing targetUid instead of throwing', async () => {
    expect(await isTargetSuperAdmin(null, makeDb({}), makeAuth({}))).toBe(false);
  });
});
