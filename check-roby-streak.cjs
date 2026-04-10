/**
 * Diagnostic: did Roby's late-night homework on 2026-04-06 break his streak?
 * UID: dpmfTQejTFdbJjd1SbJDz73L7rO2
 */
const admin = require('firebase-admin');
const sa = require('./serviceaccountkey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const ROBY_UID = 'dpmfTQejTFdbJjd1SbJDz73L7rO2';

function chicagoDateString(d) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
}
function chicagoFull(d) {
  return d.toLocaleString('en-US', { timeZone: 'America/Chicago' });
}

async function check() {
  const userDoc = await db.doc(`users/${ROBY_UID}`).get();
  const u = userDoc.data();
  console.log(`User: ${u.name} | counselorId=${u.counselorId} | counseleeDocId=${u.counseleeDocId}\n`);

  const counselorId = u.counselorId || ROBY_UID;
  const counseleeDocId = u.counseleeDocId || ROBY_UID;
  const base = `counselors/${counselorId}/counselees/${counseleeDocId}`;

  // Counselee doc (where currentStreak lives)
  const cDoc = await db.doc(base).get();
  if (cDoc.exists) {
    const cd = cDoc.data();
    console.log(`Counselee doc: currentStreak=${cd.currentStreak ?? 'unset'} | lastCompletionDate=${cd.lastCompletionDate ?? 'unset'} | weekStreak=${cd.weekStreak ?? 'unset'}\n`);
  }

  // Homework items + their completion dates
  const hwSnap = await db.collection(`${base}/homework`).get();
  console.log(`Homework items: ${hwSnap.size}\n`);

  for (const doc of hwSnap.docs) {
    const hw = doc.data();
    if (hw.cancelled || hw.completed) continue;
    const dates = hw.completedDates || [];
    const recent = dates.slice(-7);
    console.log(`${hw.title} (${hw.frequency || 'daily'})`);
    console.log(`  Last 7 completion dates: ${recent.join(', ')}`);
  }

  // Activity log entries from April 5-8 to see actual click timestamps
  console.log('\n=== Activity log (Apr 5–8 Chicago) ===');
  const since = new Date('2026-04-05T00:00:00-05:00'); // Chicago
  const until = new Date('2026-04-09T00:00:00-05:00');
  const logSnap = await db.collection(`${base}/activityLog`)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(since))
    .where('timestamp', '<', admin.firestore.Timestamp.fromDate(until))
    .orderBy('timestamp', 'asc')
    .get();

  console.log(`${logSnap.size} entries\n`);
  for (const d of logSnap.docs) {
    const e = d.data();
    const ts = e.timestamp?.toDate();
    if (!ts) continue;
    const isLateNight = ts.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }).startsWith('00') ||
                        ts.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }).startsWith('01') ||
                        ts.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }).startsWith('02');
    const flag = isLateNight ? ' ⚠️ LATE NIGHT (00–03)' : '';
    console.log(`  ${chicagoFull(ts)}${flag} | ${e.action || e.type || '?'} | ${e.itemTitle || e.details || ''}`);
  }
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
