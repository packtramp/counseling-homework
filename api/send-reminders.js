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
 * Send Reminders API
 * Called by external cron service (cron-job.org) every hour
 * Checks for counselees with reminders due and sends SMS/email
 */
export default async function handler(req, res) {
  // Verify request is from our cron service
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.REMINDER_SECRET}`) {
    console.log('Unauthorized reminder attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!db) {
    return res.status(500).json({ error: 'Firebase not initialized' });
  }

  // Admin tools
  // Set default reminder schedule on all users missing it
  if (req.query?.setDefaultSchedule) {
    const defaultSchedule = {};
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
      defaultSchedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
    });
    const allUsers = await db.collection('users').get();
    const updated = [];
    for (const userDoc of allUsers.docs) {
      const d = userDoc.data();
      const updates = {};
      if (!d.reminderSchedule) updates.reminderSchedule = defaultSchedule;
      if (d.emailReminders === undefined) updates.emailReminders = true;
      if (Object.keys(updates).length > 0) {
        await db.collection('users').doc(userDoc.id).update(updates);
        updated.push({ name: d.name, fields: Object.keys(updates) });
      }
    }
    return res.status(200).json({ updated });
  }

  // Ensure all users have self-counselor docs (for homework storage)
  if (req.query?.ensureSelfDocs) {
    const allUsers = await db.collection('users').get();
    const created = [];
    const defaultSchedule = {};
    ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
      defaultSchedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
    });
    for (const userDoc of allUsers.docs) {
      const uid = userDoc.id;
      const d = userDoc.data();
      const selfPath = `counselors/${uid}/counselees/${uid}`;
      const selfDoc = await db.doc(selfPath).get();
      if (!selfDoc.exists) {
        await db.doc(selfPath).set({
          name: d.name || 'Unknown',
          email: d.email || '',
          uid: uid,
          status: 'active',
          currentStreak: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isSelf: true,
          emailReminders: true,
          smsReminders: false,
          reminderSchedule: defaultSchedule
        });
        created.push(d.name);
      }
    }
    return res.status(200).json({ created });
  }

  if (req.query?.userDetail) {
    const uid = req.query.userDetail;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const d = userDoc.data();
    return res.status(200).json({ uid, data: d });
  }
  // Admin: delete a user (Firebase Auth + Firestore user doc + self-counselor doc)
  if (req.query?.deleteUser) {
    const uid = req.query.deleteUser;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const d = userDoc.data();
    const deleted = { uid, name: d.name, email: d.email, steps: [] };
    try { await admin.auth().deleteUser(uid); deleted.steps.push('auth'); } catch (e) { deleted.steps.push('auth_failed: ' + e.message); }
    try { await db.collection('users').doc(uid).delete(); deleted.steps.push('userDoc'); } catch (e) { deleted.steps.push('userDoc_failed: ' + e.message); }
    try { await db.doc(`counselors/${uid}/counselees/${uid}`).delete(); deleted.steps.push('selfCounselorDoc'); } catch (e) { deleted.steps.push('selfDoc_failed: ' + e.message); }
    return res.status(200).json({ deleted });
  }
  // Admin: update a user's reminder schedule slots
  // Usage: ?updateSchedule=<uid>&slot1=09:00&slot2=13:00&slot3=21:00
  if (req.query?.updateSchedule) {
    const uid = req.query.updateSchedule;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    const d = userDoc.data();
    const schedule = d.reminderSchedule || {};
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    for (const day of days) {
      if (!schedule[day]) schedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
      if (req.query.slot1 !== undefined) schedule[day].slot1 = req.query.slot1;
      if (req.query.slot2 !== undefined) schedule[day].slot2 = req.query.slot2;
      if (req.query.slot3 !== undefined) schedule[day].slot3 = req.query.slot3;
    }
    await db.collection('users').doc(uid).update({ reminderSchedule: schedule });
    return res.status(200).json({ updated: true, uid, name: d.name, schedule });
  }
  if (req.query?.listUsers) {
    const allUsers = await db.collection('users').get();
    const users = allUsers.docs.map(d => ({ uid: d.id, name: d.data().name, email: d.data().email }));
    return res.status(200).json({ users });
  }

  // Debug a specific user's homework analysis (by email)
  if (req.query?.debugUser) {
    const emailQuery = req.query.debugUser.toLowerCase();
    const allUsers = await db.collection('users').get();
    const matchedUser = allUsers.docs.find(d => (d.data().email || '').toLowerCase() === emailQuery);
    if (!matchedUser) return res.status(404).json({ error: 'User not found', email: emailQuery });

    const userData = matchedUser.data();
    const userId = matchedUser.id;
    const counselorId = userData.counselorId || userId;
    const counseleeDocId = userData.counseleeDocId || userId;
    const basePath = `counselors/${counselorId}/counselees/${counseleeDocId}`;

    const now = new Date();
    const toChicagoDate = (d) => {
      const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
      return new Date(s);
    };
    const todayChicago = toChicagoDate(new Date());
    const msPerDay = 1000 * 60 * 60 * 24;
    const msPerWeek = 7 * msPerDay;

    const homeworkSnap = await db.collection(`${basePath}/homework`).get();
    const hwDebug = [];

    for (const doc of homeworkSnap.docs) {
      const hw = doc.data();
      const weeklyTarget = hw.weeklyTarget || 7;
      const dailyCap = hw.dailyCap || 999;
      const assignedDate = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
      const completions = hw.completions || [];

      const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));
      const periodStart = new Date(assignedDate.getTime() + weeksSinceAssigned * msPerWeek);
      const periodEnd = new Date(periodStart.getTime() + msPerWeek);

      const periodEndChicago = toChicagoDate(periodEnd);
      const daysLeftIncludingToday = Math.max(1, Math.floor((periodEndChicago - todayChicago) / msPerDay));

      const dailyCounts = {};
      let completionsInPeriod = 0;
      let completionsOutsidePeriod = 0;
      for (const c of completions) {
        const cDate = c.date?.toDate ? c.date.toDate() : (c.toDate ? c.toDate() : new Date(c));
        if (cDate >= periodStart && cDate <= now) {
          completionsInPeriod++;
          const cChicago = toChicagoDate(cDate);
          const dayKey = cChicago.toDateString();
          dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
        } else {
          completionsOutsidePeriod++;
        }
      }

      let weeklyCompleted = 0;
      for (const count of Object.values(dailyCounts)) {
        weeklyCompleted += Math.min(count, dailyCap);
      }

      const isFirstWeek = weeksSinceAssigned === 0;
      const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
      const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
      const tasksRemaining = effectiveTarget - weeklyCompleted;
      const maxPerDay = dailyCap < 999 ? dailyCap : 1;
      const maxCanComplete = daysLeftIncludingToday * maxPerDay;
      const isBehind = tasksRemaining > maxCanComplete;

      hwDebug.push({
        docId: doc.id,
        title: hw.title,
        status: hw.status || '(none)',
        type: hw.type || '(none)',
        weeklyTarget,
        dailyCap,
        effectiveTarget,
        weeklyCompleted,
        tasksRemaining,
        isComplete: weeklyCompleted >= effectiveTarget,
        isBehind,
        isFirstWeek,
        weeksSinceAssigned,
        daysLeftIncludingToday,
        maxPerDay,
        maxCanComplete,
        totalCompletions: completions.length,
        completionsInPeriod,
        completionsOutsidePeriod,
        dailyCounts,
        assignedDate: assignedDate.toISOString(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        nowUTC: now.toISOString(),
        wouldTriggerEmail: tasksRemaining > 0
      });
    }

    return res.status(200).json({
      user: { uid: userId, name: userData.name, email: userData.email },
      basePath,
      homeworkCount: homeworkSnap.docs.length,
      serverTime: now.toISOString(),
      chicagoDate: todayChicago.toDateString(),
      homework: hwDebug
    });
  }

  // Daily Audit: Check who got reminders today and email summary to admin
  if (req.query?.dailyAudit) {
    const now = new Date();
    const chicagoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const todayStr = chicagoTime.getFullYear() + '-' + (chicagoTime.getMonth() + 1).toString().padStart(2, '0') + '-' + chicagoTime.getDate().toString().padStart(2, '0');
    const toChicagoDate = (d) => {
      const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
      return new Date(s);
    };
    const todayChicago = toChicagoDate(new Date());
    const msPerDay = 1000 * 60 * 60 * 24;
    const msPerWeek = 7 * msPerDay;

    const allUsersSnap = await db.collection('users').where('emailReminders', '==', true).get();
    const auditRows = [];
    let totalSlot1 = 0, totalSlot2 = 0, totalSlot3 = 0, totalSkipped = 0;

    for (const userDoc of allUsersSnap.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const counselorId = userData.counselorId || userId;
      const counseleeDocId = userData.counseleeDocId || userId;
      const basePath = `counselors/${counselorId}/counselees/${counseleeDocId}`;

      const counseleeDoc = await db.doc(basePath).get();
      if (!counseleeDoc.exists) {
        auditRows.push({ name: userData.name, email: userData.email, slot1: '—', slot2: '—', slot3: '—', activeHW: 0, behind: 0, critical: 0, note: 'No counselee doc' });
        totalSkipped++;
        continue;
      }
      const counselee = counseleeDoc.data();

      // Check dedup flags
      const s1 = counselee.lastSlot1Sent === todayStr ? 'SENT' : 'no';
      const s2 = counselee.lastSlot2Sent === todayStr ? 'SENT' : 'no';
      const s3 = counselee.lastSlot3Sent === todayStr ? 'SENT' : 'no';
      if (s1 === 'SENT') totalSlot1++;
      if (s2 === 'SENT') totalSlot2++;
      if (s3 === 'SENT') totalSlot3++;

      // Count active homework and urgency
      const homeworkSnap = await db.collection(`${basePath}/homework`).get();
      let activeHW = 0, behindCount = 0, criticalCount = 0, doneToday = 0;

      for (const hwDoc of homeworkSnap.docs) {
        const hw = hwDoc.data();
        if (hw.status === 'cancelled') continue;
        activeHW++;

        const weeklyTarget = hw.weeklyTarget || 7;
        const dailyCap = hw.dailyCap || 999;
        const assignedDate = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
        const completions = hw.completions || [];

        const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));
        const periodStart = new Date(assignedDate.getTime() + weeksSinceAssigned * msPerWeek);
        const periodEnd = new Date(periodStart.getTime() + msPerWeek);
        const periodEndChicago = toChicagoDate(periodEnd);
        const daysLeftIncludingToday = Math.max(1, Math.floor((periodEndChicago - todayChicago) / msPerDay));

        const dailyCounts = {};
        for (const c of completions) {
          const cDate = c.date?.toDate ? c.date.toDate() : (c.toDate ? c.toDate() : new Date(c));
          if (cDate >= periodStart && cDate <= now) {
            const dayKey = toChicagoDate(cDate).toDateString();
            dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
          }
        }
        let weeklyCompleted = 0;
        for (const count of Object.values(dailyCounts)) {
          weeklyCompleted += Math.min(count, dailyCap);
        }

        const isFirstWeek = weeksSinceAssigned === 0;
        const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
        const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
        const tasksRemaining = effectiveTarget - weeklyCompleted;
        const maxPerDay = dailyCap < 999 ? dailyCap : 1;
        const maxCanComplete = daysLeftIncludingToday * maxPerDay;
        const isBehind = tasksRemaining > maxCanComplete;
        const isCritical = !isBehind && tasksRemaining > 0 && tasksRemaining > ((daysLeftIncludingToday - 1) * maxPerDay);

        const rawDailyCap = hw.dailyCap;
        const todayKey = todayChicago.toDateString();
        const todayCompletions = dailyCounts[todayKey] || 0;
        const isDoneForToday = rawDailyCap ? (todayCompletions >= rawDailyCap) : (todayCompletions > 0);

        if (isBehind && !isDoneForToday && weeklyCompleted < effectiveTarget) behindCount++;
        if (isCritical && !isDoneForToday && weeklyCompleted < effectiveTarget) criticalCount++;
        if (isDoneForToday) doneToday++;
      }

      auditRows.push({ name: userData.name, email: userData.email, slot1: s1, slot2: s2, slot3: s3, activeHW, behind: behindCount, critical: criticalCount, doneToday, note: activeHW === 0 ? 'No active HW' : '' });
    }

    // Build email HTML
    const auditHtml = `
      <h2>Daily Reminder Audit — ${todayStr}</h2>
      <p><strong>Slot 1 sent:</strong> ${totalSlot1} | <strong>Slot 2 sent:</strong> ${totalSlot2} | <strong>Slot 3 sent:</strong> ${totalSlot3} | <strong>Skipped:</strong> ${totalSkipped}</p>
      <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
        <tr style="background: #2d3748; color: white;">
          <th style="padding: 6px 8px; text-align: left;">Name</th>
          <th style="padding: 6px 8px;">S1</th>
          <th style="padding: 6px 8px;">S2</th>
          <th style="padding: 6px 8px;">S3</th>
          <th style="padding: 6px 8px;">HW</th>
          <th style="padding: 6px 8px;">Behind</th>
          <th style="padding: 6px 8px;">Critical</th>
          <th style="padding: 6px 8px;">Done Today</th>
          <th style="padding: 6px 8px; text-align: left;">Note</th>
        </tr>
        ${auditRows.map((r, i) => `
          <tr style="background: ${i % 2 === 0 ? '#f7fafc' : 'white'};">
            <td style="padding: 4px 8px;">${r.name}</td>
            <td style="padding: 4px 8px; text-align: center; color: ${r.slot1 === 'SENT' ? '#38a169' : '#a0aec0'}; font-weight: bold;">${r.slot1}</td>
            <td style="padding: 4px 8px; text-align: center; color: ${r.slot2 === 'SENT' ? '#38a169' : '#a0aec0'}; font-weight: bold;">${r.slot2}</td>
            <td style="padding: 4px 8px; text-align: center; color: ${r.slot3 === 'SENT' ? '#38a169' : '#a0aec0'}; font-weight: bold;">${r.slot3}</td>
            <td style="padding: 4px 8px; text-align: center;">${r.activeHW}</td>
            <td style="padding: 4px 8px; text-align: center; color: ${r.behind > 0 ? '#e53e3e' : '#a0aec0'};">${r.behind}</td>
            <td style="padding: 4px 8px; text-align: center; color: ${r.critical > 0 ? '#d69e2e' : '#a0aec0'};">${r.critical}</td>
            <td style="padding: 4px 8px; text-align: center;">${r.doneToday || 0}</td>
            <td style="padding: 4px 8px; font-size: 11px; color: #718096;">${r.note || ''}</td>
          </tr>
        `).join('')}
      </table>
      <p style="font-size: 11px; color: #a0aec0; margin-top: 16px;">Audit run at ${chicagoTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} Chicago time</p>
    `;

    // Send audit email to admin
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';
    let emailSent = false;
    if (apiKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Counseling Homework <${fromEmail}>`,
            to: 'robdorsett@gmail.com',
            subject: `Reminder Audit ${todayStr} — S1:${totalSlot1} S2:${totalSlot2} S3:${totalSlot3}`,
            html: auditHtml
          })
        });
        emailSent = true;
      } catch (err) {
        console.error('Audit email failed:', err.message);
      }
    }

    return res.status(200).json({ date: todayStr, totalSlot1, totalSlot2, totalSlot3, totalSkipped, emailSent, users: auditRows });
  }

  if (req.query?.audit || req.query?.clearAllDedup || req.query?.testSend) {
    const counselorSnap = await db.collection('users').where('role', '==', 'counselor').get();
    const counselorSnap2 = await db.collection('users').where('isCounselor', '==', true).get();
    const allCounselorIds = new Set([...counselorSnap.docs.map(d => d.id), ...counselorSnap2.docs.map(d => d.id)]);

    // Clear ALL dedup flags (covers all users' counselee docs, not just counselors')
    if (req.query?.clearAllDedup) {
      const cleared = [];
      // Clear under counselors' counselee collections
      for (const cId of allCounselorIds) {
        const counseleesSnap = await db.collection(`counselors/${cId}/counselees`).get();
        for (const cDoc of counseleesSnap.docs) {
          const c = cDoc.data();
          if (c.lastSlot1Sent || c.lastSlot2Sent || c.lastSlot3Sent) {
            await db.doc(`counselors/${cId}/counselees/${cDoc.id}`).update({
              lastSlot1Sent: admin.firestore.FieldValue.delete(),
              lastSlot2Sent: admin.firestore.FieldValue.delete(),
              lastSlot3Sent: admin.firestore.FieldValue.delete()
            });
            cleared.push(c.name);
          }
        }
      }
      // Also clear self-counselor docs for non-counselor users
      const allUsersDocs = await db.collection('users').get();
      for (const uDoc of allUsersDocs.docs) {
        if (allCounselorIds.has(uDoc.id)) continue; // already covered above
        const selfPath = `counselors/${uDoc.id}/counselees/${uDoc.id}`;
        const selfDoc = await db.doc(selfPath).get();
        if (selfDoc.exists) {
          const s = selfDoc.data();
          if (s.lastSlot1Sent || s.lastSlot2Sent || s.lastSlot3Sent) {
            await db.doc(selfPath).update({
              lastSlot1Sent: admin.firestore.FieldValue.delete(),
              lastSlot2Sent: admin.firestore.FieldValue.delete(),
              lastSlot3Sent: admin.firestore.FieldValue.delete()
            });
            cleared.push(s.name || uDoc.data().name);
          }
        }
      }
      return res.status(200).json({ cleared });
    }

    // Test send to a specific email
    if (req.query?.testSend) {
      const to = req.query.testSend;
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: `Counseling Homework <${fromEmail}>`, to, subject: 'Test Email Delivery', html: `<p>Test email sent at ${new Date().toISOString()} to ${to}.</p>` })
        });
        const data = await response.json();
        return res.status(response.ok ? 200 : 500).json({ status: response.status, to, data });
      } catch (err) {
        return res.status(500).json({ error: err.message, to });
      }
    }

    // Audit
    const audit = [];
    for (const cId of allCounselorIds) {
      const cDoc = await db.collection('users').doc(cId).get();
      const counseleesSnap = await db.collection(`counselors/${cId}/counselees`).get();
      const counselees = counseleesSnap.docs.map(d => {
        const c = d.data();
        return { docId: d.id, name: c.name, email: c.email || 'MISSING', emailReminders: c.emailReminders, isSelf: c.isSelf || false, hasSchedule: !!c.reminderSchedule, dedup: { s1: c.lastSlot1Sent, s2: c.lastSlot2Sent, s3: c.lastSlot3Sent } };
      });
      audit.push({ counselor: cDoc.data()?.name, counselorId: cId, counseleeCount: counselees.length, counselees });
    }
    return res.status(200).json({ audit });
  }

  // Get current time in America/Chicago (CST/CDT)
  const now = new Date();
  const chicagoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const currentHour = chicagoTime.getHours().toString().padStart(2, '0');
  const currentTime = currentHour + ':' + chicagoTime.getMinutes().toString().padStart(2, '0');
  const todayStr = chicagoTime.getFullYear() + '-' + (chicagoTime.getMonth() + 1).toString().padStart(2, '0') + '-' + chicagoTime.getDate().toString().padStart(2, '0');
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[chicagoTime.getDay()];

  console.log(`Reminder check at ${chicagoTime.toISOString()} (Chicago), day=${currentDay}, time=${currentTime}, hour=${currentHour}`);

  try {
    // === PERSONAL REMINDERS: Send to ALL users with emailReminders enabled ===
    const allUsersSnap = await db.collection('users').where('emailReminders', '==', true).get();
    let smsCount = 0;
    let emailCount = 0;
    let errors = [];
    let diagnostics = [];

    for (const userDoc of allUsersSnap.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;

      // Skip users on vacation
      if (userData.vacationStart && userData.vacationEnd) {
        const now = new Date();
        const vacStart = userData.vacationStart.toDate ? userData.vacationStart.toDate() : new Date(userData.vacationStart);
        const vacEnd = userData.vacationEnd.toDate ? userData.vacationEnd.toDate() : new Date(userData.vacationEnd);
        if (now >= vacStart && now <= vacEnd) {
          diagnostics.push({ name: userData.name, email: userData.email, reason: 'on_vacation' });
          continue;
        }
      }

      // Determine homework data path: user's counselorId/counseleeDocId or self-counselor
      const counselorId = userData.counselorId || userId;
      const counseleeDocId = userData.counseleeDocId || userId;
      const basePath = `counselors/${counselorId}/counselees/${counseleeDocId}`;

      // Get the counselee doc (contains dedup flags and homework subcollection)
      const counseleeDoc = await db.doc(basePath).get();
      if (!counseleeDoc.exists) {
        diagnostics.push({ name: userData.name, email: userData.email, reason: 'no_counselee_doc', path: basePath });
        continue;
      }
      const counselee = counseleeDoc.data();

      // Merge: use user doc for preferences, counselee doc for dedup
      const email = userData.email || counselee.email;
      const phone = userData.phone || counselee.phone;
      const wantsSms = (userData.smsReminders || counselee.smsReminders) && phone;
      const wantsEmail = email; // emailReminders already filtered by query
      if (!wantsSms && !wantsEmail) continue;

      // Schedule from user doc (primary) or counselee doc (fallback)
      const schedule = userData.reminderSchedule || counselee.reminderSchedule;

      // Check schedule for today - match by HH:MM (cron fires every 30 min)
      const snapTo30 = (timeStr) => {
        if (!timeStr) return null;
        const [h, m] = timeStr.split(':').map(Number);
        const snappedM = m < 15 ? 0 : m < 45 ? 30 : 0;
        const snappedH = m >= 45 ? (h + 1) % 24 : h;
        return snappedH.toString().padStart(2, '0') + ':' + snappedM.toString().padStart(2, '0');
      };
      const currentHHMM = currentHour + ':' + now.toLocaleString('en-US', { minute: '2-digit', timeZone: 'America/Chicago' }).padStart(2, '0');
      const currentSlot = snapTo30(currentHHMM);
      let matchedSlot = null;
      if (schedule && schedule[currentDay]) {
        const todaySchedule = schedule[currentDay];
        for (const slotNum of [1, 2, 3]) {
          if (snapTo30(todaySchedule[`slot${slotNum}`]) === currentSlot) {
            if (counselee[`lastSlot${slotNum}Sent`] !== todayStr) {
              matchedSlot = slotNum;
              break;
            }
          }
        }
      } else if (snapTo30(counselee.reminderTime) === currentSlot) {
        if (counselee.lastSlot1Sent !== todayStr) {
          matchedSlot = 1;
        }
      }

      if (!matchedSlot) {
        diagnostics.push({ name: userData.name, email, reason: 'no_slot_match', currentSlot, slots: schedule?.[currentDay], dedup: { slot1: counselee.lastSlot1Sent, slot2: counselee.lastSlot2Sent, slot3: counselee.lastSlot3Sent } });
        continue;
      }

      // Get all active homework
      const homeworkSnap = await db.collection(`${basePath}/homework`).get();

        // Chicago timezone helpers
        const toChicagoDate = (d) => {
          const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
          return new Date(s);
        };
        const todayChicago = toChicagoDate(new Date());
        const msPerDay = 1000 * 60 * 60 * 24;
        const msPerWeek = 7 * msPerDay;

        // Analyze each homework item
        let currentCount = 0;       // Incomplete for the week
        let behindCount = 0;        // Can't catch up even with perfect remaining days
        let thinkListIncomplete = 0;
        let hwDetail = [];
        let activeItemCount = 0;    // Total non-cancelled homework items
        let doneForTodayCount = 0;  // Items completed for today (or weekly-complete)
        let behindNotDoneToday = 0; // Behind AND not done for today
        let criticalNotDoneToday = 0; // Will become behind if missed today AND not done
        let anyDoneToday = false;   // Has user done at least 1 item today

        for (const doc of homeworkSnap.docs) {
          const hw = doc.data();
          if (hw.status === 'cancelled') continue;

          const weeklyTarget = hw.weeklyTarget || 7;
          const dailyCap = hw.dailyCap || 999;  // Default to no cap
          const assignedDate = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
          const completions = hw.completions || [];

          // Exact-timestamp periods (matches client-side HomeworkTile.jsx)
          // Period starts exactly N*7 days from assignment time, not midnight
          const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / msPerWeek));
          const periodStart = new Date(assignedDate.getTime() + weeksSinceAssigned * msPerWeek);
          const periodEnd = new Date(periodStart.getTime() + msPerWeek);

          // Calendar days remaining INCLUDING today (Chicago time) for behind calc
          const periodEndChicago = toChicagoDate(periodEnd);
          const daysLeftIncludingToday = Math.max(1, Math.floor((periodEndChicago - todayChicago) / msPerDay));

          // Count completions in this exact period (daily cap by Chicago day)
          const dailyCounts = {};
          for (const c of completions) {
            const cDate = c.date?.toDate ? c.date.toDate() : (c.toDate ? c.toDate() : new Date(c));
            if (cDate >= periodStart && cDate <= now) {
              const cChicago = toChicagoDate(cDate);
              const dayKey = cChicago.toDateString();
              dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
            }
          }

          // Sum capped daily completions
          let weeklyCompleted = 0;
          for (const count of Object.values(dailyCounts)) {
            weeklyCompleted += Math.min(count, dailyCap);
          }

          // Week 1 pro-rate: scale cap by dailyCap for Think Lists
          const isFirstWeek = weeksSinceAssigned === 0;
          const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
          const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
          const tasksRemaining = effectiveTarget - weeklyCompleted;
          const maxPerDay = dailyCap < 999 ? dailyCap : 1;
          const maxCanComplete = daysLeftIncludingToday * maxPerDay;
          const isBehind = tasksRemaining > maxCanComplete;

          // Check if this item is done for today (matches client isCompletedToday logic)
          const todayKey = todayChicago.toDateString();
          const todayCompletions = dailyCounts[todayKey] || 0;
          const rawDailyCap = hw.dailyCap; // undefined if not set
          const isDoneForToday = rawDailyCap ? (todayCompletions >= rawDailyCap) : (todayCompletions > 0);

          // "Critical" = will become behind if they skip today
          // If they don't do it today, remaining capacity = (daysLeftIncludingToday - 1) * maxPerDay
          const isCritical = !isBehind && tasksRemaining > 0 && tasksRemaining > ((daysLeftIncludingToday - 1) * maxPerDay);

          activeItemCount++;
          if (isDoneForToday || weeklyCompleted >= effectiveTarget) {
            doneForTodayCount++;
          }
          if (isDoneForToday) {
            anyDoneToday = true;
          }
          if (!isDoneForToday && weeklyCompleted < effectiveTarget) {
            // This item is undone today and not weekly-complete
            if (isBehind) behindNotDoneToday++;
            if (isCritical) criticalNotDoneToday++;
          }

          hwDetail.push({
            title: hw.title,
            weeklyTarget,
            effectiveTarget: effectiveTarget,
            dailyCap,
            weeklyCompleted,
            tasksRemaining,
            assigned: toChicagoDate(assignedDate).toLocaleDateString('en-CA'),
            weeksSinceAssigned,
            daysLeftIncludingToday,
            maxPerDay,
            periodStart: toChicagoDate(periodStart).toLocaleDateString('en-CA'),
            periodEnd: toChicagoDate(periodEnd).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
            isBehind,
            isFirstWeek,
            isComplete: weeklyCompleted >= effectiveTarget,
            isDoneForToday,
            completionsArray: Array.isArray(completions) ? completions.length : typeof completions
          });

          // Is this homework incomplete for the week?
          if (tasksRemaining > 0) {
            currentCount++;

            if (isBehind) {
              behindCount++;
            }

            // Track think list homework separately
            if (hw.type === 'thinklist') {
              thinkListIncomplete++;
            }
          }
        }

        // Determine what to send based on slot
        let message = '';
        let shouldSend = false;

        const userName = userData.name || counselee.name;

        // Check if user has completed all homework for today (nothing left to do)
        const allDoneForToday = activeItemCount > 0 && doneForTodayCount >= activeItemCount;
        const itemsInCurrent = activeItemCount - doneForTodayCount; // Items not done today and not weekly-complete
        const urgentUndone = behindNotDoneToday + criticalNotDoneToday; // Behind or critical AND not done today

        if (matchedSlot === 1) {
          // Slot 1: Morning overview — send if any items are in Current tab (not done for today)
          // See EMAIL-RULES.md rule 1
          if (itemsInCurrent > 0) {
            shouldSend = true;
            message = `Hi ${userName}! You have ${itemsInCurrent} homework item${itemsInCurrent > 1 ? 's' : ''} to complete today. Open your app: https://counselinghomework.com`;
          }
        } else {
          // Slots 2-3: Nudge reminders — see EMAIL-RULES.md rules 3-5
          // Rule 3: All done for today → SKIP (absolute gate)
          if (allDoneForToday) {
            diagnostics.push({ name: userName, reason: 'all_done_for_today', matchedSlot, activeItemCount, doneForTodayCount });
            continue;
          }

          // Rule 4: Any undone item is behind or critical → SEND
          if (urgentUndone > 0) {
            shouldSend = true;
            message = `Hi ${userName}! You have ${urgentUndone} homework item${urgentUndone > 1 ? 's' : ''} that need${urgentUndone === 1 ? 's' : ''} attention today. https://counselinghomework.com`;
          }
          // Otherwise: nothing urgent → SKIP (no "0 items" emails)
        }

        if (!shouldSend) {
          diagnostics.push({ name: userName, reason: 'shouldSend_false', matchedSlot, currentCount, behindCount, thinkListIncomplete, hwDetail });
          continue;
        }
        diagnostics.push({ name: userName, reason: 'sending', matchedSlot, currentCount, behindCount, thinkListIncomplete });

        // Send SMS
        let smsSent = false;
        if (wantsSms) {
          try {
            await sendSms(phone, message);
            smsCount++;
            smsSent = true;
          } catch (err) {
            console.error(`SMS FAILED for ${userName} (${phone}):`, err.message);
            errors.push({ type: 'sms', user: userName, error: err.message });
          }
        }

        // Send Email
        let emailSent = false;
        if (wantsEmail) {
          try {
            await sendEmail(email, userName, itemsInCurrent, thinkListIncomplete, urgentUndone, matchedSlot, matchedSlot === 1 ? hwDetail : null);
            emailCount++;
            emailSent = true;
          } catch (err) {
            console.error(`EMAIL FAILED for ${userName} (${email}):`, err.message);
            errors.push({ type: 'email', user: userName, error: err.message });
          }
        }

        // Only record dedup if at least one send succeeded
        if (smsSent || emailSent) {
          try {
            await db.doc(basePath).update({
              [`lastSlot${matchedSlot}Sent`]: todayStr
            });
          } catch (dedupErr) {
            console.error(`Failed to write dedup for ${userName}:`, dedupErr.message);
          }
        } else {
          console.error(`ALL SENDS FAILED for ${userName} — dedup NOT written, will retry next run`);
        }
    }

    console.log(`Reminders sent: ${smsCount} SMS, ${emailCount} emails, ${errors.length} errors`);

    // === COUNSELOR DAILY SUMMARY (fires at 11 PM Chicago) ===
    let summaryCount = 0;
    if (currentHour === '23') {
      const toChicagoDate = (d) => {
        const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
        return new Date(s);
      };
      const todayChicago = toChicagoDate(new Date());
      const todayKey = todayChicago.toDateString();
      const smsMsPerDay = 1000 * 60 * 60 * 24;
      const smsMsPerWeek = 7 * smsMsPerDay;

      const counselorUsersSnap = await db.collection('users').where('isCounselor', '==', true).get();

      for (const userDoc of counselorUsersSnap.docs) {
        const counselorId = userDoc.id;
        const counselorData = userDoc.data();

        // Dedup: only send once per day
        if (counselorData.lastSummarySent === todayStr) {
          diagnostics.push({ name: counselorData.name, reason: 'summary_dedup' });
          continue;
        }

        // Get counselor email from Firebase Auth
        let counselorEmail;
        try {
          const authUser = await admin.auth().getUser(counselorId);
          counselorEmail = authUser.email;
        } catch (e) {
          diagnostics.push({ name: counselorData.name, reason: 'summary_no_auth', error: e.message });
          continue;
        }

        const counseleesSnap = await db.collection(`counselors/${counselorId}/counselees`).get();
        if (counseleesSnap.empty) continue;

        const summaryData = [];

        for (const counseleeDoc of counseleesSnap.docs) {
          const c = counseleeDoc.data();
          if (c.status === 'inactive') continue;
          if (c.graduated) continue; // Skip graduated counselees from daily summary
          if (c.isSelf) continue; // Skip counselor's own self-counselor doc
          if (!c.uid) continue; // Skip counselees with no account (counselor-only tracking)

          const hwSnap = await db.collection(`counselors/${counselorId}/counselees/${counseleeDoc.id}/homework`).get();
          const hwItems = [];

          for (const hwDoc of hwSnap.docs) {
            const hw = hwDoc.data();
            if (hw.status === 'cancelled') continue;

            const weeklyTarget = hw.weeklyTarget || 7;
            const dailyCap = hw.dailyCap || 999;
            const assignedDate = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
            const completions = hw.completions || [];

            // Exact-timestamp periods (matches client-side HomeworkTile.jsx)
            const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / smsMsPerWeek));
            const periodStart = new Date(assignedDate.getTime() + weeksSinceAssigned * smsMsPerWeek);
            const periodEnd = new Date(periodStart.getTime() + smsMsPerWeek);
            const periodEndChicago = toChicagoDate(periodEnd);
            // Include today in remaining days (matches client-side isItemBehind)
            const daysLeftIncludingToday = Math.max(1, Math.floor((periodEndChicago - todayChicago) / smsMsPerDay));

            const dailyCounts = {};
            let completedToday = false;
            for (const comp of completions) {
              const cDate = comp.date?.toDate ? comp.date.toDate() : (comp.toDate ? comp.toDate() : new Date(comp));
              if (cDate >= periodStart && cDate <= now) {
                const cChicago = toChicagoDate(cDate);
                const dayKey2 = cChicago.toDateString();
                dailyCounts[dayKey2] = (dailyCounts[dayKey2] || 0) + 1;
              }
              const cChicago2 = toChicagoDate(cDate);
              if (cChicago2.toDateString() === todayKey) {
                completedToday = true;
              }
            }

            let weeklyCompleted = 0;
            for (const count of Object.values(dailyCounts)) {
              weeklyCompleted += Math.min(count, dailyCap);
            }

            const isFirstWeek = weeksSinceAssigned === 0;
            const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
            const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
            const tasksRemaining = effectiveTarget - weeklyCompleted;
            const maxPerDay = dailyCap < 999 ? dailyCap : 1;
            const maxCanComplete = daysLeftIncludingToday * maxPerDay;
            const isBehind = tasksRemaining > maxCanComplete;
            const isWeeklyComplete = weeklyCompleted >= effectiveTarget;

            hwItems.push({
              title: hw.title,
              completedToday,
              weeklyCompleted,
              effectiveTarget,
              isBehind,
              isWeeklyComplete
            });
          }

          if (hwItems.length > 0) {
            summaryData.push({ name: c.name, homework: hwItems });
          }
        }

        if (summaryData.length > 0) {
          const dateDisplay = chicagoTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
          try {
            await sendCounselorSummary(counselorEmail, counselorData.name || 'Counselor', summaryData, dateDisplay);
            summaryCount++;
            await db.doc(`users/${counselorId}`).update({ lastSummarySent: todayStr });
          } catch (err) {
            errors.push({ type: 'summary', counselor: counselorData.name, error: err.message });
          }
        }
      }
    }

    // === AP DAILY SUMMARY (fires at midnight Chicago — checks YESTERDAY's completions) ===
    let apSummaryCount = 0;
    if (currentHour === '00') {
      const toChicagoDateAP = (d) => {
        const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
        return new Date(s);
      };
      // At midnight, "today" just started — check YESTERDAY's activity instead
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayChicagoAP = toChicagoDateAP(yesterdayDate);
      const todayKeyAP = yesterdayChicagoAP.toDateString();
      const apMsPerDay = 1000 * 60 * 60 * 24;
      const apMsPerWeek = 7 * apMsPerDay;
      // Query ALL users (not just counselors) since any user can be an AP
      const allUsersSnap = await db.collection('users').get();

      for (const apDoc of allUsersSnap.docs) {
        const apData = apDoc.data();
        const apId = apDoc.id;

        // Skip users without watchingUsers
        if (!apData.watchingUsers || !Array.isArray(apData.watchingUsers) || apData.watchingUsers.length === 0) {
          continue;
        }

        // Dedup: only send once per day
        if (apData.lastAPSummaryDate === todayStr) {
          diagnostics.push({ name: apData.name, reason: 'ap_summary_dedup' });
          continue;
        }

        // Get AP email from user doc or Firebase Auth
        let apEmail = apData.email;
        if (!apEmail) {
          try {
            const authUser = await admin.auth().getUser(apId);
            apEmail = authUser.email;
          } catch (e) {
            diagnostics.push({ name: apData.name, reason: 'ap_no_email', error: e.message });
            continue;
          }
        }

        const apSummaryItems = [];

        for (const watchEntry of apData.watchingUsers) {
          // watchEntry can be a string (uid) or object with uid/dataPath
          const watchedUid = typeof watchEntry === 'string' ? watchEntry : watchEntry.uid;
          const dataPath = typeof watchEntry === 'object' ? watchEntry.dataPath : null;

          if (!watchedUid) continue;

          // Get watched user's name
          let watchedName = 'Unknown';
          let watchedUserData = null;
          try {
            const watchedUserDoc = await db.doc(`users/${watchedUid}`).get();
            if (watchedUserDoc.exists) {
              watchedUserData = watchedUserDoc.data();
              watchedName = watchedUserData.name || 'Unknown';
            }
          } catch (e) {
            // Fall back to Auth display name
            try {
              const authUser = await admin.auth().getUser(watchedUid);
              watchedName = authUser.displayName || authUser.email || 'Unknown';
            } catch (e2) {
              // skip
            }
          }

          // Skip watched users on vacation
          if (watchedUserData && watchedUserData.vacationStart && watchedUserData.vacationEnd) {
            const nowVac = new Date();
            const vacStart = watchedUserData.vacationStart.toDate ? watchedUserData.vacationStart.toDate() : new Date(watchedUserData.vacationStart);
            const vacEnd = watchedUserData.vacationEnd.toDate ? watchedUserData.vacationEnd.toDate() : new Date(watchedUserData.vacationEnd);
            if (nowVac >= vacStart && nowVac <= vacEnd) {
              diagnostics.push({ name: watchedName, reason: 'watched_user_on_vacation', ap: apData.name });
              continue;
            }
          }

          // Determine homework path - use dataPath if provided, otherwise self-counselor pattern
          const hwPath = dataPath
            ? `${dataPath}/homework`
            : `counselors/${watchedUid}/counselees/${watchedUid}/homework`;

          let hwSnap;
          try {
            hwSnap = await db.collection(hwPath).get();
          } catch (e) {
            diagnostics.push({ name: watchedName, reason: 'ap_hw_fetch_error', error: e.message });
            continue;
          }

          if (hwSnap.empty) continue;

          let completedTodayTotal = 0;
          let totalActiveItems = 0;
          let behindItems = 0;
          let allCompleteForWeek = true;

          for (const hwDoc of hwSnap.docs) {
            const hw = hwDoc.data();
            if (hw.status === 'cancelled') continue;

            totalActiveItems++;

            const weeklyTarget = hw.weeklyTarget || 7;
            const dailyCap = hw.dailyCap || 999;
            const assignedDate = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : new Date(hw.assignedDate || hw.createdAt?.toDate() || now);
            const completions = hw.completions || [];

            // Exact-timestamp periods (matches client-side HomeworkTile.jsx)
            const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedDate) / apMsPerWeek));
            const periodStart = new Date(assignedDate.getTime() + weeksSinceAssigned * apMsPerWeek);
            const periodEnd = new Date(periodStart.getTime() + apMsPerWeek);
            const periodEndChicago = toChicagoDateAP(periodEnd);
            // Include today in remaining days (email fires at midnight, full day still ahead)
            const daysLeftIncludingToday = Math.max(1, Math.floor((periodEndChicago - todayChicagoAP) / apMsPerDay));

            // Count completions in this exact period (daily cap by Chicago day)
            const dailyCounts = {};
            let completedToday = false;
            for (const comp of completions) {
              const cDate = comp.date?.toDate ? comp.date.toDate() : (comp.toDate ? comp.toDate() : new Date(comp));
              if (cDate >= periodStart && cDate <= now) {
                const cChicago = toChicagoDateAP(cDate);
                const dayKey = cChicago.toDateString();
                dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
              }
              const cChicago2 = toChicagoDateAP(cDate);
              if (cChicago2.toDateString() === todayKeyAP) {
                completedToday = true;
              }
            }

            // Sum capped daily completions
            let weeklyCompleted = 0;
            for (const count of Object.values(dailyCounts)) {
              weeklyCompleted += Math.min(count, dailyCap);
            }

            // Week 1 pro-rate (scale by dailyCap for Think Lists)
            const isFirstWeek = weeksSinceAssigned === 0;
            const maxFirstWeekCap = dailyCap < 999 ? 6 * dailyCap : 6;
            const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, maxFirstWeekCap) : weeklyTarget;
            const tasksRemaining = effectiveTarget - weeklyCompleted;
            const maxPerDay = dailyCap < 999 ? dailyCap : 1;
            const maxCanComplete = daysLeftIncludingToday * maxPerDay;
            const isBehind = tasksRemaining > maxCanComplete;
            const isWeeklyComplete = weeklyCompleted >= effectiveTarget;

            if (completedToday) completedTodayTotal++;
            if (isBehind) behindItems++;
            if (!isWeeklyComplete) allCompleteForWeek = false;
          }

          // Skip users with no active homework
          if (totalActiveItems === 0) continue;

          // Determine summary line for this watched user
          let summaryLine;
          if (allCompleteForWeek) {
            summaryLine = `${watchedName} has completed all homework for this week!`;
          } else if (behindItems > 0) {
            summaryLine = `${watchedName} is behind this week \u2014 missed ${behindItems} item${behindItems > 1 ? 's' : ''} that can't be caught up.`;
          } else if (completedTodayTotal > 0) {
            summaryLine = `${watchedName} did ${completedTodayTotal} homework today. On target for a successful week.`;
          } else {
            summaryLine = `${watchedName} didn't accomplish any homework today, but is on target for a successful week.`;
          }

          apSummaryItems.push(summaryLine);
        }

        // Only send if we have at least one watched user with active homework
        if (apSummaryItems.length > 0) {
          const dateDisplay = yesterdayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
          try {
            await sendAPSummary(apEmail, apData.name || 'Friend', apSummaryItems, dateDisplay);
            apSummaryCount++;
            await db.doc(`users/${apId}`).update({ lastAPSummaryDate: todayStr });
          } catch (err) {
            errors.push({ type: 'ap_summary', ap: apData.name, error: err.message });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      time: currentTime,
      smsCount,
      emailCount,
      summaryCount: summaryCount > 0 ? summaryCount : undefined,
      apSummaryCount: apSummaryCount > 0 ? apSummaryCount : undefined,
      errors: errors.length > 0 ? errors : undefined,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined
    });
  } catch (error) {
    console.error('Reminder error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Send SMS via Twilio
 */
async function sendSms(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error(`Twilio not configured - SID:${!!accountSid} Token:${!!authToken} MsgSvc:${!!messagingServiceSid}`);
  }

  // Format phone to E.164 (+1XXXXXXXXXX)
  const digits = phone.replace(/\D/g, '');
  const toNumber = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      To: toNumber,
      MessagingServiceSid: messagingServiceSid,
      Body: message
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'SMS send failed');
  }

  return response.json();
}

