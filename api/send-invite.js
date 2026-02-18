import { Resend } from 'resend';
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
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    } catch (initError) {
      console.error('Firebase Admin init error:', initError.message);
    }
  }
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Twilio config (optional)
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: verify caller is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let callerUid;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    callerUid = decoded.uid;
  } catch (authErr) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Rate limit: 10 invites per user per hour
  try {
    const rlDb = admin.firestore();
    const rlRef = rlDb.doc(`rateLimits/${callerUid}_invite`);
    const rlDoc = await rlRef.get();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    if (rlDoc.exists) {
      const rl = rlDoc.data();
      if (now - rl.windowStart < oneHour && rl.count >= 10) {
        return res.status(429).json({ error: 'Too many invites. Try again later.' });
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
    const { email, name, phone, inviterName } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const results = { email: false, sms: false };

    // Send email invite via Resend
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'GCC Counseling <noreply@counselinghomework.com>',
        to: email,
        subject: `${inviterName || 'Someone'} invited you to Counseling Homework`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited!</h2>
            <p>Hello${name ? ` ${name}` : ''}!</p>
            <p><strong>${inviterName || 'Someone'}</strong> has invited you to be accountability partners on Counseling Homework.</p>
            <p>This app helps you track your progress on counseling homework, journaling, and personal growth - with accountability partners who can encourage you along the way.</p>
            <p style="margin: 2rem 0;">
              <a href="https://counselinghomework.com/login?signup=true" style="background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Create Your Free Account
              </a>
            </p>
            <p style="color: #666; font-size: 0.9rem;">
              After creating your account, ask ${inviterName || 'them'} to add you as an accountability partner using your email address.
            </p>
          </div>
        `
      });
      results.email = true;
    }

    // Send SMS invite via Twilio (optional)
    if (phone && twilioAccountSid && twilioAuthToken && twilioMessagingServiceSid) {
      try {
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
          cleanPhone = '+1' + cleanPhone;
        } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
          cleanPhone = '+' + cleanPhone;
        }

        if (cleanPhone.length >= 11) {
          const twilioClient = (await import('twilio')).default;
          const client = twilioClient(twilioAccountSid, twilioAuthToken);

          await client.messages.create({
            messagingServiceSid: twilioMessagingServiceSid,
            to: cleanPhone,
            body: `Hello${name ? ` ${name}` : ''}! ${inviterName || 'Someone'} has invited you to be accountability partners at www.counselinghomework.com. Create an account to get started!`
          });
          results.sms = true;
        }
      } catch (smsErr) {
        console.error('SMS error:', smsErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      emailSent: results.email,
      smsSent: results.sms
    });
  } catch (error) {
    console.error('Send invite error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send invite' });
  }
}
