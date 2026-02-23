import React from 'react';

export default function HelpPage() {
  const handleBack = () => {
    window.close();
    setTimeout(() => { window.location.href = '/login'; }, 100);
  };

  const sectionStyle = { marginBottom: 32 };
  const h2Style = { fontSize: '1.2rem', color: '#2c5282', borderBottom: '2px solid #e2e8f0', paddingBottom: 6, marginBottom: 12 };
  const h3Style = { fontSize: '1rem', color: '#2d3748', marginBottom: 6, marginTop: 16 };
  const pStyle = { margin: '6px 0', fontSize: '0.92rem' };
  const ulStyle = { margin: '6px 0 12px', paddingLeft: 20, fontSize: '0.92rem' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'inherit', lineHeight: 1.6, color: '#2d3748' }}>
      <button
        onClick={handleBack}
        style={{ background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: '0.95rem', marginBottom: 16, padding: 0 }}
      >
        &larr; Back
      </button>

      <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#2b6cb0', lineHeight: 1.5 }}>
        <strong>Beta Notice:</strong> This app is currently in beta. Please do not enter any personal information you would not want others to discover. The app is in active development and data may not be fully secure. We are continuously testing and improving security as we go.
      </div>

      <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Help &amp; How It Works</h1>
      <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 0 }}>Everything you need to know about Counseling Homework</p>

      {/* Getting Started */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Getting Started</h2>
        <p style={pStyle}>
          Counseling Homework is a simple app for tracking homework assigned by your biblical counselor. Open the app, see what's due, tap to complete it, done.
        </p>
        <p style={pStyle}>
          When you first sign up, your counselor can add you as a counselee, or you can use the app independently to track your own growth. You can also invite friends as <strong>accountability partners</strong> to see your progress and encourage you along the way.
        </p>
      </div>

      {/* Adding Homework & Goals */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Adding Homework &amp; Goals</h2>
        <p style={pStyle}>
          You don't have to wait for a counselor to assign homework — you can add your own goals and tasks at any time.
        </p>

        <h3 style={h3Style}>How to Add Homework</h3>
        <ol style={ulStyle}>
          <li>From your dashboard, scroll to the <strong>Homework</strong> section</li>
          <li>Tap <strong>"+ Add Homework"</strong></li>
          <li>Enter a title (e.g., "Read Psalm 1 daily" or "Memorize Romans 8:1")</li>
          <li>Choose the type: <strong>Recurring Task</strong> or <strong>Memorization</strong></li>
          <li>Set the frequency — how often you need to do it:
            <ul style={{ marginTop: 4 }}>
              <li><strong>Daily</strong> — Every day</li>
              <li><strong>X times per week</strong> — A set number of times each week (e.g., 3x/week)</li>
            </ul>
          </li>
          <li>Set a due date (when the assignment ends)</li>
          <li>Tap <strong>Save</strong> — it appears on your dashboard immediately</li>
        </ol>
        <p style={pStyle}>
          Each day, just tap the <strong>checkbox</strong> next to a homework item to mark it done. The app tracks your completions and shows your progress toward weekly targets.
        </p>

        <h3 style={h3Style}>If You Have a Counselor</h3>
        <p style={pStyle}>
          Your counselor can also assign homework to you. These items show up on your dashboard automatically. You can complete counselor-assigned homework the same way — just tap to check it off.
        </p>
      </div>

      {/* Your Dashboard */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Your Dashboard</h2>
        <p style={pStyle}>
          Your dashboard is your home base. At the top you'll see your name, your streaks, and any encouragement you've received. Below that are your homework items, journals, and think lists.
        </p>

        <h3 style={h3Style}>Homework Items</h3>
        <p style={pStyle}>
          Homework can be assigned by your counselor or created by you. Each item has a schedule (daily, X times per week, etc.) and a due date. Tap the checkbox to mark it complete for the day.
        </p>
        <ul style={ulStyle}>
          <li><strong>Recurring tasks</strong> — Things to do daily or X times per week (e.g., "Read Romans 8 daily")</li>
          <li><strong>Memorization</strong> — Scripture memory assignments to check off as you practice</li>
        </ul>

        <h3 style={h3Style}>Heart Journals</h3>
        <p style={pStyle}>
          Heart Journals help you process emotions and situations biblically. When something triggers a strong reaction, open a Heart Journal to walk through what happened, what you felt, what you thought, and what Scripture says about it.
        </p>

        <h3 style={h3Style}>Think Lists</h3>
        <p style={pStyle}>
          Think Lists are collections of truth statements to review throughout your day. Your counselor (or you) can create lists of biblical truths to meditate on. The app reminds you to review them at times you choose.
        </p>

        <h3 style={h3Style}>Journals</h3>
        <p style={pStyle}>
          Free-form journaling space to help you journal regularly on things like thankfulness or God's mercy — to help you change habits and low views of God and His sovereign hand. Your counselor can see these to understand how you're doing between sessions.
        </p>
      </div>

      {/* Streaks */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Streaks</h2>
        <p style={pStyle}>
          Streaks help you stay consistent. You'll see two types:
        </p>

        <h3 style={h3Style}>Day Streak</h3>
        <p style={pStyle}>
          The goal of the day streak is to track <strong>daily activity in God's Word</strong> — not necessarily completeness. It's about showing up each day, not being perfect. Your streak counts how many days you've done at least one thing. Rest days don't add to it, but they don't necessarily end it either.
        </p>
        <ul style={ulStyle}>
          <li><strong>Check off at least 1 item</strong> — Your streak goes up by one</li>
          <li><strong>Skip a day, but still on track</strong> — If you take a day off but you still have enough days left in the week to meet all your targets, your streak <strong>holds</strong>. It doesn't go up, but it doesn't reset.</li>
          <li><strong>Fall behind</strong> — If you miss enough that it becomes <strong>mathematically impossible</strong> to finish any homework item on time, your streak resets to zero</li>
        </ul>
        <p style={pStyle}>
          <strong>Example:</strong> You have a "5 times per week" item. By Thursday you've already done all 5. Friday and Saturday you rest — your streak holds (it doesn't go up, but it doesn't reset). On Sunday you check something off and it goes up again.
        </p>
        <p style={pStyle}>
          <strong>Overachievers:</strong> Already hit your weekly target? You can still check it off again for extra credit (6/5, 7/5, etc.) — and your streak will increase for that day.
        </p>
        <p style={pStyle}>
          <strong>Important:</strong> Your day streak tracks whether you <em>showed up</em>, not whether every single item is on track. It's possible to have a growing streak while still being "behind" on a specific item — the streak rewards daily effort, while the behind status looks at each item individually.
        </p>

        <h3 style={h3Style}>Week Streak</h3>
        <p style={pStyle}>
          Your week streak counts <strong>consecutive weeks</strong> where you did at least one thing. Weeks run Sunday through Saturday. You only need <strong>one checkmark</strong> anywhere in the week for it to count. This is more forgiving than the day streak — even if you miss several days, your week streak stays alive as long as you do something each week.
        </p>
        <p style={pStyle}>
          <em>Note: Day and week streaks measure different things, so the numbers won't always match up. That's normal — day streaks count active days, week streaks count active weeks.</em>
        </p>
      </div>

      {/* Accountability Partners */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Accountability Partners</h2>
        <p style={pStyle}>
          Accountability Partners (APs) are people who can see your homework progress and encourage you. This is a two-way relationship — both people can see each other's data.
        </p>

        <h3 style={h3Style}>Adding an AP</h3>
        <ul style={ulStyle}>
          <li>Open the <strong>Accountability Partners</strong> section on your dashboard</li>
          <li>Search for someone by name or email</li>
          <li>If they already have an account, send a <strong>partner request</strong></li>
          <li>If they don't have an account, send an <strong>invite</strong> — they'll get an email to sign up</li>
          <li>Once they accept, you'll both appear on each other's dashboards</li>
        </ul>

        <h3 style={h3Style}>What Your AP Sees</h3>
        <p style={pStyle}>
          Your AP can see your homework list, whether you've completed items, your streaks, your journals, and your think lists. They <strong>cannot</strong> edit your homework — it's read-only for them.
        </p>

        <h3 style={h3Style}>AP Tiles</h3>
        <p style={pStyle}>
          Each AP appears as a color-coded tile on your dashboard. The color and label tell you where they stand:
        </p>
        <ul style={ulStyle}>
          <li><strong style={{ color: '#38a169' }}>Green — "On track"</strong> — They've completed their homework for today</li>
          <li><strong style={{ color: '#d69e2e' }}>Yellow — "Required today"</strong> — They need to complete something today or they'll fall behind this week</li>
          <li><strong style={{ color: '#718096' }}>Gray — "No activity today"</strong> — They haven't done anything today, but still have buffer days to catch up this week</li>
          <li><strong style={{ color: '#e53e3e' }}>Red — "Behind"</strong> — They've missed enough that they can't catch up this week even with max effort</li>
        </ul>
        <p style={pStyle}>
          Each tile also shows two streak circles:
        </p>
        <ul style={ulStyle}>
          <li><strong style={{ color: '#38a169' }}>Green circle</strong> — Their <strong>day streak</strong> (consecutive days with at least one completion)</li>
          <li><strong style={{ color: '#2b6cb0' }}>Blue circle</strong> — Their <strong>week streak</strong> (consecutive weeks with at least one completion)</li>
        </ul>
        <p style={pStyle}>
          A gray circle with "0" means their streak has reset. See the <strong>Day Streak</strong> and <strong>Week Streak</strong> sections above for how streaks grow and reset.
        </p>
      </div>

      {/* Encouragement System */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Encouragement (Cheers, Nudges, Messages)</h2>
        <p style={pStyle}>
          You can encourage your APs and counselees using three actions, found at the bottom of each person's tile:
        </p>
        <ul style={ulStyle}>
          <li><strong>👍 Cheer</strong> — A thumbs-up to recognize their hard work</li>
          <li><strong>👊 Nudge</strong> — A friendly fist bump to encourage them to stay on track</li>
          <li><strong>💬 Message</strong> — A short personal message (up to 500 characters)</li>
        </ul>
        <p style={pStyle}>
          Each action sends an <strong>immediate email</strong> to the recipient. You can send one of each type per person per day.
        </p>
        <p style={pStyle}>
          You can see your own received cheers, nudges, and messages on your dashboard greeting area. Only <strong>you</strong> see your own counts — other people can't see how many you've received.
        </p>
      </div>

      {/* Email Reminders */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Email Reminders</h2>
        <p style={pStyle}>
          The app can send you up to 3 email reminders per day to help you stay on track with your homework. You control the schedule in <strong>Account Settings &gt; Reminders</strong>.
        </p>
        <ul style={ulStyle}>
          <li><strong>Reminder 1</strong> — Your daily overview showing all homework and progress</li>
          <li><strong>Reminders 2 &amp; 3</strong> — Only sent if you have items that are behind or critical</li>
        </ul>
        <p style={pStyle}>
          You pick the times for each reminder slot (e.g., 9 AM, 3 PM, 8 PM). If you're all caught up, the later reminders won't bother you.
        </p>
      </div>

      {/* For Counselors */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>For Counselors</h2>
        <p style={pStyle}>
          If you're a counselor, you'll see a <strong>"My Counselees"</strong> section on your dashboard in addition to your own homework area.
        </p>

        <h3 style={h3Style}>Adding Counselees</h3>
        <ul style={ulStyle}>
          <li>Click <strong>"+ Add Counselee"</strong> in the My Counselees section</li>
          <li>Enter their name and email — they'll receive an invite to create their account</li>
          <li>You can also add counselees without an email (offline tracking) and activate their login later</li>
        </ul>

        <h3 style={h3Style}>Managing Homework</h3>
        <ul style={ulStyle}>
          <li>Click on a counselee to open their detail view</li>
          <li>Assign recurring tasks, memorization, think lists, and more</li>
          <li>Set frequency (daily, X/week) and due dates</li>
          <li>View their completion history and streaks</li>
          <li>Edit or remove homework items as needed</li>
        </ul>

        <h3 style={h3Style}>Session Notes</h3>
        <p style={pStyle}>
          Record notes from each counseling session. Both you and your counselee can add notes — helpful for tracking discussion points, action items, and progress over time.
        </p>

        <h3 style={h3Style}>Daily Summary Email</h3>
        <p style={pStyle}>
          Each evening at 11 PM, you receive a summary email listing all your active counselees with their status: on track, behind, or complete. This helps you know who might need extra follow-up.
        </p>

        <h3 style={h3Style}>Graduating Counselees</h3>
        <p style={pStyle}>
          When a counselee completes their counseling program, you can <strong>graduate</strong> them. Graduated counselees move to a separate tab and stop receiving reminders, but their data is preserved. You can reactivate them at any time.
        </p>
      </div>

      {/* Requesting a Counselee Account */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Getting a Counselee Account</h2>
        <p style={pStyle}>
          If you're seeking biblical counseling and want to use this app:
        </p>
        <ul style={ulStyle}>
          <li>Ask your counselor if they use Counseling Homework</li>
          <li>Your counselor will send you an invite email with a link to create your account</li>
          <li>Once you sign up, you'll be automatically linked to your counselor</li>
          <li>You can also sign up on your own and use the app independently for personal growth — no counselor required</li>
        </ul>
      </div>

      {/* Account Settings */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Account Settings</h2>
        <p style={pStyle}>
          Access Account Settings by tapping your profile icon in the top right corner. From there you can:
        </p>
        <ul style={ulStyle}>
          <li>Update your name and profile photo</li>
          <li>Change your email or phone number</li>
          <li>Configure your reminder schedule (times and days)</li>
          <li>Turn email reminders on or off</li>
        </ul>

        <h3 style={h3Style}>Your Activity History</h3>
        <p style={pStyle}>
          Every homework check-off is logged with a timestamp. Your counselor (and you) can view your activity history to see exactly what was completed and when. This log is permanent — nothing is ever deleted, so progress can always be reviewed and streaks can be verified.
        </p>
      </div>

      {/* Contact */}
      <div style={sectionStyle}>
        <h2 style={h2Style}>Need More Help?</h2>
        <p style={pStyle}>
          If you have questions or run into issues, contact your counselor directly or email <a href="mailto:roby@dorsettgroup.com" style={{ color: '#3182ce' }}>roby@dorsettgroup.com</a>.
        </p>
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 32, textAlign: 'center', color: '#a0aec0', fontSize: '0.8rem' }}>
        Counseling Homework &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
