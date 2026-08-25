/**
 * The vacation backfill must land on the day it MEANS, on a traveller's phone.
 *
 * The client buckets completions on the DEVICE clock minus the 3-hour rollover, while the
 * backfill is stamped in Central. A near-midnight Central stamp therefore lands on the
 * FOLLOWING day for anyone far enough east: 23:59 Central is 06:59 in Ljubljana, which
 * buckets to the next day. That is what made Roby's TODAY arrive already complete, with
 * every item in Done and nothing to check off (8/24, in Slovenia).
 */
import { describe, it, expect } from 'vitest';

const BUCKET_SHIFT_HOURS = 3;
const bucketIn = (instant, tz) => {
  const local = new Date(instant.toLocaleString('en-US', { timeZone: tz }));
  const s = new Date(local.getTime() - BUCKET_SHIFT_HOURS * 3600 * 1000);
  s.setHours(0, 0, 0, 0);
  return s.toDateString();
};

// Every zone a trip realistically reaches, west to east.
const ZONES = [
  'Pacific/Honolulu', 'America/Los_Angeles', 'America/Chicago', 'America/New_York',
  'Europe/London', 'Europe/Ljubljana', 'Europe/Warsaw', 'Asia/Dubai', 'Asia/Tokyo',
];
const INTENDED = 'Mon Aug 24 2026';

describe('vacation backfill stamp time', () => {
  it('REGRESSION: the old 23:59 Central stamp slipped a day going east', () => {
    const old = new Date('2026-08-24T23:59:00-05:00');
    const wrong = ZONES.filter((tz) => bucketIn(old, tz) !== INTENDED);
    expect(wrong).toContain('Europe/Ljubljana'); // exactly where Roby was
    expect(wrong.length).toBeGreaterThan(0);
  });

  it('noon Central lands on the intended day in every zone tested', () => {
    const fixed = new Date('2026-08-24T12:00:00-05:00');
    const wrong = ZONES.filter((tz) => bucketIn(fixed, tz) !== INTENDED);
    expect(wrong).toEqual([]);
  });

  it('noon is correct across the offsets real travel reaches (-9h..+14h from Central)', () => {
    // Local hour = 12 + offset; the bucket keeps the day while (local - 3) stays in [0,24),
    // so noon holds from -9h to +14h. That spans every inhabited zone except the far
    // Pacific (Auckland is +17 from Central) - deliberately asserted, not hand-waved.
    const fixed = new Date('2026-08-24T12:00:00-05:00');
    for (let offset = -9; offset <= 14; offset++) {
      const shifted = new Date(fixed.getTime() + offset * 3600 * 1000);
      const s = new Date(shifted.getTime() - BUCKET_SHIFT_HOURS * 3600 * 1000);
      s.setHours(0, 0, 0, 0);
      expect(s.toDateString()).toBe(INTENDED);
    }
  });
});