/**
 * Send Email via Resend
 */
async function sendEmail(email, name, currentCount, thinkListIncomplete = 0, behindCount = 0, slot = 1, hwDetail = null) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';

  if (!apiKey) {
    throw new Error('Resend not configured');
  }

  // Build subject and body based on slot number
  const ordinal = slot === 1 ? 'first' : slot === 2 ? 'second' : 'third';
  let subject, bodyText, detailHtml = '';

  if (slot === 1) {
    subject = `Homework Reminder: ${currentCount} item${currentCount > 1 ? 's' : ''} this week`;
    bodyText = `Here's your homework for today:`;

    // Build detailed homework breakdown for Slot 1
    if (hwDetail && hwDetail.length > 0) {
      const incomplete = hwDetail.filter(h => !h.isComplete);
      const complete = hwDetail.filter(h => h.isComplete);

      if (incomplete.length > 0) {
        detailHtml += '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">';
        for (const hw of incomplete) {
          // Urgency message — use working days needed (accounts for dailyCap)
          // Think lists with dailyCap=2 and 6 remaining only need 3 working days, not 6 calendar days
          let urgency;
          const workingDaysNeeded = Math.ceil(hw.tasksRemaining / hw.maxPerDay);
          const bufferDays = hw.daysLeftIncludingToday - workingDaysNeeded;
          if (hw.isBehind) {
            urgency = `<span style="color: #e53e3e; font-weight: 600;">Can't catch up this week</span>`;
          } else if (bufferDays === 0) {
            urgency = `<span style="color: #e53e3e; font-weight: 600;">If you miss today, you won't be able to catch up</span>`;
          } else if (bufferDays <= 2) {
            urgency = `<span style="color: #c05621;">${bufferDays} day${bufferDays !== 1 ? 's' : ''} of buffer left</span>`;
          } else {
            urgency = `<span style="color: #2c5282;">${hw.daysLeftIncludingToday} days left</span>`;
          }

          detailHtml += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px 0;">
                <strong>${hw.title}</strong><br/>
                <span style="font-size: 14px; color: #4a5568;">${hw.weeklyCompleted}/${hw.effectiveTarget} done &middot; Due ${hw.periodEnd} &middot; ${urgency}</span>
              </td>
            </tr>`;
        }
        detailHtml += '</table>';
      }

      if (complete.length > 0) {
        detailHtml += `<p style="color: #38a169; font-size: 14px; margin-top: 8px;">&#10003; ${complete.length} item${complete.length > 1 ? 's' : ''} complete this week — nice work!</p>`;
      }
    }
  } else if (thinkListIncomplete > 0) {
    subject = `Reminder #${slot}: Think List`;
    bodyText = `This is your <strong>${ordinal} reminder</strong> today. Time to review your think list${thinkListIncomplete > 1 ? 's' : ''}.`;
  } else {
    subject = `Reminder #${slot}: ${behindCount} item${behindCount > 1 ? 's' : ''} need attention`;
    bodyText = `This is your <strong>${ordinal} reminder</strong> today. You have <strong>${behindCount} homework item${behindCount > 1 ? 's' : ''}</strong> that need${behindCount === 1 ? 's' : ''} attention today to stay on track this week.`;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Counseling Homework <${fromEmail}>`,
      to: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c5282;">Homework Reminder${slot > 1 ? ' #' + slot : ''}</h2>
          <p>Hi ${name},</p>
          <p>${bodyText}</p>
          ${detailHtml}
          <p>
            <a href="https://counselinghomework.com"
               style="display: inline-block; background: #2c5282; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Open App
            </a>
          </p>
          <p style="color: #718096; font-size: 14px; margin-top: 24px;">
            You're receiving this because you enabled email reminders.
            Update your preferences in Account Settings.
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Email send failed');
  }

  return response.json();
}

/**
 * Send Counselor Daily Summary Email
 * One email per counselor showing all counselees' homework status
 */
async function sendCounselorSummary(email, counselorName, summaryData, dateDisplay) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';

  if (!apiKey) throw new Error('Resend not configured');

  // Build HTML rows grouped by counselee
  let counseleeRows = '';
  for (const counselee of summaryData) {
    const behindItems = counselee.homework.filter(h => h.isBehind).length;
    const completeItems = counselee.homework.filter(h => h.isWeeklyComplete).length;
    const totalItems = counselee.homework.length;

    let overallStatus, statusColor;
    if (behindItems > 0) {
      overallStatus = `${behindItems} behind`;
      statusColor = '#e53e3e';
    } else if (completeItems === totalItems) {
      overallStatus = 'All complete';
      statusColor = '#38a169';
    } else {
      overallStatus = 'On track';
      statusColor = '#2c5282';
    }

    counseleeRows += `
      <tr style="background: #edf2f7;">
        <td colspan="4" style="padding: 10px 12px; font-weight: bold; font-size: 15px;">
          ${counselee.name}
          <span style="color: ${statusColor}; font-weight: normal; font-size: 13px; margin-left: 8px;">${overallStatus}</span>
        </td>
      </tr>`;

    for (const hw of counselee.homework) {
      // Today column: ✓ = done today, X = can't catch up, blank = on track or complete
      const todayIcon = hw.completedToday
        ? '<span style="color: #38a169; font-size: 16px;">&#10003;</span>'
        : (hw.isBehind ? '<span style="color: #e53e3e; font-size: 16px;">&#10007;</span>' : '');
      const progress = `${hw.weeklyCompleted}/${hw.effectiveTarget}`;
      let status, sColor;
      if (hw.isWeeklyComplete) {
        status = 'Complete'; sColor = '#38a169';
      } else if (hw.isBehind) {
        status = "Can't catch up"; sColor = '#e53e3e';
      } else {
        status = 'On track'; sColor = '#2c5282';
      }

      counseleeRows += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 12px;">${hw.title}</td>
          <td style="padding: 6px 12px; text-align: center;">${todayIcon}</td>
          <td style="padding: 6px 12px; text-align: center;">${progress}</td>
          <td style="padding: 6px 12px; text-align: center; color: ${sColor}; font-weight: 600;">${status}</td>
        </tr>`;
    }
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c5282; margin-bottom: 4px;">Daily Summary</h2>
      <p style="color: #718096; margin-top: 0;">${dateDisplay}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #2c5282; color: white;">
            <th style="padding: 8px 12px; text-align: left;">Homework</th>
            <th style="padding: 8px 12px; text-align: center; width: 60px;">Today</th>
            <th style="padding: 8px 12px; text-align: center; width: 60px;">Week</th>
            <th style="padding: 8px 12px; text-align: center; width: 100px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${counseleeRows}
        </tbody>
      </table>
      <p style="margin-top: 16px;">
        <a href="https://counselinghomework.com"
           style="display: inline-block; background: #2c5282; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">
          Open App
        </a>
      </p>
      <p style="color: #718096; font-size: 12px; margin-top: 20px;">
        Sent nightly at 11 PM CT.
      </p>
    </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Counseling Homework <${fromEmail}>`,
      to: email,
      subject: `Daily Summary \u2014 ${dateDisplay}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Summary email send failed');
  }

  return response.json();
}

