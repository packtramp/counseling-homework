import { describe, it, expect } from 'vitest';
import {
  getCompletionsForDay,
  isCompletedToday,
  getTodayProgress,
  getWeeklyProgress,
  isItemBehind,
  formatPhone,
  parseTime,
  formatTimeDisplay
} from './homeworkHelpers';

// Helper to create a date at a specific time
const makeDate = (year, month, day, hour = 12, min = 0) =>
  new Date(year, month - 1, day, hour, min, 0, 0);

// Helper to create mock completion timestamps
const makeCompletion = (date) => ({ toDate: () => date });

describe('getCompletionsForDay', () => {
  it('returns 0 for empty completions', () => {
    expect(getCompletionsForDay([], new Date())).toBe(0);
    expect(getCompletionsForDay(null, new Date())).toBe(0);
    expect(getCompletionsForDay(undefined, new Date())).toBe(0);
  });

  it('counts completions on target day', () => {
    const today = makeDate(2026, 2, 4);
    const completions = [
      makeCompletion(makeDate(2026, 2, 4, 9, 0)),
      makeCompletion(makeDate(2026, 2, 4, 14, 30)),
      makeCompletion(makeDate(2026, 2, 3, 10, 0)), // yesterday
    ];
    expect(getCompletionsForDay(completions, today)).toBe(2);
  });

  it('handles Date objects without toDate method', () => {
    const today = makeDate(2026, 2, 4);
    const completions = [
      makeDate(2026, 2, 4, 9, 0),
      makeDate(2026, 2, 4, 14, 30),
    ];
    expect(getCompletionsForDay(completions, today)).toBe(2);
  });
});

describe('isCompletedToday', () => {
  const today = makeDate(2026, 2, 4, 15, 0);

  it('returns false for no completions', () => {
    expect(isCompletedToday({ completions: [] }, today)).toBe(false);
    expect(isCompletedToday({}, today)).toBe(false);
  });

  it('returns true if completed today (no daily cap)', () => {
    const item = {
      completions: [makeCompletion(makeDate(2026, 2, 4, 9, 0))]
    };
    expect(isCompletedToday(item, today)).toBe(true);
  });

  it('returns false if completed yesterday only', () => {
    const item = {
      completions: [makeCompletion(makeDate(2026, 2, 3, 9, 0))]
    };
    expect(isCompletedToday(item, today)).toBe(false);
  });

  it('respects daily cap - not done until cap reached', () => {
    const item = {
      dailyCap: 3,
      completions: [
        makeCompletion(makeDate(2026, 2, 4, 9, 0)),
        makeCompletion(makeDate(2026, 2, 4, 12, 0)),
      ]
    };
    expect(isCompletedToday(item, today)).toBe(false); // 2/3, not done

    item.completions.push(makeCompletion(makeDate(2026, 2, 4, 15, 0)));
    expect(isCompletedToday(item, today)).toBe(true); // 3/3, done
  });
});

describe('getTodayProgress', () => {
  const today = makeDate(2026, 2, 4, 15, 0);

  it('returns 0 count for no completions', () => {
    const result = getTodayProgress({ completions: [] }, today);
    expect(result.count).toBe(0);
    expect(result.cap).toBeNull();
  });

  it('counts today completions', () => {
    const item = {
      dailyCap: 3,
      completions: [
        makeCompletion(makeDate(2026, 2, 4, 9, 0)),
        makeCompletion(makeDate(2026, 2, 4, 12, 0)),
      ]
    };
    const result = getTodayProgress(item, today);
    expect(result.count).toBe(2);
    expect(result.cap).toBe(3);
  });
});

describe('getWeeklyProgress', () => {
  it('calculates progress within first week', () => {
    const assignedDate = makeDate(2026, 2, 1); // Sunday
    const now = makeDate(2026, 2, 4); // Wednesday (day 3)

    const item = {
      assignedDate,
      weeklyTarget: 7,
      completions: [
        makeCompletion(makeDate(2026, 2, 2, 9, 0)), // Mon
        makeCompletion(makeDate(2026, 2, 3, 9, 0)), // Tue
        makeCompletion(makeDate(2026, 2, 4, 9, 0)), // Wed
      ]
    };

    const result = getWeeklyProgress(item, now);
    expect(result.current).toBe(3);
    expect(result.target).toBe(6); // Week 1 pro-rate: max 6
  });

  it('applies daily cap to weekly counting', () => {
    const assignedDate = makeDate(2026, 2, 1);
    const now = makeDate(2026, 2, 4);

    const item = {
      assignedDate,
      weeklyTarget: 7,
      dailyCap: 2,
      completions: [
        // 3 completions on Monday, but cap is 2
        makeCompletion(makeDate(2026, 2, 2, 9, 0)),
        makeCompletion(makeDate(2026, 2, 2, 12, 0)),
        makeCompletion(makeDate(2026, 2, 2, 15, 0)),
        // 1 completion on Tuesday
        makeCompletion(makeDate(2026, 2, 3, 9, 0)),
      ]
    };

    const result = getWeeklyProgress(item, now);
    expect(result.current).toBe(3); // 2 (capped) + 1
  });

  it('gives full target in week 2+', () => {
    const assignedDate = makeDate(2026, 1, 25); // A week+ ago
    const now = makeDate(2026, 2, 4);

    const item = {
      assignedDate,
      weeklyTarget: 7,
      completions: []
    };

    const result = getWeeklyProgress(item, now);
    expect(result.target).toBe(7); // Full target after week 1
  });
});

