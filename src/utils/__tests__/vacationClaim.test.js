/**
 * Claiming a vacation day you actually worked.
 *
 * On a vacation day, calculateAPStreak increments the streak only if there is a REAL
 * completion — one on an item whose autoCompletedDates does NOT contain that date.
 * An auto-only day holds the streak steady instead.
 *
 * So when the 3am job fills yesterday in, work the user genuinely did becomes
 * unclaimable: the "I forgot yesterday" button hid itself, and even clicking it would
 * not have helped, because the stamp is checked PER ITEM. These tests pin both halves.
 */
import { describe, it, expect } from 'vitest';
import { calculateAPStreak, dayBucket } from '../homeworkHelpers';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

// On vacation for the last 10 days, so every day under test is a vacation day.
const profile = { vacationStart: daysAgo(10), vacationEnd: new Date(Date.now() + 86400000) };

// A daily item completed on each of the last `n` days.
const itemFor = (days, autoDates = []) => ({
  status: 'active',
  weeklyTarget: 7,
  assignedDate: daysAgo(20),
  completions: days.map((n) => daysAgo(n)),
  autoCompletedDates: autoDates,
});

describe('vacation streak: real work counts, auto-fill only holds', () => {
  it('does NOT increment for a day that was auto-filled', () => {
    const yest = dayBucket(daysAgo(1));
    const autoOnly = calculateAPStreak([itemFor([1, 2], [ymd(yest)])], profile);
    const real = calculateAPStreak([itemFor([1, 2], [])], profile);
    expect(real).toBeGreaterThan(autoOnly);
  });

  it('counts the day once the auto stamp is CLEARED (what claiming does)', () => {
    const yest = dayBucket(daysAgo(1));
    const stamped = itemFor([1, 2, 3], [ymd(yest)]);
    // Claiming removes that date from autoCompletedDates — the completion already exists.
    const claimed = { ...stamped, autoCompletedDates: [] };
    expect(calculateAPStreak([claimed], profile)).toBeGreaterThan(calculateAPStreak([stamped], profile));
  });

  it('a stamp on a DIFFERENT date does not suppress yesterday', () => {
    const other = ymd(dayBucket(daysAgo(5)));
    expect(calculateAPStreak([itemFor([1, 2], [other])], profile))
      .toBe(calculateAPStreak([itemFor([1, 2], [])], profile));
  });
});
