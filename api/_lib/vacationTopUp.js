/**
 * Vacation auto-complete top-up planning (pure functions — unit tested).
 *
 * Vacation must pause EVERYTHING. The old logic added ONE completion per missed
 * day, which was enough for normal homework but left multi-times-per-day items
 * (Think Lists: dailyCap 2-3 toward a 15-21 weekly target) mathematically
 * behind after a long vacation. Each vacation day now tops the item up to its
 * FULL daily cap.
 *
 * Timestamps are returned as distinct millisecond values 1s apart because
 * Firestore arrayUnion silently dedupes identical values — N copies of one
 * timestamp would collapse into a single completion.
 */

/** How many completions per day this item needs to be fully "done" for the day. */
export const effectiveDailyCap = (hw) => {
  const cap = hw?.dailyCap;
  if (!cap || cap >= 999) return 1; // uncapped items: 1/day is a full day
  return Math.min(cap, 10);         // sanity bound against bad data
};

/**
 * Plan the auto-completions for one item on one vacation day.
 * @returns {{ addMs: number[], stampAuto: boolean }}
 *   addMs     - millisecond timestamps to add (empty if the day is already full)
 *   stampAuto - true only when the ENTIRE day is auto-filled (zero real work).
 *               Partial days are NOT stamped: autoCompletedDates is day-granular
 *               and the streak calc treats a stamped day as "no real work" —
 *               stamping a partial day would erase streak credit the user earned.
 */
export const planDayTopUp = (hw, completionsOnDay, baseMs) => {
  const need = effectiveDailyCap(hw) - completionsOnDay;
  const addMs = [];
  for (let i = 0; i < need; i++) addMs.push(baseMs + i * 1000);
  return { addMs, stampAuto: addMs.length > 0 && completionsOnDay === 0 };
};
