import admin from 'firebase-admin';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    privateKey = privateKey.replace(/\\\\n/g, '\n');
  }

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (initError) {
      console.error('Firebase Admin init error:', initError.message);
    }
  }
}

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Midnight cron job - runs daily at midnight (America/Chicago timezone)
 *
 * Current functionality:
 * - Updates "behindCount" on counselee documents for denormalized display
 * - Updates "currentStreak" on counselee documents (not behind = +1, behind = reset to 0)
 * - Logs red days to activityLog for historical tracking
 */
export default async function handler(req, res) {
  // Verify this is a cron request from Vercel
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('Unauthorized cron attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!db) {
    return res.status(500).json({ error: 'Firebase not initialized' });
  }

  console.log('Midnight cron running at:', new Date().toISOString());

  try {
    // Get all counselors
    const counselorsSnap = await db.collection('counselors').get();
    let counseleesProcessed = 0;
    let behindUpdates = 0;
    let redDaysLogged = 0;

    for (const counselorDoc of counselorsSnap.docs) {
      const counselorId = counselorDoc.id;

      // Get all counselees for this counselor
      const counseleesSnap = await db.collection(`counselors/${counselorId}/counselees`).get();

      for (const counseleeDoc of counseleesSnap.docs) {
        counseleesProcessed++;
        const counseleeId = counseleeDoc.id;

        // Get homework for this counselee
        const homeworkSnap = await db.collection(`counselors/${counselorId}/counselees/${counseleeId}/homework`).get();

        // Calculate behind count
        let behindCount = 0;
        const now = new Date();

        for (const hwDoc of homeworkSnap.docs) {
          const hw = hwDoc.data();
          if (hw.status === 'cancelled') continue;

          const completions = hw.completions || [];
          const weeklyTarget = hw.weeklyTarget || 7;

          let assignedDate;
          if (hw.assignedDate?.toDate) {
            assignedDate = hw.assignedDate.toDate();
          } else if (hw.assignedDate) {
            assignedDate = new Date(hw.assignedDate);
          } else {
            assignedDate = new Date();
          }

          const msPerDay = 24 * 60 * 60 * 1000;
          const msPerWeek = 7 * msPerDay;
          const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));

          // Count completions this week
          let currentWeekCompletions = 0;
          completions.forEach(c => {
            const cDate = c.toDate ? c.toDate() : new Date(c);
            const weekNum = Math.floor((cDate - assignedDate) / msPerWeek);
            if (weekNum === weeksSinceAssigned) {
              currentWeekCompletions++;
            }
          });

          // Calculate days remaining
          const weekStartMs = assignedDate.getTime() + (weeksSinceAssigned * msPerWeek);
          const dayOfWeek = Math.floor((now.getTime() - weekStartMs) / msPerDay);
          const daysRemaining = 7 - dayOfWeek;

          // Check if behind
          if ((currentWeekCompletions + daysRemaining) < weeklyTarget) {
            behindCount++;
          }
        }

        // Update streak: not behind = +1, behind = reset to 0
        const currentData = counseleeDoc.data();
        const currentStreak = currentData.currentStreak || 0;
        const hasActiveHomework = homeworkSnap.docs.some(d => d.data().status === 'active');
        const newStreak = !hasActiveHomework ? currentStreak : (behindCount > 0 ? 0 : currentStreak + 1);

        // Update counselee document with behind count and streak
        if (currentData.behindCount !== behindCount || currentData.currentStreak !== newStreak) {
          await db.doc(`counselors/${counselorId}/counselees/${counseleeId}`).update({
            behindCount: behindCount,
            currentStreak: newStreak,
            lastBehindCheck: admin.firestore.FieldValue.serverTimestamp()
          });
          behindUpdates++;
        }

        // Log red days to activity history for historical tracking
        if (behindCount > 0 && hasActiveHomework) {
          await db.collection(`counselors/${counselorId}/counselees/${counseleeId}/activityLog`).add({
            type: 'red_day',
            behindCount: behindCount,
            streakReset: currentStreak > 0,
            previousStreak: currentStreak,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
          redDaysLogged++;
        }
      }
    }

    console.log(`Midnight cron complete: ${counseleesProcessed} counselees processed, ${behindUpdates} behind counts updated, ${redDaysLogged} red days logged`);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      counseleesProcessed,
      behindUpdates,
      redDaysLogged
    });
  } catch (error) {
    console.error('Midnight cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
