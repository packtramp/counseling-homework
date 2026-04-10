/**
 * DRY RUN — compute every user's streak under BOTH the current logic and the
 * proposed 3-hour shift logic, then diff. Shows exactly what would change.
 *
 * Pure read-only. Touches nothing in Firestore.
 */
const admin = require('firebase-admin');
const sa = require('./serviceaccountkey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const DAY_ROLLOVER_HOUR = 3;
const SHIFT_MS = DAY_ROLLOVER_HOUR * 60 * 60 * 1000;

// Old: identity. New: subtract 3 hours.
const shiftedDate = (d, useShift) => useShift ? new Date(d.getTime() - SHIFT_MS) : d;

const toMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isDateOnVacation = (date, profile) => {
  if (!profile?.vacationStart || !profile?.vacationEnd) return false;
  const start = profile.vacationStart.toDate ? profile.vacationStart.toDate() : new Date(profile.vacationStart);
  const end = profile.vacationEnd.toDate ? profile.vacationEnd.toDate() : new Date(profile.vacationEnd);
  const checkDate = toMidnight(date);
  return checkDate >= toMidnight(start) && checkDate <= toMidnight(end);
};

// calculateAPStreak with optional shift toggle.
// When useShift=true, every completion timestamp AND "now" are pushed back 3 hours
// before bucketing into days. Algorithm logic is otherwise unchanged.
const calculateAPStreak = (homework, profile, useShift = false) => {
  if (!homework || homework.length === 0) return 0;
  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const rawNow = new Date();
  const now = shiftedDate(rawNow, useShift);
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const daySet = new Set();
  let earliestCompletionMs = Infinity;
  for (const hw of homework) {
    for (const c of (hw.completions || [])) {
      const rawC = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const cDate = shiftedDate(rawC, useShift);
      const dayMs = new Date(cDate.getFullYear(), cDate.getMonth(), cDate.getDate()).getTime();
      daySet.add(dayMs);
      if (dayMs < earliestCompletionMs) earliestCompletionMs = dayMs;
    }
  }
  if (daySet.size === 0) return 0;

  const isAnyItemBehindOnDate = (checkDate) => {
    for (const hw of activeHomework) {
      const weeklyTarget = hw.weeklyTarget || 7;
      const dailyCap = hw.dailyCap || 999;
      const maxPerDay = dailyCap < 999 ? dailyCap : 1;
      let rawAssigned;
      if (hw.assignedDate?.toDate) rawAssigned = hw.assignedDate.toDate();
      else if (hw.assignedDate) rawAssigned = new Date(hw.assignedDate);
      else continue;
      const assigned = toMidnight(rawAssigned);
      if (checkDate < assigned) continue;
      const daysSinceAssigned = Math.round((checkDate - assigned) / msPerDay);
      const weeksSinceAssigned = Math.floor(daysSinceAssigned / 7);
      const dayOfWeek = daysSinceAssigned % 7;
      const weekStartDate = new Date(assigned.getFullYear(), assigned.getMonth(), assigned.getDate() + weeksSinceAssigned * 7);
      const dailyCounts = {};
      for (const c of (hw.completions || [])) {
        const rawC = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
        const cDateLocal = shiftedDate(rawC, useShift);
        const cDay = toMidnight(cDateLocal);
        if (cDay >= weekStartDate && cDay <= checkDate) {
          const dayKey = cDay.getTime();
          dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
        }
      }
      let weekCompletions = 0;
      for (const count of Object.values(dailyCounts)) weekCompletions += Math.min(count, dailyCap);
      const daysRemaining = 7 - dayOfWeek;
      const maxPossibleRemaining = daysRemaining * maxPerDay;
      const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
      const effectiveTarget = weeksSinceAssigned === 0 ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
      if ((weekCompletions + maxPossibleRemaining) < effectiveTarget) return true;
    }
    return false;
  };

  let streak = 0;
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysBack = 0;
  const maxDaysBack = Math.min(365, Math.ceil((todayMs - earliestCompletionMs) / msPerDay) + 1);
  while (daysBack <= maxDaysBack) {
    const checkDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - daysBack);
    const checkDayMs = checkDate.getTime();
    const hasActivity = daySet.has(checkDayMs);
    if (isDateOnVacation(checkDate, profile)) {
      if (hasActivity) {
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        let hasReal = false;
        for (const hw of homework) {
          const autoSet = new Set(hw.autoCompletedDates || []);
          for (const c of (hw.completions || [])) {
            const rawC = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
            const cDateLocal = shiftedDate(rawC, useShift);
            const cDayMs = new Date(cDateLocal.getFullYear(), cDateLocal.getMonth(), cDateLocal.getDate()).getTime();
            if (cDayMs === checkDayMs && !autoSet.has(dateStr)) { hasReal = true; break; }
          }
          if (hasReal) break;
        }
        if (hasReal) streak++;
      }
      daysBack++;
      continue;
    }
    if (hasActivity) streak++;
    else if (daysBack === 0) { /* stagnate today */ }
    else if (isAnyItemBehindOnDate(checkDate)) break;
    daysBack++;
  }
  return streak;
};

