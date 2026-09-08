/* ==========================================================================
   Doug's voice
   --------------------------------------------------------------------------
   A fixed block-page message becomes wallpaper in about three days —
   habituation is what kills interstitials (DESIGN.md ADR-6). So lines are
   pooled and rotated, and the pool never repeats twice running.

   Tone rules, enforced by review not by code:
     - first person plural: "we said 15 minutes", not "you said"
     - never "failed", "wasted", "you've lost N hours"
     - always acknowledge it was the user's own decision, without gloating
     - short. Doug is not chatty. Two lines maximum.
     - disappointed WITH you, never IN you
   ========================================================================== */

/** Lines for the interstitial, tiered by how many times you've tried today.
 *  Escalation is wry, never scolding — the joke is that Doug is still here. */
const BLOCKED_LINES = {
  /* First couple of attempts: matter-of-fact. */
  low: [
    'A small pause. A fresh start.',
    'We made a little space for this.',
    'Let’s come back to what matters.',
    'The internet can wait a moment.',
    'A little room to find your focus.',
    'I’m keeping this spot for you.',
    'One tab at a time.',
    'Your focus time is still yours.',
    'A good moment to take a breath.',
    'This one can wait until later.',
    'Back to our little patch of focus.',
    'A quieter tab. A clearer head.',
  ],
  /* Getting habitual: gently name the pattern. */
  mid: [
    'We’ve been here before today.',
    'Reflex, right? It happens.',
    'Same door, same dinosaur.',
    'A familiar turn. A new chance to choose.',
    'Sometimes our hands get ahead of us.',
    'Noticing is a good place to start.',
    'Let’s take a different little walk.',
    'The urge can pass. I’ll wait with you.',
    'Here we are. We can start again.',
    'A small reset, whenever you need one.',
    'One breath. Then the next small thing.',
  ],
  /* A lot: acknowledge it honestly, no lecture. */
  high: [
    'Some days need a few more fresh starts.',
    'A busy mind. A little breathing room.',
    'I’m here for as many resets as you need.',
    'We can begin again from right here.',
    'A pause still counts as a pause.',
    'Maybe a stretch would feel good.',
    'Still on your side. Still here.',
    'Tomorrow gets its own fresh page.',
    'This moment can be a turning point.',
    'No rush. One small step back.',
  ],
};

/** Second line — a small honest observation, sometimes. Not always shown,
 *  because a page that always says two things reads as nagging. */
const SUBLINES = [
  'You made this space for something that matters.',
  'Your next small step is enough.',
  'The rest of the internet will still be here later.',
  'Unclench your shoulders. You have a little room.',
  'A gentle reminder of what you came to do.',
  'You don’t have to finish everything. Just begin.',
  'I’m on your side, one tab at a time.',
  'Your session is still running. We can return to it.',
  'A sip of water, a breath, and back when you’re ready.',
  'Noticing the habit is already a small change.',
];

/** Popup greetings per mood. Keyed to MOODS in doug.js. */
/** @type {Record<string, string[]>} */
const MOOD_LINES = {
  asleep:    ['Off the clock.', 'Nothing scheduled. Resting.', 'See you in the morning.', 'Quiet hours. I’m down.'],
  locked_in: ['This is the good stuff.', 'Nobody’s knocking. Nice.', 'Don’t peek. You’re in it.', 'Clean so far. Keep going.'],
  focused:   ['We’re working.', 'In it.', 'Session’s running.', 'Eyes on the work.'],
  bummed:    ['Today got away from us.', 'It happens. Tomorrow’s clean.', 'Rough one. We reset at midnight.', 'Not our best. Still us.'],
  side_eye:  ['Getting close to a limit.', 'Just so you know.', 'Budget’s looking skinny.', 'I’d ease off, if it were me.'],
  stoked:    ['Look at this streak.', 'We’re on a run.', 'Several good days. I noticed.', 'This is the fun version of me.'],
  chill:     ['Ready when you are.', 'Nothing running.', 'Whenever you’re ready.', 'Idle. In a good way.'],
};

/**
 * Pick a line without repeating the previous one.
 *
 * Deterministic given (pool, avoid) is not the goal — variety is. We just
 * guarantee no immediate repeat, which is the thing people actually notice.
 *
 * @param {string[]} pool
 * @param {string} [avoid] previously shown line
 */
function pick(pool, avoid) {
  const options = pool.length > 1 && avoid ? pool.filter((l) => l !== avoid) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Copy for the interstitial.
 *
 * @param {number} attempts how many times this site was hit today (1-based)
 * @param {string} [avoid]  last line shown, to prevent an immediate repeat
 * @returns {{line: string, subline: string|null}}
 */
export function blockedCopy(attempts = 1, avoid) {
  const tier = attempts >= 8 ? 'high' : attempts >= 4 ? 'mid' : 'low';
  return {
    line: pick(BLOCKED_LINES[tier], avoid),
    // Show a subline ~half the time, and always on the first hit of the day
    // when it's genuinely informative rather than repetitive.
    subline: attempts === 1 || Math.random() < 0.5 ? pick(SUBLINES) : null,
  };
}

/** Copy for the popup, given Doug's current mood. */
/** @param {string} [mood] @param {string} [avoid] */
export function moodCopy(mood, avoid) {
  return pick(MOOD_LINES[mood || 'chill'] || MOOD_LINES.chill, avoid);
}

/** Exported for tests — pool sizes, not the lines themselves. */
export const COPY_STATS = {
  blocked: {
    low: BLOCKED_LINES.low.length,
    mid: BLOCKED_LINES.mid.length,
    high: BLOCKED_LINES.high.length,
  },
  sublines: SUBLINES.length,
  mood: Object.fromEntries(Object.entries(MOOD_LINES).map(([k, v]) => [k, v.length])),
};
