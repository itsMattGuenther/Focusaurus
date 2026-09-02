import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEVIATIONS,
  NON_TEXT,
  PAIRS,
  TEXT,
  audit,
  composite,
  contrast,
  darkDrift,
  readPalettes,
  relativeLuminance,
  resolve,
} from '../dev/contrast.js';

/* The palette is data in one file, so "is this readable" is arithmetic rather
   than something you have to eyeball in a browser (DESIGN.md ADR-8). These
   tests are the contrast half of the v0.2 accessibility pass, and they exist
   so a later palette tweak can't quietly push the small-caps `.label` voice
   back under AA — which is exactly how it got there the first time.

   `npm run contrast` prints the same numbers as a table. */

const { light, dark, raw } = readPalettes();

/* --- The math ------------------------------------------------------------ */

test('relative luminance matches the WCAG reference points', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);
  // 0.2126/0.7152/0.0722 are the channel weights, so a pure primary lands on
  // its own coefficient.
  assert.equal(relativeLuminance('#ff0000').toFixed(4), '0.2126');
  assert.equal(relativeLuminance('#00ff00').toFixed(4), '0.7152');
  assert.equal(relativeLuminance('#0000ff').toFixed(4), '0.0722');
});

test('contrast is symmetric and bounded by 1 and 21', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#ffffff', '#000000').toFixed(2), '21.00');
  assert.equal(contrast('#4a6741', '#4a6741'), 1);
});

test('a translucent overlay is composited before it is measured', () => {
  assert.equal(composite('#ffffff', '#000000', 0.5), '#808080');
  assert.equal(composite('#000000', '#4a6741', 0), '#4a6741');
  assert.equal(composite('#000000', '#4a6741', 1), '#000000');
});

/* --- Parsing tokens.css -------------------------------------------------- */

test('both palettes parse out of tokens.css and are complete', () => {
  for (const [name, palette] of [['light', light], ['dark', dark]]) {
    for (const token of new Set(PAIRS.map((p) => p.fg))) {
      assert.ok(palette[token], `${name} palette is missing --${token}`);
    }
    // A palette that lost its guard regex would come back nearly empty, and
    // every assertion below would pass on nothing.
    assert.ok(Object.keys(palette).length > 15, `${name} palette parsed too thin`);
  }
});

test('a dark palette inherits anything its block does not redefine', () => {
  const { dark: overlaid } = readPalettes(`
    :root { --paper: #ffffff; --ink: #000000; --moss: #4a6741; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --paper: #000000; } }
    :root[data-theme='dark'] { --paper: #000000; }
  `);
  assert.equal(overlaid.paper, '#000000'); // redefined
  assert.equal(overlaid.moss, '#4a6741'); // inherited from :root
});

/*
 * Regression: the two dark blocks are hand-duplicated, because a custom
 * property can't be shared between a rule inside a media query and one outside
 * it. They had already drifted — the explicit `[data-theme='dark']` block was
 * missing all three shadow overrides, so choosing dark on a light OS got the
 * warm light-mode shadows.
 */
test('the OS-preference and explicit dark blocks stay identical', () => {
  assert.deepEqual(darkDrift(raw), []);
});

/* --- The audit ------------------------------------------------------------ */

for (const [theme, palette] of [['light', light], ['dark', dark]]) {
  for (const pair of PAIRS) {
    const label = `${pair.fg} on ${typeof pair.bg === 'string' ? pair.bg : pair.bg.on}`;
    test(`${theme}: ${label} clears ${pair.min}:1 — ${pair.where}`, () => {
      const ratio = contrast(palette[pair.fg], resolve(palette, pair.bg));
      assert.ok(
        ratio >= pair.min,
        `${ratio.toFixed(2)}:1, needs ${pair.min}:1 (${pair.where})`,
      );
    });
  }
}

test('every audited pair passes in both themes', () => {
  const failed = [...audit(light), ...audit(dark)].filter((r) => !r.pass);
  assert.deepEqual(failed, [], 'run `npm run contrast` for the full table');
});

/* --- The audit has to keep meaning something ----------------------------- */

test('the audit covers text and non-text minimums, and the whole palette', () => {
  assert.ok(PAIRS.some((p) => p.min === TEXT));
  assert.ok(PAIRS.some((p) => p.min === NON_TEXT));

  // Every semantic color the UI paints text or a control boundary with should
  // appear as a foreground somewhere, or the table has gone stale.
  const covered = new Set(PAIRS.map((p) => p.fg));
  for (const token of ['ink', 'ink-soft', 'ink-faint', 'moss', 'clay', 'amber', 'paper-raised']) {
    assert.ok(covered.has(token), `--${token} is never audited as a foreground`);
  }
});

test('every deviation names real tokens and says why it is kept', () => {
  for (const d of DEVIATIONS) {
    assert.ok(d.why.length > 80, 'a deviation without a real rationale is just an exclusion');
    for (const [fg, bg] of d.pairs) {
      assert.ok(light[fg] && light[bg], `deviation names a token that no longer exists: ${fg}/${bg}`);
    }
  }
});
