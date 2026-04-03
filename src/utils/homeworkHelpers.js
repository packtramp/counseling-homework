/**
 * Homework Helper Functions
 *
 * Pure utility functions for homework calculations.
 * Extracted for testability and reuse across components.
 */

/**
 * Normalize a date to midnight (strips time-of-day).
 * Critical for week-boundary math — without this, homework assigned at 7pm
 * creates week boundaries at 7pm, causing completions to leak across weeks.
 */
const toMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Count calendar days between two midnight-normalized dates (DST-safe).
 * Uses Math.round to handle DST offsets where ms difference is 23 or 25 hours
 * instead of exactly 24. Both dates should be at local midnight.
 */
const daysBetween = (from, to) => Math.round((to - from) / (24 * 60 * 60 * 1000));

/**
 * Check if a user is currently on vacation.
 * @param {Object} profile - User profile with optional vacationStart/vacationEnd
 * @returns {boolean} True if currently on vacation
 */
export const isOnVacation = (profile) => {
  if (!profile?.vacationStart || !profile?.vacationEnd) return false;
  const now = new Date();
  const start = profile.vacationStart.toDate ? profile.vacationStart.toDate() : new Date(profile.vacationStart);
  const end = profile.vacationEnd.toDate ? profile.vacationEnd.toDate() : new Date(profile.vacationEnd);
  return now >= start && now <= end;
};

/**
 * Check if a specific date falls within a vacation period.
 * @param {Date} date - The date to check
 * @param {Object} profile - User profile with optional vacationStart/vacationEnd
 * @returns {boolean} True if date is during vacation
 */
export const isDateOnVacation = (date, profile) => {
  if (!profile?.vacationStart || !profile?.vacationEnd) return false;
  const start = profile.vacationStart.toDate ? profile.vacationStart.toDate() : new Date(profile.vacationStart);
  const end = profile.vacationEnd.toDate ? profile.vacationEnd.toDate() : new Date(profile.vacationEnd);
  const checkDate = toMidnight(date);
  return checkDate >= toMidnight(start) && checkDate <= toMidnight(end);
};

/**
 * Count completions for a specific day
 * @param {Array} completions - Array of completion timestamps (Firestore Timestamps or Dates)
 * @param {Date} date - Target date to count
 * @returns {number} Number of completions on that day
 */
export const getCompletionsForDay = (completions, date) => {
  if (!completions || !Array.isArray(completions)) return 0;
  const targetStr = date.toDateString();
  return completions.filter(c => {
    const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
    return cDate.toDateString() === targetStr;
  }).length;
};

/**
 * Check if homework item is completed for today (or hit daily cap)
 * @param {Object} item - Homework item with completions array and optional dailyCap
 * @param {Date} [now] - Optional current date (for testing)
 * @returns {boolean} True if completed today
 */
export const isCompletedToday = (item, now = new Date()) => {
  if (!item.completions || item.completions.length === 0) return false;
  const todayCount = getCompletionsForDay(item.completions, now);
  const dailyCap = item.dailyCap || 999;
  return todayCount >= dailyCap || (todayCount > 0 && !item.dailyCap);
};

/**
 * Get today's completion progress
 * @param {Object} item - Homework item
 * @param {Date} [now] - Optional current date (for testing)
 * @returns {Object} { count: number, cap: number|null }
 */
export const getTodayProgress = (item, now = new Date()) => {
  const completions = item.completions || [];
  const todayCount = getCompletionsForDay(completions, now);
  const dailyCap = item.dailyCap || null;
  return { count: todayCount, cap: dailyCap };
};

/**
 * Get weekly progress (respecting daily caps)
 * @param {Object} item - Homework item with completions, weeklyTarget, dailyCap, assignedDate
 * @param {Date} [now] - Optional current date (for testing)
 * @returns {Object} { current: number, target: number }
 */
