import test from 'node:test';
import assert from 'node:assert/strict';

import { MOODS, DEFAULT_MOOD, ICON_VIEWBOX, dougSVG } from '../src/shared/doug.js';

const moods = Object.keys(MOODS);

test('every mood renders, and an unknown mood falls back to chill', () => {
  for (const mood of moods) {
    const svg = dougSVG(mood, { breathing: false });
    assert.match(svg, new RegExp(`data-mood="${mood}"`));
    assert.match(svg, /role="img"/);
    assert.match(svg, new RegExp(`looking ${MOODS[mood].label.toLowerCase()}`));
  }
  const fallback = dougSVG('not-a-mood');
  assert.match(fallback, new RegExp(`data-mood="${DEFAULT_MOOD}"`));
});

test('every mood shares one body — plates, arms, belly, snout', () => {
  const markers = [
    'stroke-width="20"',
    'cx="96" cy="128" rx="46"',
    'cx="168" cy="62" rx="16"',
    'M118 122 Q134 130 140 146',
    '--doug-plate',
    '--doug-belly',
    'class="doug__body"',
    'class="doug__eyes"',
  ];
  for (const mood of moods) {
    const svg = dougSVG(mood, { breathing: false });
    for (const marker of markers) {
      assert.ok(svg.includes(marker), `${mood} missing ${marker}`);
    }
  }
});

test('locked_in is the only mood with sparkles; asleep is the only one with zzz', () => {
  assert.match(dougSVG('locked_in'), /doug__sparkles/);
  assert.match(dougSVG('asleep'), /doug__zzz/);
  for (const mood of moods) {
    if (mood !== 'locked_in') assert.doesNotMatch(dougSVG(mood), /doug__sparkles/);
    if (mood !== 'asleep') assert.doesNotMatch(dougSVG(mood), /doug__zzz/);
  }
});

test('icon crop is a tighter frame on the same drawing', () => {
  const full = dougSVG('chill', { breathing: false });
  const icon = dougSVG('chill', { breathing: false, viewBox: ICON_VIEWBOX });
  assert.match(full, /viewBox="0 0 200 200"/);
  assert.match(icon, new RegExp(`viewBox="${ICON_VIEWBOX}"`));
  // Same anatomy, different window.
  assert.equal(
    icon.replace(/viewBox="[^"]+"/, 'viewBox="X"'),
    full.replace(/viewBox="[^"]+"/, 'viewBox="X"'),
  );
});
