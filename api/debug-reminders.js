import admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n');
  }
  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
      });
    } catch (e) { /* already initialized */ }
  }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.REMINDER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!db) return res.status(500).json({ error: 'Firebase not initialized' });

  const now = new Date();
  const chicagoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const currentTime = chicagoTime.getHours().toString().padStart(2, '0') + ':' + chicagoTime.getMinutes().toString().padStart(2, '0');
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[chicagoTime.getDay()];

  // Handle clearDedup request
  const clearDedup = req.query?.clearDedup === 'true';
  const clearResults = [];

  const results = [];

  // Check users collection to find counselors
  const usersSnap = await db.collection('users').get();
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Find counselor UIDs from users collection
  const counselorUsers = allUsers.filter(u => u.role === 'counselor');
  const counselorIds = counselorUsers.map(u => u.id);

  for (const counselorUser of counselorUsers) {
    const counselorId = counselorUser.id;
    const counseleesSnap = await db.collection(`counselors/${counselorId}/counselees`).get();

    // Chicago timezone helpers
    const toChicagoDate = (d) => {
      const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
      return new Date(s);
    };
    const todayChicago = toChicagoDate(new Date());
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerWeek = 7 * msPerDay;
    const tomorrowChicago = new Date(todayChicago.getTime() + msPerDay);

    for (const counseleeDoc of counseleesSnap.docs) {
      const c = counseleeDoc.data();

      // Clear dedup fields if requested
      if (clearDedup) {
        const updates = {};
        if (c.lastSlot1Sent) updates.lastSlot1Sent = admin.firestore.FieldValue.delete();
        if (c.lastSlot2Sent) updates.lastSlot2Sent = admin.firestore.FieldValue.delete();
        if (c.lastSlot3Sent) updates.lastSlot3Sent = admin.firestore.FieldValue.delete();
        if (Object.keys(updates).length > 0) {
          await counseleeDoc.ref.update(updates);
          clearResults.push({ name: c.name, cleared: Object.keys(updates) });
        }
      }

      const hwSnap = await db.collection(`counselors/${counselorId}/counselees/${counseleeDoc.id}/homework`).get();
      const hwItems = hwSnap.docs.map(d => {
        const hw = d.data();
        const completions = hw.completions || [];
        const weeklyTarget = hw.weeklyTarget || 7;
        const dailyCap = hw.dailyCap || 999;
        const assignedRaw = hw.assignedDate?.toDate ? hw.assignedDate.toDate() : (hw.assignedDate ? new Date(hw.assignedDate) : hw.createdAt?.toDate ? hw.createdAt.toDate() : now);

        // Exact-timestamp periods (matches client-side HomeworkTile.jsx)
        const weeksSinceAssigned = Math.max(0, Math.floor((now - assignedRaw) / msPerWeek));
        const periodStart = new Date(assignedRaw.getTime() + weeksSinceAssigned * msPerWeek);
        const periodEnd = new Date(periodStart.getTime() + msPerWeek);
        const periodEndChicago = toChicagoDate(periodEnd);
        const daysLeftAfterToday = Math.max(0, Math.floor((periodEndChicago - tomorrowChicago) / msPerDay));
        const daysSinceAssigned = Math.floor((now - assignedRaw) / msPerDay);

        // Count completions in this exact period
        const dailyCounts = {};
        for (const c2 of completions) {
          const cDate = c2.date?.toDate ? c2.date.toDate() : (c2.toDate ? c2.toDate() : new Date(c2));
          if (cDate >= periodStart && cDate <= now) {
            const cChicago = toChicagoDate(cDate);
            const dayKey = cChicago.toDateString();
            dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1;
          }
        }
        let weeklyCompleted = 0;
        for (const count of Object.values(dailyCounts)) {
          weeklyCompleted += Math.min(count, dailyCap);
        }
        const isFirstWeek = weeksSinceAssigned === 0;
        const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, 6) : weeklyTarget;
        const tasksRemaining = effectiveTarget - weeklyCompleted;
        const isBehind = tasksRemaining > daysLeftAfterToday;

        return {
          title: hw.title,
          status: hw.status,
          type: hw.type,
          weeklyTarget,
          effectiveTarget,
          dailyCap: hw.dailyCap || null,
          assignedDate: toChicagoDate(assignedRaw).toLocaleDateString('en-CA'),
          periodStart: toChicagoDate(periodStart).toLocaleDateString('en-CA'),
          periodEnd: toChicagoDate(periodEnd).toLocaleDateString('en-CA'),
          daysSinceAssigned,
          weeksSinceAssigned,
          daysLeftAfterToday,
          weeklyCompleted,
          tasksRemaining,
          isBehind,
          isFirstWeek,
          totalCompletions: completions.length,
          completionDates: completions.slice(-10).map(c2 => {
            const cDate = c2.date?.toDate ? c2.date.toDate() : (c2.toDate ? c2.toDate() : new Date(c2));
            return cDate.toLocaleString('en-US', { timeZone: 'America/Chicago' });
          })
        };
      });

      results.push({
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        smsReminders: c.smsReminders || false,
        emailReminders: c.emailReminders || false,
        reminderTime: c.reminderTime || null,
        reminderSchedule: c.reminderSchedule || null,
        status: c.status,
        homework: hwItems
      });
    }
  }

  return res.status(200).json({
    dedupCleared: clearDedup ? clearResults : undefined,
    serverTime: now.toISOString(),
    chicagoTime: chicagoTime.toISOString(),
    currentTime,
    currentDay,
    counselorCount: counselorUsers.length,
    counselorIds,
    usersCount: usersSnap.size,
    counselorUsers: counselorUsers.map(u => ({ id: u.id, name: u.name, role: u.role })),
    allUsers: allUsers.map(u => ({ id: u.id, name: u.name, role: u.role, counselorId: u.counselorId })),
    counselees: results
  });
}