export const getWeeklyProgress = (item, now = new Date()) => {
  const completions = item.completions || [];
  const weeklyTarget = item.weeklyTarget || 7;
  const dailyCap = item.dailyCap || 999;

  let rawAssigned;
  if (item.assignedDate?.toDate) {
    rawAssigned = item.assignedDate.toDate();
  } else if (item.assignedDate) {
    rawAssigned = new Date(item.assignedDate);
  } else {
    rawAssigned = now;
  }
  const assignedDate = toMidnight(rawAssigned);
  const today = toMidnight(now);

  // Use daysBetween for DST-safe week calculation
  const totalDays = daysBetween(assignedDate, today);
  const weeksSinceAssigned = Math.max(0, Math.floor(totalDays / 7));

  // Group completions by day within this week
  const dailyCounts = {};
  completions.forEach(c => {
    const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
    const cDay = toMidnight(cDate);
    const cDays = daysBetween(assignedDate, cDay);
    const weekNum = Math.floor(cDays / 7);
    if (weekNum === weeksSinceAssigned) {
      const dayKey = cDay.toDateString();
      dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
    }
  });

  // Sum capped daily completions
  let currentWeekCompletions = 0;
  for (const count of Object.values(dailyCounts)) {
    currentWeekCompletions += Math.min(count, dailyCap);
  }

  // Week 1 pro-rate: assignment night doesn't count as a full day
  // Scale cap by dailyCap so Think Lists (dailyCap=3, weeklyTarget=15) get min(15, 18)=15 not min(15, 6)=6
  const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
  const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
  return { current: currentWeekCompletions, target: effectiveTarget };
};

/**
 * Check if homework item is "behind" - can't catch up even with perfect completion
 * @param {Object} item - Homework item
 * @param {Date} [now] - Optional current date (for testing)
 * @returns {boolean} True if behind
 */
export const isItemBehind = (item, now = new Date(), profile) => {
  if (item.status === 'cancelled') return false;
  if (isOnVacation(profile)) return false;

  const completions = item.completions || [];
  const weeklyTarget = item.weeklyTarget || 7;
  const dailyCap = item.dailyCap || 999;

  let rawAssigned;
  if (item.assignedDate?.toDate) {
    rawAssigned = item.assignedDate.toDate();
  } else if (item.assignedDate) {
    rawAssigned = new Date(item.assignedDate);
  } else {
    rawAssigned = now;
  }
  const assignedDate = toMidnight(rawAssigned);
  const today = toMidnight(now);

  // Use daysBetween for DST-safe week calculation
  const totalDays = daysBetween(assignedDate, today);
  const weeksSinceAssigned = Math.max(0, Math.floor(totalDays / 7));
  const dayOfWeek = totalDays % 7;

  // Group completions by day within this week
  const dailyCounts = {};
  completions.forEach(c => {
    const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
    const cDay = toMidnight(cDate);
    const cDays = daysBetween(assignedDate, cDay);
    const weekNum = Math.floor(cDays / 7);
    if (weekNum === weeksSinceAssigned) {
      const dayKey = cDay.toDateString();
      dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
    }
  });

  // Sum capped daily completions
  let currentWeekCompletions = 0;
  for (const count of Object.values(dailyCounts)) {
    currentWeekCompletions += Math.min(count, dailyCap);
  }

  // Calculate days remaining in this homework week (including today)
  const daysRemaining = 7 - dayOfWeek;

  // Max possible per day
  const maxPerDay = dailyCap < 999 ? dailyCap : 1;
  const maxPossibleRemaining = daysRemaining * maxPerDay;

  // Week 1 pro-rate (scale by dailyCap for Think Lists)
  const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
  const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;

  // Behind if even perfect completion from now can't meet target
  return (currentWeekCompletions + maxPossibleRemaining) < effectiveTarget;
};

/**
 * Check if homework item MUST be completed today or user will be irrecoverably behind.
 * Returns false if already behind (red) or already done today (green) — only true for the "warning" state.
 * @param {Object} item - Homework item
 * @param {Date} [now] - Optional current date (for testing)
 * @returns {boolean} True if skipping today means can't catch up
 */
