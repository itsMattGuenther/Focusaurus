/* ==========================================================================
   Storage access
   --------------------------------------------------------------------------
   The only module besides the service worker that touches chrome.*.
   Everything goes through typed accessors so no caller has to remember which
   area a given key lives in, or what its default shape is.

   Area split (DESIGN.md ADR-7):
     sync  — settings. Small, and worth carrying between machines for free.
     local — usage, sessions, streaks. sync's quotas (8KB/item,
             1800 writes/hour) can't survive per-minute time-series writes.
   ========================================================================== */

import { parseInput, specKey } from '../shared/match.js';
import { localDayKey } from '../shared/schedule.js';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  dino: { name: 'Doug' },
  schedule: {
    enabled: false,
    days: [1, 2, 3, 4, 5], // 0 = Sunday
    start: '09:00',
    end: '17:00',
  },
  strictness: 'firm', // gentle | firm | locked
  overrideMinutes: 5,
  onboarded: false,
  /* NOTE: the whole array is one sync item, so it's bound by
     QUOTA_BYTES_PER_ITEM (8192). That's roughly 80 sites. Plenty for a
     personal blocklist; if it ever becomes a real ceiling, sites move to
     local and lose cross-machine sync. */
  sites: [],
};

/** Override delay in seconds, derived from strictness. `locked` means no
 *  override is offered at all until the session ends. */
export const OVERRIDE_DELAYS = { gentle: 5, firm: 15, locked: null };

const DEFAULT_LOCAL = {
  session: null,        // { startedAt, endsAt, plannedMinutes, source }
  scheduleSuppressedUntil: null, // auto-start muted until this ts
  overrides: [],        // [{ siteId, expiresAt }]
  recentAttempts: [],   // timestamps, pruned to a 10-minute window
  streak: { current: 0, best: 0, lastGoodDay: null },
  lastBlockedLine: null,
};

/* --- Settings (sync) ----------------------------------------------------- */

export async function getSettings() {
  const stored = await chrome.storage.sync.get(null);
  // Shallow-merge per top-level key so a newly added default appears for
  // existing users without a migration step.
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    dino: { ...DEFAULT_SETTINGS.dino, ...(stored.dino || {}) },
    schedule: { ...DEFAULT_SETTINGS.schedule, ...(stored.schedule || {}) },
    sites: Array.isArray(stored.sites) ? stored.sites : [],
  };
}

export async function patchSettings(patch) {
  await chrome.storage.sync.set(patch);
  return getSettings();
}

/* --- Local state -------------------------------------------------------- */

export async function getLocal() {
  const stored = await chrome.storage.local.get(null);
  return { ...DEFAULT_LOCAL, ...stored };
}

export async function patchLocal(patch) {
  await chrome.storage.local.set(patch);
}

/* --- Sites -------------------------------------------------------------- */

