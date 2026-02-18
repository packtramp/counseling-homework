import { Resend } from 'resend';
import admin from 'firebase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: verify Firebase ID token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let callerUid;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    callerUid = decodedToken.uid;
  } catch (authErr) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { recipientUid, type, message } = req.body;

    // Validate required fields
    if (!recipientUid || !type) {
      return res.status(400).json({ error: 'Missing required fields: recipientUid, type' });
    }

    // Validate type
    if (!['cheer', 'nudge', 'message'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be: cheer, nudge, or message' });
    }

    // Message required for message type, max 500 chars
    if (type === 'message' && (!message || !message.trim())) {
      return res.status(400).json({ error: 'Message text required for message type' });
    }
    if (message && message.length > 500) {
      return res.status(400).json({ error: 'Message must be 500 characters or less' });
    }

    // Can't encourage yourself
    if (callerUid === recipientUid) {
      return res.status(400).json({ error: 'Cannot send encouragement to yourself' });
    }

    const db = admin.firestore();

    // Rate limit: 1 per type per recipient per day (Chicago timezone)
    const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const todayStart = new Date(chicagoNow);
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC for Firestore query
    const utcNow = new Date();
    const chicagoOffset = utcNow.getTime() - new Date(utcNow.toLocaleString('en-US', { timeZone: 'America/Chicago' })).getTime();
    const todayStartUtc = new Date(todayStart.getTime() + chicagoOffset);

    const existingQuery = await db.collection('encouragements')
      .where('senderUid', '==', callerUid)
      .where('recipientUid', '==', recipientUid)
      .where('type', '==', type)
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStartUtc))
      .get();

    if (!existingQuery.empty) {
      return res.status(429).json({ error: `Already sent a ${type} to this person today` });
    }

    // Authorization: sender must be AP watcher OR counselor of recipient
    const senderDoc = await db.collection('users').doc(callerUid).get();
    const senderData = senderDoc.exists ? senderDoc.data() : {};
    const senderName = senderData.name || 'Someone';

    const isAPWatcher = (senderData.watchingUsers || []).some(w => w.uid === recipientUid);

    let isCounselor = false;
    if (senderData.isCounselor) {
      const counseleesSnap = await db.collection('counselors').doc(callerUid).collection('counselees')
        .where('uid', '==', recipientUid).get();
      isCounselor = !counseleesSnap.empty;
    }

    if (!isAPWatcher && !isCounselor) {
      return res.status(403).json({ error: 'Not authorized to encourage this user' });
    }

    // Look up recipient
    const recipientDoc = await db.collection('users').doc(recipientUid).get();
    if (!recipientDoc.exists) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    const recipientData = recipientDoc.data();
    const recipientName = recipientData.name || 'Friend';
    const recipientEmail = recipientData.email;

    // Write encouragement doc
    await db.collection('encouragements').add({
      type,
      senderUid: callerUid,
      senderName,
      recipientUid,
      recipientName,
      recipientEmail: recipientEmail || '',
      message: type === 'message' ? message.trim() : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send email if recipient has email
    if (recipientEmail) {
      const emailTemplates = {
        cheer: {
          subject: `👍 ${senderName} cheered you on!`,
          body: `<p>${escapeHtml(senderName)} noticed your hard work on Counseling Homework and sent you a cheer! Keep it up &mdash; your faithfulness matters.</p>`
        },
        nudge: {
          subject: `👊 ${senderName} sent you a fist bump`,
          body: `<p>${escapeHtml(senderName)} is thinking of you and wants to encourage you to stay on track. You've got this!</p>`
        },
        message: {
          subject: `💬 ${senderName} sent you a message`,
          body: `<p>${escapeHtml(senderName)} says:</p><blockquote style="border-left: 3px solid #3182ce; padding-left: 12px; margin: 12px 0; color: #2d3748; font-style: italic;">${escapeHtml(message?.trim() || '')}</blockquote>`
        }
      };

      const template = emailTemplates[type];
      await resend.emails.send({
        from: 'Counseling Homework <noreply@counselinghomework.com>',
        to: recipientEmail,
        subject: template.subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c5282;">${template.subject}</h2>
            <p>Hi ${escapeHtml(recipientName)},</p>
            ${template.body}
            <div style="margin: 2rem 0; text-align: center;">
              <a href="https://counselinghomework.com" style="background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 1.1rem;">Open App</a>
            </div>
            <p style="color: #999; font-size: 0.8rem; text-align: center;">
              You're receiving this because someone encouraged you on Counseling Homework.
            </p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true, type, recipientName });
  } catch (error) {
    console.error('Send encouragement error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send encouragement' });
  }
}
