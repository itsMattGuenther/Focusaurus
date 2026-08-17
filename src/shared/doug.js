/* ==========================================================================
   Doug — the Focusaurus
   --------------------------------------------------------------------------
   Doug is inline SVG, not a set of raster sprites (DESIGN.md ADR-9).

   Consequences of that choice, all of which we want:
     - one shared body, so moods can never drift out of register with each other
     - themeable: every fill is a CSS custom property, so Doug follows dark mode
     - animatable: he breathes, and his pupils can move
     - ~4KB total instead of six PNGs at three densities
     - a new mood is a few path strings, not a commission

   Doug faces right. Canvas is 200x200; he stands on y=188.
   The body never changes between moods — only eyes, brows, mouth, and the
   occasional accessory. That constraint is what makes him read as one
   character across seven states.
   ========================================================================== */

/** Mood ids, plus the human-readable reason each one exists.
 *  `because` is surfaced in the popup tooltip — an unexplained mood is just
 *  decoration (DESIGN.md §5). */
export const MOODS = {
  asleep:   { label: 'Asleep',      because: "It's outside your work hours." },
  locked_in:{ label: 'Locked in',   because: "Deep in a session, no slips." },
  focused:  { label: 'Focused',     because: 'A session is running.' },
  bummed:   { label: 'Bummed',      because: "A budget got blown today." },
  side_eye: { label: 'Side-eyeing', because: "You're close to a limit." },
  stoked:   { label: 'Stoked',      because: 'Several good days in a row.' },
  chill:    { label: 'Chill',       because: 'Nothing much going on.' },
};

export const DEFAULT_MOOD = 'chill';

/* --- Shared anatomy ------------------------------------------------------
   Drawn back-to-front. Extracted as constants so no mood can accidentally
   ship a different body. */

const BACK_LEG = `<rect x="70" y="156" width="22" height="32" rx="11" fill="var(--doug-body-dim)"/>`;
const FRONT_LEG = `<rect x="100" y="158" width="24" height="30" rx="12" fill="var(--doug-body)"/>`;

const TAIL = `<path d="M62 120 C34 118 14 138 6 166 C30 158 46 152 68 150 Z" fill="var(--doug-body-dim)"/>`;

const BODY = `<ellipse cx="96" cy="134" rx="48" ry="40" fill="var(--doug-body)"/>`;
const BELLY = `<ellipse cx="92" cy="148" rx="34" ry="22" fill="var(--doug-belly)" opacity="0.85"/>`;

/* Spine plates, tail-base up to the neck. Small and irregular on purpose —
   perfectly even plates look machined. */
const PLATES = [
  [56, 112], [72, 100], [90, 95], [108, 97], [124, 104], [134, 88],
]
  .map(([x, y]) => `<path d="M${x - 8} ${y + 5} Q${x - 1} ${y - 9} ${x + 8} ${y + 4} Z" fill="var(--doug-plate)"/>`)
  .join('');

/* Neck is a fat round-capped stroke — far more forgiving than a filled
   outline, and it tucks cleanly under both body and head. */
const NECK = `<path d="M118 110 Q130 84 142 72" stroke="var(--doug-body)" stroke-width="34" stroke-linecap="round" fill="none"/>`;

const HEAD = `<ellipse cx="148" cy="62" rx="32" ry="28" fill="var(--doug-body)"/>`;
const SNOUT = `
  <ellipse cx="176" cy="70" rx="16" ry="13" fill="var(--doug-body)"/>
  <circle cx="186" cy="66" r="2.2" fill="var(--doug-ink)" opacity="0.5"/>`;

/* --- Face parts ---------------------------------------------------------- */

const EYE_L = { cx: 142, cy: 56, r: 8 };
const EYE_R = { cx: 164, cy: 58, r: 8.5 };

/* Eyes are wrapped in their own group so the blink animation can collapse
   ONLY the eyes. Animating the whole face group squashes the brows and mouth
   too, which reads as his entire head deflating. */

/** Open eyes with optional pupil offset and an optional drooping lid. */
function openEyes({ dx = 2, dy = 1, lid = 0 } = {}) {
  const eye = (e) => `
    <circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="var(--doug-eye)"/>
    <circle cx="${e.cx + dx}" cy="${e.cy + dy}" r="${e.r * 0.48}" fill="var(--doug-ink)"/>
    ${lid > 0
      ? `<path d="M${e.cx - e.r - 0.5} ${e.cy - e.r * (1 - lid)}
                  a${e.r + 0.5} ${e.r + 0.5} 0 0 1 ${(e.r + 0.5) * 2} 0
                  L${e.cx + e.r + 0.5} ${e.cy - e.r * (1 - lid)} Z"
              fill="var(--doug-body)"/>`
      : ''}`;
  return `<g class="doug__eyes">${eye(EYE_L)}${eye(EYE_R)}</g>`;
}

/** Closed/curved eyes — used for sleep (downward) and delight (upward).
 *  Already-shut eyes never blink; doug.css opts these moods out. */
