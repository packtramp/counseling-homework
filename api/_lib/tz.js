// Shared timezone helpers for server-side date math.
//
// Replaces the `new Date(now.toLocaleString('en-US',{timeZone}))` reparse hack with
// Intl.DateTimeFormat.formatToParts, which is reliable in Node for ANY IANA zone.
//
// Prime guarantee: for tz === 'America/Chicago', every function returns exactly what the
// old Chicago-hardcoded code returned — so current (all-Central) users are byte-identical.

export const DAY_ROLLOVER_HOUR = 3; // must match client homeworkHelpers.js dayBucket

// Memoize one DateTimeFormat per tz — constructing it per call (per user, per tick) is wasteful.
const _dtfCache = new Map();
function _dtf(tz) {
  let f = _dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23', // hour 0..23, avoids the "24:00" quirk
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'long',
    });
    _dtfCache.set(tz, f);
  }
  return f;
}

// Wall-clock parts of an instant in a given IANA tz. hour 0..23, weekday lowercased.
export function zonedParts(date, tz) {
  const parts = _dtf(tz).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return {
    y: +g('year'), mo: +g('month'), d: +g('day'),
    hour: +g('hour'), minute: +g('minute'),
    weekday: g('weekday').toLowerCase(),
  };
}

// Stable calendar-day number in a tz (for diffing whole days). PLAIN-midnight boundary —
// this is what the current send-reminders week math uses (toChicagoMidnight), so Central
// stays identical. (The 3am-rollover variant is bucketDayNum, used by the seal in Phase 2.)
export function zonedDayNum(date, tz) {
  const z = zonedParts(date, tz);
  return Math.floor(Date.UTC(z.y, z.mo - 1, z.d) / 86400000);
}

// The 3am-rollover bucket day, per tz — matches the CLIENT's dayBucket. (Phase 2 seal.)
export function bucketDayNum(date, tz) {
  return zonedDayNum(new Date(date.getTime() - DAY_ROLLOVER_HOUR * 3600000), tz);
}

// Whole calendar days from a→b in a tz (plain-midnight boundaries).
export function zonedDaysBetween(a, b, tz) {
  return zonedDayNum(b, tz) - zonedDayNum(a, tz);
}

// YYYY-MM-DD in a tz (used as the per-user reminder-dedup key + seal day-string).
export function zonedTodayStr(date, tz) {
  const z = zonedParts(date, tz);
  return `${z.y}-${String(z.mo).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
}

export function isValidTz(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Resolve a stored timezone to a safe value (falls back to Central).
export function safeTz(tz) {
  return isValidTz(tz) ? tz : 'America/Chicago';
}
