/**
 * Reminder preference resolution (pure — unit tested).
 *
 * The user doc is what Settings writes — it is AUTHORITATIVE whenever it holds
 * an explicit boolean. The counselee doc's flags are a legacy mirror that
 * Settings does NOT keep in sync; it is only a fallback for accounts whose
 * user doc predates the flag.
 *
 * Bug this fixes (Garrett, 2026-07-23): gating was `user.flag || counselee.flag`,
 * so a stale counselee `emailReminders: true` overrode the user's explicit
 * opt-OUT — he kept getting emails with email switched off. OR-gating can only
 * ever ADD channels; it can never honor a "no".
 */
export const resolvePref = (userValue, counseleeValue) =>
  userValue !== undefined && userValue !== null ? !!userValue : !!counseleeValue;

/**
 * @returns {{ wantsSms: boolean, wantsEmail: boolean }}
 */
export const resolveReminderPrefs = (userData = {}, counselee = {}, phone, email) => ({
  wantsSms: resolvePref(userData.smsReminders, counselee.smsReminders) && !!phone,
  wantsEmail: resolvePref(userData.emailReminders, counselee.emailReminders) && !!email
});
