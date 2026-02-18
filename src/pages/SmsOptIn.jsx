import React from 'react';

export default function SmsOptIn() {
  const handleBack = () => {
    window.close();
    setTimeout(() => { window.location.href = '/login'; }, 100);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'inherit', lineHeight: 1.6, color: '#2d3748' }}>
      <button
        onClick={handleBack}
        style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '0.95rem', marginBottom: 16, padding: 0 }}
      >
        &larr; Back
      </button>

      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>SMS Opt-In Information</h1>
      <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 0 }}>How SMS reminders work on Counseling Homework</p>

      <h2>How Users Opt In to SMS Reminders</h2>
      <p>
        Counseling Homework is a web application for tracking biblical counseling homework. Counselors enroll counselees during in-person counseling sessions. After account creation, counselees log into <strong>counselinghomework.com</strong> and can optionally enable SMS reminders.
      </p>

      <h3>Step-by-Step Opt-In Process</h3>
      <ol style={{ lineHeight: 2 }}>
        <li>Counselee logs into their account at counselinghomework.com</li>
        <li>Counselee navigates to <strong>Account Settings</strong> (gear icon)</li>
        <li>Counselee selects the <strong>Reminders</strong> tab</li>
        <li>Counselee checks the <strong>"SMS reminders"</strong> checkbox</li>
        <li>Counselee enters their phone number</li>
        <li>Counselee clicks <strong>Save Preferences</strong></li>
      </ol>
      <p>
        <strong>SMS is unchecked by default.</strong> Users must actively check the box and provide their phone number. No SMS messages are sent until the user explicitly opts in.
      </p>

      {/* Actual screenshot of the Account Settings Reminders tab */}
      <h3>Account Settings — Reminders Tab (Screenshot)</h3>
      <img
        src="/sms-optin-screenshot.png"
        alt="Screenshot of Account Settings showing the Reminders tab with SMS reminders checkbox, phone number field, and weekly schedule"
        style={{ maxWidth: '100%', border: '2px solid #e2e8f0', borderRadius: 8, margin: '16px 0' }}
      />
      <p style={{ fontSize: '0.75rem', color: '#718096', fontStyle: 'italic' }}>
        Screenshot of the Account Settings Reminders tab showing the SMS opt-in checkbox, phone number field, and weekly reminder schedule.
      </p>

      <h2>What Messages Are Sent</h2>
      <p>If a user has opted in to SMS and has incomplete homework for the day, they receive up to 3 automated reminders at their chosen times. Examples:</p>
      <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, margin: '8px 0', fontSize: '0.9rem' }}>
        <em>"Counseling Homework Reminder: You have 2 items to complete today. Visit https://counselinghomework.com to check them off. Reply STOP to unsubscribe or HELP for support."</em>
      </div>
      <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, margin: '8px 0', fontSize: '0.9rem' }}>
        <em>"Counseling Homework: Don't forget — your Bible reading assignment is due this week (3 of 5 completed). Log in at https://counselinghomework.com. Reply STOP to opt out."</em>
      </div>

      <h2>How to Opt Out</h2>
      <ul>
        <li><strong>Reply STOP</strong> to any SMS message</li>
        <li><strong>Uncheck "SMS reminders"</strong> in Account Settings &gt; Reminders tab</li>
        <li><strong>Reply HELP</strong> for support information</li>
      </ul>
      <p>Message and data rates may apply. Message frequency: 1-3 messages per day, only on days with incomplete homework.</p>

      <h2>Related Policies</h2>
      <ul>
        <li><a href="/privacy" style={{ color: '#3182ce' }}>Privacy Policy</a></li>
        <li><a href="/tos" style={{ color: '#3182ce' }}>Terms of Service</a></li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions? Contact us at{' '}
        <a href="mailto:robdorsett@gmail.com" style={{ color: '#3182ce' }}>robdorsett@gmail.com</a>.
      </p>
    </div>
  );
}
