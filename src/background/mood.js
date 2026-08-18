/* ==========================================================================
   Mood resolution
   --------------------------------------------------------------------------
   PURE MODULE (DESIGN.md ADR-8).

   Doug's mood is the primary output of the whole product — the thing you're
   meant to read at a glance instead of opening a dashboard. So it's a
   priority-ordered rule list, not a blended numeric score.

   A score would be untunable and, worse, unexplainable: "why is Doug sad?"
   has to have a one-sentence answer, because an unexplained mood is just
   decoration. First match wins, top down.

   Budget-driven rules (4 and 5) are implemented now but can't fire until v0.4
   ships the tracker — `budgets` simply arrives empty until then.

   Schedule and date helpers live in shared/schedule.js, since the options page
   and the service worker need the same definitions.
   ========================================================================== */

import { isWithinSchedule } from '../shared/schedule.js';

/**
 * Resolve Doug's mood.
 *
 * @param {object} s
 * @param {Date}    [s.now]
 * @param {object}  [s.schedule]
 * @param {object}  [s.session]           truthy when a session is running
 * @param {number}  [s.recentAttempts]    block hits in the last ~10 min
 * @param {number[]}[s.budgets]           percentages used, 0..N
 * @param {number}  [s.streak]            consecutive good days
 * @returns {{mood: string, because: string}}
 */
export function resolveMood({
  now = new Date(),
  schedule = null,
  session = null,
  recentAttempts = 0,
  budgets = [],
  streak = 0,
} = {}) {
  // 1. Off the clock, nothing running.
  if (schedule && schedule.enabled && !session && !isWithinSchedule(schedule, now)) {
    return { mood: 'asleep', because: "It's outside your work hours." };
  }

  // 2/3. A running session outranks every negative mood below. This ordering
  // IS the recovery rule from DESIGN.md §5 — starting a session must always be
  // enough to pull Doug out of a bad mood. Do not reorder these below 4/5.
  if (session) {
    if (recentAttempts === 0) {
      return { mood: 'locked_in', because: 'Deep in a session with no slips.' };
    }
    return { mood: 'focused', because: 'A session is running.' };
  }

  const maxBudget = budgets.length ? Math.max(...budgets) : 0;

  // 4. Something blown.
  if (maxBudget >= 100) {
    return { mood: 'bummed', because: 'A budget got used up today.' };
  }

  // 5. Something close.
  if (maxBudget >= 80) {
    return { mood: 'side_eye', because: "You're close to one of your limits." };
  }

  // 6. On a run and comfortably inside every budget.
  if (streak >= 3 && maxBudget < 50) {
    return { mood: 'stoked', because: `${streak} good days in a row.` };
  }

  // 7. Default.
  return { mood: 'chill', because: 'Nothing running right now.' };
}
