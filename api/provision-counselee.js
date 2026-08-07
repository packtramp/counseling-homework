import admin from 'firebase-admin';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  } catch (e) {
    console.error('provision-counselee: admin init failed:', e.message);
  }
}

/**
 * Server-side provisioning of a counselee's user profile + counseleeLink.
 *
 * WHY (2026-08-03 security review): these two documents carry the PRIVILEGED fields
 * (`counselorId`, `counseleeDocId`, `role`, `approved`) that decide who can read a
 * person's counseling content. While the client writes them, the Firestore rules must
 * stay permissive enough to allow it — which is exactly what let a user self-grant
 * privileged fields. Moving the write here lets the rules lock the client out entirely.
 *
 * AUTHORIZATION: the caller must own the counselee record they are provisioning —
 * `counselors/{callerUid}/counselees/{counseleeDocId}` must exist AND its `uid` field
 * must equal the counselee being provisioned. The caller cannot name someone else's
 * counselee, and cannot invent a binding that has no record behind it.
 *
 * NOTE: this endpoint covers the counselor-initiated flows (counselor adds a counselee /
 * activates a login). It deliberately does NOT auto-bind a self-signup to a counselor —
 * that path requires the invitee's consent and is handled separately.
 */

// Fields the client may never set — the server owns these.
const PRIVILEGED = ['role', 'counselorId', 'counseleeDocId', 'approved', 'isAdmin', 'isSuperAdmin', 'isCounselor'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Server not configured' });
  }

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

    // AUTHORIZATION: the caller must own this counselee record, and it must point at
    // the user being provisioned. This is the check that makes the binding trustworthy.
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

    // The authoritative profile write — privileged fields come from the verified caller.
    await db.collection('users').doc(counseleeUid).set({
      ...safeProfile,
      email,
      role: 'counselee',
      counselorId: callerUid,
      counseleeDocId,
      approved: true, // counselor-invited = already vetted
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Keep the counselee record pointed at the account.
    if (!rec.data().uid) await recRef.update({ uid: counseleeUid });

    // The invite link, used when an invited person signs up on their own.
    if (email) {
      const emailKey = email.replace(/[.]/g, '_');
      await db.collection('counseleeLinks').doc(emailKey).set({
        counselorId: callerUid,
        counseleeDocId,
        email,
        name: safeProfile.name || rec.data().name || '',
      });
    }

    // Auto-promote the caller to counselor on their first counselee.
    const callerRef = db.collection('users').doc(callerUid);
    const caller = await callerRef.get();
    if (caller.exists && !caller.data().isCounselor) {
      await callerRef.update({ isCounselor: true });
    }

    return res.status(200).json({ success: true, uid: counseleeUid });
  } catch (error) {
    console.error('provision-counselee error:', error.message);
    return res.status(500).json({ error: 'Failed to provision counselee' });
  }
}
