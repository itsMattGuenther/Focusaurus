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

   Proportions (v0.2) are authored against the specimen plate in
   Focusaurus.webp: a compact T-rex, not a lollipop. Head is ~45% of body
   width, neck is a connection rather than a third limb, plates sit on the
   spine, and a pair of stubby arms make him a dinosaur at 92px.
   ========================================================================== */

/** Mood ids, plus the human-readable reason each one exists.
 *  `because` is surfaced in the popup — an unexplained mood is just
 *  decoration (DESIGN.md §5). */
/** @type {Record<string, { label: string, because: string }>} */
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
   ship a different body. Coordinates are the v0.2 redraw: smaller head,
   thinner neck, defined muzzle, T-rex arms, plates along the spine only. */

const BACK_LEG = `<rect x="68" y="150" width="22" height="38" rx="11" fill="var(--doug-body-dim)"/>`;
const FRONT_LEG = `<rect x="102" y="152" width="24" height="36" rx="12" fill="var(--doug-body)"/>`;

const TAIL = `<path d="M56 128 C28 124 12 142 8 172 C26 162 44 152 64 148 Z" fill="var(--doug-body-dim)"/>`;

const BODY = `<ellipse cx="96" cy="128" rx="46" ry="38" fill="var(--doug-body)"/>`;
const BELLY = `<ellipse cx="104" cy="142" rx="30" ry="24" fill="var(--doug-belly)" opacity="0.92"/>`;

/* Spine plates, tail-base up to the nape. Irregular on purpose — perfectly
   even plates look machined. Drawn under the body so the bases tuck in. */
/** @param {number} x @param {number} y @param {number} w @param {number} h */
function plate(x, y, w, h) {
  const tipX = (x - w * 0.12).toFixed(1);
  const tipY = (y - h).toFixed(1);
  const left = (x - w * 0.48).toFixed(1);
  const right = (x + w * 0.5).toFixed(1);
  const base = (y + h * 0.18).toFixed(1);
  return `<path d="M${left} ${base} L${tipX} ${tipY} L${right} ${base} Z" fill="var(--doug-plate)"/>`;
}

const PLATES = [
  plate(56, 122, 13, 14),
  plate(72, 104, 16, 19),
  plate(90, 90, 18, 23),
  plate(108, 94, 16, 18),
  plate(124, 106, 12, 13),
].join('');

/* Neck is a round-capped stroke — far more forgiving than a filled outline,
   and it tucks cleanly under both body and head. v0.1 was 34px and read as
   a third limb; 20px is a neck. */
const NECK = `<path d="M122 106 Q132 86 140 70" stroke="var(--doug-body)" stroke-width="20" stroke-linecap="round" fill="none"/>`;

/* Stubby T-rex arm. This is the silhouette cue that he's a dinosaur at
   popup size, not a bean with a face. */
const ARM = `
  <path d="M118 122 Q134 130 140 146" stroke="var(--doug-body)" stroke-width="11" stroke-linecap="round" fill="none"/>
  <ellipse cx="141" cy="150" rx="6.5" ry="5" fill="var(--doug-body)"/>`;

const HEAD = `<ellipse cx="148" cy="54" rx="22" ry="20" fill="var(--doug-body)"/>`;

/* Horizontal muzzle overlapping the head so the join is a silhouette, not
   two stacked eggs. */
const SNOUT = `
  <ellipse cx="168" cy="62" rx="16" ry="11" fill="var(--doug-body)"/>
  <circle cx="178" cy="58" r="1.8" fill="var(--doug-ink)" opacity="0.55"/>`;

/* --- Face parts ---------------------------------------------------------- */

const EYE_L = { cx: 138, cy: 50, r: 7.0 };
const EYE_R = { cx: 156, cy: 52, r: 7.6 };

/* Eyes are wrapped in their own group so the blink animation can collapse
   ONLY the eyes. Animating the whole face group squashes the brows and mouth
   too, which reads as his entire head deflating. */

/** Open eyes with optional pupil offset and an optional drooping lid. */
function openEyes({ dx = 1.8, dy = 0.8, lid = 0 } = {}) {
  /** @param {{ cx: number, cy: number, r: number }} e */
  const eye = (e) => `
    <circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="var(--doug-eye)"/>
    <circle cx="${e.cx + dx}" cy="${e.cy + dy}" r="${e.r * 0.46}" fill="var(--doug-ink)"/>
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
  /** @param {{ cx: number, cy: number, r: number }} e */
  const arc = (e) =>
    `<path d="M${e.cx - e.r} ${e.cy} a${e.r} ${e.r * 0.72} 0 0 ${sweep} ${e.r * 2} 0"
       stroke="var(--doug-ink)" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
  return `<g class="doug__eyes">${arc(EYE_L)}${arc(EYE_R)}</g>`;
}

/** @param {string} d */
const brow = (d) =>
  `<path d="${d}" stroke="var(--doug-ink)" stroke-width="2.8" stroke-linecap="round" fill="none" opacity="0.85"/>`;

/** @param {string} d @param {string} [fill] */
const mouth = (d, fill = 'none') =>
  `<path d="${d}" stroke="var(--doug-ink)" stroke-width="2.6" stroke-linecap="round"
     stroke-linejoin="round" fill="${fill}" opacity="0.85"/>`;

