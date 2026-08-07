import admin from 'firebase-admin';
import { Resend } from 'resend';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Handle various private key formats from Vercel env vars
  if (privateKey) {
    // Replace escaped newlines with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    // Also handle double-escaped newlines
    privateKey = privateKey.replace(/\\\\n/g, '\n');
  }

  console.log('Firebase Admin init check:', {
    hasProjectId: !!projectId,
    hasClientEmail: !!clientEmail,
    hasPrivateKey: !!privateKey,
    privateKeyStart: privateKey ? privateKey.substring(0, 50) : 'MISSING',
    privateKeyLength: privateKey ? privateKey.length : 0
  });

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase Admin credentials');
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('Firebase Admin initialized successfully');
    } catch (initError) {
      console.error('Firebase Admin init error:', initError.message);
    }
  }
}

/**
 * Server-side provisioning of a counselee's user profile + counseleeLink.
 *
 * WHY (2026-08-03 security review): these documents carry the PRIVILEGED fields
 * (`counselorId`, `counseleeDocId`, `role`, `approved`) that decide who may read a
 * person's counseling content. While the CLIENT writes them, the Firestore rules must
 * stay permissive enough to allow it — which is exactly what let a user self-grant
 * privileged fields. Moving the write here lets the rules lock the client out entirely.
 *
 * AUTHORIZATION: the caller must OWN the counselee record being provisioned —
 * `counselors/{callerUid}/counselees/{counseleeDocId}` must exist AND its `uid` must
 * match (or be unset). A caller cannot name someone else's counselee, nor invent a
 * binding with no record behind it.
 *
 * NOTE: deliberately does NOT auto-bind a self-signup to a counselor — that requires
 * the invitee's consent and is handled separately.
 */
const PRIVILEGED = ['role', 'counselorId', 'counseleeDocId', 'approved', 'isAdmin', 'isSuperAdmin', 'isCounselor'];

async function handleProvision(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let callerUid;
  try {
    callerUid = (await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1])).uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { counseleeUid, counseleeDocId, profile = {} } = req.body || {};
  if (!counseleeUid || !counseleeDocId) {
    return res.status(400).json({ error: 'Missing counseleeUid or counseleeDocId' });
  }

  try {
    const db = admin.firestore();

    // AUTHORIZATION: caller must own this counselee record, and it must point at the
    // user being provisioned. This is what makes the binding trustworthy.
    const recRef = db.doc(`counselors/${callerUid}/counselees/${counseleeDocId}`);
    const rec = await recRef.get();
    if (!rec.exists) {
      return res.status(403).json({ error: 'Not your counselee record' });
    }
    if (rec.data().uid && rec.data().uid !== counseleeUid) {
      return res.status(403).json({ error: 'Counselee record points at a different user' });
    }

    // Strip anything privileged the client tried to send; the server sets those itself.
    const safeProfile = {};
    for (const [k, v] of Object.entries(profile)) {
      if (!PRIVILEGED.includes(k)) safeProfile[k] = v;
    }

    const email = (safeProfile.email || rec.data().email || '').toLowerCase();

    await db.collection('users').doc(counseleeUid).set({
      ...safeProfile,
      email,
      role: 'counselee',
      counselorId: callerUid,
      counseleeDocId,
      approved: true, // counselor-invited = already vetted
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (!rec.data().uid) await recRef.update({ uid: counseleeUid });

    if (email) {
      await db.collection('counseleeLinks').doc(email.replace(/[.]/g, '_')).set({
        counselorId: callerUid,
        counseleeDocId,
        email,
        name: safeProfile.name || rec.data().name || '',
      });
    }

    const callerRef = db.collection('users').doc(callerUid);
    const caller = await callerRef.get();
    if (caller.exists && !caller.data().isCounselor) {
      await callerRef.update({ isCounselor: true });
    }

    return res.status(200).json({ success: true, uid: counseleeUid });
  } catch (error) {
    console.error('provision error:', error.message);
    return res.status(500).json({ error: 'Failed to provision counselee' });
  }
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if Firebase Admin was initialized
  if (!admin.apps.length) {
    return res.status(500).json({
      error: 'Firebase Admin not initialized',
      hint: 'Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY env vars in Vercel'
    });
  }

  // action:'provision' — write the counselee's user doc + counseleeLink SERVER-SIDE.
  // Folded into this endpoint rather than its own file because the Vercel Hobby plan
  // caps a deployment at 12 Serverless Functions and we are at the limit.
  if (req.body?.action === 'provision') {
    return handleProvision(req, res);
  }

  const { email, password, counselorId, name } = req.body;

  if (!email || !password || !counselorId) {
    return res.status(400).json({ error: 'Missing required fields', received: { email: !!email, password: !!password, counselorId: !!counselorId } });
  }

  // Verify the request is from an authenticated counselor
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - no bearer token' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    console.log('Verifying token...');
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('Token verified for:', decodedToken.uid);

    // Verify the caller is the counselor
    if (decodedToken.uid !== counselorId) {
      return res.status(403).json({ error: 'Forbidden - UID mismatch' });
    }

    // Verify caller exists — any authenticated user can add counselees
    const db = admin.firestore();
    const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!callerDoc.exists) {
      return res.status(403).json({ error: 'Forbidden - user not found' });
    }

    // Auto-promote to counselor when adding first counselee
    if (!callerDoc.data().isCounselor) {
      await db.collection('users').doc(decodedToken.uid).update({ isCounselor: true });
      console.log('Auto-promoted user to counselor:', decodedToken.uid);
    }

    // Create the user
    console.log('Creating user:', email);
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    console.log('User created:', userRecord.uid);

    // Auto-verify email for counselor-created accounts (they skip EmailVerifyGate)
    await admin.auth().updateUser(userRecord.uid, { emailVerified: true });
    console.log('Email auto-verified for counselor-created account:', userRecord.uid);

    // Send welcome email with login credentials
    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const greeting = name ? `Hi ${name},` : 'Hi,';
        await resend.emails.send({
          from: 'GCC Counseling <noreply@counselinghomework.com>',
          to: email,
          subject: 'Welcome to GCC Counseling Homework',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Welcome to GCC Counseling Homework!</h2>
              <p>${greeting}</p>
              <p>An account has been created for you on the GCC Counseling Homework app.</p>
              <p><strong>Your login details:</strong></p>
              <ul>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Temporary Password:</strong> ${password}</li>
              </ul>
              <p>Please log in at <a href="https://counselinghomework.com">counselinghomework.com</a> and change your password in Account Settings.</p>
              <p><strong>Reminders:</strong> Once you log in for the first time, email and text (SMS) homework reminders will turn on automatically. If you'd rather not receive them, you can turn off email and/or text reminders anytime in <strong>Account Settings</strong>.</p>
              <p>If you have any questions, please contact your counselor.</p>
              <p>Grace and peace,<br>GCC Counseling Team</p>
            </div>
          `
        });
        emailSent = true;
        console.log('Welcome email sent to:', email);
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }
    } else {
      console.warn('RESEND_API_KEY not set - skipping welcome email');
    }

    return res.status(200).json({
      success: true,
      uid: userRecord.uid,
      emailSent
    });
  } catch (error) {
    console.error('Error in create-user:', error.code, error.message);

    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already in use' });
    }

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired - please refresh' });
    }

    if (error.code === 'auth/argument-error') {
      return res.status(500).json({
        error: 'Firebase config error',
        code: error.code,
        message: error.message
      });
    }

    return res.status(500).json({
      error: error.message,
      code: error.code || 'unknown'
    });
  }
}