export const isRequiredToday = (item, now = new Date()) => {
  if (item.status === 'cancelled') return false;
  if (isItemBehind(item, now)) return false;
  if (isCompletedToday(item, now)) return false;

  const completions = item.completions || [];
  const weeklyTarget = item.weeklyTarget || 7;
  const dailyCap = item.dailyCap || 999;

  let rawAssigned;
  if (item.assignedDate?.toDate) {
    rawAssigned = item.assignedDate.toDate();
  } else if (item.assignedDate) {
    rawAssigned = new Date(item.assignedDate);
  } else {
    rawAssigned = now;
  }
  const assignedDate = toMidnight(rawAssigned);
  const today = toMidnight(now);

  // Use daysBetween for DST-safe week calculation
  const totalDays = daysBetween(assignedDate, today);
  const weeksSinceAssigned = Math.max(0, Math.floor(totalDays / 7));
  const dayOfWeek = totalDays % 7;

  // Group completions by day within this week
  const dailyCounts = {};
  completions.forEach(c => {
    const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
    const cDay = toMidnight(cDate);
    const cDays = daysBetween(assignedDate, cDay);
    const weekNum = Math.floor(cDays / 7);
    if (weekNum === weeksSinceAssigned) {
      const dayKey = cDay.toDateString();
      dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
    }
  });

  let currentWeekCompletions = 0;
  for (const count of Object.values(dailyCounts)) {
    currentWeekCompletions += Math.min(count, dailyCap);
  }

  const daysRemaining = 7 - dayOfWeek;

  const maxPerDay = dailyCap < 999 ? dailyCap : 1;
  const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
  const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;

  // If skipping today (daysRemaining - 1), can they still meet the target?
  if (daysRemaining >= 1) {
    const maxWithoutToday = currentWeekCompletions + ((daysRemaining - 1) * maxPerDay);
    return maxWithoutToday < effectiveTarget;
  }
  return false;
};

/**
 * Format phone number as (xxx) xxx-xxxx
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
export const formatPhone = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return phone;
};

/**
 * Parse time string into HH:MM format
 * Handles formats like "3:35pm", "3:35 pm", "15:35", "3pm", "3 pm"
 * @param {string} input - Time string to parse
 * @returns {string} HH:MM format or original input if can't parse
 */
export const parseTime = (input) => {
  if (!input || input.trim() === '') return '';
  const str = input.trim().toLowerCase();

  const match = str.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm|a|p)?$/i);
  if (!match) return input;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  if (period === 'pm' || period === 'p') {
    if (hours < 12) hours += 12;
  } else if (period === 'am' || period === 'a') {
    if (hours === 12) hours = 0;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return input;

  return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
};

/**
 * Format HH:MM to display format like "3:35 PM"
 * @param {string} value - Time in HH:MM format
 * @returns {string} Formatted time or original if can't parse
 */
export const formatTimeDisplay = (value) => {
  if (!value) return '';
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return value;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return minutes === '00' ? `${hours} ${ampm}` : `${hours}:${minutes} ${ampm}`;
};

/**
 * Calculate accountability partner status based on homework progress
 * @param {Array} homework - Array of homework items
 * @returns {string} 'green' | 'red' | 'warning' | 'idle' | 'neutral'
 */
