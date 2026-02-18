/**
 * One-time cleanup: Remove accountability partner links between counselors and their counselees.
 * These should never have been created (#60 now blocks new ones).
 *
 * Usage: node cleanup-counselor-ap.cjs
 */
const admin = require('firebase-admin');
const serviceAccount = require('./counseling-homework-firebase-adminsdk-fbsvc-ef8bdcbfea.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanup() {
  // Get all users
  const usersSnap = await db.collection('users').get();
  const users = {};
  usersSnap.forEach(doc => {
    users[doc.id] = { id: doc.id, ...doc.data() };
  });

  let cleanupCount = 0;

  for (const [uid, user] of Object.entries(users)) {
    const partners = user.accountabilityPartners || [];
    const partnerUids = user.accountabilityPartnerUids || [];
    const watching = user.watchingUsers || [];

    // Find partners who are this user's counselor or counselee
    const badPartnerUids = [];
    for (const p of partners) {
      const partnerUser = users[p.uid];
      if (!partnerUser) continue;

      const isMyCounselor = user.counselorId === p.uid;
      const isMyCounselee = partnerUser.counselorId === uid;

      if (isMyCounselor || isMyCounselee) {
        badPartnerUids.push(p.uid);
        console.log(`  REMOVING: ${user.name || user.email} <-> ${partnerUser.name || partnerUser.email} (counselor-counselee relationship)`);
      }
    }

    if (badPartnerUids.length === 0) continue;

    // Filter out bad partners from all three arrays
    const cleanPartners = partners.filter(p => !badPartnerUids.includes(p.uid));
    const cleanPartnerUids = partnerUids.filter(u => !badPartnerUids.includes(u));
    const cleanWatching = watching.filter(w => !badPartnerUids.includes(w.uid));

    await db.collection('users').doc(uid).update({
      accountabilityPartners: cleanPartners,
      accountabilityPartnerUids: cleanPartnerUids,
      watchingUsers: cleanWatching
    });

    cleanupCount++;
    console.log(`  Updated ${user.name || user.email}: removed ${badPartnerUids.length} bad AP link(s)`);
  }

  console.log(`\nDone. Cleaned up ${cleanupCount} user records.`);
  process.exit(0);
}

cleanup().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
