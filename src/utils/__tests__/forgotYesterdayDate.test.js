/**
 * Regression: the "I forgot yesterday" alreadyLogged check must use the RAW yesterday date,
 * not a pre-bucketed one. getCompletionsForDay buckets its argument itself; handing it an
 * already-bucketed midnight shifts it a day earlier (dayBucket(Sep14 00:00) → Sep13). That
 * made the check read the day-BEFORE-yesterday, so anyone with a completion two days back
 * (i.e. a good record) had their backfill silently no-op'd. (Roby, 9/15 — clicked repeatedly,
 * streak never moved.)
 */
import { describe, it, expect } from 'vitest';
import { getCompletionsForDay, dayBucket } from '../homeworkHelpers';

// Completion on the day BEFORE yesterday only; yesterday is empty.
const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
const midday = new Date(twoDaysAgo.getFullYear(), twoDaysAgo.getMonth(), twoDaysAgo.getDate(), 14, 0, 0);
const completions = [{ toDate: () => midday }];

const rawYesterday = new Date();
rawYesterday.setDate(rawYesterday.getDate() - 1);
rawYesterday.setHours(23, 59, 0, 0);

describe('I forgot — yesterday check uses the raw date', () => {
  it('CORRECT: raw yesterday date sees an empty yesterday (0), so the backfill proceeds', () => {
    expect(getCompletionsForDay(completions, rawYesterday)).toBe(0);
  });

  it('THE BUG: a pre-bucketed yesterday double-shifts and falsely finds the day-before', () => {
    // This is what the code used to do — passing yBucket. It reads Sep13's completion as if
    // it were yesterday's, so alreadyLogged went true and the write was skipped.
    expect(getCompletionsForDay(completions, dayBucket(rawYesterday))).toBeGreaterThan(0);
  });
});
