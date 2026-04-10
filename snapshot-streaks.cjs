/**
 * SAFETY SNAPSHOT — saves every user's day & week streak BEFORE the 3am cutoff change.
 * Ports calculateAPStreak + calculateWeekStreak verbatim from src/utils/homeworkHelpers.js
 * so the snapshot is computed exactly the same way the live UI computes it.
 *
 * Output: streak-snapshot-{ISO}.json with per-user streaks and raw completion counts.
 *
 * Run BEFORE deploying the cutoff change. After deploy, run snapshot-streaks.cjs again
 * to compare. If anything moves unexpectedly, we have the baseline to investigate.
 */
const admin = require('firebase-admin');
const fs = require('fs');
const sa = require('./serviceaccountkey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ─── Verbatim port of homeworkHelpers.js (current logic, no shift) ───
const toMidnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isDateOnVacation = (date, profile) => {
  if (!profile?.vacationStart || !profile?.vacationEnd) return false;
  const start = profile.vacationStart.toDate ? profile.vacationStart.toDate() : new Date(profile.vacationStart);
  const end = profile.vacationEnd.toDate ? profile.vacationEnd.toDate() : new Date(profile.vacationEnd);
  const checkDate = toMidnight(date);
  return checkDate >= toMidnight(start) && checkDate <= toMidnight(end);
};

const calculateAPStreak = (homework, profile) => {
  if (!homework || homework.length === 0) return 0;
  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

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
        if (hasRealCompletion) streak++;
      }
      daysBack++;
      continue;
    }
    if (hasActivity) {
      streak++;
    } else if (daysBack === 0) {
      // stagnate
    } else {
      if (isAnyItemBehindOnDate(checkDate)) break;
    }
    daysBack++;
  }
  return streak;
};

const calculateWeekStreak = (homework) => {
  if (!homework || homework.length === 0) return 0;
  const activeHomework = homework.filter(h => h.status === 'active');
  if (activeHomework.length === 0) return 0;
  const activeWeeks = new Set();
  for (const hw of activeHomework) {
    for (const c of (hw.completions || [])) {
      const cDate = c.toDate ? c.toDate() : (c.date ? new Date(c.date) : new Date(c));
      const sunday = new Date(cDate);
      sunday.setDate(sunday.getDate() - sunday.getDay());
      const weekKey = `${sunday.getFullYear()}-${sunday.getMonth() + 1}-${sunday.getDate()}`;
      activeWeeks.add(weekKey);
    }
  }
  if (activeWeeks.size === 0) return 0;
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
    } else break;
    if (streak > 52) break;
  }
  if (streak === 0) {
    checkWeek = new Date(currentSunday);
    checkWeek.setDate(checkWeek.getDate() - 7);
    while (true) {
      const weekKey = `${checkWeek.getFullYear()}-${checkWeek.getMonth() + 1}-${checkWeek.getDate()}`;
      if (activeWeeks.has(weekKey)) {
        streak++;
        checkWeek.setDate(checkWeek.getDate() - 7);
      } else break;
      if (streak > 52) break;
    }
  }
  return streak;
};

// ─── Walk every user, compute snapshot ───

async function snapshot() {
  const usersSnap = await db.collection('users').get();
  const result = { generatedAt: new Date().toISOString(), users: [] };

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
    } catch (e) { /* no homework path */ }

    const dayStreak = calculateAPStreak(homework, u);
    const weekStreak = calculateWeekStreak(homework);
    const totalCompletions = homework.reduce((sum, h) => sum + (h.completions || []).length, 0);
    const activeItems = homework.filter(h => h.status === 'active').length;

    result.users.push({
      uid,
      name: u.name || '(unnamed)',
      email: u.email || '',
      dayStreak,
      weekStreak,
      activeItems,
      totalCompletions
    });
  }

  result.users.sort((a, b) => b.dayStreak - a.dayStreak);
  const filename = `streak-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));

  console.log(`\n=== Snapshot saved: ${filename} ===\n`);
  console.log(`Users: ${result.users.length}`);
  console.log('\nTop 15 by day streak:');
  console.log('UID                              | Name                 | Day | Week | Active | Compl');
  console.log('---------------------------------|----------------------|-----|------|--------|------');
  for (const u of result.users.slice(0, 15)) {
    console.log(
      `${u.uid.padEnd(33)}| ${(u.name || '').padEnd(21)}| ${String(u.dayStreak).padStart(3)} | ${String(u.weekStreak).padStart(4)} | ${String(u.activeItems).padStart(6)} | ${String(u.totalCompletions).padStart(5)}`
    );
  }
}

snapshot().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
