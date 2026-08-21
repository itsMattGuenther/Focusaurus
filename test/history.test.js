import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORPHAN_ID,
  ORPHAN_LABEL,
  WEEK_LENGTH,
  historyGlance,
  historyHeadline,
  summarizeAttempts,
  timesPhrase,
  weekKeys,
  weekdayIndex,
  weekdayLetter,
  weekdayName,
} from '../src/shared/history.js';

/** Local-time Date, so these tests don't shift with the runner's timezone. */
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

const SITES = [
  { id: 's_rd', label: 'reddit.com' },
  { id: 's_ig', label: 'instagram.com' },
  { id: 's_yt', label: 'youtube.com/shorts' },
];

function day(perSite) {
  return { perSite, sessions: [] };
}

/* --- Calendar ------------------------------------------------------------ */

test('weekKeys returns seven local days ending on the given date', () => {
  const keys = weekKeys(at(2026, 8, 21));
  assert.equal(keys.length, WEEK_LENGTH);
  assert.deepEqual(keys, [
    '2026-08-15',
    '2026-08-16',
    '2026-08-17',
    '2026-08-18',
    '2026-08-19',
    '2026-08-20',
    '2026-08-21',
  ]);
});

test('weekKeys rolls over a month and a year without skipping a day', () => {
  assert.deepEqual(weekKeys(at(2026, 1, 2), 5), [
    '2025-12-29',
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
    '2026-01-02',
  ]);
});

test('weekKeys uses the local calendar date, not the clock', () => {
  // 00:30 and 23:30 on the same local day must produce the same keys.
  assert.deepEqual(weekKeys(at(2026, 8, 21, 0), 3), weekKeys(new Date(2026, 7, 21, 23, 30), 3));
});

test('weekday helpers parse YYYY-MM-DD as a local date', () => {
  // 2026-08-21 is a Friday.
  assert.equal(weekdayIndex('2026-08-21'), 5);
  assert.equal(weekdayLetter('2026-08-21'), 'F');
  assert.equal(weekdayName('2026-08-21'), 'Friday');
  assert.equal(weekdayLetter('not-a-date'), 'S');
});

/* --- Counting ------------------------------------------------------------ */

test('summarizeAttempts totals, ranks, and names the leader', () => {
  const keys = weekKeys(at(2026, 8, 21));
  const dayMap = Object.fromEntries(keys.map((k) => [k, day({})]));
  dayMap['2026-08-15'] = day({ s_rd: { attempts: 10 }, s_ig: { attempts: 2 } });
  dayMap['2026-08-18'] = day({ s_rd: { attempts: 30 }, s_yt: { attempts: 5 } });
  dayMap['2026-08-21'] = day({ s_ig: { attempts: 3 } });

  const summary = summarizeAttempts(dayMap, SITES);
  assert.equal(summary.total, 50);
  assert.equal(summary.peak, 35);
  assert.equal(summary.leader?.id, 's_rd');
  assert.equal(summary.leader?.label, 'reddit.com');
  assert.equal(summary.leader?.attempts, 40);
  assert.deepEqual(summary.sites.map((s) => [s.label, s.attempts]), [
    ['reddit.com', 40],
    ['instagram.com', 5],
    ['youtube.com/shorts', 5],
  ]);
});

test('tied sites rank alphabetically by label', () => {
  const summary = summarizeAttempts(
    { '2026-08-21': day({ s_yt: { attempts: 4 }, s_ig: { attempts: 4 } }) },
    SITES,
  );
  assert.deepEqual(summary.sites.map((s) => s.label), ['instagram.com', 'youtube.com/shorts']);
});

test('sites no longer on the list collapse into one off-the-list bucket', () => {
  const summary = summarizeAttempts(
    {
      '2026-08-21': day({
        s_rd: { attempts: 3 },
        s_gone: { attempts: 4 },
        s_also: { attempts: 2 },
      }),
    },
    [{ id: 's_rd', label: 'reddit.com' }],
  );
  assert.equal(summary.total, 9);
  assert.equal(summary.sites.length, 2);
  const orphan = summary.sites.find((s) => s.id === ORPHAN_ID);
  assert.equal(orphan.label, ORPHAN_LABEL);
  assert.equal(orphan.attempts, 6);
  assert.equal(summary.leader.id, ORPHAN_ID);
});

