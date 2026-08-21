/* ==========================================================================
   Attempt history
   --------------------------------------------------------------------------
   PURE MODULE (DESIGN.md ADR-8).

   "You reached for Twitter 23 times today" is the stat we think actually
   changes behavior — it names the reflex rather than the elapsed time
   (PRODUCT.md §5). This module turns the per-day `usage:*` buckets into a
   trailing-week picture the popup and settings page can both read.

   Time spent is v0.3. Overrides appear in the weekly review (v0.5). This
   file counts attempts, and only attempts, so the signal stays one number.
   ========================================================================== */

/** Same format as `schedule.localDayKey` — kept local so this module doesn't
 *  pull the schedule engine into every test and into the studio typecheck.
 *  @param {Date} date */
function localDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const WEEK_LENGTH = 7;
/** Sites that have since been removed from the list still have usage rows.
 *  Bucket them together so the week's total stays honest without naming a
 *  site the user already decided not to track. */
export const ORPHAN_ID = '__orphan__';
export const ORPHAN_LABEL = 'off the list';

const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Trailing `length` local calendar days, oldest first, ending on `from`.
 * Not a Mon–Sun week: a personal tool that went quiet Monday morning
 * shouldn't open on an empty "this week" until Sunday.
 *
 * @param {Date} [from]
 * @param {number} [length]
 * @returns {string[]} YYYY-MM-DD keys
 */
export function weekKeys(from = new Date(), length = WEEK_LENGTH) {
  const n = Math.max(1, Math.round(Number(length)) || WEEK_LENGTH);
  const keys = [];
  // Construct each day as a local Y/M/D so DST and month roll-overs don't
  // skip or double a calendar date the way subtracting milliseconds would.
  const y = from.getFullYear();
  const m = from.getMonth();
  const d = from.getDate();
  for (let i = n - 1; i >= 0; i -= 1) {
    keys.push(localDayKey(new Date(y, m, d - i)));
  }
  return keys;
}

/**
 * Local weekday of a YYYY-MM-DD key. Parsed as a local date, never UTC —
 * `new Date('2026-08-17')` is midnight UTC and lands on the previous
 * evening in the Americas.
 *
 * @param {string} dayKey
 * @returns {number} 0–6, Sunday-origin; 0 if the key is unreadable
 */
export function weekdayIndex(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  if (!y || !m || !d) return 0;
  const day = new Date(y, m - 1, d).getDay();
  return Number.isInteger(day) ? day : 0;
}

/** @param {string} dayKey */
export function weekdayLetter(dayKey) {
  return DOW_LETTER[weekdayIndex(dayKey)];
}

/** @param {string} dayKey */
export function weekdayName(dayKey) {
  return DOW_NAME[weekdayIndex(dayKey)];
}

/** "once" / "N times" — the noun the rest of the product already uses.
 *  @param {*} n */
export function timesPhrase(n) {
  const count = Math.max(0, Math.round(Number(n) || 0));
  return count === 1 ? 'once' : `${count} times`;
}

/**
 * @typedef {{ attempts?: number, overrides?: number, activeSeconds?: number }} UsageEntry
 * @typedef {{ perSite?: Record<string, UsageEntry> }} UsageDay
 * @typedef {{ id: string, label?: string }} SiteRef
 * @typedef {{
 *   key: string,
 *   weekday: string,
 *   weekdayName: string,
 *   attempts: number,
 *   overrides: number,
 * }} DaySummary
 * @typedef {{
 *   id: string,
 *   label: string,
 *   attempts: number,
 *   overrides: number,
 * }} SiteSummary
 * @typedef {{
 *   days: DaySummary[],
 *   sites: SiteSummary[],
 *   total: number,
 *   overrides: number,
 *   peak: number,
 *   leader: SiteSummary | null,
 * }} AttemptSummary
 */

/** @param {*} value */
function asCount(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Fold a map of `YYYY-MM-DD → usage bucket` into the week's picture.
 *
 * Day order follows the keys as given (callers pass `weekKeys()`). Sites
 * rank by attempts, then label. `activeSeconds` is ignored on purpose.
 *
 * @param {Record<string, UsageDay>} dayMap
 * @param {SiteRef[]} [sites]
 * @returns {AttemptSummary}
 */
export function summarizeAttempts(dayMap, sites = []) {
  const labels = new Map();
  for (const site of Array.isArray(sites) ? sites : []) {
    if (site && typeof site.id === 'string' && site.id) {
      labels.set(site.id, typeof site.label === 'string' && site.label ? site.label : site.id);
    }
  }

  const keys = Object.keys(dayMap || {});
  /** @type {Map<string, { attempts: number, overrides: number }>} */
  const bySite = new Map();

  const days = keys.map((key) => {
    const raw = dayMap[key];
    const perSite = raw && typeof raw === 'object' && raw.perSite && typeof raw.perSite === 'object'
      ? raw.perSite
      : {};

    let attempts = 0;
    let overrides = 0;
    for (const [id, entry] of Object.entries(perSite)) {
      const a = asCount(entry?.attempts);
      const o = asCount(entry?.overrides);
      attempts += a;
      overrides += o;
      if (!a && !o) continue;
      const bucket = labels.has(id) ? id : ORPHAN_ID;
      const cur = bySite.get(bucket) || { attempts: 0, overrides: 0 };
      cur.attempts += a;
      cur.overrides += o;
      bySite.set(bucket, cur);
    }

    return {
      key,
      weekday: weekdayLetter(key),
      weekdayName: weekdayName(key),
      attempts,
      overrides,
    };
  });

  const ranked = [...bySite.entries()]
    .map(([id, stats]) => ({
      id,
      label: id === ORPHAN_ID ? ORPHAN_LABEL : labels.get(id) || id,
      attempts: stats.attempts,
      overrides: stats.overrides,
    }))
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label));

  const total = days.reduce((n, day) => n + day.attempts, 0);
  const overrideTotal = days.reduce((n, day) => n + day.overrides, 0);
  const peak = days.reduce((n, day) => Math.max(n, day.attempts), 0);

  return {
    days,
    sites: ranked,
    total,
    overrides: overrideTotal,
    peak,
    leader: ranked[0] || null,
  };
}

/**
 * One line for the popup. Short enough to sit under today's count without
 * turning the control panel into a dashboard.
 *
 * @param {AttemptSummary} [summary]
 */
export function historyGlance(summary) {
  const total = summary?.total || 0;
  const leader = summary?.leader;
  if (total === 0) return 'Quiet week so far.';
  if (leader) return `${leader.label} · ${timesPhrase(leader.attempts)} this week`;
  return `${timesPhrase(total)} this week`;
}

/**
 * The sentence the settings page leads with. Present, specific, never a
 * deficit — DESIGN.md §5 copy tone.
 *
 * @param {AttemptSummary} [summary]
 */
export function historyHeadline(summary) {
  const total = summary?.total || 0;
  const leader = summary?.leader;
  const siteCount = summary?.sites?.length || 0;

  if (total === 0) return 'Quiet week so far.';
  if (siteCount <= 1 && leader) {
    return `This week you reached for ${leader.label} ${timesPhrase(leader.attempts)}.`;
  }
  if (leader && leader.attempts * 2 > total) {
    return `This week you reached ${timesPhrase(total)}. ${leader.label} led.`;
  }
  return `This week you reached ${timesPhrase(total)} across ${siteCount} sites.`;
}
