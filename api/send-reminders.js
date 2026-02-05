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
    // Find counselors from users collection (counselors collection may not have parent docs)
    const usersSnap = await db.collection('users').where('role', '==', 'counselor').get();
    let smsCount = 0;
    let emailCount = 0;
    let errors = [];
    let diagnostics = [];

    for (const userDoc of usersSnap.docs) {
      const counselorId = userDoc.id;
      const counseleesSnap = await db.collection(`counselors/${counselorId}/counselees`).get();

      for (const counseleeDoc of counseleesSnap.docs) {
        const counselee = counseleeDoc.data();

        // Check what's enabled
        const wantsSms = counselee.smsReminders && counselee.phone;
        const wantsEmail = counselee.emailReminders && counselee.email;
        if (!wantsSms && !wantsEmail) continue;

        // Check schedule for today - match by HOUR (not exact minute) for reliability
        // Picks the first slot matching this hour that hasn't been sent yet (dedup-aware)
        const getHour = (timeStr) => timeStr ? timeStr.split(':')[0] : null;
        let matchedSlot = null;
        if (counselee.reminderSchedule && counselee.reminderSchedule[currentDay]) {
          const todaySchedule = counselee.reminderSchedule[currentDay];
          for (const slotNum of [1, 2, 3]) {
            if (getHour(todaySchedule[`slot${slotNum}`]) === currentHour) {
              if (counselee[`lastSlot${slotNum}Sent`] !== todayStr) {
                matchedSlot = slotNum;
                break;
              }
            }
          }
        } else if (getHour(counselee.reminderTime) === currentHour) {
          if (counselee.lastSlot1Sent !== todayStr) {
            matchedSlot = 1;
          }
        }

        if (!matchedSlot) {
          diagnostics.push({ name: counselee.name, reason: 'no_slot_match', currentHour, slots: counselee.reminderSchedule?.[currentDay], dedup: { slot1: counselee.lastSlot1Sent, slot2: counselee.lastSlot2Sent, slot3: counselee.lastSlot3Sent } });
          continue;
        }

        // Get all active homework
        const homeworkSnap = await db.collection(`counselors/${counselorId}/counselees/${counseleeDoc.id}/homework`).get();

        // Chicago timezone helpers
        const toChicagoDate = (d) => {
          const s = d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
          return new Date(s);
        };
        const todayChicago = toChicagoDate(new Date());
        const msPerDay = 1000 * 60 * 60 * 24;
        const msPerWeek = 7 * msPerDay;
        const tomorrowChicago = new Date(todayChicago.getTime() + msPerDay);

        // Analyze each homework item
        let currentCount = 0;  // Incomplete for the week
        let behindCount = 0;   // Can't catch up if today is skipped
        let thinkListIncomplete = 0;
        let hwDetail = [];

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

          // Calendar days remaining after today (Chicago time) for behind calc
          const periodEndChicago = toChicagoDate(periodEnd);
          const daysLeftAfterToday = Math.max(0, Math.floor((periodEndChicago - tomorrowChicago) / msPerDay));

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

          // Week 1 pro-rate: assignment night doesn't count as a full day
          const isFirstWeek = weeksSinceAssigned === 0;
          const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, 6) : weeklyTarget;
          const tasksRemaining = effectiveTarget - weeklyCompleted;
          const isBehind = tasksRemaining > daysLeftAfterToday;

          hwDetail.push({
            title: hw.title,
            weeklyTarget,
            weeklyCompleted,
            tasksRemaining,
            assigned: toChicagoDate(assignedDate).toLocaleDateString('en-CA'),
            weeksSinceAssigned,
            daysLeftAfterToday,
            periodStart: toChicagoDate(periodStart).toLocaleDateString('en-CA'),
            periodEnd: toChicagoDate(periodEnd).toLocaleDateString('en-CA'),
            isBehind,
            isFirstWeek,
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

        if (matchedSlot === 1) {
          // Main reminder - send if ANY homework is in Current (incomplete for week)
          if (currentCount > 0) {
            shouldSend = true;
            message = `Hi ${counselee.name}! You have ${currentCount} homework item${currentCount > 1 ? 's' : ''} to complete this week. Open your app: https://counselinghomework.com`;
          }
        } else {
          // Slots 2-3: Only send if Think List homework incomplete OR any homework is "behind"
          if (thinkListIncomplete > 0) {
            shouldSend = true;
            message = `Hi ${counselee.name}! Time to review your think list${thinkListIncomplete > 1 ? 's' : ''}. Open your app: https://counselinghomework.com`;
          } else if (behindCount > 0) {
            // Behind reminder - they'll miss their target if they skip today
            shouldSend = true;
            message = `Hi ${counselee.name}! Heads up: you have ${behindCount} homework item${behindCount > 1 ? 's' : ''} that need${behindCount === 1 ? 's' : ''} attention today to stay on track. https://counselinghomework.com`;
          }
        }

        if (!shouldSend) {
          diagnostics.push({ name: counselee.name, reason: 'shouldSend_false', matchedSlot, currentCount, behindCount, thinkListIncomplete, hwDetail });
          continue;
        }
        diagnostics.push({ name: counselee.name, reason: 'sending', matchedSlot, currentCount, behindCount, thinkListIncomplete });

        // Send SMS
        if (wantsSms) {
          try {
            await sendSms(counselee.phone, message);
            smsCount++;
          } catch (err) {
            errors.push({ type: 'sms', counselee: counselee.name, error: err.message });
          }
        }

        // Send Email
        if (wantsEmail) {
          try {
            await sendEmail(counselee.email, counselee.name, currentCount, thinkListIncomplete, behindCount, matchedSlot);
            emailCount++;
          } catch (err) {
            errors.push({ type: 'email', counselee: counselee.name, error: err.message });
          }
        }

        // Record dedup timestamp so we don't re-send for this slot today
        try {
          await db.doc(`counselors/${counselorId}/counselees/${counseleeDoc.id}`).update({
            [`lastSlot${matchedSlot}Sent`]: todayStr
          });
        } catch (dedupErr) {
          console.error(`Failed to write dedup for ${counselee.name}:`, dedupErr.message);
        }
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
      const summaryTomorrowChicago = new Date(todayChicago.getTime() + smsMsPerDay);

      for (const userDoc of usersSnap.docs) {
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
            const daysLeftAfterToday = Math.max(0, Math.floor((periodEndChicago - summaryTomorrowChicago) / smsMsPerDay));

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
            const effectiveTarget = isFirstWeek ? Math.min(weeklyTarget, 6) : weeklyTarget;
            const tasksRemaining = effectiveTarget - weeklyCompleted;
            const isBehind = tasksRemaining > daysLeftAfterToday;
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

    return res.status(200).json({
      success: true,
      time: currentTime,
      smsCount,
      emailCount,
      summaryCount: summaryCount > 0 ? summaryCount : undefined,
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
async function sendEmail(email, name, currentCount, thinkListIncomplete = 0, behindCount = 0, slot = 1) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';

  if (!apiKey) {
    throw new Error('Resend not configured');
  }

  // Build subject and body based on slot number
  const ordinal = slot === 1 ? 'first' : slot === 2 ? 'second' : 'third';
  let subject, bodyText;

  if (slot === 1) {
    // Main daily reminder - incomplete for the week
    subject = `Reminder #${slot}: ${currentCount} homework item${currentCount > 1 ? 's' : ''} this week`;
    bodyText = `This is your <strong>${ordinal} reminder</strong> today. You have <strong>${currentCount} homework item${currentCount > 1 ? 's' : ''}</strong> to complete this week.`;
  } else if (thinkListIncomplete > 0) {
    // Think list reminder (slots 2-3)
    subject = `Reminder #${slot}: Think List`;
    bodyText = `This is your <strong>${ordinal} reminder</strong> today. Time to review your think list${thinkListIncomplete > 1 ? 's' : ''}.`;
  } else {
    // Behind reminder (slots 2-3) - need to do these today to stay on track
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
          <h2 style="color: #2c5282;">Homework Reminder #${slot}</h2>
          <p>Hi ${name},</p>
          <p>${bodyText}</p>
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
