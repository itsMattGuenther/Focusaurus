import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPEN_ENDED_MINUTES,
  badgeText,
  isOpenEnded,
  minutesRemaining,
  sessionActive,
} from '../src/shared/session.js';

const NOW = 1_700_000_000_000;

/** A session with `mins` of wall-clock time left. */
const session = (minsLeft, plannedMinutes = 50) => ({
  startedAt: NOW - (plannedMinutes - minsLeft) * 60_000,
  plannedMinutes,
  endsAt: NOW + minsLeft * 60_000,
});

test('sessionActive is false for nothing, and for anything expired', () => {
  assert.equal(sessionActive(null, NOW), false);
  assert.equal(sessionActive(undefined, NOW), false);
  assert.equal(sessionActive(session(-1), NOW), false);
  assert.equal(sessionActive({ endsAt: NOW }, NOW), false, 'exactly expired is inactive');
  assert.equal(sessionActive(session(1), NOW), true);
});

test('badge is empty when no session is running', () => {
  assert.equal(badgeText(null, NOW), '');
  assert.equal(badgeText(session(-5), NOW), '');
});

test('BUG FIX: badge is derived from endsAt, so it tracks the real clock', () => {
  // The original bug: the badge was only painted during a rule reconcile, so it
  // froze at whatever the clock read during the last session start or override
  // and then drifted — showing 49 while 47 minutes actually remained.
  //
  // The fix is twofold: a 1-minute alarm repaints it, and the text is always
  // recomputed from endsAt rather than decremented. This test locks in the
  // second half: the same session must render correctly at any `now`.
  const s = session(50);
  assert.equal(badgeText(s, NOW), '50');
  assert.equal(badgeText(s, NOW + 1 * 60_000), '49');
  assert.equal(badgeText(s, NOW + 3 * 60_000), '47');
  assert.equal(badgeText(s, NOW + 49 * 60_000), '1');
  assert.equal(badgeText(s, NOW + 50 * 60_000), '', 'expired clears the badge');

  // A skipped paint must leave the next one correct, not compounded.
  assert.equal(badgeText(s, NOW + 30 * 60_000), '20');
});

test('badge never reads 0 while the session is still enforcing', () => {
  // Rounding up matters here: a badge reading "0" next to a still-blocking
  // extension looks broken.
  assert.equal(badgeText(session(0.5), NOW), '1');
  assert.equal(badgeText(session(0.01), NOW), '1');
  assert.equal(minutesRemaining(session(0.5), NOW), 1);
});

test('partial minutes round up', () => {
  const s = { plannedMinutes: 50, startedAt: NOW, endsAt: NOW + 47.5 * 60_000 };
  assert.equal(badgeText(s, NOW), '48');
});

test('an open-ended session shows infinity, not a countdown', () => {
  // Counting down from 720 is meaningless and too wide for the badge.
  const s = session(719, OPEN_ENDED_MINUTES);
  assert.equal(isOpenEnded(s), true);
  assert.equal(badgeText(s, NOW), '∞');
  // Still ∞ much later, and it does not start counting down.
  assert.equal(badgeText(s, NOW + 600 * 60_000), '∞');
});

test('long finite sessions switch to hours to stay legible at 16px', () => {
  assert.equal(badgeText(session(99, 120), NOW), '99');
  assert.equal(badgeText(session(100, 120), NOW), '2h');
  assert.equal(badgeText(session(120, 180), NOW), '2h');
  assert.equal(badgeText(session(200, 240), NOW), '3h');
});

test('isOpenEnded only trips at the threshold', () => {
  assert.equal(isOpenEnded({ plannedMinutes: 90 }), false);
  assert.equal(isOpenEnded({ plannedMinutes: OPEN_ENDED_MINUTES - 1 }), false);
  assert.equal(isOpenEnded({ plannedMinutes: OPEN_ENDED_MINUTES }), true);
  assert.equal(isOpenEnded(null), false);
});

test('a manual session without a deadline stays active; a scheduled one needs a deadline', () => {
  const open = { startedAt: NOW, plannedMinutes: OPEN_ENDED_MINUTES, source: 'manual', endsAt: null };
  const nextMonth = NOW + 30 * 24 * 60 * 60_000;
  assert.equal(sessionActive(open, nextMonth), true);
  assert.equal(minutesRemaining(open, nextMonth), Infinity);
  assert.equal(badgeText(open, nextMonth), '∞');
  assert.equal(sessionActive({ ...open, source: 'schedule' }, NOW), false);
});

test('the standard chip durations all render sensibly', () => {
  // The four options the popup actually offers.
  assert.equal(badgeText(session(25, 25), NOW), '25');
  assert.equal(badgeText(session(50, 50), NOW), '50');
  assert.equal(badgeText(session(90, 90), NOW), '90');
  assert.equal(badgeText(session(720, 720), NOW), '∞');
});
