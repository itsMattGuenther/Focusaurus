import test from 'node:test';
import assert from 'node:assert/strict';

import { blockedCopy, moodCopy, COPY_STATS } from '../src/shared/copy.js';
import { MOODS } from '../src/shared/doug.js';

test('copy pools are thick enough that a week of use will not loop', () => {
  // v0.2: the original pools were thin enough to notice repeats inside a week.
  // A work week of sessions hitting the interstitial a few times a day needs
  // more than a handful of lines per tier.
  assert.ok(COPY_STATS.blocked.low >= 10, `low tier ${COPY_STATS.blocked.low}`);
  assert.ok(COPY_STATS.blocked.mid >= 8, `mid tier ${COPY_STATS.blocked.mid}`);
  assert.ok(COPY_STATS.blocked.high >= 8, `high tier ${COPY_STATS.blocked.high}`);
  assert.ok(COPY_STATS.sublines >= 8, `sublines ${COPY_STATS.sublines}`);
  for (const mood of Object.keys(MOODS)) {
    assert.ok(COPY_STATS.mood[mood] >= 3, `${mood} has ${COPY_STATS.mood[mood]} lines`);
  }
});

test('blockedCopy tiers by attempt count', () => {
  // Determinism isn't the contract, membership is: a first hit never draws
  // from the "we're really doing this" pool.
  const lows = new Set();
  const highs = new Set();
  for (let i = 0; i < 40; i++) {
    lows.add(blockedCopy(1).line);
    highs.add(blockedCopy(12).line);
  }
  for (const line of lows) {
    assert.equal(highs.has(line), false, `low line leaked into high: ${line}`);
  }
});

test('blockedCopy always returns a line, and a first hit always has a subline', () => {
  const first = blockedCopy(1);
  assert.equal(typeof first.line, 'string');
  assert.ok(first.line.length > 0);
  assert.equal(typeof first.subline, 'string');
});

test('moodCopy covers every mood id', () => {
  for (const mood of Object.keys(MOODS)) {
    const line = moodCopy(mood);
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 0);
  }
  assert.equal(typeof moodCopy('not-a-mood'), 'string');
});

test('pick never immediately repeats when the pool has more than one line', () => {
  const first = moodCopy('chill');
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    seen.add(moodCopy('chill', first));
  }
  assert.equal(seen.has(first), false);
});
