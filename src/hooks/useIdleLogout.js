import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

// Idle auto sign-out. ON by default (HIPAA-level safeguard): if a logged-in device sits
// untouched for 30 minutes, we sign the user out so their counseling data isn't left open
// for the next person to pick up the phone/laptop. A user can deliberately turn this OFF in
// Settings, which sets profile.idleLogoutDisabled === true.
//
// Fixed at 30 minutes — no shorter/longer options (keeps it simple and predictable).
export const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_MS = 30 * 1000;            // poll cadence

// Pure decision (unit-tested): given the last activity time, is the session now idle-expired?
export function shouldLogout({ disabled, lastActive, now }) {
  if (disabled) return false;
  return now - lastActive >= IDLE_MS;
}

// Activity signals that count as "the user is still here". `mousemove` only writes a ref
// (no React re-render, no timer churn) so there is zero hot-path cost — important after the
// Sept perf work.
const EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'mousemove'];

export function useIdleLogout() {
  const { user, userProfile, logout } = useAuth();
  const lastActive = useRef(Date.now());
  const disabled = userProfile?.idleLogoutDisabled === true;

  useEffect(() => {
    if (!user || disabled) return;

    lastActive.current = Date.now();
    const mark = () => { lastActive.current = Date.now(); };
    EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const id = setInterval(() => {
      if (shouldLogout({ disabled, lastActive: lastActive.current, now: Date.now() })) {
        // Signing out flips useAuth's user to null; ProtectedRoute then redirects to /login.
        logout().catch(() => {});
      }
    }, CHECK_MS);

    return () => {
      clearInterval(id);
      EVENTS.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [user, disabled, logout]);
}
