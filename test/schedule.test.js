import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideScheduleAction,
  describeSchedule,
  isOvernight,
  isWithinSchedule,
  localDayKey,
  parseClock,
  windowEndsAt,
} from '../src/shared/schedule.js';

/** Local-time Date, so these tests don't shift with the runner's timezone. */
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);

const WEEKDAYS = { enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
const NIGHTS = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '04:00' };

/* --- Clock parsing -------------------------------------------------------- */

test('parseClock handles the formats the options page emits', () => {
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('09:30'), 570);
  assert.equal(parseClock('23:59'), 1439);
  // Garbage degrades to midnight rather than NaN, which would poison every
  // comparison downstream.
  assert.equal(parseClock('nonsense'), 0);
  assert.equal(parseClock(''), 0);
});

test('isOvernight detects a wrapped window', () => {
  assert.equal(isOvernight(WEEKDAYS), false);
  assert.equal(isOvernight(NIGHTS), true);
});

/* --- Window membership ---------------------------------------------------- */

test('a disabled or absent schedule counts as always on the clock', () => {
  // So every caller behaves exactly as it did before schedules existed.
  assert.equal(isWithinSchedule(null, at(2026, 8, 19, 3)), true);
  assert.equal(isWithinSchedule({ enabled: false }, at(2026, 8, 19, 3)), true);
});

test('same-day window: inside, outside, and boundaries', () => {
  // 2026-08-19 is a Wednesday.
  assert.equal(isWithinSchedule(WEEKDAYS, at(2026, 8, 19, 12)), true);
  assert.equal(isWithinSchedule(WEEKDAYS, at(2026, 8, 19, 8, 59)), false);
  assert.equal(isWithinSchedule(WEEKDAYS, at(2026, 8, 19, 21)), false);
  // Start inclusive, end exclusive.
  assert.equal(isWithinSchedule(WEEKDAYS, at(2026, 8, 19, 9, 0)), true);
  assert.equal(isWithinSchedule(WEEKDAYS, at(2026, 8, 19, 17, 0)), false);
});

test('unselected days are outside regardless of the clock', () => {
  // 2026-08-22 is a Saturday.
  assert.equal(isWithinSchedule(WEEKDAYS, at(2026, 8, 22, 12)), false);
});

test('overnight window carries the small hours into the previous shift', () => {
  assert.equal(isWithinSchedule(NIGHTS, at(2026, 8, 19, 23)), true);
  assert.equal(isWithinSchedule(NIGHTS, at(2026, 8, 19, 2)), true);
  assert.equal(isWithinSchedule(NIGHTS, at(2026, 8, 19, 12)), false);
  assert.equal(isWithinSchedule(NIGHTS, at(2026, 8, 19, 22, 0)), true);
  assert.equal(isWithinSchedule(NIGHTS, at(2026, 8, 19, 4, 0)), false);
});

test('an overnight shift belongs to the day it STARTED', () => {
  // Mon-Fri 22:00-04:00. Friday night's shift runs into Saturday morning and
  // must not cut out at midnight; Sunday morning is NOT covered, because that
  // would belong to a Saturday shift that was never scheduled.
  const weeknights = { enabled: true, days: [1, 2, 3, 4, 5], start: '22:00', end: '04:00' };
  assert.equal(isWithinSchedule(weeknights, at(2026, 8, 21, 23)), true, 'Fri 23:00');
  assert.equal(isWithinSchedule(weeknights, at(2026, 8, 22, 2)), true, 'Sat 02:00 = Fri shift');
  assert.equal(isWithinSchedule(weeknights, at(2026, 8, 22, 23)), false, 'Sat 23:00 unscheduled');
  assert.equal(isWithinSchedule(weeknights, at(2026, 8, 23, 2)), false, 'Sun 02:00 = Sat shift');
});

/* --- Window end ----------------------------------------------------------- */

test('windowEndsAt lands on the end of the current window', () => {
  assert.equal(windowEndsAt(WEEKDAYS, at(2026, 8, 19, 12)), at(2026, 8, 19, 17).getTime());
});

test('windowEndsAt rolls to tomorrow for an overnight window', () => {
  // Before midnight, the 04:00 end is tomorrow...
  assert.equal(windowEndsAt(NIGHTS, at(2026, 8, 19, 23)), at(2026, 8, 20, 4).getTime());
  // ...but after midnight it's already today.
  assert.equal(windowEndsAt(NIGHTS, at(2026, 8, 20, 1)), at(2026, 8, 20, 4).getTime());
});

/* --- The decision -------------------------------------------------------- */

const manual = {
  source: 'manual',
  startedAt: 0,
  endsAt: Date.now() + 60_000,
  plannedMinutes: 50,
};
const scheduled = {
  source: 'schedule',
  startedAt: 0,
  endsAt: Date.now() + 60_000,
  plannedMinutes: 480,
};

test('starts a session inside work hours when nothing is running', () => {
  const d = decideScheduleAction({ now: at(2026, 8, 19, 9, 30), schedule: WEEKDAYS });
  assert.equal(d.action, 'start');
  assert.equal(d.endsAt, at(2026, 8, 19, 17).getTime(), 'ends when the window does');
});

