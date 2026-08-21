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
    'We said not right now.',
    'This one’s on the list. You put it there.',
    'Not during a session. Past-you was pretty clear.',
    'Still blocked. Still here.',
    'That was the deal.',
    'I’m just holding the door.',
    'Yep. That’s the one we agreed on.',
    'Focus mode is still on. So am I.',
    'This tab isn’t going anywhere useful.',
    'You can come back later. That’s the point.',
    'Noted. And no.',
    'The list doesn’t have a loophole. I checked.',
  ],
  /* Getting habitual: gently name the pattern. */
  mid: [
    'We’ve been here before today.',
    'Reflex, right? It happens.',
    'Same door, same dinosaur.',
    'You’re not really deciding at this point.',
    'That’s the hand, moving on its own again.',
    'Third time’s not a charm. It’s a habit.',
    'We keep taking this walk.',
    'The site didn’t change. The urge didn’t either.',
    'I know, I know. Still no.',
    'This is the same five seconds as last time.',
    'Close the tab. The thought will pass.',
  ],
  /* A lot: acknowledge it honestly, no lecture. */
  high: [
    'We’re really doing this today, huh.',
    'Okay. Rough one. Still no.',
    'I’ll keep standing here if you keep coming back.',
    'This is the loop. You can just close the tab.',
    'Yeah. I counted too.',
    'We can do this as many times as you need. The answer stays the same.',
    'I’m not mad. I’m just still here.',
    'Tomorrow doesn’t care about this number.',
    'The feed is not going to save the afternoon.',
    'Alright. Deep breath. Then close it.',
  ],
};

/** Second line — a small honest observation, sometimes. Not always shown,
 *  because a page that always says two things reads as nagging. */
const SUBLINES = [
  'Session ends when it ends.',
  'Nothing bad happens if you close this.',
  'The feed will still be there later. That’s the whole problem with it.',
  'You can override. It just takes a second.',
  'Past-you set this up on purpose.',
  'Five minutes from now you will not miss this tab.',
  'I’m on your side. That’s why I’m in the way.',
  'The session is still running. We can go back to it.',
  'Override exists for a reason. So does the wait.',
  'Nobody’s keeping score except the number up there.',
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
