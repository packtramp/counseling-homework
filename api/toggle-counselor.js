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

    // One-way reminder broadcast to the caller's OWN contact list (men's group).
    // Reads users/{caller}/broadcastContacts (active, non-opted-out) and texts each via
    // the same Twilio Messaging Service used for reminders. Writes a history record.
    if (action === 'sendBroadcast') {
      const message = (req.body.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Message required' });
      if (message.length > 1000) return res.status(400).json({ error: 'Message too long (max 1000)' });

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const bcAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      if (!accountSid || !bcAuthToken || !messagingServiceSid) {
        return res.status(500).json({ error: 'Twilio not configured' });
      }

      const contactsSnap = await db.collection(`users/${decodedToken.uid}/broadcastContacts`).get();
      const contacts = contactsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.active !== false && c.optOut !== true && c.phone);
      if (contacts.length === 0) {
        return res.status(400).json({ error: 'No active contacts to send to' });
      }

      const results = [];
      for (const c of contacts) {
        const digits = String(c.phone).replace(/\D/g, '');
        const toNumber = digits.length === 10 ? `+1${digits}` : `+${digits}`;
        try {
          const smsResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${bcAuthToken}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ To: toNumber, MessagingServiceSid: messagingServiceSid, Body: message })
          });
          if (smsResp.ok) {
            const data = await smsResp.json();
            results.push({ name: c.name || '', phone: c.phone, status: 'sent', sid: data.sid || null });
          } else {
            const err = await smsResp.json();
            results.push({ name: c.name || '', phone: c.phone, status: 'failed', error: err.message || 'send failed' });
          }
        } catch (e) {
          results.push({ name: c.name || '', phone: c.phone, status: 'failed', error: e.message });
        }
      }

      const sentCount = results.filter(r => r.status === 'sent').length;
      const failCount = results.length - sentCount;

      let broadcastId = null;
      try {
        const ref = await db.collection(`users/${decodedToken.uid}/broadcasts`).add({
          message,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          recipientCount: results.length,
          sentCount,
          failCount,
          results
        });
        broadcastId = ref.id;
      } catch (e) {
        console.error('broadcast history write failed:', e.message);
      }

      return res.status(200).json({ success: true, broadcastId, sentCount, failCount, results });
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

      // Counselor docs are phantom parents — use listDocuments().
      const counselorRefs = await db.collection('counselors').listDocuments();
      for (const counselorRef of counselorRefs) {
        const counseleesSnap = await db.collection(`counselors/${counselorRef.id}/counselees`).get();
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
            counselorId: counselorRef.id,
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

      // Fix all counselor/counselee subcollection docs. Counselor docs are phantom parents — use listDocuments().
      const counselorRefs = await db.collection('counselors').listDocuments();
      for (const counselorRef of counselorRefs) {
        const counseleesSnap = await db.collection(`counselors/${counselorRef.id}/counselees`).get();
        for (const cDoc of counseleesSnap.docs) {
          const data = cDoc.data();
          const schedule = data.reminderSchedule;
          if (!schedule) {
            await cDoc.ref.update({ reminderSchedule: defaultSchedule });
            results.counseleesFixed++;
            results.details.push(`counselors/${counselorRef.id}/counselees/${cDoc.id} (${data.name}) - no schedule, added full default`);
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
              results.details.push(`counselors/${counselorRef.id}/counselees/${cDoc.id} (${data.name}) - filled missing slots`);
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
