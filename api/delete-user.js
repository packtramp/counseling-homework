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

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { uid, counselorId, adminDelete, targetUid } = req.body;

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const db = admin.firestore();

    // === ADMIN DELETE MODE ===
    if (adminDelete && targetUid) {
      // Verify caller is superAdmin
      const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!callerDoc.exists || !callerDoc.data().isSuperAdmin) {
        return res.status(403).json({ error: 'Forbidden - requires superAdmin' });
      }

      // Prevent deleting yourself
      if (targetUid === decodedToken.uid) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      // Prevent deleting other superAdmins
      const targetDoc = await db.collection('users').doc(targetUid).get();
      if (targetDoc.exists && targetDoc.data().isSuperAdmin) {
        return res.status(400).json({ error: 'Cannot delete a superAdmin account' });
      }

      const targetData = targetDoc.exists ? targetDoc.data() : {};
      const cleaned = { auth: false, userDoc: false, apLinks: 0, partnerRequests: 0, pendingInvites: 0 };

      // 1. Delete Firebase Auth account
      try {
        await admin.auth().deleteUser(targetUid);
        cleaned.auth = true;
      } catch (authErr) {
        if (authErr.code === 'auth/user-not-found') {
          cleaned.auth = true;
        } else {
          throw authErr;
        }
      }

      // 2. Clean up AP references from all other users
      const usersSnap = await db.collection('users').get();
      const batch = db.batch();
      let apCleanCount = 0;

      for (const userDoc of usersSnap.docs) {
        if (userDoc.id === targetUid) continue;
        const data = userDoc.data();
        const partners = data.accountabilityPartners || [];
        const partnerUids = data.accountabilityPartnerUids || [];
        const watching = data.watchingUsers || [];

        const hadPartner = partners.some(p => p.uid === targetUid);
        const hadPartnerUid = partnerUids.includes(targetUid);
        const hadWatching = watching.some(w => w.uid === targetUid);

        if (hadPartner || hadPartnerUid || hadWatching) {
          const updates = {};
          if (hadPartner) updates.accountabilityPartners = partners.filter(p => p.uid !== targetUid);
          if (hadPartnerUid) updates.accountabilityPartnerUids = partnerUids.filter(u => u !== targetUid);
          if (hadWatching) updates.watchingUsers = watching.filter(w => w.uid !== targetUid);
          batch.update(userDoc.ref, updates);
          apCleanCount++;
        }
      }

      if (apCleanCount > 0) {
        await batch.commit();
      }
      cleaned.apLinks = apCleanCount;

      // 3. Clean up partnerRequests involving this user
      const prSnap = await db.collection('partnerRequests').get();
      let prCount = 0;
      for (const prDoc of prSnap.docs) {
        const pr = prDoc.data();
        if (pr.requesterUid === targetUid || pr.targetUid === targetUid) {
          await prDoc.ref.delete();
          prCount++;
        }
      }
      cleaned.partnerRequests = prCount;

      // 4. Clean up pendingInvites by this user's email
      if (targetData.email) {
        const emailKey = targetData.email.toLowerCase().replace(/[.@]/g, '_');
        const inviteDoc = await db.collection('pendingInvites').doc(emailKey).get();
        if (inviteDoc.exists) {
          await inviteDoc.ref.delete();
          cleaned.pendingInvites = 1;
        }
      }

      // 5. Delete the Firestore user doc last
      if (targetDoc.exists) {
        await db.collection('users').doc(targetUid).delete();
        cleaned.userDoc = true;
      }

      return res.status(200).json({ success: true, cleaned });
    }

    // === COUNSELOR DELETE MODE (original) ===
    if (!uid || !counselorId) {
      return res.status(400).json({ error: 'Missing uid or counselorId (or use adminDelete + targetUid)' });
    }

    if (decodedToken.uid !== counselorId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await admin.auth().deleteUser(uid);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error.code, error.message);

    if (error.code === 'auth/user-not-found') {
      return res.status(200).json({ success: true, note: 'User already deleted' });
    }

    return res.status(500).json({ error: error.message });
  }
}
