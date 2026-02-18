import { Resend } from 'resend';
import admin from 'firebase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

// Twilio config (optional - parked on A2P but ready)
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: verify caller is authenticated and matches requesterUid
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

  // Rate limit: 10 partner requests per user per hour
  try {
    const rlDb = admin.firestore();
    const rlRef = rlDb.doc(`rateLimits/${callerUid}_partner`);
    const rlDoc = await rlRef.get();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    if (rlDoc.exists) {
      const rl = rlDoc.data();
      if (now - rl.windowStart < oneHour && rl.count >= 10) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
      }
      if (now - rl.windowStart >= oneHour) {
        await rlRef.set({ count: 1, windowStart: now });
      } else {
        await rlRef.update({ count: admin.firestore.FieldValue.increment(1) });
      }
    } else {
      await rlRef.set({ count: 1, windowStart: now });
    }
  } catch (rlErr) {
    console.error('Rate limit check error:', rlErr.message);
  }

  try {
    const { requesterUid, requesterName, requesterEmail, requesterDataPath, targetUid, targetName, targetEmail } = req.body;

    if (!requesterUid || !targetUid || !targetEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify caller is the requester (prevent spoofing)
    if (callerUid !== requesterUid) {
      return res.status(403).json({ error: 'Forbidden - UID mismatch' });
    }

    // Generate a unique token
    const token = crypto.randomUUID();

    // Store the partner request in Firestore
    const db = admin.firestore();
    await db.collection('partnerRequests').doc(token).set({
      requesterUid,
      requesterName: requesterName || 'Someone',
      requesterEmail: requesterEmail || '',
      requesterDataPath: requesterDataPath || `counselors/${requesterUid}/counselees/${requesterUid}`,
      targetUid,
      targetName: targetName || '',
      targetEmail,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send email - directs to dashboard where invite tile will appear
    await resend.emails.send({
      from: 'GCC Counseling <noreply@counselinghomework.com>',
      to: targetEmail,
      subject: `${requesterName} wants to be your accountability partner`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Accountability Partner Request</h2>
          <p>Hello${targetName ? ` ${targetName}` : ''}!</p>
          <p><strong>${requesterName}</strong> wants to be your accountability partner on Counseling Homework.</p>
          <p>If you accept, you'll both be able to view each other's homework progress, journals, and activity to encourage one another.</p>
          <div style="margin: 2rem 0; text-align: center;">
            <a href="https://counselinghomework.com" style="background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 1.1rem;">View Your Dashboard</a>
          </div>
          <p style="color: #666; font-size: 0.85rem;">
            Log in to accept or decline this request from your dashboard.
          </p>
        </div>
      `
    });

    // Send SMS if target has a phone number on their profile
    if (twilioAccountSid && twilioAuthToken && twilioMessagingServiceSid) {
      try {
        const targetUserDoc = await db.collection('users').doc(targetUid).get();
        const targetProfile = targetUserDoc.exists ? targetUserDoc.data() : {};
        const phone = targetProfile.phone;
        if (phone) {
          let cleanPhone = phone.replace(/\D/g, '');
          if (cleanPhone.length === 10) cleanPhone = '+1' + cleanPhone;
          else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) cleanPhone = '+' + cleanPhone;

          if (cleanPhone.length >= 11) {
            const twilioClient = (await import('twilio')).default;
            const client = twilioClient(twilioAccountSid, twilioAuthToken);
            await client.messages.create({
              messagingServiceSid: twilioMessagingServiceSid,
              to: cleanPhone,
              body: `${requesterName || 'Someone'} wants to be your accountability partner on Counseling Homework. Check your email to accept or decline.`
            });
          }
        }
      } catch (smsErr) {
        console.error('Partner request SMS error:', smsErr.message);
      }
    }

    return res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('Send partner request error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send partner request' });
  }
}
