import React from 'react';

/**
 * Onboarding messages shown to new users, one per day, in sequence.
 * To add a new tip: append to this array. Existing users who finished
 * will automatically see it on their next login.
 */
const ONBOARDING_MESSAGES = [
  {
    id: 'create-goals',
    title: 'Welcome! Start by Adding Goals',
    body: (
      <>
        <p>You can add your own goals and homework anytime — you don't need a counselor to assign them.</p>
        <p>Scroll to the <strong>Homework</strong> section on your dashboard and tap <strong>"+ Add Homework"</strong> to get started.</p>
      </>
    )
  },
  {
    id: 'check-off',
    title: 'Check Off Homework Daily',
    body: (
      <>
        <p>Each day, tap the <strong>checkbox</strong> next to a homework item to mark it done.</p>
        <p>Your progress is tracked automatically — you'll see your weekly count update in real time.</p>
      </>
    )
  },
  {
    id: 'invite-aps',
    title: 'Invite Accountability Partners',
    body: (
      <>
        <p>Invite friends or family to see your progress and encourage you along the way.</p>
        <p>Open <strong>Accountability Partners</strong> on your dashboard to search for someone or send an invite.</p>
      </>
    )
  },
  {
    id: 'streaks',
    title: 'Build Your Streak',
    body: (
      <>
        <p>Your <strong>day streak</strong> tracks daily activity in God's Word — not perfection, just showing up.</p>
        <p>Do at least <strong>1 thing</strong> each day to keep it growing. Rest days with cushion won't reset it.</p>
      </>
    )
  },
  {
    id: 'need-help',
    title: 'Need Help?',
    body: (
      <>
        <p>Tap your <strong>profile icon</strong> in the top right corner, then <strong>Help</strong> for a full guide on how everything works.</p>
        <p>You'll find details on streaks, accountability partners, reminders, and more.</p>
      </>
    )
  },
  {
    id: 'journaling',
    title: 'Heart Journals',
    body: (
      <>
        <p><strong>Heart Journals</strong> help you process situations biblically.</p>
        <p>When something triggers a strong reaction, open a Heart Journal to walk through what happened, what you felt, what you thought, and what Scripture says about it.</p>
      </>
    )
  },
  {
    id: 'think-lists',
    title: 'Think Lists',
    body: (
      <>
        <p><strong>Think Lists</strong> are collections of truth statements to review throughout your day.</p>
        <p>You or your counselor can create them. The app reminds you to review them at times you choose.</p>
      </>
    )
  },
  {
    id: 'encouragement',
    title: 'Cheer, Nudge, & Message',
    body: (
      <>
        <p>You can encourage your accountability partners and counselees using the bar at the bottom of their tile:</p>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>
          <li><strong>Cheer</strong> — A thumbs-up for their hard work</li>
          <li><strong>Nudge</strong> — A friendly fist bump to stay on track</li>
          <li><strong>Message</strong> — A short personal note</li>
        </ul>
        <p>Each sends an immediate email to encourage them.</p>
      </>
    )
  },
  {
    id: 'sms-phone',
    title: 'Get SMS Reminders',
    body: (
      <>
        <p>Want text message reminders? Add your <strong>phone number</strong> in <strong>Account Settings</strong> and turn on SMS reminders.</p>
        <p>You'll get up to 3 texts a day at the times you choose to help you stay on track with your homework.</p>
      </>
    )
  }
];

/**
 * Determine which onboarding message to show (if any).
 * Pure function for testability.
 *
 * @param {number|undefined|null} step - User's current onboarding step
 * @param {Date|Object|null} lastSeen - Timestamp of last dismissed message
 * @param {Date} [now] - Current date (for testing)
 * @returns {{ index: number, message: Object }|null} Next message to show, or null
 */
export const getNextOnboardingMessage = (step, lastSeen, now = new Date()) => {
  // No field or null = hasn't started onboarding yet → begin at step 0
  const currentStep = (typeof step === 'number') ? step : 0;

  // All messages seen
  if (currentStep >= ONBOARDING_MESSAGES.length) return null;

  // Max 1 per day: check if already dismissed one today
  if (lastSeen) {
    const lastDate = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
    if (lastDate.toDateString() === now.toDateString()) return null;
  }

  return {
    index: currentStep,
    message: ONBOARDING_MESSAGES[currentStep]
  };
};

// Export for testing
export const MESSAGE_COUNT = ONBOARDING_MESSAGES.length;

export default function OnboardingModal({ step, lastSeen, onDismiss }) {
  const result = getNextOnboardingMessage(step, lastSeen);
  if (!result) return null;

  const { index, message } = result;
  const total = ONBOARDING_MESSAGES.length;

  return (
    <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && onDismiss(index)}>
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <span className="onboarding-step-badge">Tip {index + 1} of {total}</span>
        </div>
        <h2 className="onboarding-title">{message.title}</h2>
        <div className="onboarding-body">{message.body}</div>
        <button
          className="onboarding-dismiss-btn"
          onClick={() => onDismiss(index)}
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