export const calculateAccountabilityStatus = (homework, profile) => {
  if (!homework || homework.length === 0) return 'neutral';
  if (isOnVacation(profile)) return 'vacation';

  const now = new Date();
  const today = toMidnight(now);

  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 'neutral';

  let cantCatchUp = false;
  let anyDoneToday = false;
  let requiredToday = false;

  for (const hw of activeHomework) {
    const weeklyTarget = hw.weeklyTarget || 7;
    const dailyCap = hw.dailyCap || 999;
    const completions = hw.completions || [];

    // Get assignedDate (same logic as HomeworkTile), normalized to midnight
    let rawAssigned;
    if (hw.assignedDate?.toDate) {
      rawAssigned = hw.assignedDate.toDate();
    } else if (hw.assignedDate) {
      rawAssigned = new Date(hw.assignedDate);
    } else if (hw.assignedAt?.toDate) {
      rawAssigned = hw.assignedAt.toDate();
    } else if (hw.assignedAt) {
      rawAssigned = new Date(hw.assignedAt);
    } else {
      rawAssigned = new Date();
    }
    const assignedDate = toMidnight(rawAssigned);

    // DST-safe week calculation
    const totalDays = daysBetween(assignedDate, today);
    const weeksSinceAssigned = Math.max(0, Math.floor(totalDays / 7));
    const dayOfPeriod = totalDays % 7;

    // Count completions in current period (grouped by day, capped per day)
    const dailyCounts = {};
    completions.forEach(c => {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const cDay = toMidnight(cDate);
      const cDays = daysBetween(assignedDate, cDay);
      const weekNum = Math.floor(cDays / 7);
      if (weekNum === weeksSinceAssigned) {
        const dayKey = cDay.toDateString();
        dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
      }
    });

    let currentPeriodCompletions = 0;
    for (const count of Object.values(dailyCounts)) {
      currentPeriodCompletions += Math.min(count, dailyCap);
    }

    // Check if any completion today
    const todayKey = today.toDateString();
    if (dailyCounts[todayKey] && dailyCounts[todayKey] > 0) {
      anyDoneToday = true;
    }

    // Days remaining in this period (matches isItemBehind logic)
    const daysRemaining = 7 - dayOfPeriod;

    // Week 1 pro-rate (scale by dailyCap for Think Lists)
    const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
    const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;

    const maxPerDay = dailyCap < 999 ? dailyCap : 1;
    const maxPossible = currentPeriodCompletions + (daysRemaining * maxPerDay);

    if (maxPossible < effectiveTarget) {
      cantCatchUp = true;
    }

    // "Required today" check: if skipping today means red tomorrow
    if (!cantCatchUp && daysRemaining >= 1) {
      const maxPossibleWithoutToday = currentPeriodCompletions + ((daysRemaining - 1) * maxPerDay);
      if (maxPossibleWithoutToday < effectiveTarget) {
        requiredToday = true;
      }
    }
  }

  if (cantCatchUp) return 'red';           // Red overrides everything - math doesn't work
  if (anyDoneToday) return 'green';        // Not behind + did something today
  if (requiredToday) return 'warning';     // Must do something today or red tomorrow
  return 'idle';                            // Not behind + nothing done today (safe)
};

/**
 * Get the status color for a specific historical date across all homework items.
 * Uses the same behind-check math as isItemBehind / calculateAPStreak.
 * @param {Array} homework - Array of homework items
 * @param {Date} targetDate - The date to evaluate (midnight-normalized)
 * @returns {'green'|'red'|'gray'} Day status
 */
