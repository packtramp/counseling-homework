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

  const { targetUid, isCounselor, action } = req.body;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const db = admin.firestore();

    // Welcome SMS — any authenticated user can send to their own phone
    if (action === 'sendWelcomeSms') {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'Phone number required' });

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken2 = process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!accountSid || !authToken2 || !messagingServiceSid) {
        return res.status(500).json({ error: 'Twilio not configured' });
      }

      const digits = phone.replace(/\D/g, '');
      const toNumber = digits.length === 10 ? `+1${digits}` : `+${digits}`;
      const welcomeMsg = "Counseling Homework: You're now subscribed to SMS reminders. Expect 1-3 msgs/day on days with incomplete assignments. Msg & data rates may apply. Reply HELP for help, STOP to opt out.";

      const smsResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken2}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: toNumber,
          MessagingServiceSid: messagingServiceSid,
          Body: welcomeMsg
        })
      });

      if (!smsResp.ok) {
        const err = await smsResp.json();
        return res.status(500).json({ error: err.message || 'SMS send failed' });
      }

      return res.status(200).json({ success: true, message: 'Welcome SMS sent' });
    }

    // Verify caller is a superAdmin for all other actions
    const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!callerDoc.exists || !callerDoc.data().isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden - requires superAdmin' });
    }

    // Verify all users have reminder schedules filled out
    if (action === 'verifyReminders') {
      const results = { users: [], counselees: [] };
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

      const usersSnap = await db.collection('users').get();
      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        const schedule = data.reminderSchedule;
        const missing = [];
        if (!schedule) {
          missing.push('NO SCHEDULE');
        } else {
          for (const day of days) {
            if (!schedule[day]) { missing.push(`${day}: missing`); }
            else {
              if (!schedule[day].slot1) missing.push(`${day}.slot1`);
              if (!schedule[day].slot2) missing.push(`${day}.slot2`);
              if (!schedule[day].slot3) missing.push(`${day}.slot3`);
            }
          }
        }
        results.users.push({
          name: data.name || data.email || userDoc.id,
          role: data.isCounselor ? 'counselor' : (data.isSuperAdmin ? 'superAdmin' : 'counselee'),
          status: missing.length === 0 ? 'OK' : 'MISSING',
          missing,
          slot1: schedule?.monday?.slot1 || '',
          slot2: schedule?.monday?.slot2 || '',
          slot3: schedule?.monday?.slot3 || ''
        });
      }

      const counselorsSnap = await db.collection('counselors').get();
      for (const counselorDoc of counselorsSnap.docs) {
        const counseleesSnap = await db.collection(`counselors/${counselorDoc.id}/counselees`).get();
        for (const cDoc of counseleesSnap.docs) {
          const data = cDoc.data();
          const schedule = data.reminderSchedule;
          const missing = [];
          if (!schedule) {
            missing.push('NO SCHEDULE');
          } else {
            for (const day of days) {
              if (!schedule[day]) { missing.push(`${day}: missing`); }
              else {
                if (!schedule[day].slot1) missing.push(`${day}.slot1`);
                if (!schedule[day].slot2) missing.push(`${day}.slot2`);
                if (!schedule[day].slot3) missing.push(`${day}.slot3`);
              }
            }
          }
          results.counselees.push({
            name: data.name || cDoc.id,
            counselorId: counselorDoc.id,
            isSelf: !!data.isSelf,
            status: missing.length === 0 ? 'OK' : 'MISSING',
            missing,
            slot1: schedule?.monday?.slot1 || '',
            slot2: schedule?.monday?.slot2 || '',
            slot3: schedule?.monday?.slot3 || ''
          });
        }
      }

      return res.status(200).json({ success: true, ...results });
    }

    // One-time backfill: set default slot2/slot3 for users missing them
    if (action === 'backfillReminders') {
      const defaultSchedule = {};
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
        defaultSchedule[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
      });

      const results = { usersFixed: 0, counseleesFixed: 0, details: [] };

      // Fix all users docs
      const usersSnap = await db.collection('users').get();
      for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        const schedule = data.reminderSchedule;
        if (!schedule) {
          await userDoc.ref.update({ reminderSchedule: defaultSchedule });
          results.usersFixed++;
          results.details.push(`users/${userDoc.id} (${data.name || data.email}) - no schedule, added full default`);
        } else {
          // Check if any day is missing slot2 or slot3
          let needsUpdate = false;
          const updated = { ...schedule };
          for (const day of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) {
            if (!updated[day]) {
              updated[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
              needsUpdate = true;
            } else {
              if (!updated[day].slot2) { updated[day] = { ...updated[day], slot2: '15:00' }; needsUpdate = true; }
              if (!updated[day].slot3) { updated[day] = { ...updated[day], slot3: '20:00' }; needsUpdate = true; }
            }
          }
          if (needsUpdate) {
            await userDoc.ref.update({ reminderSchedule: updated });
            results.usersFixed++;
            results.details.push(`users/${userDoc.id} (${data.name || data.email}) - filled missing slots`);
          }
        }
      }

      // Fix all counselor/counselee subcollection docs
      const counselorsSnap = await db.collection('counselors').get();
      for (const counselorDoc of counselorsSnap.docs) {
        const counseleesSnap = await db.collection(`counselors/${counselorDoc.id}/counselees`).get();
        for (const cDoc of counseleesSnap.docs) {
          const data = cDoc.data();
          const schedule = data.reminderSchedule;
          if (!schedule) {
            await cDoc.ref.update({ reminderSchedule: defaultSchedule });
            results.counseleesFixed++;
            results.details.push(`counselors/${counselorDoc.id}/counselees/${cDoc.id} (${data.name}) - no schedule, added full default`);
          } else {
            let needsUpdate = false;
            const updated = { ...schedule };
            for (const day of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) {
              if (!updated[day]) {
                updated[day] = { slot1: '09:00', slot2: '15:00', slot3: '20:00' };
                needsUpdate = true;
              } else {
                if (!updated[day].slot2) { updated[day] = { ...updated[day], slot2: '15:00' }; needsUpdate = true; }
                if (!updated[day].slot3) { updated[day] = { ...updated[day], slot3: '20:00' }; needsUpdate = true; }
              }
            }
            if (needsUpdate) {
              await cDoc.ref.update({ reminderSchedule: updated });
              results.counseleesFixed++;
              results.details.push(`counselors/${counselorDoc.id}/counselees/${cDoc.id} (${data.name}) - filled missing slots`);
            }
          }
        }
      }

      return res.status(200).json({ success: true, ...results });
    }

    if (!targetUid || typeof isCounselor !== 'boolean') {
      return res.status(400).json({ error: 'Missing targetUid or isCounselor boolean' });
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
