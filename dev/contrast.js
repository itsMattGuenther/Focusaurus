/* ==========================================================================
   Contrast audit
   --------------------------------------------------------------------------
   Reads the palettes straight out of src/shared/tokens.css and measures every
   foreground/background pair the UI actually renders, in both themes, against
   WCAG 2.1 contrast minimums.

     npm run contrast   ->   the table, both themes
     npm test           ->   the same numbers, asserted (test/contrast.test.js)

   Why this can be a plain node module: no surface hardcodes a color, so the
   palette is a small set of hex literals in one file, and "is this readable"
   becomes arithmetic rather than something you eyeball in a browser. Same
   property that makes the logic modules unit-testable (DESIGN.md ADR-8) — the
   design system is data too.

   The pair table below is hand-curated on purpose. Deriving it from the CSS
   would mean resolving cascade and inheritance, and a table of pairs that
   don't exist is worse than no table: you end up darkening a token to satisfy
   a combination nobody can see. Every entry cites the selector it came from.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

export const TOKENS_PATH = join(root, 'src', 'shared', 'tokens.css');

/* --- Color math ----------------------------------------------------------
   WCAG 2.1 relative luminance and contrast ratio, verbatim from the spec. */

/** @param {string} hex `#rrggbb` @returns {[number, number, number]} 0..255 */
export function channels(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {string} hex @returns {number} 0..1 */
export function relativeLuminance(hex) {
  const [r, g, b] = channels(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colors. 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Flatten a translucent overlay onto an opaque base — an `rgba()` fill has to
 *  be composited before it can be measured. */
export function composite(over, base, alpha) {
  const [o, b] = [channels(over), channels(base)];
  const mix = (i) => Math.round(o[i] * alpha + b[i] * (1 - alpha));
  return `#${[0, 1, 2].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`;
}

/* --- Palette extraction --------------------------------------------------
   Three blocks define color: the light `:root`, the dark block guarded behind
   the OS preference, and the explicit `[data-theme='dark']` override. A custom
   property can't be shared across a rule inside a media query and one outside
   it, so the last two are hand-duplicated and can drift. They're compared. */

const BLOCKS = {
  light: /:root\s*\{([^}]*)\}/,
  darkPreferred:
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([^}]*)\}/,
  darkExplicit: /:root\[data-theme='dark'\]\s*\{([^}]*)\}/,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Every `--token: value;` declaration in one rule body. */
function declarations(body) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[name] = value.trim();
  }
  return out;
}

/** Just the colors — type, space, shadows and the grain data URI aren't
 *  measurable as contrast. */
function colors(body) {
  return Object.fromEntries(
    Object.entries(declarations(body))
      .filter(([, v]) => HEX.test(v))
      .map(([k, v]) => [k, v.toLowerCase()]),
  );
}

/**
 * Parse tokens.css into the two complete palettes the app can render in.
 *
 * The dark blocks are overlays: they redefine most colors but inherit anything
 * they don't mention from `:root`, exactly as the cascade would.
 *
 * @param {string} [css] Defaults to the real tokens.css.
 */
export function readPalettes(css = readFileSync(TOKENS_PATH, 'utf8')) {
  /** @type {Record<string, Record<string, string>>} */
  const blocks = {};
  /** @type {Record<string, Record<string, string>>} */
  const raw = {};
  for (const [name, re] of Object.entries(BLOCKS)) {
    const match = css.match(re);
    if (!match) throw new Error(`tokens.css: could not find the ${name} palette block`);
    blocks[name] = colors(match[1]);
    raw[name] = declarations(match[1]);
  }
  return {
    blocks,
    raw,
    light: blocks.light,
    dark: { ...blocks.light, ...blocks.darkPreferred },
  };
}

/* --- What has to be readable ---------------------------------------------
   WCAG 2.1: 4.5:1 for body text (1.4.3), 3:1 for text at 18.66px bold or 24px
   and up (also 1.4.3), and 3:1 for the boundary of a control or a focus ring
   (1.4.11). Type here is small — the field-guide `.label` voice is 11px — so
   almost every row is the 4.5 case. */

export const TEXT = 4.5;
export const NON_TEXT = 3;

