import admin from 'firebase-admin';
import { Resend } from 'resend';

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

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not initialized' });
  }

  const { email, name, tempPassword } = req.body;
  if (!email || !name || !tempPassword) {
    return res.status(400).json({ error: 'Missing email, name, or tempPassword' });
  }

  if (tempPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Verify caller is a superAdmin
    const db = admin.firestore();
    const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!callerDoc.exists || !callerDoc.data().isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden - requires superAdmin' });
    }

    // Create the user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: tempPassword,
      displayName: name
    });

    // Create the user profile in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email: email,
      name: name,
      isCounselor: false,
      isSuperAdmin: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      invitedBy: decodedToken.uid
    });

    // Initialize self-counselor data
    const selfPath = `counselors/${userRecord.uid}/counselees/${userRecord.uid}`;
    await db.doc(selfPath).set({
      name: name,
      email: email,
      uid: userRecord.uid,
      status: 'active',
      currentStreak: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isSelf: true
    });

    // Send invite email
    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'GCC Counseling <noreply@counselinghomework.com>',
          to: email,
          subject: 'Welcome to GCC Counseling Homework',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Welcome to GCC Counseling Homework!</h2>
              <p>Hi ${name},</p>
              <p>An account has been created for you on the GCC Counseling Homework app.</p>
              <p><strong>Your login details:</strong></p>
              <ul>
                <li>Email: ${email}</li>
                <li>Temporary Password: ${tempPassword}</li>
              </ul>
              <p>Please log in at <a href="https://counselinghomework.com">counselinghomework.com</a> and change your password.</p>
              <p>If you have any questions, please contact your counselor.</p>
              <p>Grace and peace,<br>GCC Counseling Team</p>
            </div>
          `
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Failed to send invite email:', emailError);
      }
    }

    return res.status(200).json({
      success: true,
      uid: userRecord.uid,
      emailSent
    });
  } catch (error) {
    console.error('Error in invite-user:', error);

    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already in use' });
    }

    return res.status(500).json({ error: error.message });
  }
}
