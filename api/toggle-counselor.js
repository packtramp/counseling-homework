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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not initialized' });
  }

  const { targetUid, isCounselor } = req.body;
  if (!targetUid || typeof isCounselor !== 'boolean') {
    return res.status(400).json({ error: 'Missing targetUid or isCounselor boolean' });
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

    // Update the target user's isCounselor flag
    const targetRef = db.collection('users').doc(targetUid);
    const targetDoc = await targetRef.get();

    if (!targetDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    await targetRef.update({ isCounselor });

    // If enabling counselor, initialize their self-counselor data structure
    if (isCounselor) {
      const selfPath = `counselors/${targetUid}/counselees/${targetUid}`;
      const selfDoc = await db.doc(selfPath).get();

      if (!selfDoc.exists) {
        const targetData = targetDoc.data();
        await db.doc(selfPath).set({
          name: targetData.name || 'Me',
          email: targetData.email || '',
          uid: targetUid,
          status: 'active',
          currentStreak: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isSelf: true
        });
      }
    }

    return res.status(200).json({ success: true, isCounselor });
  } catch (error) {
    console.error('Error in toggle-counselor:', error);
    return res.status(500).json({ error: error.message });
  }
}
