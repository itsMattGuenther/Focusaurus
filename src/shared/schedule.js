/* ==========================================================================
   Work-hours schedule
   --------------------------------------------------------------------------
   PURE MODULE (DESIGN.md ADR-8).

   Two responsibilities:
     - answering "are we inside work hours right now"
     - deciding whether the schedule should start or stop a session

   Both live here so the options page, the mood engine and the service worker
   agree on one definition. Before this, `isWithinSchedule` lived in mood.js
   and the schedule setting had no effect on enforcement at all — it only
   tinted Doug's mood, which would make a "work hours" toggle in the options
   page actively misleading.
   ========================================================================== */

/** Minutes since local midnight. */
function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/** "HH:MM" -> minutes since midnight. */
export function parseClock(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** True when `start` is later in the day than `end`, e.g. 22:00-04:00. */
export function isOvernight(schedule) {
  return parseClock(schedule.start) > parseClock(schedule.end);
}

/**
 * Is `date` inside the configured work window?
 *
 * A schedule that's absent or disabled counts as "always on the clock", so
 * callers without a schedule behave exactly as they did before schedules
 * existed.
 */
export function isWithinSchedule(schedule, date) {
  if (!schedule || !schedule.enabled) return true;

  const now = minutesOfDay(date);
  const start = parseClock(schedule.start);
  const end = parseClock(schedule.end);

  if (start <= end) {
    // Same-day window: the day must be selected AND the clock must be inside.
    if (Array.isArray(schedule.days) && !schedule.days.includes(date.getDay())) return false;
    return now >= start && now < end;
  }

  // Overnight window. The selected day refers to the day the window STARTED,
  // so the small hours belong to the previous day's shift — otherwise a
  // Mon-Fri 22:00-04:00 schedule would cut out at midnight on Friday night.
  if (!Array.isArray(schedule.days)) return now >= start || now < end;

  if (now >= start) return schedule.days.includes(date.getDay());
  const yesterday = (date.getDay() + 6) % 7;
  return now < end && schedule.days.includes(yesterday);
}

/**
 * Timestamp at which the current work window closes.
 * Assumes we're inside the window; used to set a scheduled session's endsAt.
 */
export function windowEndsAt(schedule, now = new Date()) {
  const end = parseClock(schedule.end);
  const at = new Date(now);
  at.setHours(Math.floor(end / 60), end % 60, 0, 0);

  // For an overnight window, "end" is tomorrow if we're still before midnight.
  if (isOvernight(schedule) && minutesOfDay(now) >= parseClock(schedule.start)) {
    at.setDate(at.getDate() + 1);
  }
  return at.getTime();
}

/**
 * Should the schedule act right now?
 *
 * @param {object}  args
 * @param {Date}    [args.now]
 * @param {object}  args.schedule
 * @param {object}  [args.session]         current session, if any
 * @param {number}  [args.suppressedUntil] auto-start is muted until this ts
 * @returns {{action: 'start'|'stop'|'none', endsAt?: number, reason: string}}
 */
export function decideScheduleAction({
  now = new Date(),
  schedule,
  session = null,
  suppressedUntil = null,
} = {}) {
  const scheduled = session && session.source === 'schedule';

  if (!schedule || !schedule.enabled) {
    // Turning the schedule off shouldn't leave its session running.
    if (scheduled) return { action: 'stop', reason: 'schedule-disabled' };
    return { action: 'none', reason: 'no-schedule' };
  }

  if (isWithinSchedule(schedule, now)) {
    // A manual session inside work hours is the user's call — never touch it.
    if (session) return { action: 'none', reason: 'session-already-running' };

    // Manually ending a scheduled session mutes auto-start for the rest of the
    // window. Without this, quitting a session would silently restart it within
    // a minute, which is the single most infuriating way to build this feature.
    if (suppressedUntil && now.getTime() < suppressedUntil) {
      return { action: 'none', reason: 'suppressed' };
    }

    return {
      action: 'start',
      endsAt: windowEndsAt(schedule, now),
      reason: 'within-hours',
    };
  }

  // Outside hours: retire the schedule's own session, leave a manual one be.
  if (scheduled) return { action: 'stop', reason: 'outside-hours' };
  return { action: 'none', reason: 'outside-hours' };
}

/** Local YYYY-MM-DD. Deliberately not UTC — a day that rolls over at 7pm
 *  would make every budget and streak nonsense (DESIGN.md §4). */
export function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Human summary for the options page, e.g. "Mon-Fri, 9:00 AM - 5:00 PM". */
export function describeSchedule(schedule) {
  if (!schedule || !schedule.enabled) return 'Off';

  const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = Array.isArray(schedule.days) ? [...schedule.days].sort((a, b) => a - b) : [];

  let dayText;
  if (days.length === 0) dayText = 'No days';
  else if (days.length === 7) dayText = 'Every day';
  else if (days.join() === '1,2,3,4,5') dayText = 'Weekdays';
  else if (days.join() === '0,6') dayText = 'Weekends';
  else dayText = days.map((d) => NAMES[d]).join(', ');

  const clock = (hhmm) => {
    const mins = parseClock(hhmm);
    const h24 = Math.floor(mins / 60);
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(mins % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  };

  return `${dayText}, ${clock(schedule.start)} – ${clock(schedule.end)}`;
}
