import admin from 'firebase-admin';
import crypto from 'crypto';

// Validate Twilio's X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted param concat)).
function validTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

// (REMOVED 2026-08-03) htmlResponse() lived here. It interpolated attacker-controlled
// values (requesterName) into HTML served from the app's own origin — a stored-XSS hole
// that could lift a victim's login token. Its only callers were in the unauthenticated
// GET magic-link branch, which was removed in the same change, so the helper went with it.

// Authenticated in-app response (POST). SECURITY: replaces the old client-side cross-user
// writes to accountabilityPartnerUids (C-1). Validates the caller is the request's TARGET,
// then does all array writes with the Admin SDK. Supports accept / accept_private / reject.
async function handleAuthenticatedResponse(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  if (!admin.apps.length) return res.status(500).json({ error: 'Server not configured' });
  let callerUid;
  try {
    callerUid = (await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1])).uid;
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }

  const { requestId, action } = req.body || {};
  if (!requestId || !['accept', 'accept_private', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Missing requestId or invalid action' });
  }

  const db = admin.firestore();
  const now = new Date().toISOString();
  const reqRef = db.collection('partnerRequests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) return res.status(404).json({ error: 'Request not found' });
  const request = reqSnap.data();

  // AUTHORIZATION: only the request's TARGET may respond.
  if (request.targetUid !== callerUid) return res.status(403).json({ error: 'Not authorized' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'Already processed', status: request.status });

  if (action === 'reject') {
    await reqRef.update({ status: 'rejected', respondedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.status(200).json({ success: true, status: 'rejected' });
  }

  const { requesterUid, requesterName, requesterEmail, requesterDataPath, targetUid, targetName, targetEmail } = request;
  const targetProfile = (await db.collection('users').doc(targetUid).get()).data() || {};
  const requesterProfile = (await db.collection('users').doc(requesterUid).get()).data() || {};
  const targetDataPath = (targetProfile.counselorId && targetProfile.counseleeDocId)
    ? `counselors/${targetProfile.counselorId}/counselees/${targetProfile.counseleeDocId}`
    : `counselors/${targetUid}/counselees/${targetUid}`;
  const reqDataPath = requesterDataPath || `counselors/${requesterUid}/counselees/${requesterUid}`;

  // Block counselor↔counselee AP links unless graduated
  const reqIsCounseleeOfTarget = requesterProfile.counselorId === targetUid;
  const targetIsCounseleeOfReq = targetProfile.counselorId === requesterUid;
  if (reqIsCounseleeOfTarget || targetIsCounseleeOfReq) {
    let graduated = false;
    try {
      if (reqIsCounseleeOfTarget && requesterProfile.counseleeDocId) {
        const c = await db.doc(`counselors/${targetUid}/counselees/${requesterProfile.counseleeDocId}`).get();
        graduated = c.exists && c.data().graduated === true;
      } else if (targetIsCounseleeOfReq && targetProfile.counseleeDocId) {
        const c = await db.doc(`counselors/${requesterUid}/counselees/${targetProfile.counseleeDocId}`).get();
        graduated = c.exists && c.data().graduated === true;
      }
    } catch (e) { /* ignore */ }
    if (!graduated) {
      await reqRef.update({ status: 'blocked_counselor_relationship', respondedAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(409).json({ error: 'Counselor-counselee relationship already includes full access' });
    }
  }

  const arrayUnion = admin.firestore.FieldValue.arrayUnion;
  // Direction 1 (always): requester shares with target.
  await db.collection('users').doc(requesterUid).update({
    accountabilityPartners: arrayUnion({ uid: targetUid, name: targetName || targetEmail, email: targetEmail, addedAt: now }),
    accountabilityPartnerUids: arrayUnion(targetUid),
  });
  await db.collection('users').doc(targetUid).update({
    watchingUsers: arrayUnion({ uid: requesterUid, name: requesterName, email: requesterEmail, dataPath: reqDataPath, addedAt: now }),
  });
  // Direction 2 (mutual accept only): target shares with requester.
  if (action === 'accept') {
    await db.collection('users').doc(targetUid).update({
      accountabilityPartners: arrayUnion({ uid: requesterUid, name: requesterName, email: requesterEmail, addedAt: now }),
      accountabilityPartnerUids: arrayUnion(requesterUid),
    });
    await db.collection('users').doc(requesterUid).update({
      watchingUsers: arrayUnion({ uid: targetUid, name: targetName || targetEmail, email: targetEmail, dataPath: targetDataPath, addedAt: now }),
    });
  }
  await reqRef.update({
    status: action === 'accept' ? 'accepted' : 'accepted_private',
    respondedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return res.status(200).json({ success: true, status: action === 'accept' ? 'accepted' : 'accepted_private' });
}

// Inbound SMS reply forwarder. Twilio POSTs here (form-encoded) when someone replies to a
// broadcast. Gated by the ?sms=<SMS_WEBHOOK_SECRET> marker in the configured webhook URL.
// Forwards the reply to the admin email via Resend and returns empty TwiML (no auto-reply).
async function handleSmsReply(req, res) {
  const twiml = (extra = '') => {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${extra}</Response>`);
  };

  // Verify the request is genuinely from Twilio (X-Twilio-Signature over the configured URL).
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const reqUrl = `${proto}://${host}${req.url}`;
  const signature = req.headers['x-twilio-signature'];
  if (!validTwilioSignature(process.env.TWILIO_AUTH_TOKEN, reqUrl, req.body || {}, signature)) {
    console.error('SMS reply: bad Twilio signature for', reqUrl);
    return res.status(403).send('Forbidden');
  }

  const from = req.body?.From || '';
  const body = (req.body?.Body || '').trim();
  const digits = String(from).replace(/\D/g, '');
  const last10 = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  const pretty = last10.length === 10 ? `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}` : from;
  const looksLikeOptOut = /\b(don'?t add me|remove me|unsubscribe|opt.?out|take me off|no thanks?)\b/i.test(body);

  // Best-effort: match the sender's number to a contact name + group (across all groups),
  // and capture that group's owner so the reply is forwarded to the OWNER, not hardcoded.
  let matchedName = '', matchedGroup = '', matchedOwnerUid = '';
  try {
    const db = admin.firestore();
    const groupsSnap = await db.collection('broadcastGroups').get();
    for (const g of groupsSnap.docs) {
      const cs = await db.collection(`broadcastGroups/${g.id}/contacts`).get();
      const hit = cs.docs.find(d => {
        const cd = String(d.data().phone || '').replace(/\D/g, '');
        const c10 = cd.length === 11 && cd[0] === '1' ? cd.slice(1) : cd;
        return c10 && c10 === last10;
      });
      if (hit) { matchedName = hit.data().name || ''; matchedGroup = g.data().name || ''; matchedOwnerUid = g.data().ownerUid || ''; break; }
    }
  } catch (e) { console.error('reply name lookup failed:', e.message); }
  const who = matchedName ? `${matchedName} (${pretty})` : pretty;

  // Route the forward to the matched group's OWNER email; fall back to the admin.
  let toEmail = 'robdorsett@gmail.com';
  try {
    if (matchedOwnerUid) {
      const od = await admin.firestore().collection('users').doc(matchedOwnerUid).get();
      if (od.exists && od.data().email) toEmail = od.data().email;
    }
  } catch (e) { console.error('owner email lookup failed:', e.message); }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'reminders@counselinghomework.com';
  if (apiKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `Reminder Broadcasts <${fromEmail}>`,
          to: toEmail,
          subject: `SMS reply from ${matchedName || pretty}${matchedGroup ? ` — ${matchedGroup}` : ''}${looksLikeOptOut ? ' — possible OPT-OUT' : ''}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5282; margin-bottom: 4px;">New reply to a broadcast</h2>
              <p style="margin: 0 0 12px; color: #718096; font-size: 14px;">From <strong>${who}</strong>${matchedGroup ? ` &middot; ${matchedGroup}` : ''}</p>
              ${looksLikeOptOut ? `<p style="background:#fed7d7;color:#822727;padding:8px 12px;border-radius:6px;font-weight:600;">This looks like an opt-out request — you may want to pause or remove this contact.</p>` : ''}
              <blockquote style="border-left: 3px solid #cbd5e0; margin: 12px 0; padding: 4px 14px; color: #2d3748; font-size: 15px; white-space: pre-wrap;">${body.replace(/</g, '&lt;')}</blockquote>
              <p style="color: #a0aec0; font-size: 12px; margin-top: 20px;">One-way reminder system — replies are forwarded to you, not to the group. STOP/HELP are handled automatically by the carrier.</p>
            </div>
          `
        })
      });
    } catch (err) {
      console.error('SMS reply forward failed:', err.message);
    }
  }

  // Empty TwiML → Twilio sends no auto-reply back to the sender.
  return twiml();
}

export default async function handler(req, res) {
  // Twilio inbound SMS reply (form POST with ?sms=<secret> marker).
  if (req.method === 'POST' && req.query?.sms !== undefined) {
    try { return await handleSmsReply(req, res); }
    catch (e) { console.error('sms reply error:', e); res.setHeader('Content-Type', 'text/xml'); return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>'); }
  }
  // In-app authenticated response (JSON). The GET path below is the email magic-link (HTML).
  if (req.method === 'POST') {
    try { return await handleAuthenticatedResponse(req, res); }
    catch (e) { console.error('authenticated partner-response error:', e); return res.status(500).json({ error: 'Failed to process response' }); }
  }
  // The email magic-link GET path was REMOVED 2026-08-03 (security).
  // It accepted a partner request from anyone holding the token, with no authentication
  // and no check that the caller was the request's target — so a self-registered stranger
  // could link themselves to any user and read that person's homework, journals, heart
  // journals, session notes and prayer requests. Nothing ever generated such a link (the
  // invite email points at the dashboard), so it was dead code as well as a hole.
  // Responding to an invite happens in-app via the POST path above, which verifies the
  // caller IS the target.
  return res.status(405).json({ error: 'Method not allowed' });
}
