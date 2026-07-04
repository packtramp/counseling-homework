import admin from 'firebase-admin';
import { Resend } from 'resend';

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

const resend = new Resend(process.env.RESEND_API_KEY);

async function generateVerificationCode(uid, email) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const db = admin.firestore();
  await db.collection('verificationCodes').doc(uid).set({
    code,
    email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    attempts: 0
  });
  return code;
}

// One-click account approval. The link in the admin's email carries a server-only random
// token (stored in accountApprovals/{uid}, a deny-all collection). No login required — the
// token IS the authorization. Flips users/{uid}.approved = true.
async function handleApprove(req, res) {
  const page = (title, body) => res.status(200).setHeader('Content-Type', 'text/html').send(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<div style="font-family:sans-serif;max-width:520px;margin:48px auto;padding:0 20px;text-align:center">` +
    `<h2>${title}</h2><p style="color:#555">${body}</p>` +
    `<p style="margin-top:24px"><a href="https://counselinghomework.com" style="color:#2c5282">Open the app</a></p></div>`);
  const { uid, token } = req.query;
  if (!uid || !token) return res.status(400).send('Missing uid or token.');
  try {
    const db = admin.firestore();
    const ref = db.collection('accountApprovals').doc(String(uid));
    const snap = await ref.get();
    if (!snap.exists) return page('Already handled', 'This request was already approved or has expired.');
    if (snap.data().token !== String(token)) return res.status(403).send('Invalid or expired approval link.');
    await db.collection('users').doc(String(uid)).set(
      { approved: true, approvedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await ref.delete();
    return page('Approved ✓', `${snap.data().name || 'This person'} can now sign in and use the app.`);
  } catch (e) {
    console.error('approve error:', e.message);
    return res.status(500).send('Something went wrong approving this account.');
  }
}

export default async function handler(req, res) {
  // One-click account approval from the admin's notification email (GET + server-only token).
  if (req.method === 'GET' && req.query.action === 'approve') {
    return handleApprove(req, res);
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: verify caller is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  let callerUid;
  let callerEmail;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    callerUid = decoded.uid;
    callerEmail = (decoded.email || '').toLowerCase();
  } catch (authErr) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { email, name, uid, action, code } = req.body;

  // ---- FEEDBACK (no auth required beyond the Bearer token already verified above) ----
  if (action === 'feedback') {
    const { type, title, page, displayName } = req.body;
    if (!type || !title) {
      return res.status(400).json({ error: 'Missing required fields (type, title)' });
    }

    const isBug = type === 'Bug Report';
    const label = isBug ? 'bug' : 'enhancement';

    let body = `**Submitted by:** ${displayName || 'Unknown'} (${email || 'no email'})\n`;
    body += `**Page/Screen:** ${page || 'Not specified'}\n\n`;

    if (isBug) {
      body += `## What's happening\n${req.body.whatHappened || 'Not provided'}\n\n`;
      if (req.body.expected) body += `## Expected behavior\n${req.body.expected}\n\n`;
      if (req.body.steps) body += `## Steps to reproduce\n${req.body.steps}\n\n`;
    } else {
      body += `## Description\n${req.body.description || 'Not provided'}\n\n`;
      if (req.body.whyUseful) body += `## Why this would be useful\n${req.body.whyUseful}\n\n`;
    }

    if (req.body.screenshotUrl) {
      body += `## Screenshot\n![Screenshot](${req.body.screenshotUrl})\n\n`;
    }

    body += `---\n*Submitted via Counseling Homework app feedback form*`;

    try {
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) {
        const ghRes = await fetch('https://api.github.com/repos/packtramp/counseling-homework/issues', {
          method: 'POST',
          headers: {
            'Authorization': `token ${ghToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `[${isBug ? 'Bug' : 'Feature'}] ${title}`,
            body,
            labels: [label, 'user-feedback'],
          }),
        });
        if (!ghRes.ok) console.error('GitHub Issue creation failed:', await ghRes.text());
      }

      if (process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: 'GCC Counseling <noreply@counselinghomework.com>',
            to: 'robdorsett@gmail.com',
            subject: `[Counseling HW ${type}] ${title}`,
            html: body.replace(/\n/g, '<br/>').replace(/## /g, '<h3>').replace(/<h3>(.*?)<br\/>/g, '<h3>$1</h3>'),
          });
        } catch (emailErr) {
          console.error('Feedback email notification failed (non-fatal):', emailErr);
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Feedback submission failed:', err);
      return res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  // Check verification code (called from EmailVerifyGate)
  if (action === 'check-verify-code') {
    if (!code) return res.status(400).json({ error: 'Missing code' });
    try {
      const db = admin.firestore();
      const codeDoc = await db.collection('verificationCodes').doc(callerUid).get();
      if (!codeDoc.exists) return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
      const codeData = codeDoc.data();
      if (codeData.attempts >= 5) {
        return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
      }
      if (codeData.code !== code) {
        await db.collection('verificationCodes').doc(callerUid).update({
          attempts: admin.firestore.FieldValue.increment(1)
        });
        return res.status(400).json({ error: 'Invalid code. Please try again.' });
      }
      await admin.auth().updateUser(callerUid, { emailVerified: true });
      await db.collection('verificationCodes').doc(callerUid).delete();
      return res.status(200).json({ success: true, verified: true });
    } catch (err) {
      console.error('Verify code error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Resend verification code (called from EmailVerifyGate)
  if (action === 'resend-verify') {
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
      const verifyCode = await generateVerificationCode(callerUid, email);
      await resend.emails.send({
        from: 'GCC Counseling <noreply@counselinghomework.com>',
        to: email,
        subject: 'Your verification code - Counseling Homework',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Your Verification Code</h2>
            <p>Enter this code on the verification page to activate your account:</p>
            <div style="margin: 2rem 0; text-align: center;">
              <span style="background: #f0f4f8; padding: 16px 32px; font-size: 2rem; font-weight: bold; letter-spacing: 8px; border-radius: 8px; display: inline-block; color: #2c5282;">${verifyCode}</span>
            </div>
            <p style="color: #888; font-size: 0.85rem;">If you didn't request this, you can ignore this email.</p>
          </div>
        `
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Resend verify error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (!email || !name) {
    return res.status(400).json({ error: 'Missing email or name' });
  }

  // B1 / M-9: convert a pending accountability-partner invite into a partnerRequest
  // SERVER-SIDE. The client can no longer do this (M-9 blocks creating a request whose
  // requesterUid isn't the caller). Admin SDK bypasses rules. Keyed on the VERIFIED
  // email from the token (callerEmail) — never the client-supplied `email` — so a caller
  // cannot hijack someone else's invite by passing a different address. targetUid is the
  // verified callerUid, never the client-supplied uid.
  try {
    if (callerEmail) {
      const db2 = admin.firestore();
      const emailKey = callerEmail.replace(/[.]/g, '_');
      const inviteRef = db2.collection('pendingInvites').doc(emailKey);
      const inviteSnap = await inviteRef.get();
      if (inviteSnap.exists) {
        const invite = inviteSnap.data();
        const inviterUid = invite.inviterUid;
        if (inviterUid) {
          const inviterSnap = await db2.collection('users').doc(inviterUid).get();
          const inviterData = inviterSnap.exists ? inviterSnap.data() : { name: invite.inviterName, email: '' };
          let inviterDataPath = `counselors/${inviterUid}/counselees/${inviterUid}`;
          if (inviterData.counselorId && inviterData.counseleeDocId) {
            inviterDataPath = `counselors/${inviterData.counselorId}/counselees/${inviterData.counseleeDocId}`;
          }
          await db2.collection('partnerRequests').add({
            requesterUid: inviterUid,
            requesterName: inviterData.name || invite.inviterName || '',
            requesterEmail: inviterData.email || '',
            requesterDataPath: inviterDataPath,
            targetUid: callerUid,
            targetName: (name || '').trim(),
            targetEmail: callerEmail,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          await inviteRef.delete();
        }
      }
    }
  } catch (inviteErr) {
    console.error('Invite conversion error:', inviteErr.message);
  }

  try {
    // Send verification code to the new user via Resend
    try {
      // Use the VERIFIED uid/email from the token, never the client body, so a caller
      // can't seed/clobber another user's verification-code doc or redirect the code.
      const verifyCode = await generateVerificationCode(callerUid, callerEmail || email);
      await resend.emails.send({
        from: 'GCC Counseling <noreply@counselinghomework.com>',
        to: callerEmail || email,
        subject: 'Your verification code - Counseling Homework',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to Counseling Homework!</h2>
            <p>Hi ${name},</p>
            <p>Thanks for creating your account. Enter this code to verify your email:</p>
            <div style="margin: 2rem 0; text-align: center;">
              <span style="background: #f0f4f8; padding: 16px 32px; font-size: 2rem; font-weight: bold; letter-spacing: 8px; border-radius: 8px; display: inline-block; color: #2c5282;">${verifyCode}</span>
            </div>
            <p style="color: #888; font-size: 0.85rem;">If you didn't create this account, you can ignore this email.</p>
          </div>
        `
      });
    } catch (verifyErr) {
      console.error('Verification email error:', verifyErr.message);
    }

    // Notify superAdmins — this is an account REQUEST; account is PENDING until approved.
    const db = admin.firestore();

    // Server-only one-click approval token (accountApprovals is deny-all to clients, so the
    // token is not readable via the world-readable users collection).
    let approveUrl = 'https://counselinghomework.com';
    try {
      const token = db.collection('_t').doc().id + db.collection('_t').doc().id;
      await db.collection('accountApprovals').doc(callerUid).set({
        token,
        uid: callerUid,
        name: name || '',
        email: callerEmail || email,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      approveUrl = `https://counselinghomework.com/api/notify-signup?action=approve&uid=${encodeURIComponent(callerUid)}&token=${encodeURIComponent(token)}`;
    } catch (e) { console.error('approval token error:', e.message); }

    const superAdminsSnapshot = await db.collection('users')
      .where('isSuperAdmin', '==', true)
      .get();

    if (superAdminsSnapshot.empty) {
      return res.status(200).json({ success: true, notified: 0 });
    }

    const superAdminEmails = superAdminsSnapshot.docs.map(doc => doc.data().email).filter(Boolean);

    if (superAdminEmails.length > 0 && process.env.RESEND_API_KEY) {
      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      await resend.emails.send({
        from: 'GCC Counseling <noreply@counselinghomework.com>',
        to: superAdminEmails,
        replyTo: callerEmail || email,
        subject: `Account REQUEST: ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>New account request</h2>
            <p>Someone requested an account on GCC Counseling Homework.
               <strong>They cannot access anything until you approve.</strong></p>
            <table style="border-collapse: collapse; margin: 1rem 0;">
              <tr><td style="padding:0.5rem 1rem 0.5rem 0;font-weight:bold;">Name:</td><td style="padding:0.5rem 0;">${name}</td></tr>
              <tr><td style="padding:0.5rem 1rem 0.5rem 0;font-weight:bold;">Email:</td><td style="padding:0.5rem 0;">${email}</td></tr>
              <tr><td style="padding:0.5rem 1rem 0.5rem 0;font-weight:bold;">Time:</td><td style="padding:0.5rem 0;">${timestamp}</td></tr>
            </table>
            <p style="margin:1.5rem 0;">
              <a href="${approveUrl}" style="background:#2c7a4b;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">&#10003; Allow this account</a>
            </p>
            <p style="color:#666;font-size:0.9rem;">Don't recognize them? <strong>Reply to this email</strong> to reach ${email} and ask questions first — or just ignore it and they stay locked out.</p>
          </div>
        `
      });
    }

    return res.status(200).json({ success: true, notified: superAdminEmails.length });
  } catch (error) {
    console.error('Error in notify-signup:', error);
    return res.status(500).json({ error: error.message });
  }
}
