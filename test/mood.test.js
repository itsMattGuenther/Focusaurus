import test from 'node:test';
import assert from 'node:assert/strict';

import { isWithinSchedule, localDayKey, resolveMood } from '../src/background/mood.js';

const SCHEDULE = { enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };

/** Local-time Date, so these tests don't shift with the runner's timezone. */
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);

const SESSION = { startedAt: 0, endsAt: Date.now() + 60_000, plannedMinutes: 50 };

test('asleep only outside work hours with nothing running', () => {
  // Wednesday 2026-08-19 at 21:00 — outside 09:00-17:00.
  assert.equal(
    resolveMood({ now: at(2026, 8, 19, 21), schedule: SCHEDULE }).mood,
    'asleep',
  );
  // Same evening, but a session is running: work beats the clock. A clean
  // session reads as locked_in; either session mood proves the point.
  assert.equal(
    resolveMood({ now: at(2026, 8, 19, 21), schedule: SCHEDULE, session: SESSION }).mood,
    'locked_in',
  );
  assert.equal(
    resolveMood({
      now: at(2026, 8, 19, 21),
      schedule: SCHEDULE,
      session: SESSION,
      recentAttempts: 2,
    }).mood,
    'focused',
  );
  // No schedule configured means never "off the clock".
  assert.equal(resolveMood({ now: at(2026, 8, 19, 21) }).mood, 'chill');
});

test('a weekend day is outside the schedule', () => {
  // 2026-08-22 is a Saturday.
  assert.equal(
    resolveMood({ now: at(2026, 8, 22, 11), schedule: SCHEDULE }).mood,
    'asleep',
  );
});

test('locked_in requires a clean session; any slip drops to focused', () => {
  assert.equal(resolveMood({ session: SESSION, recentAttempts: 0 }).mood, 'locked_in');
  assert.equal(resolveMood({ session: SESSION, recentAttempts: 1 }).mood, 'focused');
});

test('RECOVERY RULE: a running session outranks every negative mood', () => {
  // This is the load-bearing ordering from DESIGN.md §5. Starting a session
  // must always be enough to pull Doug out of a bad mood, because a dino you
  // cannot cheer up is a dino you uninstall. If this test fails, someone
  // reordered the rule list and reintroduced shame.
  const bad = { budgets: [150, 90], streak: 0 };
  assert.equal(resolveMood(bad).mood, 'bummed');
  assert.equal(resolveMood({ ...bad, session: SESSION, recentAttempts: 3 }).mood, 'focused');
  assert.equal(resolveMood({ ...bad, session: SESSION, recentAttempts: 0 }).mood, 'locked_in');
});

test('budget thresholds pick the right mood', () => {
  assert.equal(resolveMood({ budgets: [100] }).mood, 'bummed');
  assert.equal(resolveMood({ budgets: [140] }).mood, 'bummed');
  assert.equal(resolveMood({ budgets: [80] }).mood, 'side_eye');
  assert.equal(resolveMood({ budgets: [99] }).mood, 'side_eye');
  assert.equal(resolveMood({ budgets: [79] }).mood, 'chill');
  // The worst budget of the day drives the mood, not the average.
  assert.equal(resolveMood({ budgets: [5, 10, 100] }).mood, 'bummed');
});

test('stoked needs a streak AND comfortable headroom', () => {
  assert.equal(resolveMood({ streak: 3, budgets: [10] }).mood, 'stoked');
  assert.equal(resolveMood({ streak: 9, budgets: [] }).mood, 'stoked');
  assert.equal(resolveMood({ streak: 2, budgets: [10] }).mood, 'chill');
  // A streak doesn't paper over a budget that's already half gone.
  assert.equal(resolveMood({ streak: 9, budgets: [60] }).mood, 'chill');
});

test('empty state is chill, never negative', () => {
  assert.equal(resolveMood().mood, 'chill');
  assert.equal(resolveMood({}).mood, 'chill');
});

test('every mood ships an explanation', () => {
  // An unexplained mood is decoration. The popup surfaces this string.
  for (const state of [
    {},
    { session: SESSION },
    { session: SESSION, recentAttempts: 2 },
    { budgets: [100] },
    { budgets: [85] },
    { streak: 4 },
    { now: at(2026, 8, 19, 22), schedule: SCHEDULE },
  ]) {
    const { because } = resolveMood(state);
    assert.ok(because && because.length > 5, 'because should be a real sentence');
  }
});

test('isWithinSchedule handles an overnight window', () => {
  const night = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '04:00' };
  assert.equal(isWithinSchedule(night, at(2026, 8, 19, 23)), true);
  assert.equal(isWithinSchedule(night, at(2026, 8, 19, 2)), true);
  assert.equal(isWithinSchedule(night, at(2026, 8, 19, 12)), false);
  // Boundaries: start inclusive, end exclusive.
  assert.equal(isWithinSchedule(night, at(2026, 8, 19, 22, 0)), true);
  assert.equal(isWithinSchedule(night, at(2026, 8, 19, 4, 0)), false);
});

test('localDayKey uses local midnight, not UTC', () => {
  // A late-evening timestamp must file under today. Using toISOString() here
  // would roll the key to tomorrow for anyone west of Greenwich, which would
  // silently split a single evening's usage across two days.
  assert.equal(localDayKey(at(2026, 8, 17, 23, 59)), '2026-08-17');
  assert.equal(localDayKey(at(2026, 8, 17, 0, 1)), '2026-08-17');
  assert.equal(localDayKey(at(2026, 1, 5, 12)), '2026-01-05');
});
