import admin from 'firebase-admin';
import { runDailyChores } from '../_lib/dailyChores.js';

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
      admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
    } catch (initError) {
      console.error('Firebase Admin init error:', initError.message);
    }
  }
}

/**
 * Daily housekeeping endpoint.
 *
 * NOTE: the actual work now lives in api/_lib/dailyChores.js and is ALSO driven by the reliable
 * 30-minute reminder cron (send-reminders.js). This Vercel daily cron historically never
 * authenticated (no CRON_SECRET set → 401 every night → never ran), so it is now just a
 * redundant trigger. runDailyChores() is guarded to run once per Central day regardless of how
 * many times / from where it's called, so this can't double-fire with the reminder cron.
 */
export default async function handler(req, res) {
  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase not initialized' });
  }
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await runDailyChores(new Date());
    return res.status(200).json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('Daily chores cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
