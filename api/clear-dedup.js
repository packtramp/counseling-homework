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
 * Clear Dedup API - Resets lastSlot1Sent/lastSlot2Sent/lastSlot3Sent for a counselee
 * Call with: GET /api/clear-dedup?counselee=FirstName+LastName
 */
export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.REMINDER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!db) return res.status(500).json({ error: 'Firebase not initialized' });

  const targetName = req.query.counselee || '';
  if (!targetName) {
    return res.status(400).json({ error: 'Missing counselee query param' });
  }

  try {
    const usersSnap = await db.collection('users').where('role', '==', 'counselor').get();

    for (const userDoc of usersSnap.docs) {
      const counselorId = userDoc.id;
      const counseleesSnap = await db.collection(`counselors/${counselorId}/counselees`).get();

      for (const doc of counseleesSnap.docs) {
        const c = doc.data();
        if (c.name === targetName) {
          await doc.ref.update({
            lastSlot1Sent: '',
            lastSlot2Sent: '',
            lastSlot3Sent: ''
          });
          return res.status(200).json({ success: true, counselee: targetName, message: 'Dedup fields cleared' });
        }
      }
    }

    return res.status(404).json({ error: `Counselee not found: "${targetName}"` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