/* --- Mood expressions ---------------------------------------------------
   Each returns the face layer only. Keys must match MOODS.
   Brows sit just above the eyes — they are part of the face, not floating
   furniture. Mouths live on the snout. */

/** @type {Record<string, () => string>} */
const FACES = {
  chill: () =>
    openEyes() +
    brow('M130 38 Q138 34 146 38') +
    brow('M150 40 Q158 36 167 41') +
    mouth('M164 70 Q174 77 184 68'),

  /* Determined: narrowed eyes, brows driven down and inward, flat mouth. */
  focused: () =>
    openEyes({ dx: 2.4, dy: 0, lid: 0.34 }) +
    brow('M130 42 Q138 38 147 43') +
    brow('M150 44 Q159 40 168 45') +
    mouth('M166 72 L184 70'),

  /* Same set as focused plus a glint — the only mood with an accessory,
     which is what makes it feel earned. */
  locked_in: () =>
    openEyes({ dx: 2.4, dy: 0, lid: 0.3 }) +
    brow('M130 43 Q138 38 147 44') +
    brow('M150 45 Q159 40 168 46') +
    mouth('M166 72 L184 70') +
    `<g class="doug__sparkles" opacity="0.9">
       <path d="M104 40 l2.4 5.8 5.8 2.4 -5.8 2.4 -2.4 5.8 -2.4 -5.8 -5.8 -2.4 5.8 -2.4 Z"
             fill="var(--moss-bright)"/>
       <path d="M118 24 l1.5 3.6 3.6 1.5 -3.6 1.5 -1.5 3.6 -1.5 -3.6 -3.6 -1.5 3.6 -1.5 Z"
             fill="var(--moss-bright)" opacity="0.6"/>
     </g>`,

  /* Delighted: arc eyes, high brows, open grin. */
  stoked: () =>
    curvedEyes('up') +
    brow('M129 34 Q138 28 147 34') +
    brow('M150 36 Q159 30 168 37') +
    mouth('M162 68 Q174 84 186 66', 'var(--doug-ink)'),

  /* Suspicious: pupils rolled back toward you, one brow up, wry mouth. */
  side_eye: () =>
    openEyes({ dx: -3.2, dy: 0.4, lid: 0.18 }) +
    brow('M129 32 Q138 28 147 34') +
    brow('M150 44 Q159 42 167 44') +
    mouth('M164 72 Q173 76 184 68'),

  /* Deflated: heavy lids, outer brows dropped, frown. Deliberately gentle —
     this is the mood most likely to tip into shame, so it stays soft. */
  bummed: () =>
    openEyes({ dx: 0.8, dy: 2.2, lid: 0.5 }) +
    brow('M129 40 Q139 38 147 46') +
    brow('M151 46 Q160 38 168 42') +
    mouth('M164 76 Q174 68 184 74'),

  asleep: () =>
    curvedEyes('down') +
    brow('M130 36 Q138 33 146 37') +
    brow('M150 39 Q158 36 167 40') +
    mouth('M168 72 Q174 76 180 71') +
    `<g class="doug__zzz" fill="var(--ink-faint)" font-family="var(--font-display)"
        font-weight="700" opacity="0.75">
       <text x="104" y="40" font-size="14">z</text>
       <text x="90" y="26" font-size="10">z</text>
       <text x="78" y="16" font-size="8">z</text>
     </g>`,
};

/**
 * Build Doug as an SVG string.
 *
 * @param {string} mood     One of MOODS. Falls back to DEFAULT_MOOD.
 * @param {object} [opts]
 * @param {boolean} [opts.breathing=true]  Idle breathing animation.
 * @param {string}  [opts.className='']    Extra classes on the <svg>.
 * @param {string}  [opts.viewBox='0 0 200 200']  Override to crop (icons).
 * @returns {string} SVG markup
 */
export function dougSVG(mood = DEFAULT_MOOD, opts = {}) {
  const { breathing = true, className = '', viewBox = '0 0 200 200' } = opts;
  const face = FACES[mood] ? FACES[mood] : FACES[DEFAULT_MOOD];
  const resolved = FACES[mood] ? mood : DEFAULT_MOOD;
  const meta = MOODS[resolved];

  return `
<svg class="doug ${breathing ? 'doug--breathing' : ''} ${className}"
     viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"
     data-mood="${resolved}" role="img"
     aria-label="Doug the Focusaurus, looking ${meta.label.toLowerCase()}">
  <g class="doug__body">
    ${BACK_LEG}
    ${TAIL}
    ${PLATES}
    ${BODY}
    ${BELLY}
    ${FRONT_LEG}
    ${ARM}
    ${NECK}
    ${HEAD}
    ${SNOUT}
    <g class="doug__face">${face()}</g>
  </g>
</svg>`.trim();
}

/** Head-and-shoulders crop for the 16px toolbar icon, where a full-body
 *  drawing collapses into a green pebble. Same geometry, tighter frame. */
export const ICON_VIEWBOX = '96 16 100 100';

/** Replace an element's contents with Doug. */
/** @param {HTMLElement} el @param {string} [mood] @param {object} [opts] */
export function renderDoug(el, mood, opts) {
  el.innerHTML = dougSVG(mood, opts);
  return el.firstElementChild;
}
