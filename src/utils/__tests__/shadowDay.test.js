/**
 * shadowDayString — the frozen local day written into the shadow field at each tap.
 * Device-local date with the 3am rollover baked in. Nothing reads it yet (Phase 1);
 * these pin its shape so the later Angle-A flip can trust it.
 */
import { describe, it, expect } from 'vitest';
import { shadowDayString } from '../homeworkHelpers';

describe('shadowDayString', () => {
  it('returns YYYY-MM-DD', () => {
    expect(shadowDayString(new Date(2026, 8, 9, 14, 0))).toBe('2026-09-09');
  });
  it('a 1am tap counts for the PREVIOUS day (3am rollover)', () => {
    expect(shadowDayString(new Date(2026, 8, 9, 1, 0))).toBe('2026-09-08');
  });
  it('a 3:01am tap counts for the new day', () => {
    expect(shadowDayString(new Date(2026, 8, 9, 3, 1))).toBe('2026-09-09');
  });
  it('2:59am stays on the previous day', () => {
    expect(shadowDayString(new Date(2026, 8, 9, 2, 59))).toBe('2026-09-08');
  });
  it('zero-pads month and day', () => {
    expect(shadowDayString(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
  });
});
