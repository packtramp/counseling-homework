/**
 * Imports the LIVE homeworkHelpers.js and runs it against every user.
 * Compares to the snapshot baseline. Prove the edit matches the dry-run.
 *
 * Read-only.
 */
const admin = require('firebase-admin');
const fs = require('fs');
const sa = require('./serviceaccountkey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Find the most recent snapshot
const snapFile = fs.readdirSync('.').filter(f => f.startsWith('streak-snapshot-')).sort().pop();
if (!snapFile) { console.error('No snapshot file found'); process.exit(1); }
const snapshot = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
const snapByUid = Object.fromEntries(snapshot.users.map(u => [u.uid, u]));
console.log(`Loaded baseline: ${snapFile}`);

// Dynamically import the live ES module
(async () => {
  const helpers = await import('./src/utils/homeworkHelpers.js');
  const { calculateAPStreak, calculateWeekStreak } = helpers;

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
    const dayNew = calculateAPStreak(homework, u);
    const weekNew = calculateWeekStreak(homework);
    const totalCompletions = homework.reduce((s, h) => s + (h.completions || []).length, 0);
    const baseline = snapByUid[uid] || { dayStreak: 0, weekStreak: 0 };
    rows.push({
      name: u.name || '(unnamed)',
      dayOld: baseline.dayStreak, dayNew,
      weekOld: baseline.weekStreak, weekNew,
      totalCompletions
    });
  }
  rows.sort((a, b) => b.dayOld - a.dayOld);

  console.log('\n=== LIVE CODE vs BASELINE ===\n');
  console.log('Name                  | DayOld | DayNew | ΔDay | WkOld | WkNew | ΔWk');
  console.log('----------------------|--------|--------|------|-------|-------|-----');
  let dDayCount = 0, dWkCount = 0;
  for (const r of rows) {
    if (r.totalCompletions === 0) continue;
    const dDay = r.dayNew - r.dayOld;
    const dWk = r.weekNew - r.weekOld;
    if (dDay !== 0) dDayCount++;
    if (dWk !== 0) dWkCount++;
    const flag = (dDay !== 0 || dWk !== 0) ? ' ←' : '';
    const dDayStr = (dDay >= 0 ? '+' : '') + dDay;
    const dWkStr = (dWk >= 0 ? '+' : '') + dWk;
    console.log(
      `${(r.name || '').padEnd(22)}| ${String(r.dayOld).padStart(6)} | ${String(r.dayNew).padStart(6)} | ${dDayStr.padStart(4)} | ${String(r.weekOld).padStart(5)} | ${String(r.weekNew).padStart(5)} | ${dWkStr.padStart(3)}${flag}`
    );
  }
  console.log(`\nDay streaks changed: ${dDayCount} | Week streaks changed: ${dWkCount}`);
  console.log(dDayCount === 1 && dWkCount === 0 ? '\n✅ MATCHES DRY-RUN PREDICTION (only Roby +1)' : '\n⚠️ DIFFERS FROM DRY-RUN — INVESTIGATE');
  process.exit(0);
})();