export const getDayStatus = (homework, targetDate) => {
  if (!homework || homework.length === 0) return 'gray';

  const target = toMidnight(targetDate);

  const activeOnDate = homework.filter(h => {
    if (h.status === 'cancelled') return false;
    let assignedDate;
    if (h.assignedDate?.toDate) assignedDate = h.assignedDate.toDate();
    else if (h.assignedDate) assignedDate = new Date(h.assignedDate);
    else return false;
    return target >= toMidnight(assignedDate);
  });

  if (activeOnDate.length === 0) return 'gray';

  let anyBehind = false;
  let anyCompletions = false;

  for (const hw of activeOnDate) {
    const weeklyTarget = hw.weeklyTarget || 7;
    const dailyCap = hw.dailyCap || 999;
    const maxPerDay = dailyCap < 999 ? dailyCap : 1;

    let rawAssigned;
    if (hw.assignedDate?.toDate) rawAssigned = hw.assignedDate.toDate();
    else if (hw.assignedDate) rawAssigned = new Date(hw.assignedDate);
    else continue;

    const assigned = toMidnight(rawAssigned);
    // DST-safe week calculation
    const totalDays = daysBetween(assigned, target);
    const weeksSinceAssigned = Math.max(0, Math.floor(totalDays / 7));
    const dayOfWeek = totalDays % 7;
    // Week start as a proper date (DST-safe)
    const weekStartDate = new Date(assigned.getFullYear(), assigned.getMonth(), assigned.getDate() + weeksSinceAssigned * 7);

    // Count completions this homework-week up to and including targetDate
    const dailyCounts = {};
    for (const c of (hw.completions || [])) {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const cDay = toMidnight(cDate);
      if (cDay >= weekStartDate && cDay <= target) {
        const dayKey = cDay.getTime();
        dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
      }
      // Check if any completion on the target date itself
      if (cDay.getTime() === target.getTime()) anyCompletions = true;
    }

    let weekCompletions = 0;
    for (const count of Object.values(dailyCounts)) {
      weekCompletions += Math.min(count, dailyCap);
    }

    // Days remaining in week from this day forward (including this day)
    const daysRemaining = 7 - dayOfWeek;
    const maxPossibleRemaining = daysRemaining * maxPerDay;

    // Week 1 pro-rate
    const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
    const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;

    if ((weekCompletions + maxPossibleRemaining) < effectiveTarget) {
      anyBehind = true;
    }
  }

  if (anyBehind) return 'red';
  if (anyCompletions) return 'green';
  return 'gray';
};

/**
 * Get detailed day status including which items are behind (for calendar "why" display).
 * @param {Array} homework - Array of homework items
 * @param {Date} targetDate - The date to evaluate
 * @returns {{ status: 'green'|'red'|'gray', behindItems: Array<{title: string, current: number, target: number}> }}
 */
export const getDayDetails = (homework, targetDate) => {
  if (!homework || homework.length === 0) return { status: 'gray', behindItems: [] };

  const target = toMidnight(targetDate);

  const activeOnDate = homework.filter(h => {
    if (h.status === 'cancelled') return false;
    let rawAssigned;
    if (h.assignedDate?.toDate) rawAssigned = h.assignedDate.toDate();
    else if (h.assignedDate) rawAssigned = new Date(h.assignedDate);
    else return false;
    return target >= toMidnight(rawAssigned);
  });

  if (activeOnDate.length === 0) return { status: 'gray', behindItems: [] };

  const behindItems = [];
  let anyCompletions = false;

  for (const hw of activeOnDate) {
    const weeklyTarget = hw.weeklyTarget || 7;
    const dailyCap = hw.dailyCap || 999;
    const maxPerDay = dailyCap < 999 ? dailyCap : 1;

    let rawAssigned;
    if (hw.assignedDate?.toDate) rawAssigned = hw.assignedDate.toDate();
    else if (hw.assignedDate) rawAssigned = new Date(hw.assignedDate);
    else continue;

    const assigned = toMidnight(rawAssigned);
    // DST-safe week calculation
    const totalDays = daysBetween(assigned, target);
    const weeksSinceAssigned = Math.max(0, Math.floor(totalDays / 7));
    const dayOfWeek = totalDays % 7;
    const weekStartDate = new Date(assigned.getFullYear(), assigned.getMonth(), assigned.getDate() + weeksSinceAssigned * 7);

    const dailyCounts = {};
    for (const c of (hw.completions || [])) {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const cDay = toMidnight(cDate);
      if (cDay >= weekStartDate && cDay <= target) {
        const dayKey = cDay.getTime();
        dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
      }
      if (cDay.getTime() === target.getTime()) anyCompletions = true;
    }

    let weekCompletions = 0;
    for (const count of Object.values(dailyCounts)) {
      weekCompletions += Math.min(count, dailyCap);
    }

    const daysRemaining = 7 - dayOfWeek;
    const maxPossibleRemaining = daysRemaining * maxPerDay;

    const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
    const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;

    if ((weekCompletions + maxPossibleRemaining) < effectiveTarget) {
      const weekEndDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6);
      behindItems.push({ title: hw.title || 'Untitled', current: weekCompletions, target: effectiveTarget, weekEnd: weekEndDate });
    }
  }

  if (behindItems.length > 0) return { status: 'red', behindItems };
  if (anyCompletions) return { status: 'green', behindItems: [] };
  return { status: 'gray', behindItems: [] };
};

