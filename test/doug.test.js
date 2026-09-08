import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MOODS, dougSVG } from '../src/shared/doug.js';

test('every character mood has a bundled, distinct, bounded production asset', () => {
  const sources = new Set();
  for (const mood of Object.keys(MOODS)) {
    const file = new URL(`../assets/art/doug-${mood}.webp`, import.meta.url);
    assert.ok(existsSync(file), `missing ${mood}`);
    const data = readFileSync(file);
    assert.equal(data.subarray(8, 12).toString(), 'WEBP');
    assert.ok(data.length < 200_000, 'keep the first view quick');
    sources.add(data.toString('base64'));
    assert.match(dougSVG(mood), new RegExp(`data-mood="${mood}"`));
  }
  assert.equal(sources.size, 7);
});

test('character labels escape user names and unknown moods fall back safely', () => {
  const svg = dougSVG('constructor', { name: '<img src=x onerror="alert(1)">' });
  assert.match(svg, /data-mood="chill"/);
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;img/);
  assert.match(svg, /role="img"/);
});
