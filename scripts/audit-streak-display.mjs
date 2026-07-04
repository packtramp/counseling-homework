/**
 * Audit Roby's dashboard tile statuses against actual Firestore data.
 *
 * For each of Roby's APs + counselees, compute the same status the UI shows
 * (calculateAccountabilityStatus + isItemBehind) using the actual homework
 * collection, then print a side-by-side comparison so we can spot any
 * stale or buggy "Behind" labels.
 *
 * Usage:
 *   node scripts/audit-streak-display.mjs
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateAccountabilityStatus,
  calculateAPStreak,
  calculateWeekStreak,
  isItemBehind,
  isCompletedToday,
  isRequiredToday,
  isOnVacation,
  dayBucket,
} from '../src/utils/homeworkHelpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require(path.resolve(__dirname, '../serviceaccountkey.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const ROBY_EMAIL = 'robdorsett@gmail.com';

async function main() {
  // Find Roby's user doc
  const usersSnap = await db.collection('users').where('email', '==', ROBY_EMAIL).limit(1).get();
  if (usersSnap.empty) { console.error('No user found for ' + ROBY_EMAIL); process.exit(1); }
  const robyDoc = usersSnap.docs[0];
  const robyUid = robyDoc.id;
  console.log(`Roby UID: ${robyUid}\n`);

  // ============== ACCOUNTABILITY PARTNERS ==============
  // Find users who have Roby in their accountabilityPartnerUids
  const apsSnap = await db.collection('users').where('accountabilityPartnerUids', 'array-contains', robyUid).get();
  const apUsers = apsSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
  console.log(`=== ACCOUNTABILITY PARTNERS (${apUsers.length} total) ===\n`);
  for (const apUser of apUsers) {
    await auditUser(apUser, 'AP');
  }

  // ============== COUNSELEES ==============
  const counseleesSnap = await db.collection(`counselors/${robyUid}/counselees`).get();
  const counselees = counseleesSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
  console.log(`\n=== COUNSELEES (${counselees.length} total) ===\n`);
  for (const counselee of counselees) {
    await auditCounselee(counselee, robyUid);
  }

  process.exit(0);
}

async function fetchUserProfile(uid) {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? snap.data() : null;
}

async function fetchHomeworkForAPUser(uid) {
  // AP users are typically their own counselor. Iterate their counselees subcollection
  // and union homework across any matching counselee docs (filter to ones where uid===uid for self).
  const counseleesSnap = await db.collection(`counselors/${uid}/counselees`).get();
  if (counseleesSnap.empty) return { homework: [], context: `no counselees subcollection under counselors/${uid}` };
  const homework = [];
  let path = '';
  for (const c of counseleesSnap.docs) {
    const cd = c.data();
    // The AP's own homework is in the doc where counselee.uid === this AP's uid
    if (cd.uid === uid) {
      const hwSnap = await db.collection(`counselors/${uid}/counselees/${c.id}/homework`).get();
      hwSnap.docs.forEach(d => homework.push({ id: d.id, ...d.data() }));
      path = `counselors/${uid}/counselees/${c.id}/homework (self-counselor)`;
    }
  }
  return { homework, context: path || `${counseleesSnap.size} counselees but none with self uid` };
}

async function auditUser(user, kind) {
  const name = user.name || user.firstName || user.email || user.uid;
  console.log(`-- ${name} (${kind}) — uid=${user.uid}`);
  const { homework, context } = await fetchHomeworkForAPUser(user.uid);
  const profile = user;
  await analyze(name, homework, profile);
  console.log('');
}

async function auditCounselee(counselee, robyUid) {
  const name = counselee.name || counselee.firstName || '(no name)';
  const hasUid = !!counselee.uid;
  console.log(`-- ${name} (counselee) — counseleeDocId=${counselee.docId}, uid=${counselee.uid || 'NONE'}, graduated=${!!counselee.graduated}`);
  const hwSnap = await db.collection(`counselors/${robyUid}/counselees/${counselee.docId}/homework`).get();
  const homework = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // For counselees: profile lookup (for vacation) needs their user doc if they have a uid
  const profile = hasUid ? await fetchUserProfile(counselee.uid) : null;
  await analyze(name, homework, profile);
  console.log('');
}

function analyze(name, homework, profile) {
  if (homework.length === 0) {
    console.log(`   No homework documents found.`);
    return;
  }
  const active = homework.filter(h => h.status === 'active');
  const onVacation = isOnVacation(profile);
  console.log(`   Total: ${homework.length}, Active: ${active.length}, On vacation: ${onVacation}`);

  // Compute overall status using the same logic the UI uses
  const status = calculateAccountabilityStatus(homework, profile);
  const dayStreak = calculateAPStreak(homework, profile);
  const weekStreak = calculateWeekStreak(homework);
  const behindCount = homework.filter(h =>
    h.status !== 'cancelled' && h.status !== 'expired' && isItemBehind(h, new Date(), profile)
  ).length;

  const statusLabel = status === 'green' ? 'On track' :
                      status === 'warning' ? 'Required today' :
                      status === 'red' ? `Behind (${behindCount} item(s))` :
                      status === 'idle' ? 'No activity today (idle)' :
                      status === 'vacation' ? 'Vacation' :
                      status === 'neutral' ? 'Neutral (no homework)' :
                      status;
  console.log(`   STATUS:  ${statusLabel}    |  streak: ${dayStreak} days, ${weekStreak} weeks`);

  // Per-item detail
  for (const hw of active) {
    const behind = isItemBehind(hw, new Date(), profile);
    const doneToday = isCompletedToday(hw, new Date());
    const required = isRequiredToday(hw, new Date());
    const completions = (hw.completions || []).length;
    const lastCompletion = (hw.completions || []).length > 0
      ? (() => {
          const last = hw.completions[hw.completions.length - 1];
          const d = last.toDate ? last.toDate() : new Date(last.date || last);
          return d.toISOString().slice(0, 10);
        })()
      : '(never)';
    const target = hw.weeklyTarget || 7;
    const cap = hw.dailyCap || 999;
    const assigned = hw.assignedDate?.toDate ? hw.assignedDate.toDate().toISOString().slice(0,10) : '(none)';
    const flags = [
      behind && 'BEHIND',
      doneToday && 'doneToday',
      required && 'requiredToday',
    ].filter(Boolean).join(' ');
    console.log(`     • "${hw.title || hw.id}" — target=${target}/wk cap=${cap} completions=${completions} last=${lastCompletion} assigned=${assigned}  [${flags || 'ok'}]`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