describe('isItemBehind', () => {
  it('returns false for cancelled items', () => {
    const item = { status: 'cancelled', weeklyTarget: 7, completions: [] };
    expect(isItemBehind(item)).toBe(false);
  });

  it('returns false if can still catch up', () => {
    const assignedDate = makeDate(2026, 2, 1); // Sunday
    const now = makeDate(2026, 2, 2); // Monday (day 1, 6 days remaining)

    const item = {
      assignedDate,
      weeklyTarget: 6,
      completions: [] // 0 done, need 6, have 6 days = can catch up
    };

    expect(isItemBehind(item, now)).toBe(false);
  });

  it('returns true if impossible to catch up', () => {
    const assignedDate = makeDate(2026, 2, 1); // Sunday
    const now = makeDate(2026, 2, 6); // Friday (day 5, 2 days remaining)

    const item = {
      assignedDate,
      weeklyTarget: 6,
      completions: [
        makeCompletion(makeDate(2026, 2, 2, 9, 0)), // 1 done
      ] // Need 6, have 1, can do 2 more (2 days * 1/day) = max 3, need 6 = behind
    };

    expect(isItemBehind(item, now)).toBe(true);
  });

  it('accounts for daily cap in behind calculation', () => {
    const assignedDate = makeDate(2026, 2, 1);
    const now = makeDate(2026, 2, 5); // Thursday (day 4, 3 days remaining)

    const item = {
      assignedDate,
      weeklyTarget: 6, // Pro-rated to 6
      dailyCap: 3,
      completions: [] // 0 done, can do 3*3=9 in remaining days = NOT behind
    };

    expect(isItemBehind(item, now)).toBe(false);
  });
});

describe('formatPhone', () => {
  it('formats 10-digit numbers', () => {
    expect(formatPhone('2561234567')).toBe('(256) 123-4567');
    expect(formatPhone('256-123-4567')).toBe('(256) 123-4567');
    expect(formatPhone('(256) 123-4567')).toBe('(256) 123-4567');
  });

  it('formats 11-digit numbers starting with 1', () => {
    expect(formatPhone('12561234567')).toBe('(256) 123-4567');
    expect(formatPhone('1-256-123-4567')).toBe('(256) 123-4567');
  });

  it('returns empty for empty input', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
  });

  it('returns original for non-standard formats', () => {
    expect(formatPhone('123')).toBe('123');
    expect(formatPhone('invalid')).toBe('invalid');
  });
});

describe('parseTime', () => {
  it('parses 12-hour formats', () => {
    expect(parseTime('3:35pm')).toBe('15:35');
    expect(parseTime('3:35 pm')).toBe('15:35');
    expect(parseTime('3pm')).toBe('15:00');
    expect(parseTime('12pm')).toBe('12:00');
    expect(parseTime('12am')).toBe('00:00');
  });

  it('parses 24-hour formats', () => {
    expect(parseTime('15:35')).toBe('15:35');
    expect(parseTime('9:00')).toBe('09:00');
    expect(parseTime('23:59')).toBe('23:59');
  });

  it('handles edge cases', () => {
    expect(parseTime('')).toBe('');
    expect(parseTime('   ')).toBe('');
    expect(parseTime('invalid')).toBe('invalid');
  });
});

describe('formatTimeDisplay', () => {
  it('formats HH:MM to display format', () => {
    expect(formatTimeDisplay('15:35')).toBe('3:35 PM');
    expect(formatTimeDisplay('09:00')).toBe('9 AM');
    expect(formatTimeDisplay('12:00')).toBe('12 PM');
    expect(formatTimeDisplay('00:00')).toBe('12 AM');
  });

  it('handles empty input', () => {
    expect(formatTimeDisplay('')).toBe('');
    expect(formatTimeDisplay(null)).toBe('');
    expect(formatTimeDisplay(undefined)).toBe('');
  });

  it('returns original for invalid format', () => {
    expect(formatTimeDisplay('invalid')).toBe('invalid');
  });
});
