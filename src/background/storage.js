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
import { localDayKey } from './mood.js';

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
  session: null,        // { startedAt, endsAt, plannedMinutes }
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
