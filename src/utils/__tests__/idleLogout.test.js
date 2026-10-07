import { describe, it, expect } from 'vitest';
import { shouldLogout, IDLE_MS } from '../../hooks/useIdleLogout';

describe('idle auto sign-out decision', () => {
  const base = 1_000_000_000_000;

  it('defaults ON: logs out once 30 min of inactivity have passed', () => {
    expect(shouldLogout({ disabled: false, lastActive: base, now: base + IDLE_MS })).toBe(true);
    expect(shouldLogout({ disabled: false, lastActive: base, now: base + IDLE_MS + 1 })).toBe(true);
  });

  it('does not log out before the 30 min threshold', () => {
    expect(shouldLogout({ disabled: false, lastActive: base, now: base + IDLE_MS - 1 })).toBe(false);
    expect(shouldLogout({ disabled: false, lastActive: base, now: base + 60_000 })).toBe(false);
  });

  it('never logs out when the user has turned the setting off', () => {
    expect(shouldLogout({ disabled: true, lastActive: base, now: base + IDLE_MS * 10 })).toBe(false);
  });

  it('is fixed at exactly 30 minutes', () => {
    expect(IDLE_MS).toBe(30 * 60 * 1000);
  });
});