test('does nothing outside work hours', () => {
  assert.equal(
    decideScheduleAction({ now: at(2026, 8, 19, 20), schedule: WEEKDAYS }).action,
    'none',
  );
});

test('never touches a manual session', () => {
  // Inside hours it's already covered; outside hours it's the user's explicit
  // choice to keep working, and cutting it off would be hostile.
  assert.equal(
    decideScheduleAction({ now: at(2026, 8, 19, 12), schedule: WEEKDAYS, session: manual }).action,
    'none',
  );
  assert.equal(
    decideScheduleAction({ now: at(2026, 8, 19, 22), schedule: WEEKDAYS, session: manual }).action,
    'none',
  );
});

test('retires its own session when the window closes', () => {
  const d = decideScheduleAction({
    now: at(2026, 8, 19, 17, 1),
    schedule: WEEKDAYS,
    session: scheduled,
  });
  assert.equal(d.action, 'stop');
  assert.equal(d.reason, 'outside-hours');
});

test('disabling the schedule retires its session too', () => {
  const d = decideScheduleAction({
    now: at(2026, 8, 19, 12),
    schedule: { ...WEEKDAYS, enabled: false },
    session: scheduled,
  });
  assert.equal(d.action, 'stop');
  assert.equal(d.reason, 'schedule-disabled');
});

test('disabling the schedule leaves a manual session alone', () => {
  assert.equal(
    decideScheduleAction({
      now: at(2026, 8, 19, 12),
      schedule: { ...WEEKDAYS, enabled: false },
      session: manual,
    }).action,
    'none',
  );
});

test('KEY BEHAVIOR: ending a scheduled session does not immediately restart it', () => {
  // Without suppression, quitting a session mid-window would see it restart on
  // the next alarm tick — the most infuriating possible way to ship this.
  const now = at(2026, 8, 19, 11);
  const suppressedUntil = at(2026, 8, 19, 17).getTime();

  const muted = decideScheduleAction({ now, schedule: WEEKDAYS, suppressedUntil });
  assert.equal(muted.action, 'none');
  assert.equal(muted.reason, 'suppressed');

  // Suppression only lasts through the window; the next day starts clean.
  const tomorrow = decideScheduleAction({
    now: at(2026, 8, 20, 9, 30),
    schedule: WEEKDAYS,
    suppressedUntil,
  });
  assert.equal(tomorrow.action, 'start');
});

test('expired suppression stops muting', () => {
  const d = decideScheduleAction({
    now: at(2026, 8, 19, 16),
    schedule: WEEKDAYS,
    suppressedUntil: at(2026, 8, 19, 15).getTime(),
  });
  assert.equal(d.action, 'start');
});

test('a session with no source is treated as manual', () => {
  // Sessions predating the schedule feature have no `source` field and must not
  // be silently killed by an upgrade.
  const legacy = { startedAt: 0, endsAt: Date.now() + 60_000, plannedMinutes: 50 };
  assert.equal(
    decideScheduleAction({ now: at(2026, 8, 19, 22), schedule: WEEKDAYS, session: legacy }).action,
    'none',
  );
});

test('every decision carries a reason', () => {
  for (const args of [
    { now: at(2026, 8, 19, 12), schedule: WEEKDAYS },
    { now: at(2026, 8, 19, 20), schedule: WEEKDAYS },
    { now: at(2026, 8, 19, 12), schedule: WEEKDAYS, session: manual },
    { schedule: null },
    {},
  ]) {
    assert.ok(decideScheduleAction(args).reason, 'decisions must be explainable');
  }
});

/* --- Presentation --------------------------------------------------------- */

test('describeSchedule reads like English', () => {
  assert.equal(describeSchedule(WEEKDAYS), 'Weekdays, 9:00 AM – 5:00 PM');
  assert.equal(describeSchedule({ ...WEEKDAYS, enabled: false }), 'Off');
  assert.equal(
    describeSchedule({ ...WEEKDAYS, days: [0, 1, 2, 3, 4, 5, 6] }),
    'Every day, 9:00 AM – 5:00 PM',
  );
  assert.equal(describeSchedule({ ...WEEKDAYS, days: [0, 6] }), 'Weekends, 9:00 AM – 5:00 PM');
  assert.equal(describeSchedule({ ...WEEKDAYS, days: [2, 4] }), 'Tue, Thu, 9:00 AM – 5:00 PM');
  assert.equal(describeSchedule({ ...WEEKDAYS, days: [] }), 'No days, 9:00 AM – 5:00 PM');
});

test('describeSchedule renders noon and midnight correctly', () => {
  // The classic 12-hour clock bug: 12:00 must not render as 0:00.
  assert.equal(
    describeSchedule({ enabled: true, days: [1], start: '12:00', end: '00:00' }),
    'Mon, 12:00 PM – 12:00 AM',
  );
});

test('localDayKey uses local midnight, not UTC', () => {
  assert.equal(localDayKey(at(2026, 8, 17, 23, 59)), '2026-08-17');
  assert.equal(localDayKey(at(2026, 8, 17, 0, 1)), '2026-08-17');
  assert.equal(localDayKey(at(2026, 1, 5, 12)), '2026-01-05');
});
