/**
 * One-shot: re-enable smsReminders for the test-window's disabled users (minus moorhead7),
 * plus brandiedorsett@gmail.com, then send each a launch-announcement SMS.
 *
 * Usage:
 *   node scripts/sms-launch-announce.cjs              # dry-run (default)
 *   node scripts/sms-launch-announce.cjs --commit     # flip flag + send SMS
 *
 * Reads Twilio creds from ../.env.local (project root). Reads service account from app/.
 * Messaging Service SID is hardcoded to the Sole-Prop campaign (Campaign #1) per project CLAUDE.md.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load TWILIO_* from project-root .env.local (no dotenv dep)
const envPath = path.resolve(__dirname, '../../.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    })
);

const TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;
const TWILIO_MESSAGING_SERVICE_SID = 'MGa84b8cec0c1b2e4c6be836fba0bd283c';  // Sole-Prop, Campaign #1

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing from .env.local');
  process.exit(1);
}

const COMMIT = process.argv.includes('--commit');

// Email-local-part fragments (full emails resolved from Firestore)
const TARGET_FRAGMENTS = [
  'ngrote523',
  'garrett.lovik',
  'rpd0017@auburn',
  'quinnbeasley',
  'nunnelleydvm',
  'ajelmore87',
  'brandiedorsett@gmail.com',  // full, new opt-in
];

const SKIP_FRAGMENTS = ['moorhead7', 'ljelmore572'];  // moorhead7 = Roby's call 5/18; ljelmore572 = Laura, leave alone

// Phone overrides — Roby provided these directly with consent (5/18). Patched onto user doc on --commit.
const PHONE_OVERRIDES = {
  'quinnbeasley@gmail.com': '+12562887472',
  'brandiedorsett@gmail.com': '+12564688490',
};

const serviceAccount = require(path.resolve(__dirname, '../serviceaccountkey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function craftMessage(firstName) {
  const name = firstName || 'there';
  return `Hi ${name}! counselinghomework.com now sends SMS homework reminders. You opted in. To turn off: Settings in the app. Reply STOP to opt out.`;
}

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

async function sendSms(toPhone, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: toPhone,
      MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      Body: body,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Twilio: ${data.message || JSON.stringify(data)}`);
  return data;
}

(async () => {
  console.log(`Mode: ${COMMIT ? 'COMMIT (will flip flag + send SMS)' : 'DRY-RUN (no writes, no sends)'}\n`);

  const snap = await db.collection('users').get();
  const allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

  const matches = [];
  for (const frag of TARGET_FRAGMENTS) {
    const found = allUsers.filter(u => u.email && u.email.toLowerCase().includes(frag.toLowerCase()));
    if (found.length === 0) {
      console.log(`MISS    ${frag}  (no user matched)`);
      continue;
    }
    if (found.length > 1) {
      console.log(`AMBIG   ${frag}  → ${found.map(f => f.email).join(', ')}`);
      continue;
    }
    matches.push(found[0]);
  }

  // Defensive: filter out anyone matching a skip fragment (e.g. moorhead7)
  const targets = matches.filter(u => {
    const isSkipped = SKIP_FRAGMENTS.some(s => u.email.toLowerCase().includes(s));
    if (isSkipped) console.log(`SKIP    ${u.email}  (in skip list)`);
    return !isSkipped;
  });

  console.log(`\n${targets.length} target users:\n`);

  let flipped = 0, alreadyOn = 0, noPhone = 0, sent = 0, sendFailed = 0;

  for (const u of targets) {
    const override = PHONE_OVERRIDES[u.email.toLowerCase()];
    const phone = override || formatPhone(u.phone);
    const isOverride = !!override && (formatPhone(u.phone) !== override);
    const currentlyOn = u.smsReminders === true;
    const msg = craftMessage(u.firstName || u.name);
    console.log(`  ${u.email}`);
    console.log(`    UID:          ${u.uid}`);
    console.log(`    Phone:        ${phone || '(NONE — will skip SMS)'}${isOverride ? '  [OVERRIDE — will write to user doc]' : ''}`);
    console.log(`    smsReminders: ${currentlyOn ? 'true (already on)' : 'false → flip to true'}`);
    console.log(`    Message:      "${msg}"`);

    if (COMMIT) {
      const updateFields = {};
      if (!currentlyOn) updateFields.smsReminders = true;
      if (isOverride) updateFields.phone = override;
      if (Object.keys(updateFields).length) {
        await db.doc(`users/${u.uid}`).update(updateFields);
        if (updateFields.smsReminders) { flipped++; console.log(`    ✓ Flipped smsReminders → true`); }
        if (updateFields.phone) console.log(`    ✓ Phone written: ${updateFields.phone}`);
      } else {
        alreadyOn++;
      }
      if (!phone) {
        noPhone++;
        console.log(`    ✗ No phone — SMS skipped`);
      } else {
        try {
          const result = await sendSms(phone, msg);
          sent++;
          console.log(`    ✓ SMS sent  SID=${result.sid}  status=${result.status}`);
        } catch (e) {
          sendFailed++;
          console.log(`    ✗ SMS failed: ${e.message}`);
        }
      }
    }
    console.log('');
  }

  console.log(`Summary: targets=${targets.length} flipped=${flipped} alreadyOn=${alreadyOn} noPhone=${noPhone} sent=${sent} failed=${sendFailed}`);
  if (!COMMIT) console.log('\nDRY-RUN — no writes, no sends. Re-run with --commit to apply.');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
