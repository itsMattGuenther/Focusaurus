import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  OVERRIDE_DELAYS,
  sanitizeSettings,
} from '../src/background/storage.js';

/* storage.js touches chrome.* only inside functions, so importing it — and
   calling the pure sanitizer — works fine outside a browser. */

const GOOD = {
  schemaVersion: 1,
  dino: { name: 'Rex' },
  schedule: { enabled: true, days: [1, 3, 5], start: '08:30', end: '16:45' },
  strictness: 'gentle',
  overrideMinutes: 10,
  onboarded: true,
  sites: [
    { id: 's_1', label: 'reddit.com', match: { kind: 'domain', value: 'reddit.com' }, mode: 'block', pack: 'forums' },
  ],
};

test('a well-formed export round-trips unchanged', () => {
  const { settings, warnings } = sanitizeSettings(GOOD);
  assert.deepEqual(warnings, []);
  assert.equal(settings.dino.name, 'Rex');
  assert.equal(settings.strictness, 'gentle');
  assert.equal(settings.overrideMinutes, 10);
  assert.deepEqual(settings.schedule, GOOD.schedule);
  assert.equal(settings.sites.length, 1);
  assert.equal(settings.sites[0].label, 'reddit.com');
});

test('garbage input yields usable defaults rather than throwing', () => {
  for (const junk of [null, undefined, 42, 'nope', [], true]) {
    const { settings } = sanitizeSettings(junk);
    assert.equal(settings.strictness, DEFAULT_SETTINGS.strictness);
    assert.deepEqual(settings.sites, []);
    assert.equal(settings.dino.name, 'Doug');
  }
});

test('an unknown strictness falls back instead of disabling overrides', () => {
  // A bogus value would make OVERRIDE_DELAYS[strictness] undefined, which the
  // interstitial reads as "no override offered" — silently the strictest mode.
  const { settings, warnings } = sanitizeSettings({ ...GOOD, strictness: 'nuclear' });
  assert.equal(settings.strictness, 'firm');
  assert.ok(Object.prototype.hasOwnProperty.call(OVERRIDE_DELAYS, settings.strictness));
  assert.ok(warnings.some((w) => w.includes('nuclear')));
});

test('override length is clamped to a sane range', () => {
  for (const bad of [0, -5, 9999, NaN, 'ten', null]) {
    const { settings } = sanitizeSettings({ ...GOOD, overrideMinutes: bad });
    assert.equal(settings.overrideMinutes, DEFAULT_SETTINGS.overrideMinutes);
  }
  assert.equal(sanitizeSettings({ ...GOOD, overrideMinutes: 7.6 }).settings.overrideMinutes, 8);
  assert.equal(sanitizeSettings({ ...GOOD, overrideMinutes: 120 }).settings.overrideMinutes, 120);
});

test('schedule times must be HH:MM', () => {
  const { settings, warnings } = sanitizeSettings({
    ...GOOD,
    schedule: { enabled: true, days: [1], start: '25:99', end: 'lunchtime' },
  });
  assert.equal(settings.schedule.start, DEFAULT_SETTINGS.schedule.start);
  assert.equal(settings.schedule.end, DEFAULT_SETTINGS.schedule.end);
  assert.equal(warnings.filter((w) => w.includes('HH:MM')).length, 2);
});

test('schedule days are de-duplicated, sorted, and range-checked', () => {
  const { settings } = sanitizeSettings({
    ...GOOD,
    schedule: { enabled: true, days: [5, 1, 1, 9, -2, 'x', 3], start: '09:00', end: '17:00' },
  });
  assert.deepEqual(settings.schedule.days, [1, 3, 5]);
});

test('an empty day list is preserved, not silently repaired', () => {
  // "No days" is a real (if useless) state, and the options page warns about
  // it. Quietly refilling weekdays would re-enable blocking the user turned off.
  const { settings } = sanitizeSettings({
    ...GOOD,
    schedule: { enabled: true, days: [], start: '09:00', end: '17:00' },
  });
  assert.deepEqual(settings.schedule.days, []);
});

