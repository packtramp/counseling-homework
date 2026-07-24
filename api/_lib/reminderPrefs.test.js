import { describe, it, expect } from 'vitest';
import { resolvePref, resolveReminderPrefs } from './reminderPrefs.js';

// Garrett bug (2026-07-23): user doc emailReminders=false (his real setting),
// stale counselee doc emailReminders=true. The old OR-gating sent him emails
// anyway — an explicit opt-out must always win over the legacy mirror.
describe('resolvePref — user doc is authoritative', () => {
  it('explicit user FALSE beats stale counselee TRUE (the Garrett bug)', () => {
    expect(resolvePref(false, true)).toBe(false);
  });

  it('explicit user TRUE beats counselee FALSE', () => {
    expect(resolvePref(true, false)).toBe(true);
  });

  it('user undefined falls back to counselee flag (legacy accounts)', () => {
    expect(resolvePref(undefined, true)).toBe(true);
    expect(resolvePref(undefined, false)).toBe(false);
    expect(resolvePref(undefined, undefined)).toBe(false);
  });
});

describe('resolveReminderPrefs — Garrett scenario end-to-end', () => {
  const garrettUser = { smsReminders: true, emailReminders: false };
  const garrettCee = { smsReminders: true, emailReminders: true }; // stale mirror

  it('SMS on + email OFF means exactly that', () => {
    const p = resolveReminderPrefs(garrettUser, garrettCee, '9044159366', 'garrett@x.com');
    expect(p.wantsSms).toBe(true);
    expect(p.wantsEmail).toBe(false); // old OR-logic returned true here
  });

  it('no phone still blocks SMS even when opted in', () => {
    const p = resolveReminderPrefs(garrettUser, garrettCee, '', 'garrett@x.com');
    expect(p.wantsSms).toBe(false);
  });

  it('SMS-only opt-in stays reachable (the Rocky bug stays dead)', () => {
    const p = resolveReminderPrefs({ smsReminders: true, emailReminders: false }, {}, '2567973364', 'r@x.com');
    expect(p.wantsSms).toBe(true);
    expect(p.wantsEmail).toBe(false);
  });
});
