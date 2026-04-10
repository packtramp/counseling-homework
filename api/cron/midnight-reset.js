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
  if (!db) {
    return res.status(500).json({ error: 'Firebase not initialized' });
  }

  // Verify this is a cron request from Vercel
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('Unauthorized cron attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Midnight cron running at:', new Date().toISOString());

  try {
    // ═══ PHASE 1: VACATION AUTO-COMPLETE (runs before streak/behind calculations) ═══
    // Auto-completes for YESTERDAY (the day that just ended) so completions count toward
    // the correct homework week. Also completes for today to stay current.
    const now = new Date();
    const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

    // Yesterday in Chicago time
    const yesterdayChicago = new Date(chicagoNow);
    yesterdayChicago.setDate(yesterdayChicago.getDate() - 1);
    const yMonth = String(yesterdayChicago.getMonth() + 1).padStart(2, '0');
    const yDay = String(yesterdayChicago.getDate()).padStart(2, '0');
    const yYear = yesterdayChicago.getFullYear();
    const yesterdayDateStr = `${yYear}-${yMonth}-${yDay}`;
    const yesterdayMidnight = new Date(yesterdayChicago);
    yesterdayMidnight.setHours(0, 0, 0, 0);
    // Timestamp for yesterday at 11:59 PM Chicago time
    const yesterdayLate = new Date(yesterdayChicago);
    yesterdayLate.setHours(23, 59, 0, 0);
    // Convert back to UTC for Firestore timestamp
    const yesterdayLateUtcMs = now.getTime() - (chicagoNow.getTime() - yesterdayLate.getTime());
    const yesterdayTimestamp = admin.firestore.Timestamp.fromMillis(yesterdayLateUtcMs);

    // Today in Chicago time
    const chicagoDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
    const [vMonth, vDay, vYear] = chicagoDateStr.split('/');
    const todayDateStr = `${vYear}-${vMonth.padStart(2, '0')}-${vDay.padStart(2, '0')}`;
    const todayMidnight = new Date(chicagoNow);
    todayMidnight.setHours(0, 0, 0, 0);

    let vacationUsersProcessed = 0;
    let vacationItemsAutoCompleted = 0;

    const allUsersSnap = await db.collection('users').get();
    for (const userDoc of allUsersSnap.docs) {
      const userData = userDoc.data();
      if (!userData.vacationStart || !userData.vacationEnd) continue;

      const vacStart = userData.vacationStart.toDate ? userData.vacationStart.toDate() : new Date(userData.vacationStart);
      const vacEnd = userData.vacationEnd.toDate ? userData.vacationEnd.toDate() : new Date(userData.vacationEnd);
      if (now < vacStart || now > vacEnd) continue;

      const counselorId = userData.counselorId || userDoc.id;
      const counseleeDocId = userData.counseleeDocId || userDoc.id;
      const homeworkPath = `counselors/${counselorId}/counselees/${counseleeDocId}/homework`;
      const homeworkSnap = await db.collection(homeworkPath).get();
      const autoCompletedTitles = [];

      for (const hwDoc of homeworkSnap.docs) {
        const hw = hwDoc.data();
        if (hw.status === 'cancelled' || hw.status === 'expired') continue;

        const completions = hw.completions || [];

        // Check if already completed yesterday
        let yesterdayDone = false;
        for (const c of completions) {
          const cDate = c.toDate ? c.toDate() : new Date(c);
          const cChicago = new Date(cDate.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          cChicago.setHours(0, 0, 0, 0);
          if (cChicago.getTime() === yesterdayMidnight.getTime()) { yesterdayDone = true; break; }
        }

        // Check if already completed today
        let todayDone = false;
        for (const c of completions) {
          const cDate = c.toDate ? c.toDate() : new Date(c);
          const cChicago = new Date(cDate.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          cChicago.setHours(0, 0, 0, 0);
          if (cChicago.getTime() === todayMidnight.getTime()) { todayDone = true; break; }
        }

        const updates = {};
        const dateStrs = [];

        // Backfill yesterday if vacation was active then too
        if (!yesterdayDone && yesterdayMidnight.getTime() >= new Date(vacStart.toLocaleString('en-US', { timeZone: 'America/Chicago' })).setHours(0,0,0,0)) {
          updates.completions = admin.firestore.FieldValue.arrayUnion(yesterdayTimestamp);
          dateStrs.push(yesterdayDateStr);
        }

        // Complete today
        if (!todayDone) {
          updates.completions = admin.firestore.FieldValue.arrayUnion(
            ...(dateStrs.length > 0 ? [yesterdayTimestamp, admin.firestore.Timestamp.now()] : [admin.firestore.Timestamp.now()])
          );
          dateStrs.push(todayDateStr);
        }

        if (dateStrs.length > 0) {
          updates.autoCompletedDates = admin.firestore.FieldValue.arrayUnion(...dateStrs);
          await db.doc(`${homeworkPath}/${hwDoc.id}`).update(updates);
          autoCompletedTitles.push(hw.title || hwDoc.id);
          vacationItemsAutoCompleted += dateStrs.length;
        }
      }

      if (autoCompletedTitles.length > 0) {
        await db.collection(`counselors/${counselorId}/counselees/${counseleeDocId}/activityLog`).add({
          type: 'vacation_auto_complete',
          itemsAutoCompleted: autoCompletedTitles,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        vacationUsersProcessed++;
      }
    }

    console.log(`Vacation auto-complete: ${vacationUsersProcessed} users, ${vacationItemsAutoCompleted} items`);

    // ═══ PHASE 1.5: AUTO-CANCEL EXPIRED HOMEWORK ═══
    // Checks expiresAt timestamp (set by ThinkList/Journal save).
    // Also backfills expiresAt for legacy homework that has durationWeeks but no expiresAt.
    let expiredCancelled = 0;
    let expiresAtBackfilled = 0;
    const allCounselorsSnap = await db.collection('counselors').get();
    for (const cDoc of allCounselorsSnap.docs) {
      const ceesSnap = await db.collection(`counselors/${cDoc.id}/counselees`).get();
      for (const ceeDoc of ceesSnap.docs) {
        const hwSnap = await db.collection(`counselors/${cDoc.id}/counselees/${ceeDoc.id}/homework`)
          .where('status', '==', 'active').get();
        for (const hwDoc of hwSnap.docs) {
          const hw = hwDoc.data();
          const hwRef = db.doc(`counselors/${cDoc.id}/counselees/${ceeDoc.id}/homework/${hwDoc.id}`);

          // Backfill: has durationWeeks but no expiresAt — calculate from assignedDate
          if (hw.durationWeeks && !hw.expiresAt) {
            const assigned = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
            const expiresAt = new Date(assigned.getTime() + hw.durationWeeks * 7 * 24 * 60 * 60 * 1000);
            await hwRef.update({ expiresAt: admin.firestore.Timestamp.fromDate(expiresAt) });
            expiresAtBackfilled++;
            // Check if already expired
            if (expiresAt <= now) {
              await hwRef.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              expiredCancelled++;
              continue;
            }
          }

          // Check expiresAt
          if (hw.expiresAt) {
            const expDate = hw.expiresAt.toDate ? hw.expiresAt.toDate() : new Date(hw.expiresAt);
            if (expDate <= now) {
              await hwRef.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              expiredCancelled++;
            }
          }
        }
      }
    }
    console.log(`Expired homework: ${expiredCancelled} cancelled, ${expiresAtBackfilled} backfilled`);

    // ═══ PHASE 2: BEHIND COUNT + STREAK UPDATES ═══
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

        // Skip counselees on vacation
        try {
          const usersSnap = await db.collection('users')
            .where('counselorId', '==', counselorId)
            .where('counseleeDocId', '==', counseleeId)
            .limit(1)
            .get();
          if (!usersSnap.empty) {
            const userData = usersSnap.docs[0].data();
            if (userData.vacationStart && userData.vacationEnd) {
              const now = new Date();
              const vacStart = userData.vacationStart.toDate ? userData.vacationStart.toDate() : new Date(userData.vacationStart);
              const vacEnd = userData.vacationEnd.toDate ? userData.vacationEnd.toDate() : new Date(userData.vacationEnd);
              if (now >= vacStart && now <= vacEnd) {
                continue;
              }
            }
          }
        } catch (e) { /* vacation check failed, proceed normally */ }

        // Get homework for this counselee
        const homeworkSnap = await db.collection(`counselors/${counselorId}/counselees/${counseleeId}/homework`).get();

        // Calculate behind count
        let behindCount = 0;
        const now = new Date();

        for (const hwDoc of homeworkSnap.docs) {
          const hw = hwDoc.data();
          if (hw.status === 'cancelled' || hw.status === 'expired') continue;

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
      redDaysLogged,
      expiredCancelled,
      expiresAtBackfilled
    });
  } catch (error) {
    console.error('Midnight cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