const calculateWeekStreak = (homework, useShift = false) => {
  if (!homework || homework.length === 0) return 0;
  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 0;
  const activeWeeks = new Set();
  for (const hw of activeHomework) {
    for (const c of (hw.completions || [])) {
      const rawC = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const cDate = shiftedDate(rawC, useShift);
      const sunday = new Date(cDate);
      sunday.setDate(sunday.getDate() - sunday.getDay());
      const weekKey = `${sunday.getFullYear()}-${sunday.getMonth() + 1}-${sunday.getDate()}`;
      activeWeeks.add(weekKey);
    }
  }
  if (activeWeeks.size === 0) return 0;
  const rawNow = new Date();
  const now = shiftedDate(rawNow, useShift);
  const currentSunday = new Date(now);
  currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());
  currentSunday.setHours(0, 0, 0, 0);
  let streak = 0;
  let checkWeek = new Date(currentSunday);
  while (true) {
    const weekKey = `${checkWeek.getFullYear()}-${checkWeek.getMonth() + 1}-${checkWeek.getDate()}`;
    if (activeWeeks.has(weekKey)) { streak++; checkWeek.setDate(checkWeek.getDate() - 7); }
    else break;
    if (streak > 52) break;
  }
  if (streak === 0) {
    checkWeek = new Date(currentSunday);
    checkWeek.setDate(checkWeek.getDate() - 7);
    while (true) {
      const weekKey = `${checkWeek.getFullYear()}-${checkWeek.getMonth() + 1}-${checkWeek.getDate()}`;
      if (activeWeeks.has(weekKey)) { streak++; checkWeek.setDate(checkWeek.getDate() - 7); }
      else break;
      if (streak > 52) break;
    }
  }
  return streak;
};

async function dryRun() {
  const usersSnap = await db.collection('users').get();
  const rows = [];
  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    const uid = userDoc.id;
    const counselorId = u.counselorId || uid;
    const counseleeDocId = u.counseleeDocId || uid;
    const base = `counselors/${counselorId}/counselees/${counseleeDocId}`;
    let homework = [];
    try {
      const hwSnap = await db.collection(`${base}/homework`).get();
      homework = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {}
    const dayOld = calculateAPStreak(homework, u, false);
    const dayNew = calculateAPStreak(homework, u, true);
    const weekOld = calculateWeekStreak(homework, false);
    const weekNew = calculateWeekStreak(homework, true);
    const totalCompletions = homework.reduce((s, h) => s + (h.completions || []).length, 0);
    rows.push({ uid, name: u.name || '(unnamed)', dayOld, dayNew, weekOld, weekNew, totalCompletions });
  }
  rows.sort((a, b) => b.dayOld - a.dayOld);

  console.log('\n=== DRY RUN: current vs 3am-shift ===\n');
  console.log('Name                  | DayOld | DayNew | ΔDay | WkOld | WkNew | ΔWk');
  console.log('----------------------|--------|--------|------|-------|-------|-----');
  let changedDay = 0, changedWeek = 0, dayUp = 0, dayDown = 0;
  for (const r of rows) {
    if (r.totalCompletions === 0) continue;
    const dDay = r.dayNew - r.dayOld;
    const dWk = r.weekNew - r.weekOld;
    if (dDay !== 0) { changedDay++; if (dDay > 0) dayUp++; else dayDown++; }
    if (dWk !== 0) changedWeek++;
    const flag = (dDay !== 0 || dWk !== 0) ? ' ←' : '';
    console.log(
      `${(r.name || '').padEnd(22)}| ${String(r.dayOld).padStart(6)} | ${String(r.dayNew).padStart(6)} | ${(dDay >= 0 ? '+' : '') + dDay} `.padEnd(70) +
      `| ${String(r.weekOld).padStart(5)} | ${String(r.weekNew).padStart(5)} | ${(dWk >= 0 ? '+' : '') + dWk}${flag}`
    );
  }
  console.log(`\nDay streak changes: ${changedDay} users (${dayUp} up, ${dayDown} down)`);
  console.log(`Week streak changes: ${changedWeek} users`);
}

dryRun().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
