import admin from 'firebase-admin';

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

function htmlResponse(res, title, message, isSuccess) {
  const color = isSuccess ? '#38a169' : '#e53e3e';
  const icon = isSuccess ? '&#10003;' : '&#10007;';
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} - Counseling Homework</title>
      <style>
        body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f7fafc; }
        .card { background: white; border-radius: 12px; padding: 2rem; max-width: 400px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .icon { font-size: 3rem; color: ${color}; margin-bottom: 1rem; }
        h1 { color: #2d3748; font-size: 1.3rem; margin: 0.5rem 0; }
        p { color: #4a5568; line-height: 1.5; }
        a { display: inline-block; margin-top: 1rem; background: #3182ce; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
        a:hover { background: #2c5282; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">${icon}</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="https://counselinghomework.com">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, action } = req.query;

  if (!token || !action || !['accept', 'reject'].includes(action)) {
    return htmlResponse(res, 'Invalid Link', 'This link is invalid or malformed. Please check your email and try again.', false);
  }

  if (!admin.apps.length) {
    return htmlResponse(res, 'Server Error', 'Server configuration error. Please try again later.', false);
  }

  try {
    const db = admin.firestore();
    const requestDoc = await db.collection('partnerRequests').doc(token).get();

    if (!requestDoc.exists) {
      return htmlResponse(res, 'Request Not Found', 'This partner request was not found. It may have already been processed or expired.', false);
    }

    const request = requestDoc.data();

    if (request.status !== 'pending') {
      const statusText = request.status === 'accepted' ? 'already accepted' : 'already declined';
      return htmlResponse(res, 'Already Processed', `This partner request has ${statusText}.`, false);
    }

    if (action === 'accept') {
      // ACCEPT: Create FULL bidirectional links (no links existed before this)
      const { requesterUid, requesterName, requesterEmail, requesterDataPath, targetUid, targetName, targetEmail } = request;
      const now = new Date().toISOString();

      // Get target's data path
      const targetUserDoc = await db.collection('users').doc(targetUid).get();
      const targetProfile = targetUserDoc.exists ? targetUserDoc.data() : {};
      let targetDataPath = `counselors/${targetUid}/counselees/${targetUid}`;
      if (targetProfile.counselorId && targetProfile.counseleeDocId) {
        targetDataPath = `counselors/${targetProfile.counselorId}/counselees/${targetProfile.counseleeDocId}`;
      }

      // Dedup guard: check if relationship already exists via primitive UID array
      const requesterDoc = await db.collection('users').doc(requesterUid).get();
      const requesterProfile = requesterDoc.exists ? requesterDoc.data() : {};
      const requesterPartnerUids = requesterProfile.accountabilityPartnerUids || [];
      const targetPartnerUids = targetProfile.accountabilityPartnerUids || [];

      if (requesterPartnerUids.includes(targetUid) && targetPartnerUids.includes(requesterUid)) {
        // Already fully linked - just mark as accepted and return success
        await db.collection('partnerRequests').doc(token).update({
          status: 'accepted',
          respondedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return htmlResponse(res, 'Partner Request Accepted!',
          `You and ${requesterName} are already accountability partners.`, true);
      }

      // Block counselor-counselee from being APs (unless graduated)
      const isRequesterCounseleeOfTarget = requesterProfile.counselorId === targetUid;
      const isTargetCounseleeOfRequester = targetProfile.counselorId === requesterUid;
      if (isRequesterCounseleeOfTarget || isTargetCounseleeOfRequester) {
        // Check graduation status
        let graduated = false;
        try {
          if (isRequesterCounseleeOfTarget && requesterProfile.counseleeDocId) {
            const cDoc = await db.doc(`counselors/${targetUid}/counselees/${requesterProfile.counseleeDocId}`).get();
            graduated = cDoc.exists && cDoc.data().graduated === true;
          } else if (isTargetCounseleeOfRequester && targetProfile.counseleeDocId) {
            const cDoc = await db.doc(`counselors/${requesterUid}/counselees/${targetProfile.counseleeDocId}`).get();
            graduated = cDoc.exists && cDoc.data().graduated === true;
          }
        } catch (e) { /* ignore lookup errors */ }

        if (!graduated) {
          await db.collection('partnerRequests').doc(token).update({
            status: 'blocked_counselor_relationship',
            respondedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          return htmlResponse(res, 'Cannot Accept',
            'This accountability partner request cannot be accepted because you already have a counselor-counselee relationship with this person. That relationship already includes full data access.', false);
        }
      }

      // Direction 1: Requester shares with target (requester consented by initiating)
      await db.collection('users').doc(requesterUid).update({
        accountabilityPartners: admin.firestore.FieldValue.arrayUnion({
          uid: targetUid, name: targetName || targetEmail, email: targetEmail, addedAt: now
        }),
        accountabilityPartnerUids: admin.firestore.FieldValue.arrayUnion(targetUid)
      });
      await db.collection('users').doc(targetUid).update({
        watchingUsers: admin.firestore.FieldValue.arrayUnion({
          uid: requesterUid, name: requesterName, email: requesterEmail,
          dataPath: requesterDataPath || `counselors/${requesterUid}/counselees/${requesterUid}`,
          addedAt: now
        })
      });

      // Direction 2: Target shares with requester (target consented by clicking Accept)
      await db.collection('users').doc(targetUid).update({
        accountabilityPartners: admin.firestore.FieldValue.arrayUnion({
          uid: requesterUid, name: requesterName, email: requesterEmail, addedAt: now
        }),
        accountabilityPartnerUids: admin.firestore.FieldValue.arrayUnion(requesterUid)
      });
      await db.collection('users').doc(requesterUid).update({
        watchingUsers: admin.firestore.FieldValue.arrayUnion({
          uid: targetUid, name: targetName || targetEmail, email: targetEmail,
          dataPath: targetDataPath, addedAt: now
        })
      });

      // Mark request as accepted
      await db.collection('partnerRequests').doc(token).update({
        status: 'accepted',
        respondedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return htmlResponse(res, 'Partner Request Accepted!',
        `You and ${requesterName} are now mutual accountability partners. You can both view each other's progress.`, true);

    } else {
      // REJECT: No links were created, just mark as rejected
      await db.collection('partnerRequests').doc(token).update({
        status: 'rejected',
        respondedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return htmlResponse(res, 'Request Declined',
        `You declined the accountability partner request from ${request.requesterName}. No data will be shared.`, true);
    }

  } catch (error) {
    console.error('Partner response error:', error);
    return htmlResponse(res, 'Error', 'Something went wrong processing your response. Please try again or contact support.', false);
  }
}
