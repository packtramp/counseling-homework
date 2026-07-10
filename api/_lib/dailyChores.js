import admin from 'firebase-admin';
import { zonedParts, zonedTodayStr } from './tz.js';

// The once-a-day housekeeping the app needs: retire finished one-time homework, expire timed
// items, auto-complete homework for people on vacation. This used to live in the Vercel daily
// cron (api/cron/midnight-reset) — which never authenticated and so NEVER RAN. It now runs from
// the reliable 30-minute reminder cron via this shared job, guarded to fire once per day.
//
// Idempotent by a marker doc (meta/dailyChores.lastRun = Central date). Safe to call every tick
// and from either cron — only the first call at/after 3am Central each day does the work.
export async function runDailyChores(now = new Date()) {
  const db = admin.firestore();
  const centralHour = zonedParts(now, 'America/Chicago').hour;
  const centralToday = zonedTodayStr(now, 'America/Chicago');

  // Only at/after 3am Central (matches the old intent), once per Central day.
  if (centralHour < 3) return { ran: false, reason: 'before-3am' };
  const markerRef = db.doc('meta/dailyChores');
  const shouldRun = await db.runTransaction(async (tx) => {
    const snap = await tx.get(markerRef);
    if (snap.exists && snap.data().lastRun === centralToday) return false;
    tx.set(markerRef, { lastRun: centralToday, at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!shouldRun) return { ran: false, reason: 'already-ran-today' };

  // ───── VACATION AUTO-COMPLETE (yesterday + today, in Chicago) ─────
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const yesterdayChicago = new Date(chicagoNow); yesterdayChicago.setDate(yesterdayChicago.getDate() - 1);
  const yesterdayDateStr = `${yesterdayChicago.getFullYear()}-${String(yesterdayChicago.getMonth() + 1).padStart(2, '0')}-${String(yesterdayChicago.getDate()).padStart(2, '0')}`;
  const yesterdayMidnight = new Date(yesterdayChicago); yesterdayMidnight.setHours(0, 0, 0, 0);
  const yesterdayLate = new Date(yesterdayChicago); yesterdayLate.setHours(23, 59, 0, 0);
  const yesterdayTimestamp = admin.firestore.Timestamp.fromMillis(now.getTime() - (chicagoNow.getTime() - yesterdayLate.getTime()));
  const chicagoDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
  const [vMonth, vDay, vYear] = chicagoDateStr.split('/');
  const todayDateStr = `${vYear}-${vMonth.padStart(2, '0')}-${vDay.padStart(2, '0')}`;
  const todayMidnight = new Date(chicagoNow); todayMidnight.setHours(0, 0, 0, 0);

  let vacationUsers = 0, vacationItems = 0;
  const allUsers = await db.collection('users').get();
  for (const userDoc of allUsers.docs) {
    const u = userDoc.data();
    if (!u.vacationStart || !u.vacationEnd) continue;
    const vs = u.vacationStart.toDate ? u.vacationStart.toDate() : new Date(u.vacationStart);
    const ve = u.vacationEnd.toDate ? u.vacationEnd.toDate() : new Date(u.vacationEnd);
    if (now < vs || now > ve) continue;
    const cId = u.counselorId || userDoc.id, ceId = u.counseleeDocId || userDoc.id;
    const hwPath = `counselors/${cId}/counselees/${ceId}/homework`;
    const titles = [];
    for (const hwDoc of (await db.collection(hwPath).get()).docs) {
      const hw = hwDoc.data();
      if (['cancelled', 'expired', 'completed'].includes(hw.status)) continue;
      const comps = hw.completions || [];
      const doneOn = (mid) => comps.some((c) => { const d = new Date((c.toDate ? c.toDate() : new Date(c)).toLocaleString('en-US', { timeZone: 'America/Chicago' })); d.setHours(0,0,0,0); return d.getTime() === mid.getTime(); });
      const yDone = doneOn(yesterdayMidnight), tDone = doneOn(todayMidnight);
      const updates = {}, dateStrs = [];
      if (!yDone && yesterdayMidnight.getTime() >= new Date(vs.toLocaleString('en-US', { timeZone: 'America/Chicago' })).setHours(0,0,0,0)) {
        updates.completions = admin.firestore.FieldValue.arrayUnion(yesterdayTimestamp); dateStrs.push(yesterdayDateStr);
      }
      if (!tDone) {
        updates.completions = admin.firestore.FieldValue.arrayUnion(...(dateStrs.length ? [yesterdayTimestamp, admin.firestore.Timestamp.now()] : [admin.firestore.Timestamp.now()]));
        dateStrs.push(todayDateStr);
      }
      if (dateStrs.length) {
        updates.autoCompletedDates = admin.firestore.FieldValue.arrayUnion(...dateStrs);
        await db.doc(`${hwPath}/${hwDoc.id}`).update(updates);
        titles.push(hw.title || hwDoc.id); vacationItems += dateStrs.length;
      }
    }
    if (titles.length) {
      await db.collection(`counselors/${cId}/counselees/${ceId}/activityLog`).add({ type: 'vacation_auto_complete', itemsAutoCompleted: titles, timestamp: admin.firestore.FieldValue.serverTimestamp() });
      vacationUsers++;
    }
  }

  // ───── RETIRE ONE-TIME HOMEWORK + EXPIRE TIMED ITEMS ─────
  let expired = 0, backfilled = 0, retired = 0;
  for (const cRef of await db.collection('counselors').listDocuments()) {
    for (const ceeDoc of (await db.collection(`counselors/${cRef.id}/counselees`).get()).docs) {
      const hwSnap = await db.collection(`counselors/${cRef.id}/counselees/${ceeDoc.id}/homework`).where('status', '==', 'active').get();
      for (const hwDoc of hwSnap.docs) {
        const hw = hwDoc.data();
        const hwRef = db.doc(`counselors/${cRef.id}/counselees/${ceeDoc.id}/homework/${hwDoc.id}`);
        // Non-recurring plain homework retires once its single week has elapsed.
        if (hw.recurring === false && !hw.linkedThinkListId && !hw.linkedJournalingId) {
          const asg = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate?.() || now);
          if (new Date(asg.getTime() + 7 * 864e5) <= now) {
            await hwRef.update({ status: 'completed', completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            retired++; continue;
          }
        }
        const expireLinked = async () => {
          try {
            if (hw.linkedThinkListId) { const r = db.doc(`counselors/${cRef.id}/counselees/${ceeDoc.id}/thinkLists/${hw.linkedThinkListId}`); if ((await r.get()).exists) await r.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }); }
            if (hw.linkedJournalingId) { const r = db.doc(`counselors/${cRef.id}/counselees/${ceeDoc.id}/journals/${hw.linkedJournalingId}`); if ((await r.get()).exists) await r.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }); }
          } catch (e) { console.warn('expire linked:', e.message); }
        };
        if (hw.durationWeeks && !hw.expiresAt) {
          const asg = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
          const exp = new Date(asg.getTime() + hw.durationWeeks * 7 * 864e5);
          await hwRef.update({ expiresAt: admin.firestore.Timestamp.fromDate(exp) }); backfilled++;
          if (exp <= now) { await hwRef.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }); expired++; await expireLinked(); continue; }
        }
        if (hw.expiresAt) {
          const exp = hw.expiresAt.toDate ? hw.expiresAt.toDate() : new Date(hw.expiresAt);
          if (exp <= now) { await hwRef.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }); expired++; await expireLinked(); }
        }
      }
    }
  }

  const result = { ran: true, retired, expired, backfilled, vacationUsers, vacationItems };
  console.log('Daily chores complete:', JSON.stringify(result));
  return result;
}
