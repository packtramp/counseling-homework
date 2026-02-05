/**
 * Check SMS delivery status via Twilio
 * GET /api/check-sms?sid=SMXXXXXXX  - check specific message
 * GET /api/check-sms?recent=5        - check last N messages
 */
export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.REMINDER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    return res.status(500).json({ error: 'Twilio not configured' });
  }

  const sid = req.query.sid;
  const recent = parseInt(req.query.recent) || 5;

  const headers = {
    'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  };

  try {
    if (sid) {
      // Check specific message
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`,
        { headers }
      );
      const data = await response.json();
      return res.status(200).json({
        sid: data.sid,
        status: data.status,
        to: data.to,
        from: data.from,
        body: data.body?.substring(0, 50) + '...',
        errorCode: data.error_code,
        errorMessage: data.error_message,
        dateSent: data.date_sent,
        dateCreated: data.date_created
      });
    } else {
      // Check recent messages
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=${recent}&From=${encodeURIComponent(fromNumber)}`,
        { headers }
      );
      const data = await response.json();
      const messages = (data.messages || []).map(m => ({
        sid: m.sid,
        status: m.status,
        to: m.to,
        body: m.body?.substring(0, 60) + '...',
        errorCode: m.error_code,
        errorMessage: m.error_message,
        dateSent: m.date_sent
      }));
      return res.status(200).json({ count: messages.length, fromNumber, messages });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