/**
 * Calculate day streak from homework completions.
 * Rules:
 *   - Streak INCREASES on any day with at least 1 completion
 *   - Streak STAGNATES (holds) on days with no completion IF all items still have cushion
 *   - Streak RESETS on days where any item became irrecoverably behind
 * @param {Array} homework - Array of homework items
 * @returns {number} Day streak count
 */
export const calculateAPStreak = (homework, profile) => {
  if (!homework || homework.length === 0) return 0;
  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Collect completion dates from ALL homework (not just active)
  // so cancelled/completed items' past activity still counts
  const daySet = new Set();
  let earliestCompletionMs = Infinity;
  for (const hw of homework) {
    for (const c of (hw.completions || [])) {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const dayMs = new Date(cDate.getFullYear(), cDate.getMonth(), cDate.getDate()).getTime();
      daySet.add(dayMs);
      if (dayMs < earliestCompletionMs) earliestCompletionMs = dayMs;
    }
  }

  if (daySet.size === 0) return 0;

  // Check if any ACTIVE item is irrecoverably behind on a given date
  // Uses day-count math (not ms arithmetic) to avoid DST errors
  const isAnyItemBehindOnDate = (checkDate) => {
    for (const hw of activeHomework) {
      const weeklyTarget = hw.weeklyTarget || 7;
      const dailyCap = hw.dailyCap || 999;
      const maxPerDay = dailyCap < 999 ? dailyCap : 1;

      let rawAssigned;
      if (hw.assignedDate?.toDate) rawAssigned = hw.assignedDate.toDate();
      else if (hw.assignedDate) rawAssigned = new Date(hw.assignedDate);
      else continue; // no assigned date, skip

      // Normalize assignedDate to midnight
      const assigned = toMidnight(rawAssigned);

      // Don't check days before assignment
      if (checkDate < assigned) continue;

      // Count calendar days since assignment (DST-safe)
      const daysSinceAssigned = Math.round((checkDate - assigned) / msPerDay);
      const weeksSinceAssigned = Math.floor(daysSinceAssigned / 7);
      const dayOfWeek = daysSinceAssigned % 7;

      // Week start as a proper date (DST-safe)
      const weekStartDate = new Date(assigned.getFullYear(), assigned.getMonth(), assigned.getDate() + weeksSinceAssigned * 7);
      const weekEndDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 7);

      // Count completions this homework-week up to and including checkDate
      const dailyCounts = {};
      for (const c of (hw.completions || [])) {
        const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
        const cDay = toMidnight(cDate);
        if (cDay >= weekStartDate && cDay <= checkDate) {
          const dayKey = cDay.getTime();
          dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
        }
      }
      let weekCompletions = 0;
      for (const count of Object.values(dailyCounts)) {
        weekCompletions += Math.min(count, dailyCap);
      }

      // Days remaining in week from this day forward (including this day)
      const daysRemaining = 7 - dayOfWeek;
      const maxPossibleRemaining = daysRemaining * maxPerDay;

      // Week 1 pro-rate
      const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
      const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;

      if ((weekCompletions + maxPossibleRemaining) < effectiveTarget) {
        return true; // irrecoverably behind
      }
    }
    return false;
  };

  // Walk backward from today using date-based subtraction (not ms arithmetic)
  // to avoid DST spring-forward skipping a day when subtracting 86400000ms
  let streak = 0;
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysBack = 0;
  const maxDaysBack = Math.min(365, Math.ceil((todayMs - earliestCompletionMs) / msPerDay) + 1);

  while (daysBack <= maxDaysBack) {
    const checkDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - daysBack);

    const checkDayMs = checkDate.getTime();
    const hasActivity = daySet.has(checkDayMs);

    // Vacation days: check if user did REAL work or only auto-completions
    if (isDateOnVacation(checkDate, profile)) {
      if (hasActivity) {
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        let hasRealCompletion = false;
        for (const hw of homework) {
          const autoDateSet = new Set(hw.autoCompletedDates || []);
          for (const c of (hw.completions || [])) {
            const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
            const cDayMs = new Date(cDate.getFullYear(), cDate.getMonth(), cDate.getDate()).getTime();
            if (cDayMs === checkDayMs && !autoDateSet.has(dateStr)) {
              hasRealCompletion = true;
              break;
            }
          }
          if (hasRealCompletion) break;
        }
        if (hasRealCompletion) {
          streak++;
        }
        // else: only auto-completions → stagnation (no increment, no break)
      }
      // No activity on vacation → stagnation (no increment, no break)
      daysBack++;
      continue;
    }

    if (hasActivity) {
      // Did something → streak increases
      streak++;
    } else if (daysBack === 0) {
      // Today isn't over yet — don't break streak for incomplete today
      // Just stagnate (no increment, no break)
    } else {
      // Past day with no activity → check if any active item was irrecoverably behind
      if (isAnyItemBehindOnDate(checkDate)) {
        break; // behind with no recovery → streak ends
      }
      // Has cushion → stagnate (don't increment, don't break)
    }
    daysBack++;
  }

  return streak;
};