/** @typedef {string | { on: string, tint: string, alpha: number }} Surface */
/** @typedef {{ fg: string, bg: Surface, min: number, where: string }} Pair */

/** @type {Pair[]} */
export const PAIRS = [
  /* Primary and secondary text, on all three paper depths. */
  { fg: 'ink', bg: 'paper', min: TEXT, where: 'body copy on the page ground' },
  { fg: 'ink', bg: 'paper-raised', min: TEXT, where: '.card, .chip in the popup' },
  { fg: 'ink', bg: 'paper-sunk', min: TEXT, where: '.choice:hover, .iconbtn:hover' },
  { fg: 'ink-soft', bg: 'paper', min: TEXT, where: '.chip, .day' },
  { fg: 'ink-soft', bg: 'paper-raised', min: TEXT, where: '.card__hint, .choice__desc' },
  { fg: 'ink-soft', bg: 'paper-sunk', min: TEXT, where: '.schedule__summary' },

  /* The `.label` small-caps voice — 11px bold, and the most-used color in the
     app. It carries every specimen tag, count, and piece of metadata. */
  { fg: 'ink-faint', bg: 'paper', min: TEXT, where: '.label, .sites__empty, .actions__note' },
  { fg: 'ink-faint', bg: 'paper-raised', min: TEXT, where: '.label in a card, .field::placeholder' },
  { fg: 'ink-faint', bg: 'paper-sunk', min: TEXT, where: '.chip__mark on an off pack chip' },

  /* Moss — focus, good, live. */
  { fg: 'moss', bg: 'paper', min: TEXT, where: '.countdown, .site__pack, today in the week strip' },
  { fg: 'moss', bg: 'paper-raised', min: TEXT, where: '.data__note[data-tone=good]' },
  { fg: 'moss', bg: 'paper-sunk', min: TEXT, where: ".schedule__summary[data-live='true']" },
  { fg: 'moss', bg: 'moss-wash', min: TEXT, where: '.chip--on, the selected session length' },

  /* Clay — blocked, over, wrong. */
  { fg: 'clay', bg: 'paper', min: TEXT, where: '.tag__value--site on the interstitial' },
  { fg: 'clay', bg: 'paper-raised', min: TEXT, where: '.add__error, .data__note[data-tone=bad]' },
  { fg: 'clay', bg: 'paper-sunk', min: TEXT, where: ".schedule__summary[data-warn='true']" },
  { fg: 'clay', bg: 'clay-wash', min: TEXT, where: '.site__remove:hover' },

  /* Reversed out of a filled control. */
  {
    fg: 'paper-raised',
    bg: 'moss',
    min: TEXT,
    where: ".btn--primary, .chip[data-state='all'], .day[aria-pressed='true']",
  },
  { fg: 'paper-raised', bg: 'moss-bright', min: TEXT, where: '.btn--primary:hover' },
  {
    fg: 'paper-raised',
    bg: { on: 'moss', tint: '#000000', alpha: 0.12 },
    min: TEXT,
    where: "the tick pill inside a full chip (.chip[data-state='all'] .chip__mark)",
  },

  /* Amber is a caution accent, never a text color: the count inside a partly-on
     chip is `--ink` so the badge can keep its light wash. */
  { fg: 'ink', bg: 'amber-wash', min: TEXT, where: ".chip[data-state='partial'] .chip__mark" },
  { fg: 'amber', bg: 'paper', min: NON_TEXT, where: "the dashed border on .chip[data-state='partial']" },
  { fg: 'amber', bg: 'paper-raised', min: NON_TEXT, where: 'the same chip, in the popup' },

  /* Focus rings. These are the whole keyboard story, so they get measured. */
  { fg: 'moss', bg: 'paper', min: NON_TEXT, where: ':focus-visible ring on the page ground' },
  { fg: 'moss', bg: 'paper-raised', min: NON_TEXT, where: ':focus-visible ring on a card, and .field:focus' },
  { fg: 'clay', bg: 'paper-raised', min: NON_TEXT, where: '.site__remove:focus-visible ring' },
];

/**
 * Deviations measured, understood, and kept. Reported by the CLI so they stay
 * visible, but not asserted — each is a design call rather than an oversight,
 * and a silent exclusion is how an audit rots.
 */