test('activeSeconds are ignored — attempts are the only signal', () => {
  const summary = summarizeAttempts(
    { '2026-08-21': day({ s_rd: { attempts: 2, activeSeconds: 9999, overrides: 7 } }) },
    SITES,
  );
  assert.equal(summary.total, 2);
  assert.equal(summary.overrides, 7);
  assert.equal(summary.sites[0].attempts, 2);
});

test('garbage counts and missing buckets degrade to zero, not NaN', () => {
  const summary = summarizeAttempts(
    {
      '2026-08-20': null,
      '2026-08-21': { perSite: { s_rd: { attempts: 'nope' }, s_ig: { attempts: -3 } } },
    },
    SITES,
  );
  assert.equal(summary.total, 0);
  assert.equal(summary.peak, 0);
  assert.equal(summary.leader, null);
  assert.deepEqual(summary.sites, []);
  assert.equal(summary.days.length, 2);
});

test('an empty or absent map is a quiet week, not a throw', () => {
  for (const junk of [undefined, null, {}, []]) {
    const summary = summarizeAttempts(junk, SITES);
    assert.equal(summary.total, 0);
    assert.equal(summary.leader, null);
  }
});

test("days keep the caller's key order, oldest first from weekKeys", () => {
  const keys = weekKeys(at(2026, 8, 21));
  const dayMap = Object.fromEntries(keys.map((k, i) => [k, day({ s_rd: { attempts: i } })]));
  const summary = summarizeAttempts(dayMap, SITES);
  assert.deepEqual(summary.days.map((d) => d.key), keys);
  assert.equal(summary.days[0].attempts, 0);
  assert.equal(summary.days[6].attempts, 6);
  assert.equal(summary.days[6].weekdayName, 'Friday');
});

/* --- Copy ---------------------------------------------------------------- */

test('timesPhrase matches the rest of the product', () => {
  assert.equal(timesPhrase(0), '0 times');
  assert.equal(timesPhrase(1), 'once');
  assert.equal(timesPhrase(40), '40 times');
  assert.equal(timesPhrase('3'), '3 times');
});

test('the quiet week is the empty state, not a scold', () => {
  const empty = summarizeAttempts({}, SITES);
  assert.equal(historyGlance(empty), 'Quiet week so far.');
  assert.equal(historyHeadline(empty), 'Quiet week so far.');
});

test('a single-site week uses the roadmap sentence', () => {
  const summary = summarizeAttempts(
    { '2026-08-21': day({ s_rd: { attempts: 40 } }) },
    SITES,
  );
  assert.equal(historyHeadline(summary), 'This week you reached for reddit.com 40 times.');
  assert.equal(historyGlance(summary), 'reddit.com · 40 times this week');
});

test('a majority leader is named without burying the total', () => {
  const summary = summarizeAttempts(
    { '2026-08-21': day({ s_rd: { attempts: 30 }, s_ig: { attempts: 10 } }) },
    SITES,
  );
  assert.equal(historyHeadline(summary), 'This week you reached 40 times. reddit.com led.');
});

test('a spread week reports the count and how many sites, no leader crowning', () => {
  const summary = summarizeAttempts(
    {
      '2026-08-21': day({
        s_rd: { attempts: 5 },
        s_ig: { attempts: 4 },
        s_yt: { attempts: 4 },
      }),
    },
    SITES,
  );
  assert.equal(historyHeadline(summary), 'This week you reached 13 times across 3 sites.');
});

test('history copy never uses the words the tone rules forbid', () => {
  const summary = summarizeAttempts(
    { '2026-08-21': day({ s_rd: { attempts: 23 }, s_ig: { attempts: 12 } }) },
    SITES,
  );
  const lines = [historyGlance(summary), historyHeadline(summary), historyHeadline(summarizeAttempts({}, []))];
  for (const line of lines) {
    assert.equal(/fail|wasted|lost|shame|shouldn.t/i.test(line), false, line);
  }
});