/**
 * Calculate week streak: consecutive calendar weeks with at least 1 homework checkmark
 * Uses Sunday-Saturday calendar weeks. Any single completion in a week = credit for that week.
 * @param {Array} homework - Array of homework items
 * @returns {number} Number of consecutive weeks with activity
 */
export const calculateWeekStreak = (homework) => {
  if (!homework || homework.length === 0) return 0;
  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 0;

  // Collect ALL completion dates across all active homework into a Set of week keys
  const activeWeeks = new Set();
  for (const hw of activeHomework) {
    const completions = hw.completions || [];
    for (const c of completions) {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      // Get the Sunday that starts this calendar week
      const sunday = new Date(cDate);
      sunday.setDate(sunday.getDate() - sunday.getDay());
      const weekKey = `${sunday.getFullYear()}-${sunday.getMonth() + 1}-${sunday.getDate()}`;
      activeWeeks.add(weekKey);
    }
  }

  if (activeWeeks.size === 0) return 0;

  // Count consecutive weeks backward from current week
  const now = new Date();
  const currentSunday = new Date(now);
  currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());
  currentSunday.setHours(0, 0, 0, 0);

  let streak = 0;
  let checkWeek = new Date(currentSunday);

  while (true) {
    const weekKey = `${checkWeek.getFullYear()}-${checkWeek.getMonth() + 1}-${checkWeek.getDate()}`;
    if (activeWeeks.has(weekKey)) {
      streak++;
      checkWeek.setDate(checkWeek.getDate() - 7);
    } else {
      break;
    }
    if (streak > 52) break;
  }

  // If nothing this week yet, check starting from last week
  if (streak === 0) {
    checkWeek = new Date(currentSunday);
    checkWeek.setDate(checkWeek.getDate() - 7);
    while (true) {
      const weekKey = `${checkWeek.getFullYear()}-${checkWeek.getMonth() + 1}-${checkWeek.getDate()}`;
      if (activeWeeks.has(weekKey)) {
        streak++;
        checkWeek.setDate(checkWeek.getDate() - 7);
      } else {
        break;
      }
      if (streak > 52) break;
    }
  }

  return streak;
};