function curvedEyes(dir = 'down') {
  const sweep = dir === 'down' ? 1 : 0;
  const arc = (e) =>
    `<path d="M${e.cx - e.r} ${e.cy} a${e.r} ${e.r * 0.8} 0 0 ${sweep} ${e.r * 2} 0"
       stroke="var(--doug-ink)" stroke-width="3" stroke-linecap="round" fill="none"/>`;
  return `<g class="doug__eyes">${arc(EYE_L)}${arc(EYE_R)}</g>`;
}

const brow = (d) =>
  `<path d="${d}" stroke="var(--doug-ink)" stroke-width="3.4" stroke-linecap="round" fill="none" opacity="0.85"/>`;

const mouth = (d, fill = 'none') =>
  `<path d="${d}" stroke="var(--doug-ink)" stroke-width="3" stroke-linecap="round"
     stroke-linejoin="round" fill="${fill}" opacity="0.85"/>`;

/* --- Mood expressions ---------------------------------------------------
   Each returns the face layer only. Keys must match MOODS. */

const FACES = {
  chill: () =>
    openEyes() +
    brow('M133 40 Q142 35 151 39') +
    brow('M156 42 Q165 37 174 42') +
    mouth('M162 74 Q174 82 186 72'),

  /* Determined: narrowed eyes, brows driven down and inward, flat mouth. */
  focused: () =>
    openEyes({ dx: 3, dy: 0, lid: 0.34 }) +
    brow('M133 43 Q142 38 152 43') +
    brow('M155 45 Q165 40 175 46') +
    mouth('M164 76 L184 73'),

  /* Same set as focused plus a glint — the only mood with an accessory,
     which is what makes it feel earned. */
  locked_in: () =>
    openEyes({ dx: 3, dy: 0, lid: 0.3 }) +
    brow('M133 44 Q142 38 152 44') +
    brow('M155 46 Q165 40 175 47') +
    mouth('M164 76 L184 73') +
    `<g class="doug__sparkles" opacity="0.9">
       <path d="M104 46 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 Z"
             fill="var(--moss-bright)"/>
       <path d="M118 28 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z"
             fill="var(--moss-bright)" opacity="0.6"/>
     </g>`,

  /* Delighted: arc eyes, high brows, open grin. */
  stoked: () =>
    curvedEyes('up') +
    brow('M132 36 Q142 29 152 35') +
    brow('M155 38 Q165 31 175 38') +
    mouth('M159 71 Q174 90 188 69', 'var(--doug-ink)'),

  /* Suspicious: pupils rolled back toward you, one brow up, wry mouth. */
  side_eye: () =>
    openEyes({ dx: -3.4, dy: 0.5, lid: 0.2 }) +
    brow('M132 34 Q142 30 152 35') +
    brow('M156 45 Q165 43 174 45') +
    mouth('M162 76 Q171 79 186 71'),

  /* Deflated: heavy lids, outer brows dropped, frown. Deliberately gentle —
     this is the mood most likely to tip into shame, so it stays soft. */
  bummed: () =>
    openEyes({ dx: 1, dy: 2.5, lid: 0.52 }) +
    brow('M132 40 Q143 37 151 45') +
    brow('M157 46 Q166 39 175 43') +
    mouth('M163 80 Q174 70 186 78'),

  asleep: () =>
    curvedEyes('down') +
    brow('M133 38 Q142 34 151 38') +
    brow('M156 40 Q165 36 174 40') +
    mouth('M167 76 Q174 80 181 75') +
    `<g class="doug__zzz" fill="var(--ink-faint)" font-family="var(--font-display)"
        font-weight="700" opacity="0.75">
       <text x="104" y="46" font-size="15">z</text>
       <text x="88" y="30" font-size="11">z</text>
       <text x="76" y="18" font-size="8">z</text>
     </g>`,
};

/**
 * Build Doug as an SVG string.
 *
 * @param {string} mood     One of MOODS. Falls back to DEFAULT_MOOD.
 * @param {object} [opts]
 * @param {boolean} [opts.breathing=true]  Idle breathing animation.
 * @param {string}  [opts.className='']    Extra classes on the <svg>.
 * @returns {string} SVG markup
 */
export function dougSVG(mood = DEFAULT_MOOD, opts = {}) {
  const { breathing = true, className = '' } = opts;
  const face = FACES[mood] ? FACES[mood] : FACES[DEFAULT_MOOD];
  const resolved = FACES[mood] ? mood : DEFAULT_MOOD;
  const meta = MOODS[resolved];

  return `
<svg class="doug ${breathing ? 'doug--breathing' : ''} ${className}"
     viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"
     data-mood="${resolved}" role="img"
     aria-label="Doug the Focusaurus, looking ${meta.label.toLowerCase()}">
  <g class="doug__body">
    ${BACK_LEG}
    ${TAIL}
    ${PLATES}
    ${BODY}
    ${BELLY}
    ${FRONT_LEG}
    ${NECK}
    ${HEAD}
    ${SNOUT}
    <g class="doug__face">${face()}</g>
  </g>
</svg>`.trim();
}

/** Replace an element's contents with Doug. */
export function renderDoug(el, mood, opts) {
  el.innerHTML = dougSVG(mood, opts);
  return el.firstElementChild;
}
