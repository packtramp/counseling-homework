/**
 * Day math anchored to the user's HOME timezone, so travel can't tear the streak.
 * Roby in Poland (UTC+2) saw his streak read 12 vs a true 222 because day buckets were
 * computed on the DEVICE clock. Anchoring toMidnight (the primitive dayBucket/getAssignedDate/
 * isDateOnVacation all funnel through) to the profile tz makes the answer identical everywhere.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { dayBucket, setDayTimezone, getDayTimezone } from '../homeworkHelpers';

afterEach(() => setDayTimezone(null));

describe('home-timezone anchor', () => {
  it('defaults to off (device clock) so nothing changes for home users', () => {
    expect(getDayTimezone()).toBe(null);
  });

  it('a late-evening Central instant buckets to the SAME day whether anchored or not, for a home user', () => {
    // 8pm Central on Sep 26 (real instant)
    const inst = new Date('2026-09-27T01:00:00Z'); // 20:00 CT Sep 26
    setDayTimezone(null);
    const dev = dayBucket(inst).toDateString();
    setDayTimezone('America/Chicago');
    const anc = dayBucket(inst).toDateString();
    expect(anc).toBe(dev);
    expect(anc).toBe(new Date(2026, 8, 26).toDateString());
  });

  it('anchoring pins the day to the home tz regardless of a far-east device offset', () => {
    // Same instant, but the anchor forces the Central calendar day, not the device's.
    const inst = new Date('2026-09-27T01:00:00Z'); // Central: 8pm Sep 26; Tokyo: 10am Sep 27
    setDayTimezone('America/Chicago');
    // 8pm CT minus 3h rollover = 5pm CT Sep 26 -> Sep 26
    expect(dayBucket(inst).toDateString()).toBe(new Date(2026, 8, 26).toDateString());
  });

  it('setDayTimezone(null) restores device behavior', () => {
    setDayTimezone('America/Chicago');
    setDayTimezone(null);
    expect(getDayTimezone()).toBe(null);
  });
});