function newSiteId() {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Add a site from raw user input.
 * Returns { ok, site } or { ok: false, reason }.
 *
 * Dedupes on the normalized spec, so "https://www.Reddit.com/" and
 * "reddit.com" are recognized as the same entry — the prototype happily
 * stored both and generated two rules.
 */
export async function addSite(rawInput, { pack = 'custom', mode = 'block' } = {}) {
  const spec = parseInput(rawInput);
  if (!spec) return { ok: false, reason: 'invalid' };

  const settings = await getSettings();
  const key = specKey(spec);
  if (settings.sites.some((s) => specKey(s.match) === key)) {
    return { ok: false, reason: 'duplicate' };
  }

  const site = {
    id: newSiteId(),
    label: spec.value,
    match: spec,
    mode,
    budgetMinutes: null,
    pack,
  };

  await patchSettings({ sites: [...settings.sites, site] });
  return { ok: true, site };
}

export async function removeSite(siteId) {
  const settings = await getSettings();
  await patchSettings({ sites: settings.sites.filter((s) => s.id !== siteId) });
}

/**
 * Remove every site that came from a given pack.
 *
 * Keys off the `pack` provenance field, so anything the user typed by hand
 * survives even if it happens to match a pack entry. Packs are disjoint
 * (see starter-packs.js), so there's no question of another pack still
 * wanting one of these.
 *
 * @returns {number} how many were removed
 */
export async function removeSitesByPack(packId) {
  const settings = await getSettings();
  const keep = settings.sites.filter((s) => s.pack !== packId);
  const removed = settings.sites.length - keep.length;
  if (removed) await patchSettings({ sites: keep });
  return removed;
}

export async function findSite(siteId) {
  const settings = await getSettings();
  return settings.sites.find((s) => s.id === siteId) || null;
}

/* --- Usage -------------------------------------------------------------- */

export function usageKey(date = new Date()) {
  return `usage:${localDayKey(date)}`;
}

export async function getUsage(date = new Date()) {
  const key = usageKey(date);
  const stored = await chrome.storage.local.get(key);
  return stored[key] || { perSite: {}, sessions: [] };
}

/**
 * Record a block hit and return the running count for that site today.
 * Attempt count is the stat we think actually changes behavior — it exposes
 * the reflex rather than the elapsed time (PRODUCT.md §5).
 */
export async function recordAttempt(siteId) {
  const key = usageKey();
  const usage = await getUsage();
  const entry = usage.perSite[siteId] || { activeSeconds: 0, attempts: 0, overrides: 0 };
  entry.attempts += 1;
  usage.perSite[siteId] = entry;

  const local = await getLocal();
  const cutoff = Date.now() - 10 * 60 * 1000;
  const recentAttempts = [...local.recentAttempts.filter((t) => t > cutoff), Date.now()];

  await chrome.storage.local.set({ [key]: usage, recentAttempts });
  return entry.attempts;
}

export async function recordOverride(siteId) {
  const key = usageKey();
  const usage = await getUsage();
  const entry = usage.perSite[siteId] || { activeSeconds: 0, attempts: 0, overrides: 0 };
  entry.overrides += 1;
  usage.perSite[siteId] = entry;
  await chrome.storage.local.set({ [key]: usage });
}

/** Attempts in the last 10 minutes — feeds the locked_in mood rule. */
export async function countRecentAttempts() {
  const local = await getLocal();
  const cutoff = Date.now() - 10 * 60 * 1000;
  return local.recentAttempts.filter((t) => t > cutoff).length;
}

/** Drop usage buckets older than `keepDays`. Bounded storage, and 90 days is
 *  more history than anyone reviews. */
export async function pruneUsage(keepDays = 90) {
  const all = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffKey = usageKey(cutoff);

  const stale = Object.keys(all).filter((k) => k.startsWith('usage:') && k < cutoffKey);
  if (stale.length) await chrome.storage.local.remove(stale);
  return stale.length;
}

/* ==========================================================================
   Settings validation, export and import
   ========================================================================== */

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SITES = 300;
const MAX_DINO_NAME = 24;

/**
 * Coerce arbitrary parsed JSON into a settings object that cannot break the
 * extension.
 *
 * PURE, and deliberately repair-not-reject: a single bad field in an imported
 * file shouldn't lose the other forty. Anything unsalvageable falls back to its
 * default and is reported in `warnings` so the UI can say what happened rather
 * than silently discarding the user's data.
 *
 * @returns {{settings: object, warnings: string[]}}
 */
export function sanitizeSettings(raw) {
  const warnings = [];
  const src = raw && typeof raw === 'object' ? raw : {};
  if (!raw || typeof raw !== 'object') warnings.push('No settings object found.');

  /* strictness */
  let strictness = src.strictness;
  if (!Object.prototype.hasOwnProperty.call(OVERRIDE_DELAYS, strictness)) {
    if (strictness !== undefined) warnings.push(`Unknown strictness "${strictness}".`);
    strictness = DEFAULT_SETTINGS.strictness;
  }

  /* overrideMinutes */
  let overrideMinutes = Number(src.overrideMinutes);
  if (!Number.isFinite(overrideMinutes) || overrideMinutes < 1 || overrideMinutes > 120) {
    if (src.overrideMinutes !== undefined) warnings.push('Override length out of range (1-120).');
    overrideMinutes = DEFAULT_SETTINGS.overrideMinutes;
  }
  overrideMinutes = Math.round(overrideMinutes);

  /* schedule */
  const rawSchedule = src.schedule && typeof src.schedule === 'object' ? src.schedule : {};
  let days = Array.isArray(rawSchedule.days)
    ? [...new Set(rawSchedule.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : null;
  if (days === null) {
    if (rawSchedule.days !== undefined) warnings.push('Schedule days were unreadable.');
    days = [...DEFAULT_SETTINGS.schedule.days];
  }
  days.sort((a, b) => a - b);

  const clock = (value, fallback, label) => {
    if (typeof value === 'string' && CLOCK_RE.test(value)) return value;
    if (value !== undefined) warnings.push(`Schedule ${label} must be HH:MM.`);
    return fallback;
  };

  const schedule = {
    enabled: Boolean(rawSchedule.enabled),
    days,
    start: clock(rawSchedule.start, DEFAULT_SETTINGS.schedule.start, 'start'),
    end: clock(rawSchedule.end, DEFAULT_SETTINGS.schedule.end, 'end'),
  };

  /* dino name */
  const rawName = src.dino && typeof src.dino === 'object' ? src.dino.name : undefined;
  let name = typeof rawName === 'string' ? rawName.trim().slice(0, MAX_DINO_NAME) : '';
  if (!name) {
    if (rawName !== undefined) warnings.push('Dino name was empty; kept Doug.');
    name = DEFAULT_SETTINGS.dino.name;
  }

  /* sites */
  const sites = [];
  const seen = new Set();
  let dropped = 0;
  const rawSites = Array.isArray(src.sites) ? src.sites : [];
  if (!Array.isArray(src.sites) && src.sites !== undefined) warnings.push('Site list was not a list.');

  for (const entry of rawSites) {
    if (sites.length >= MAX_SITES) { dropped += 1; continue; }
    if (!entry || typeof entry !== 'object') { dropped += 1; continue; }

    // Re-derive the pattern rather than trusting a stored `match` object: an
    // imported file could otherwise smuggle in a hand-edited pattern that never
    // went through parseInput's validation.
    //
    // `label` is preferred over `match.value` deliberately. The two are always
    // identical in data we wrote ourselves, but in a tampered file the label is
    // the half a human would have looked at, so it's the more defensible
    // source of truth.
    const spec = parseInput(entry.label ?? entry.match?.value ?? '');
    if (!spec) { dropped += 1; continue; }

    const key = specKey(spec);
    if (seen.has(key)) { dropped += 1; continue; }
    seen.add(key);

    sites.push({
      id: typeof entry.id === 'string' && entry.id ? entry.id : newSiteId(),
      label: spec.value,
      match: spec,
      mode: entry.mode === 'budget' ? 'budget' : 'block',
      budgetMinutes: Number.isFinite(Number(entry.budgetMinutes))
        ? Math.max(1, Math.round(Number(entry.budgetMinutes)))
        : null,
      pack: typeof entry.pack === 'string' ? entry.pack : 'custom',
    });
  }
  if (dropped) warnings.push(`${dropped} site${dropped === 1 ? '' : 's'} skipped as invalid or duplicate.`);

  return {
    settings: {
      schemaVersion: SCHEMA_VERSION,
      dino: { name },
      schedule,
      strictness,
      overrideMinutes,
      onboarded: Boolean(src.onboarded),
      sites,
    },
    warnings,
  };
}

export const EXPORT_FORMAT = 'focusaurus-settings';

/** Pretty-printed JSON, so the file is readable and diffable by hand. */
export async function exportSettings() {
  const settings = await getSettings();
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
    },
    null,
    2,
  );
}

/**
 * Replace settings from an exported file.
 * Usage history is untouched — this is a config restore, not a state restore.
 */
export async function importSettings(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'not-json' };
  if (parsed.format && parsed.format !== EXPORT_FORMAT) {
    return { ok: false, reason: 'wrong-format' };
  }

  // Accept either the wrapped export or a bare settings object, since people
  // will inevitably paste the inner half.
  const { settings, warnings } = sanitizeSettings(parsed.settings ?? parsed);

  // Overwrite rather than clear-then-write: a failure between the two would
  // leave the extension with no settings at all.
  await chrome.storage.sync.set(settings);
  return { ok: true, warnings, siteCount: settings.sites.length };
}
