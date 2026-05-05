import React from 'react';

export default function PrivacyPolicy() {
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

      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 0 }}>Last updated: February 13, 2026</p>

      <h2>1. Who We Are</h2>
      <p>
        Counseling Homework ("the Service") is a free web-based tool for tracking biblical counseling homework. It is operated as a personal ministry project, not by a company. This Privacy Policy explains what information we collect, how we use it, and your rights.
      </p>

      <h2>2. Information We Collect</h2>

      <h3>Information You Provide</h3>
      <ul>
        <li><strong>Account information:</strong> Name, email address, password (encrypted), and optionally phone number and profile photo</li>
        <li><strong>Counseling data:</strong> Homework assignments and completion records, Heart Journal entries, Think List content, journal entries, and activity history</li>
        <li><strong>Preferences:</strong> Email and SMS reminder settings (times, frequency, phone number for SMS)</li>
      </ul>

      <h3>Information Collected Automatically</h3>
      <ul>
        <li><strong>Authentication data:</strong> Login timestamps, email verification status</li>
        <li><strong>Activity data:</strong> Homework check-off timestamps, last login, last activity date (used for streaks and reminders)</li>
      </ul>

      <h3>What We Do NOT Collect</h3>
      <ul>
        <li>We do not currently collect payment information (the Service is free at this time; this may change in the future)</li>
        <li>We do not use analytics tracking (no Google Analytics, no ad trackers)</li>
        <li>We do not collect location data</li>
        <li>We do not collect device fingerprints or browsing history</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <ul>
        <li><strong>To provide the Service:</strong> Displaying your homework, tracking progress, calculating streaks</li>
        <li><strong>To send email reminders:</strong> Homework reminders at your chosen times, daily summaries for counselors and accountability partners</li>
        <li><strong>To send SMS reminders:</strong> If you opt in to SMS notifications in your Account Settings, we send text message reminders to your phone number at times you configure. SMS is off by default and requires your explicit opt-in. You can opt out at any time by replying STOP to any message or toggling SMS off in Account Settings. <strong>SMS messages are reminders only — we do not send marketing, promotional, or sales messages of any kind.</strong></li>
        <li><strong>To send account emails:</strong> Signup confirmation, email verification, password resets, accountability partner invitations</li>
        <li><strong>To enable accountability:</strong> Sharing homework status with your approved accountability partners (mutual consent required)</li>
        <li><strong>To support counseling:</strong> Allowing your assigned counselor to view your homework progress, journals, and Think Lists</li>
      </ul>

      <h2>4. Who Can See Your Data</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '8px 4px' }}>Your Data</th>
            <th style={{ padding: '8px 4px' }}>Who Can See It</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px 4px' }}>Name, email, phone</td>
            <td style={{ padding: '8px 4px' }}>Your counselor, your accountability partners, administrators</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px 4px' }}>Homework progress</td>
            <td style={{ padding: '8px 4px' }}>Your counselor, your accountability partners (with consent)</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px 4px' }}>Journal & Think List content</td>
            <td style={{ padding: '8px 4px' }}>Your counselor only</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px 4px' }}>Heart Journal entries</td>
            <td style={{ padding: '8px 4px' }}>Your counselor only</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '8px 4px' }}>Profile photo</td>
            <td style={{ padding: '8px 4px' }}>Your counselor, your accountability partners</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Accountability Partners</strong> can only see your homework completion status (done/not done, streaks). They cannot see your journal content, Think List content, or Heart Journal entries. Both parties must consent before any accountability data is shared.
      </p>

      <h2>5. Data Storage and Security</h2>
      <p>Your data is stored using:</p>
      <ul>
        <li><strong>Google Firebase Authentication</strong> for login (passwords are encrypted, never stored in plain text)</li>
        <li><strong>Google Cloud Firestore</strong> for all counseling data (hosted in the United States)</li>
        <li><strong>Google Firebase Storage</strong> for profile photos</li>
        <li><strong>Vercel</strong> for hosting the application</li>
        <li><strong>Resend</strong> for sending emails</li>
        <li><strong>Twilio</strong> for sending SMS text messages (only if you opt in to SMS reminders)</li>
      </ul>
      <p>
        We use HTTPS encryption for all data in transit, Firebase security rules to restrict data access, and token-based authentication for API endpoints.
      </p>
      <p>
        <strong>Honest disclaimer:</strong> This Service is built and maintained by one person, not a professional security team. While we use industry-standard tools and follow security best practices, no system is 100% secure. Please do not store information that would cause serious harm if exposed (see Terms of Service, Section 8).
      </p>

      <h2>6. Data Sharing</h2>
      <p><strong>We do not sell, rent, or trade your personal information. Period.</strong></p>
      <p><strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> Your phone number is used solely to send SMS reminders that you have opted in to receive.</p>
      <p>We share data only with:</p>
      <ul>
        <li><strong>Service providers</strong> listed in Section 5 (Google, Vercel, Resend, Twilio) — only as needed to operate the Service</li>
        <li><strong>Your counselor and accountability partners</strong> — as described in Section 4</li>
        <li><strong>Law enforcement</strong> — only if required by law or court order</li>
      </ul>

      <h2>7. Your Rights</h2>
      <ul>
        <li><strong>Access:</strong> You can view all your data within the app at any time</li>
        <li><strong>Download:</strong> A data export feature is planned (coming soon)</li>
        <li><strong>Deletion:</strong> You can request account deletion by contacting us. Your counselor or an administrator can also delete your account, which removes all associated data</li>
        <li><strong>Correction:</strong> You can update your profile information in Account Settings</li>
        <li><strong>Revoke accountability:</strong> You can remove accountability partners at any time through the app</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>
        We use only essential cookies for authentication (keeping you logged in). We do not use advertising cookies, tracking cookies, or analytics cookies.
      </p>

      <h2>9. Children's Privacy</h2>
      <p>
        This Service is intended for users 18 years of age and older. We do not knowingly collect information from anyone under 18. If you believe a minor has created an account, please contact us.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Continued use of the Service after changes constitutes acceptance. We will make reasonable efforts to notify users of significant changes.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this Privacy Policy? Contact us at{' '}
        <a href="mailto:robdorsett@gmail.com" style={{ color: '#3182ce' }}>robdorsett@gmail.com</a>.
      </p>
    </div>
  );
}