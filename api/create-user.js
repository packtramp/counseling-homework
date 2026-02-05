import admin from 'firebase-admin';

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

  const { email, password, counselorId } = req.body;

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

    // Create the user
    console.log('Creating user:', email);
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    console.log('User created:', userRecord.uid);
    return res.status(200).json({
      success: true,
      uid: userRecord.uid
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