export const DEVIATIONS = [
  {
    pairs: [
      ['rule', 'paper'],
      ['rule-strong', 'paper'],
      ['rule-strong', 'paper-raised'],
    ],
    why:
      'Ink hairlines are load-bearing for the field-guide direction (DESIGN.md 8), and '
      + '1.4.11 asks for 3:1 only where the boundary is what identifies the control. '
      + 'Every control here also carries a label, a fill, or a shape, and focus state is '
      + 'drawn with a moss ring rather than the border, so nothing is communicated by a '
      + 'hairline alone. Raising these would turn a pressed-paper rule into a hard tan '
      + 'line across every surface.',
  },
];

/* --- Running the audit ---------------------------------------------------- */

/** @param {Record<string, string>} palette @param {Surface} surface */
export function resolve(palette, surface) {
  if (typeof surface === 'string') {
    const hex = palette[surface];
    if (!hex) throw new Error(`tokens.css: no --${surface} in this palette`);
    return hex;
  }
  return composite(surface.tint, resolve(palette, surface.on), surface.alpha);
}

/** @param {Surface} surface */
export function surfaceName(surface) {
  return typeof surface === 'string'
    ? surface
    : `${surface.on} + ${Math.round(surface.alpha * 100)}% ${surface.tint}`;
}

/**
 * Measure every pair against one palette.
 * @param {Record<string, string>} palette
 */
export function audit(palette) {
  return PAIRS.map((pair) => {
    const ratio = contrast(palette[pair.fg], resolve(palette, pair.bg));
    return {
      fg: pair.fg,
      bg: surfaceName(pair.bg),
      ratio,
      min: pair.min,
      pass: ratio >= pair.min,
      where: pair.where,
    };
  });
}

/**
 * Tokens where the two hand-duplicated dark blocks disagree. Should be empty:
 * one is what you get from a dark OS, the other from choosing dark explicitly,
 * and they are meant to be the same theme.
 *
 * @param {Record<string, Record<string, string>>} raw All declarations, not
 *   only colors — the blocks have drifted on shadows before.
 */
export function darkDrift(raw) {
  const names = new Set([
    ...Object.keys(raw.darkPreferred),
    ...Object.keys(raw.darkExplicit),
  ]);
  return [...names].filter((t) => raw.darkPreferred[t] !== raw.darkExplicit[t]).sort();
}

/* --- Report --------------------------------------------------------------- */

function report() {
  const { light, dark, raw } = readPalettes();
  let failures = 0;

  for (const [name, palette] of [['light', light], ['dark', dark]]) {
    console.log(`\n  ${name.toUpperCase()}\n  ${'-'.repeat(78)}`);
    for (const row of audit(palette)) {
      if (!row.pass) failures += 1;
      const mark = row.pass ? '  ok ' : ' FAIL';
      const ratio = `${row.ratio.toFixed(2)}:1`.padStart(8);
      const need = `(needs ${row.min})`.padEnd(12);
      console.log(`${mark}${ratio} ${need} ${`${row.fg} on ${row.bg}`.padEnd(36)} ${row.where}`);
    }
  }

  console.log(`\n  DELIBERATE DEVIATIONS\n  ${'-'.repeat(78)}`);
  for (const d of DEVIATIONS) {
    for (const [fg, bg] of d.pairs) {
      const l = contrast(light[fg], light[bg]).toFixed(2).padStart(5);
      const k = contrast(dark[fg], dark[bg]).toFixed(2).padStart(5);
      console.log(`       light ${l}:1   dark ${k}:1   ${fg} on ${bg}`);
    }
    console.log(`\n  ${d.why.replace(/(.{1,74})(\s|$)/g, '$1\n  ').trimEnd()}\n`);
  }

  const drift = darkDrift(raw);
  if (drift.length) {
    failures += drift.length;
    console.log(`  FAIL  the two dark blocks disagree on: ${drift.join(', ')}\n`);
  }

  console.log(
    failures
      ? `  ${failures} problem(s). Adjust src/shared/tokens.css.\n`
      : `  ${PAIRS.length * 2} pairs across both themes, all clear.\n`,
  );
  process.exitCode = failures ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) report();
