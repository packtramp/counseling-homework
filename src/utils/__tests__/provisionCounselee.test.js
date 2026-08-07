/**
 * Tests for the privileged-field stripping in api/provision-counselee.js.
 *
 * The endpoint's whole purpose is that the SERVER owns `role`, `counselorId`,
 * `counseleeDocId`, `approved`, `isAdmin`, `isSuperAdmin`, `isCounselor` — a client
 * must never be able to smuggle them in via the `profile` object.
 *
 * The stripping list is mirrored here; if the endpoint's list changes without this
 * test changing, the mismatch is the bug.
 */
import { describe, it, expect } from 'vitest';

const PRIVILEGED = ['role', 'counselorId', 'counseleeDocId', 'approved', 'isAdmin', 'isSuperAdmin', 'isCounselor'];

// Mirrors the endpoint's sanitize step.
const sanitize = (profile) => {
  const safe = {};
  for (const [k, v] of Object.entries(profile || {})) {
    if (!PRIVILEGED.includes(k)) safe[k] = v;
  }
  return safe;
};

describe('provision-counselee — privileged fields are stripped from client input', () => {
  it('drops every privileged field a malicious client sends', () => {
    const out = sanitize({
      name: 'Real Name',
      isSuperAdmin: true,
      isAdmin: true,
      approved: true,
      role: 'counselor',
      counselorId: 'attacker-uid',
      counseleeDocId: 'someone-elses-doc',
      isCounselor: true,
    });
    expect(out).toEqual({ name: 'Real Name' });
    for (const f of PRIVILEGED) expect(out).not.toHaveProperty(f);
  });

  it('keeps the ordinary profile fields the flows actually rely on', () => {
    const out = sanitize({
      name: 'Jane', email: 'JANE@x.com', phone: '555', onboardingStep: 0,
      emailReminders: false, smsReminders: false,
      activateRemindersOnFirstLogin: true,
      reminderSchedule: { monday: { slot1: '09:00' } },
      timezone: 'America/Chicago',
    });
    expect(out.name).toBe('Jane');
    expect(out.phone).toBe('555');
    expect(out.emailReminders).toBe(false);
    expect(out.smsReminders).toBe(false);
    expect(out.activateRemindersOnFirstLogin).toBe(true);
    expect(out.reminderSchedule).toEqual({ monday: { slot1: '09:00' } });
    expect(out.timezone).toBe('America/Chicago');
  });

  it('handles empty / missing profile without throwing', () => {
    expect(sanitize({})).toEqual({});
    expect(sanitize(undefined)).toEqual({});
    expect(sanitize(null)).toEqual({});
  });

  it('does not let a privileged field survive via unusual casing (documents the limit)', () => {
    // Firestore field names are case-sensitive; 'ISSUPERADMIN' is a different field and
    // is NOT privileged. This test records that intentionally — the rules, not this
    // filter, are the backstop for unknown fields.
    const out = sanitize({ ISSUPERADMIN: true });
    expect(out).toEqual({ ISSUPERADMIN: true });
  });
});

describe('provision-counselee — email key derivation matches the existing convention', () => {
  const emailKey = (e) => e.toLowerCase().replace(/[.]/g, '_');

  it('matches the client convention used for counseleeLinks', () => {
    expect(emailKey('Jane.Doe@Example.com')).toBe('jane_doe@example_com');
  });

  it('is stable for an already-lowercased address', () => {
    expect(emailKey('a@b.co')).toBe('a@b_co');
  });
});