test('the dino name is trimmed, capped, and never blank', () => {
  assert.equal(sanitizeSettings({ ...GOOD, dino: { name: '  Gary  ' } }).settings.dino.name, 'Gary');
  assert.equal(sanitizeSettings({ ...GOOD, dino: { name: '   ' } }).settings.dino.name, 'Doug');
  assert.equal(sanitizeSettings({ ...GOOD, dino: { name: 42 } }).settings.dino.name, 'Doug');
  assert.equal(sanitizeSettings({ ...GOOD, dino: { name: 'x'.repeat(200) } }).settings.dino.name.length, 24);
});

test('SECURITY: patterns are re-derived, not trusted from the file', () => {
  // An imported file could carry a hand-edited `match` that never passed
  // through parseInput. We rebuild it from the raw value so a crafted pattern
  // cannot reach the rule compiler.
  const { settings } = sanitizeSettings({
    ...GOOD,
    sites: [{
      id: 's_evil',
      label: 'reddit.com',
      match: { kind: 'domain', value: '.*' },
      mode: 'block',
    }],
  });
  assert.equal(settings.sites.length, 1);
  assert.equal(settings.sites[0].match.value, 'reddit.com', 'rebuilt from the label');
  assert.notEqual(settings.sites[0].match.value, '.*');
});

test('invalid and duplicate sites are dropped and counted', () => {
  const { settings, warnings } = sanitizeSettings({
    ...GOOD,
    sites: [
      { label: 'reddit.com' },
      { label: 'https://www.Reddit.com/' }, // same site, different spelling
      { label: 'reddit' },                  // bare word — would over-block
      null,
      'not an object',
      { label: '' },
    ],
  });
  assert.equal(settings.sites.length, 1);
  assert.ok(warnings.some((w) => w.includes('skipped')));
});

test('site records come out in the shape the rule compiler expects', () => {
  const { settings } = sanitizeSettings({ ...GOOD, sites: [{ label: 'youtube.com/shorts' }] });
  const [site] = settings.sites;
  assert.ok(site.id, 'an id is generated when missing');
  assert.equal(site.match.kind, 'urlPrefix');
  assert.equal(site.mode, 'block');
  assert.equal(site.pack, 'custom');
  assert.equal(site.budgetMinutes, null);
});

test('mode and budget survive for future budget sites', () => {
  const { settings } = sanitizeSettings({
    ...GOOD,
    sites: [{ label: 'youtube.com', mode: 'budget', budgetMinutes: 15.4 }],
  });
  assert.equal(settings.sites[0].mode, 'budget');
  assert.equal(settings.sites[0].budgetMinutes, 15);
});

test('an unrecognized mode falls back to block', () => {
  const { settings } = sanitizeSettings({ ...GOOD, sites: [{ label: 'x.com', mode: 'destroy' }] });
  assert.equal(settings.sites[0].mode, 'block');
});

test('the site list is capped', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ label: `site${i}.com` }));
  const { settings, warnings } = sanitizeSettings({ ...GOOD, sites: many });
  assert.equal(settings.sites.length, 300);
  assert.ok(warnings.some((w) => w.includes('skipped')));
});

test('unknown top-level keys are discarded', () => {
  const { settings } = sanitizeSettings({ ...GOOD, evil: 'payload', __proto__: { x: 1 } });
  assert.equal(settings.evil, undefined);
  assert.deepEqual(
    Object.keys(settings).sort(),
    ['dino', 'onboarded', 'overrideMinutes', 'schedule', 'schemaVersion', 'sites', 'strictness'],
  );
});

test('output always carries the current schema version', () => {
  assert.equal(sanitizeSettings({ ...GOOD, schemaVersion: 99 }).settings.schemaVersion, 1);
  assert.equal(sanitizeSettings({}).settings.schemaVersion, 1);
});
