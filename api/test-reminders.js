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

/**
 * Test Reminders API - Forces a send to verify Twilio + Resend work
 * Call with: GET /api/test-reminders?counselee=Robert+Tester
 * Sends one SMS + one email to the named counselee (or first found)
 */
export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.REMINDER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!db) return res.status(500).json({ error: 'Firebase not initialized' });

  const targetName = req.query.counselee || '';
  const results = { steps: [], errors: [] };

  try {
    // Find counselors
    const usersSnap = await db.collection('users').where('role', '==', 'counselor').get();
    results.steps.push(`Found ${usersSnap.size} counselor(s)`);

    let targetCounselee = null;
    let targetCounselorId = null;

    for (const userDoc of usersSnap.docs) {
      const counselorId = userDoc.id;
      const counseleesSnap = await db.collection(`counselors/${counselorId}/counselees`).get();

      for (const doc of counseleesSnap.docs) {
        const c = doc.data();
        if (targetName && c.name !== targetName) continue;
        if (!targetName && !targetCounselee) {
          // Take first counselee with reminders enabled
          if (c.smsReminders || c.emailReminders) {
            targetCounselee = c;
            targetCounselorId = counselorId;
          }
        } else if (c.name === targetName) {
          targetCounselee = c;
          targetCounselorId = counselorId;
        }
      }
    }

    if (!targetCounselee) {
      return res.status(404).json({ error: `Counselee not found: "${targetName || '(any with reminders)'}"`, ...results });
    }

    results.steps.push(`Target: ${targetCounselee.name}`);
    results.steps.push(`Phone: ${targetCounselee.phone || 'none'}`);
    results.steps.push(`Email: ${targetCounselee.email || 'none'}`);
    results.steps.push(`SMS enabled: ${targetCounselee.smsReminders}`);
    results.steps.push(`Email enabled: ${targetCounselee.emailReminders}`);

    const testMessage = `TEST: Hi ${targetCounselee.name}! This is a test reminder from Counseling Homework. If you see this, reminders are working! https://counselinghomework.com`;

    // Test SMS
    if (targetCounselee.smsReminders && targetCounselee.phone) {
      try {
        const smsResult = await sendSms(targetCounselee.phone, testMessage);
        results.steps.push(`SMS sent! SID: ${smsResult.sid}`);
      } catch (err) {
        results.errors.push({ type: 'sms', error: err.message });
        results.steps.push(`SMS FAILED: ${err.message}`);
      }
    } else {
      results.steps.push('SMS skipped (not enabled or no phone)');
    }

    // Test Email
    if (targetCounselee.emailReminders && targetCounselee.email) {
      try {
        const emailResult = await sendEmail(targetCounselee.email, targetCounselee.name);
        results.steps.push(`Email sent! ID: ${emailResult.id}`);
      } catch (err) {
        results.errors.push({ type: 'email', error: err.message });
        results.steps.push(`Email FAILED: ${err.message}`);
      }
    } else {
      results.steps.push('Email skipped (not enabled or no email)');
    }

    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    return res.status(500).json({ error: error.message, ...results });
  }
}

async function sendSms(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error(`Twilio not configured - SID:${!!accountSid} Token:${!!authToken} MsgSvc:${!!messagingServiceSid}`);
  }

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

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `SMS failed: ${response.status}`);
  }
  return data;
}

async function sendEmail(email, name) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';

  if (!apiKey) {
    throw new Error('Resend not configured');
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
      subject: 'TEST - Reminder System Verification',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c5282;">Test Reminder</h2>
          <p>Hi ${name},</p>
          <p>This is a <strong>test message</strong> to verify the reminder system is working correctly.</p>
          <p>If you received this, both the email delivery and the reminder engine are functioning.</p>
          <p>
            <a href="https://counselinghomework.com"
               style="display: inline-block; background: #2c5282; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Open App
            </a>
          </p>
          <p style="color: #718096; font-size: 14px; margin-top: 24px;">This is a test - no action needed.</p>
        </div>
      `
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Email failed: ${response.status}`);
  }
  return data;
}