/**
 * Send AP Daily Summary Email
 * One email per accountability partner showing watched users' homework status
 */
async function sendAPSummary(email, apName, summaryItems, dateDisplay) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';

  if (!apiKey) throw new Error('Resend not configured');

  // Build bullet list HTML
  let bulletList = '';
  for (const item of summaryItems) {
    bulletList += `<li style="margin-bottom: 8px;">${item}</li>\n`;
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c5282; margin-bottom: 4px;">Accountability Partner Update</h2>
      <p style="color: #718096; margin-top: 0;">${dateDisplay}</p>
      <p>Hi ${apName},</p>
      <p>Here's how your accountability partners are doing:</p>
      <ul style="font-size: 14px; line-height: 1.6;">
        ${bulletList}
      </ul>
      <p>Keep encouraging them!</p>
      <p style="margin-top: 16px;">
        <a href="https://counselinghomework.com"
           style="display: inline-block; background: #2c5282; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">
          Open App
        </a>
      </p>
      <p style="color: #718096; font-size: 12px; margin-top: 20px;">
        - Counseling Homework<br>
        https://counselinghomework.com
      </p>
    </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Counseling Homework <${fromEmail}>`,
      to: email,
      subject: `Accountability Partner Update \u2014 ${dateDisplay}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'AP summary email send failed');
  }

  return response.json();
}
