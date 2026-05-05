import React from 'react';

export default function TermsOfService() {
  const handleBack = () => {
    window.close();
    // If window.close() didn't work (direct navigation), go to login
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

      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 0 }}>Last updated: February 13, 2026</p>

      <h2>1. What This Is</h2>
      <p>
        Counseling Homework ("the Service") is a web-based tool for tracking biblical counseling homework assignments, journaling, and accountability. It is operated as a personal ministry project and is not a commercial product.
      </p>
      <p>
        The Service is currently provided free of charge. However, we reserve the right to introduce a paid pricing model, subscription fees, or other charges at any time, with reasonable notice to existing users. Continued use of the Service after any pricing change constitutes acceptance of those terms.
      </p>
      <p>
        By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old to use this Service. By creating an account, you confirm that you are 18 or older.
      </p>

      <h2>3. Your Account</h2>
      <p>
        You are responsible for keeping your login credentials secure. You are responsible for all activity under your account. If you believe your account has been compromised, contact us immediately.
      </p>

      <h2>4. How the Service Works</h2>
      <ul>
        <li><strong>Counselors</strong> can assign homework, view progress, and manage counselee accounts.</li>
        <li><strong>Counselees</strong> can check off homework, write journal entries, complete Think Lists, and track their progress.</li>
        <li><strong>Accountability Partners</strong> can view each other's homework status (with mutual consent). Both parties must agree before any data is shared.</li>
      </ul>

      <h2>5. Your Data</h2>
      <p>
        You own your data. We do not sell, rent, or trade your personal information. See our <a href="/privacy" style={{ color: '#3182ce' }}>Privacy Policy</a> for details on what we collect and how we use it.
      </p>
      <p>
        Your counseling data (homework, journals, Think Lists) is stored in a cloud database (Google Firebase/Firestore). While we take reasonable steps to protect it, this Service is operated by an individual, not a professional software company. See Section 8 for important disclaimers.
      </p>

      <h2>6. Email & SMS Communications</h2>
      <p>By using this Service, you consent to receive the following <strong>emails</strong>:</p>
      <ul>
        <li><strong>Homework reminder emails</strong> at times you configure in your account settings</li>
        <li><strong>Daily summary emails</strong> (for counselors and accountability partners)</li>
        <li><strong>Account-related emails</strong> (password resets, invite notifications, signup confirmations)</li>
      </ul>
      <p>
        You can adjust email reminder frequency in your account settings. To stop all emails, contact us or delete your account.
      </p>

      <h3>SMS Text Messages</h3>
      <p>
        SMS reminders are <strong>off by default</strong>. You may opt in to receive SMS homework reminders by navigating to Account Settings and toggling "SMS Reminders" on and providing your phone number. If you opt in, you consent to receive up to 3 automated text messages per day reminding you of incomplete homework items. Message frequency depends on your reminder schedule and homework status. Message and data rates may apply.
      </p>
      <p>
        <strong>Reminders only — no marketing.</strong> All SMS messages from this Service are transactional homework reminders. We do not send marketing, promotional, or sales messages of any kind, and we will not share your phone number with third parties for marketing purposes.
      </p>
      <p>
        <strong>To opt out of SMS at any time:</strong> reply STOP to any message, or toggle SMS Reminders off in your Account Settings. Reply HELP for support. Opting out of SMS does not affect email reminders or your account.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose</li>
        <li>Attempt to access another user's account or data without authorization</li>
        <li>Interfere with or disrupt the Service</li>
        <li>Use automated tools to scrape or harvest data from the Service</li>
      </ul>

      <h2>8. Disclaimers &mdash; Please Read</h2>
      <p>
        <strong>This Service is provided "as is" without warranties of any kind.</strong> It is a free tool built and maintained by one person as a ministry project. Specifically:
      </p>
      <ul>
        <li>We do not guarantee the Service will be available at all times or free from errors.</li>
        <li>We do not guarantee the security of your data against all threats. While we use industry-standard tools (Firebase Authentication, Firestore security rules, HTTPS), no system is perfectly secure.</li>
        <li><strong>Do not store highly sensitive information</strong> (Social Security numbers, financial data, medical records, passwords, or anything that would cause serious harm if exposed) in your homework entries, journals, or Think Lists. The Service is designed for counseling homework tracking, not sensitive document storage.</li>
        <li>We are not liable for any data loss, breach, or unauthorized access.</li>
      </ul>

      <h2>9. Hold Harmless &amp; Limitation of Liability</h2>
      <p>
        <strong>You agree to hold harmless the operator of this Service</strong> (Robert Dorsett and any contributors, volunteers, or affiliates) from any and all claims, damages, losses, liabilities, costs, or expenses (including attorney fees) arising from your use of the Service, including but not limited to data loss, security incidents, service interruptions, or reliance on any content or feature provided by the Service.
      </p>
      <p>
        To the maximum extent permitted by law, Counseling Homework and its operator shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages, or any loss of data, arising from your use of or inability to use the Service.
      </p>
      <p>
        This Service is not a substitute for professional counseling, therapy, or medical advice. The operator is not responsible for any decisions, actions, or outcomes resulting from the use of this Service.
      </p>

      <h2>10. Account Termination</h2>
      <p>
        You may request account deletion at any time by contacting us. Your counselor or an administrator can also remove your account. We reserve the right to suspend or terminate accounts that violate these Terms.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms. We will make reasonable efforts to notify users of significant changes.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Alabama, United States.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href="mailto:robdorsett@gmail.com" style={{ color: '#3182ce' }}>robdorsett@gmail.com</a>.
      </p>
    </div>
  );
}