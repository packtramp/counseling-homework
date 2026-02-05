/**
 * Homework Helper Functions
 *
 * Pure utility functions for homework calculations.
 * Extracted for testability and reuse across components.
 */

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

  let assignedDate;
  if (item.assignedDate?.toDate) {
    assignedDate = item.assignedDate.toDate();
  } else if (item.assignedDate) {
    assignedDate = new Date(item.assignedDate);
  } else {
    assignedDate = now;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const msPerWeek = 7 * msPerDay;
  const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));

  // Group completions by day within this week
  const dailyCounts = {};
  completions.forEach(c => {
    const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
    const weekNum = Math.floor((cDate - assignedDate) / msPerWeek);
    if (weekNum === weeksSinceAssigned) {
      const dayKey = cDate.toDateString();
      dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
    }
  });

  // Sum capped daily completions
  let currentWeekCompletions = 0;
  for (const count of Object.values(dailyCounts)) {
    currentWeekCompletions += Math.min(count, dailyCap);
  }

  // Week 1 pro-rate: assignment night doesn't count as a full day
  const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, 6) : weeklyTarget;
  return { current: currentWeekCompletions, target: effectiveTarget };
};

/**
 * Check if homework item is "behind" - can't catch up even with perfect completion
 * @param {Object} item - Homework item
 * @param {Date} [now] - Optional current date (for testing)
 * @returns {boolean} True if behind
 */
export const isItemBehind = (item, now = new Date()) => {
  if (item.status === 'cancelled') return false;

  const completions = item.completions || [];
  const weeklyTarget = item.weeklyTarget || 7;
  const dailyCap = item.dailyCap || 999;

  let assignedDate;
  if (item.assignedDate?.toDate) {
    assignedDate = item.assignedDate.toDate();
  } else if (item.assignedDate) {
    assignedDate = new Date(item.assignedDate);
  } else {
    assignedDate = now;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const msPerWeek = 7 * msPerDay;
  const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));

  // Group completions by day within this week
  const dailyCounts = {};
  completions.forEach(c => {
    const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
    const weekNum = Math.floor((cDate - assignedDate) / msPerWeek);
    if (weekNum === weeksSinceAssigned) {
      const dayKey = cDate.toDateString();
      dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
    }
  });

  // Sum capped daily completions
  let currentWeekCompletions = 0;
  for (const count of Object.values(dailyCounts)) {
    currentWeekCompletions += Math.min(count, dailyCap);
  }

  // Calculate days remaining in this homework week (including today)
  const weekStartMs = assignedDate.getTime() + (weeksSinceAssigned * msPerWeek);
  const dayOfWeek = Math.floor((now.getTime() - weekStartMs) / msPerDay);
  const daysRemaining = 7 - dayOfWeek;

  // Max possible per day
  const maxPerDay = dailyCap < 999 ? dailyCap : 1;
  const maxPossibleRemaining = daysRemaining * maxPerDay;

  // Week 1 pro-rate
  const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, 6) : weeklyTarget;

  // Behind if even perfect completion from now can't meet target
  return (currentWeekCompletions + maxPossibleRemaining) < effectiveTarget;
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
