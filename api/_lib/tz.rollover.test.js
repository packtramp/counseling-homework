import { describe, it, expect } from 'vitest';
import { rollForBucket, DAY_ROLLOVER_HOUR } from './tz.js';

// Regression for the 2026-07-31 email bug: server completion-bucketing ignored
// the 3 AM night-owl rule, so Roby's 12:00 AM + 3:25 PM journal entries (same
// calendar day) collapsed into ONE server-day — email said "3/4, can't catch
// up" on the last day while the app correctly showed 4/4 complete.
describe('rollForBucket — the 3am night-owl rule, server side', () => {
  const day = (d) => d.toDateString();

  it('shifts exactly DAY_ROLLOVER_HOUR hours back', () => {
    const t = new Date(2026, 6, 26, 12, 0);
    expect(t.getTime() - rollForBucket(t).getTime()).toBe(DAY_ROLLOVER_HOUR * 3600000);
  });

  it('a 12:00 AM check-off belongs to the PREVIOUS day', () => {
    const midnight = new Date(2026, 6, 26, 0, 0);
    expect(day(rollForBucket(midnight))).toBe(day(new Date(2026, 6, 25)));
  });

  it('2:59 AM still previous day; 3:00 AM is the new day', () => {
    expect(day(rollForBucket(new Date(2026, 6, 26, 2, 59)))).toBe(day(new Date(2026, 6, 25)));
    expect(day(rollForBucket(new Date(2026, 6, 26, 3, 0)))).toBe(day(new Date(2026, 6, 26)));
  });

  it("Roby's exact week: 4 completions = 4 DISTINCT bucket days (not 3)", () => {
    const completions = [
      new Date(2026, 6, 26, 0, 0),   // Sun 12:00 AM  -> buckets to Sat 7/25
      new Date(2026, 6, 26, 15, 25), // Sun 3:25 PM   -> Sun 7/26
      new Date(2026, 6, 28, 0, 48),  // Tue 12:48 AM  -> Mon 7/27
      new Date(2026, 6, 30, 18, 35)  // Thu 6:35 PM   -> Thu 7/30
    ];
    const buckets = new Set(completions.map(c => day(rollForBucket(c))));
    expect(buckets.size).toBe(4); // unrolled bucketing collapses the first two -> 3
    const unrolled = new Set(completions.map(day));
    expect(unrolled.size).toBe(3); // proves the old behavior was the bug
  });
});
