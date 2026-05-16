const admin = require('firebase-admin');
const sa = require('../serviceaccountkey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  // Find Roby's user doc + counselee path
  const userSnap = await db.collection('users').where('email', '==', 'robdorsett@gmail.com').get();
  const userDoc = userSnap.docs[0];
  const uid = userDoc.id;
  const u = userDoc.data();
  const counselorId = u.counselorId || uid;
  const counseleeDocId = u.counseleeDocId || uid;
  const basePath = `counselors/${counselorId}/counselees/${counseleeDocId}`;

  // Get Roby's counselee doc for dedup flags
  const cee = (await db.doc(basePath).get()).data();
  console.log('counselee doc dedup:', JSON.stringify({ lastSlot1Sent: cee.lastSlot1Sent, lastSlot2Sent: cee.lastSlot2Sent, lastSlot3Sent: cee.lastSlot3Sent }, null, 2));

  // Get all homework
  const hwSnap = await db.collection(`${basePath}/homework`).get();
  console.log(`\n${hwSnap.size} homework items:`);

  const targetDate = '5/15/2026';
  for (const d of hwSnap.docs) {
    const hw = d.data();
    if (hw.status === 'cancelled' || hw.status === 'expired') continue;
    console.log(`\n  --- ${hw.title} (target=${hw.weeklyTarget || 7}/wk, cap=${hw.dailyCap || '∞'}/day) ---`);
    const comps = (hw.completions || []).map(c => c.toDate ? c.toDate() : new Date(c));
    const sorted = comps.slice().sort((a, b) => a - b);
    const onDay = sorted.filter(d => d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' }) === targetDate);
    console.log(`    All completions: ${sorted.length}`);
    console.log(`    5/15 completions (Chicago): ${onDay.length}`);
    for (const c of onDay) {
      console.log(`      ${c.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
    }
  }
  process.exit(0);
})();
