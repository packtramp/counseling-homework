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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not initialized' });
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

    // Action: verify-all — mark all Firebase Auth users as emailVerified
    if (req.query.action === 'verify-all') {
      const listResult = await admin.auth().listUsers(1000);
      let verified = 0;
      for (const userRecord of listResult.users) {
        if (!userRecord.emailVerified) {
          await admin.auth().updateUser(userRecord.uid, { emailVerified: true });
          verified++;
        }
      }
      return res.status(200).json({ success: true, verified, total: listResult.users.length });
    }

    // Action: migrate-reminders — set default 9am/3pm/8pm schedule for all counselees
    if (req.query.action === 'migrate-reminders') {
      const defaultSchedule = {};
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
        defaultSchedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
      });

      const usersSnapshot = await db.collection('users').get();
      const counselorIds = new Set();
      for (const userDoc of usersSnapshot.docs) {
        const d = userDoc.data();
        if (d.isCounselor || d.isSuperAdmin) counselorIds.add(userDoc.id);
        if (d.counselorId) counselorIds.add(d.counselorId);
        if (!d.isCounselor && !d.counselorId) counselorIds.add(userDoc.id);
      }

      let updated = 0;
      let errors = 0;
      const details = [];
      for (const counselorId of counselorIds) {
        try {
          const snap = await db.collection(`counselors/${counselorId}/counselees`).get();
          for (const doc of snap.docs) {
            try {
              await doc.ref.update({
                emailReminders: true,
                smsReminders: doc.data().smsReminders || false,
                reminderSchedule: defaultSchedule
              });
              updated++;
              details.push(`${doc.data().name || doc.data().email || doc.id}`);
            } catch (e) { errors++; }
          }
        } catch (e) { /* collection may not exist */ }
      }
      return res.status(200).json({ success: true, updated, errors, details });
    }

    // Search mode: if ?q= is provided, do a filtered search and return immediately
    const searchQuery = req.query.q;
    if (searchQuery && searchQuery.length >= 2) {
      const searchSnapshot = await db.collection('users').limit(100).get();
      const searchLower = searchQuery.toLowerCase();
      const searchResults = [];
      searchSnapshot.forEach(doc => {
        const data = doc.data();
        const nameMatch = data.name?.toLowerCase().includes(searchLower);
        const emailMatch = data.email?.toLowerCase().includes(searchLower);
        if (nameMatch || emailMatch) {
          searchResults.push({
            uid: doc.id,
            name: data.name || '',
            email: data.email || '',
            isCounselor: data.isCounselor === true || data.role === 'counselor',
            isSuperAdmin: data.isSuperAdmin === true,
            role: data.role || null,
            createdAt: data.createdAt?.toDate?.() || null
          });
        }
      });
      return res.status(200).json({ users: searchResults });
    }

    // Get all users from Firestore
    const usersSnapshot = await db.collection('users').get();

    const users = [];
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Try multiple paths for activity log
      let lastActivity = null;
      const activityPaths = [
        // Self-counselor path (independent users)
        `counselors/${uid}/counselees/${uid}/activityLog`,
      ];

      // If user is a counselee of someone else
      if (userData.counselorId && userData.counseleeDocId) {
        activityPaths.push(
          `counselors/${userData.counselorId}/counselees/${userData.counseleeDocId}/activityLog`
        );
      }

      // Try each path and use the most recent activity
      for (const path of activityPaths) {
        try {
          const activitySnapshot = await db
            .collection(path)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

          if (!activitySnapshot.empty) {
            const activityData = activitySnapshot.docs[0].data();
            const timestamp = activityData.timestamp;

            // Use whichever is more recent
            if (!lastActivity || (timestamp && timestamp.toDate() > lastActivity.toDate())) {
              lastActivity = timestamp;
            }
          }
        } catch (e) {
          // Activity log might not exist at this path
        }
      }

      users.push({
        uid: uid,
        name: userData.name || '',
        email: userData.email || '',
        isCounselor: userData.isCounselor || false,
        isSuperAdmin: userData.isSuperAdmin || false,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
        lastActivity: lastActivity
      });
    }

    // Sort by lastLogin (most recent first), then by name
    users.sort((a, b) => {
      const aLogin = a.lastLogin?.toDate?.() || a.lastLogin || new Date(0);
      const bLogin = b.lastLogin?.toDate?.() || b.lastLogin || new Date(0);
      return bLogin - aLogin;
    });

    return res.status(200).json({ users });
  } catch (error) {
    console.error('Error in list-users:', error);
    return res.status(500).json({ error: error.message });
  }
}
