/* ==========================================================================
   Service worker — the brain
   --------------------------------------------------------------------------
   The ONLY stateful file. Everything it decides with is loaded from storage on
   each wake, because an MV3 worker is terminated after ~30s idle and no
   in-memory value survives (DESIGN.md ADR-5). There are no module-level
   mutable variables here on purpose.

   Corollary: no setTimeout/setInterval for anything beyond the current event.
   All scheduled work goes through chrome.alarms.
   ========================================================================== */

import { compileRules } from './rules.js';
import { resolveMood } from './mood.js';
import { badgeText, sessionActive } from '../shared/session.js';
import { decideScheduleAction, windowEndsAt } from '../shared/schedule.js';
import {
  DEFAULT_SETTINGS,
  OVERRIDE_DELAYS,
  addSite,
  countRecentAttempts,
  findSite,
  getLocal,
  getSettings,
  getUsage,
  patchLocal,
  patchSettings,
  pruneUsage,
  recordAttempt,
  recordOverride,
  removeSite,
  removeSitesByPack,
  exportSettings,
  importSettings,
  usageKey,
} from './storage.js';
import { STARTER_PACKS, packById, packStatus } from '../shared/starter-packs.js';

const INTERSTITIAL_PATH = '/src/blocked/blocked.html';

const ALARM_SESSION_END = 'session-end';
const ALARM_OVERRIDE = 'override-expiry';
const ALARM_HOUSEKEEPING = 'housekeeping';
const ALARM_BADGE = 'badge-tick';
const ALARM_SCHEDULE = 'schedule-check';

/* --- Enforcement --------------------------------------------------------- */

/**
 * Rebuild the entire dynamic rule set from current state.
 *
 * Wholesale replacement, never incremental patching: dynamic rules survive
 * browser restarts and extension updates, so a partial update strands orphan
 * rules that block forever with nothing in the UI to explain why
 * (DESIGN.md §1 #8).
 */
async function reconcile() {
  const [settings, local] = await Promise.all([getSettings(), getLocal()]);
  const now = Date.now();

  const enforcing = sessionActive(local.session, now);
  const overrides = (local.overrides || []).filter((o) => o.expiresAt > now);

  const desired = compileRules({
    sites: settings.sites,
    interstitialUrl: chrome.runtime.getURL(INTERSTITIAL_PATH),
    enforcing,
    overrides,
    now,
  });

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: desired,
  });

  // Drop expired overrides so storage doesn't accumulate dead entries.
  if (overrides.length !== (local.overrides || []).length) {
    await patchLocal({ overrides });
  }

  await Promise.all([
    syncAlarms(local.session, overrides, settings.schedule),
    paintBadge(local.session, now),
  ]);
  return { enforcing, ruleCount: desired.length };
}

/** Keep alarms in step with state. Re-created rather than adjusted, since
 *  chrome.alarms has no update primitive. */
async function syncAlarms(session, overrides, schedule) {
  await Promise.all([
    chrome.alarms.clear(ALARM_SESSION_END),
    chrome.alarms.clear(ALARM_OVERRIDE),
    chrome.alarms.clear(ALARM_BADGE),
    chrome.alarms.clear(ALARM_SCHEDULE),
  ]);

  // Only poll for schedule transitions when a schedule actually exists. A
  // one-shot alarm at the next boundary would be cheaper still, but this costs
  // one storage read a minute and is far harder to get subtly wrong.
  if (schedule && schedule.enabled) {
    chrome.alarms.create(ALARM_SCHEDULE, { periodInMinutes: 1 });
  }

  if (sessionActive(session)) {
    chrome.alarms.create(ALARM_SESSION_END, { when: session.endsAt });
    // The badge is a countdown, so it needs its own heartbeat. Without this it
    // only ever repainted when rules were reconciled, which meant it froze at
    // whatever the clock said during the last session start or override —
    // visibly drifting from the popup's live countdown.
    // 1 minute is the floor Chrome reliably honors, and it's the badge's own
    // resolution, so there's nothing to gain from going faster.
    chrome.alarms.create(ALARM_BADGE, { periodInMinutes: 1 });
  }
  if (overrides.length) {
    const soonest = Math.min(...overrides.map((o) => o.expiresAt));
    chrome.alarms.create(ALARM_OVERRIDE, { when: soonest });
  }
}

/* --- Badge ---------------------------------------------------------------
   The only always-visible surface in the product, so it has to be right. Text
   is recomputed from `endsAt` every paint (see session.js) rather than
   decremented, so a skipped paint is late but never wrong. */

async function paintBadge(session, now = Date.now()) {
  const text = badgeText(session, now);
  await chrome.action.setBadgeText({ text });
  if (text) {
    await chrome.action.setBadgeBackgroundColor({ color: '#4a6741' }); // --moss
  }
}

/** Badge heartbeat. Deliberately cheaper than a full reconcile — the rule set
 *  hasn't changed, only the clock. Also acts as a safety net: if the
 *  session-end alarm were ever dropped or delayed, this notices the session has
 *  expired and closes it out properly. */
async function tickBadge() {
  const local = await getLocal();
  if (local.session && !sessionActive(local.session)) {
    await endSession({ byUser: false });
    return;
  }
  await paintBadge(local.session);
}

/* --- Sessions ------------------------------------------------------------ */

/**
 * @param {number} minutes
 * @param {'manual'|'schedule'} source  provenance. The schedule may only ever
 *   stop sessions it started itself, so this field is load-bearing rather than
 *   informational.
 * @param {number} [endsAt] explicit end, used by the schedule so a session
 *   finishes exactly when the work window closes.
 */
async function startSession(minutes, source = 'manual', endsAt = null) {
  const planned = Number(minutes);
  const safeMinutes = Number.isFinite(planned) && planned > 0 ? planned : 25;
  const now = Date.now();

  const session = {
    startedAt: now,
    plannedMinutes: safeMinutes,
    endsAt: endsAt ?? now + safeMinutes * 60000,
    source,
  };
  // Recent-attempt history is per-session; carrying it over would leave Doug
  // stuck out of `locked_in` for ten minutes into a fresh session.
  // Starting a session by hand also clears any schedule suppression — the user
  // has plainly opted back in.
  await patchLocal({ session, recentAttempts: [], scheduleSuppressedUntil: null });
  return reconcile();
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.byUser=true] Whether a person asked for this. Ending a
 *   SCHEDULED session by hand mutes auto-start for the rest of the window;
 *   without that, the next alarm tick would restart it within a minute.
 */
async function endSession({ byUser = true } = {}) {
  const local = await getLocal();

  if (byUser && local.session?.source === 'schedule') {
    const settings = await getSettings();
    await patchLocal({ scheduleSuppressedUntil: windowEndsAt(settings.schedule, new Date()) });
  }

  if (local.session) {
    const usage = await getUsage();
    usage.sessions = [
      ...(usage.sessions || []),
      {
        start: local.session.startedAt,
        end: Date.now(),
        plannedMinutes: local.session.plannedMinutes,
        completed: Date.now() >= local.session.endsAt,
      },
    ];
    // usageKey() is local-midnight based; toISOString() would be UTC and would
    // file evening sessions under tomorrow for anyone west of Greenwich.
    await chrome.storage.local.set({ [usageKey()]: usage });
  }
  // Ending a session drops every override with it — otherwise an override
  // outlives the thing it was an exception to.
  await patchLocal({ session: null, overrides: [] });
  return reconcile();
}

/* --- Schedule automation -------------------------------------------------
   Without this, the schedule setting would only tint Doug's mood, and a "work
   hours" toggle in the options page that didn't actually block anything would
   be worse than no toggle at all. The decision itself is a pure function in
   shared/schedule.js; this only carries it out. */

async function applySchedule() {
  const [settings, local] = await Promise.all([getSettings(), getLocal()]);

  const decision = decideScheduleAction({
    now: new Date(),
    schedule: settings.schedule,
    session: local.session,
    suppressedUntil: local.scheduleSuppressedUntil,
  });

  if (decision.action === 'start') {
    const minutes = Math.max(1, Math.round((decision.endsAt - Date.now()) / 60000));
    await startSession(minutes, 'schedule', decision.endsAt);
    return decision;
  }

  if (decision.action === 'stop') {
    // byUser: false — the window closing is not the user quitting, so it must
    // not arm suppression and block tomorrow's session.
    await endSession({ byUser: false });
    return decision;
  }

  return decision;
}

/* --- Overrides ----------------------------------------------------------- */

async function requestOverride(siteId) {
  const settings = await getSettings();
  const delay = OVERRIDE_DELAYS[settings.strictness];
  if (delay === null) return { ok: false, reason: 'locked' };

  const site = await findSite(siteId);
  if (!site) return { ok: false, reason: 'unknown-site' };

  const local = await getLocal();
  const expiresAt = Date.now() + settings.overrideMinutes * 60000;
  const overrides = [
    ...(local.overrides || []).filter((o) => o.siteId !== siteId && o.expiresAt > Date.now()),
    { siteId, expiresAt },
  ];

  await patchLocal({ overrides });
  await recordOverride(siteId);
  await reconcile();
  return { ok: true, expiresAt };
}

/* --- Aggregate state for the UI ----------------------------------------- */

async function getState() {
  const [settings, local, usage, recentAttempts] = await Promise.all([
    getSettings(),
    getLocal(),
    getUsage(),
    countRecentAttempts(),
  ]);

  const now = new Date();
  const active = sessionActive(local.session, now.getTime());

  // Repaint while we're here. The popup runs its own live countdown, so without
  // this the two could visibly disagree at the moment you're looking at both.
  await paintBadge(active ? local.session : null, now.getTime());

  const { mood, because } = resolveMood({
    now,
    schedule: settings.schedule,
    session: active ? local.session : null,
    recentAttempts,
    budgets: [], // v0.4
    streak: local.streak?.current || 0,
  });

  const attemptsToday = Object.values(usage.perSite).reduce((n, e) => n + (e.attempts || 0), 0);

  return {
    settings,
    session: active ? local.session : null,
    overrides: (local.overrides || []).filter((o) => o.expiresAt > Date.now()),
    mood,
    because,
    attemptsToday,
    usage,
    // Status is computed here, not in the popup, so the chips can never
    // disagree with the list they're describing.
    packs: STARTER_PACKS.map((p) => ({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      status: packStatus(p, settings.sites),
    })),
    strictnessDelay: OVERRIDE_DELAYS[settings.strictness],
  };
}

/** Context for the interstitial: which site, how many times today, what to say. */
async function getBlockedContext(siteId) {
  const [site, usage, settings] = await Promise.all([
    findSite(siteId),
    getUsage(),
    getSettings(),
  ]);
  const local = await getLocal();
  return {
    site,
    attempts: usage.perSite[siteId]?.attempts || 0,
    session: local.session,
    strictnessDelay: OVERRIDE_DELAYS[settings.strictness],
    overrideMinutes: settings.overrideMinutes,
    lastLine: local.lastBlockedLine,
  };
}

/* --- Onboarding --------------------------------------------------------- */

/**
 * Toggle a whole pack on or off.
 *
 * The decision lives here rather than in the popup because the worker holds
 * the authoritative site list — a popup deciding from a stale render could
 * remove a pack the user had just re-added.
 *
 * Fully applied  -> remove everything that came from it
 * Otherwise      -> add whatever's missing (idempotent; addSite dedupes)
 *
 * The partial case resolving to "add the rest" is deliberate: after removing a
 * few entries by hand, clicking the pack should complete it, not wipe it.
 */
async function togglePack(packId) {
  const pack = packById(packId);
  if (!pack) return { ok: false, reason: 'unknown-pack' };

  const settings = await getSettings();
  const { state } = packStatus(pack, settings.sites);

  if (state === 'all') {
    const removed = await removeSitesByPack(pack.id);
    await reconcile();
    return { ok: true, action: 'removed', removed };
  }

  let added = 0;
  for (const entry of pack.sites) {
    const res = await addSite(entry, { pack: pack.id });
    if (res.ok) added += 1;
  }
  await reconcile();
  return { ok: true, action: 'added', added };
}

/* --- Message routing ----------------------------------------------------
   Every handler returns a promise; the listener replies once it settles.
   `return true` keeps the channel open for the async reply. */

const HANDLERS = {
  getState: () => getState(),
  getBlockedContext: ({ siteId }) => getBlockedContext(siteId),

  startSession: ({ minutes }) => startSession(minutes, 'manual'),
  endSession: () => endSession({ byUser: true }),

  addSite: async ({ input }) => {
    const res = await addSite(input);
    if (res.ok) await reconcile();
    return res;
  },
  removeSite: async ({ siteId }) => {
    await removeSite(siteId);
    await reconcile();
    return { ok: true };
  },
  togglePack: ({ packId }) => togglePack(packId),

  recordAttempt: async ({ siteId, line }) => {
    const attempts = await recordAttempt(siteId);
    if (line) await patchLocal({ lastBlockedLine: line });
    return { attempts };
  },
  requestOverride: ({ siteId }) => requestOverride(siteId),

  patchSettings: async (patch) => {
    await patchSettings(patch.values || {});
    await reconcile();
    // Take effect now rather than on the next tick: toggling the schedule on
    // during work hours should start blocking immediately, not up to a minute
    // later, and toggling it off should release straight away.
    await applySchedule();
    return { ok: true, settings: await getSettings() };
  },

  exportSettings: async () => ({ ok: true, data: await exportSettings() }),
  importSettings: async ({ json }) => {
    const res = await importSettings(json);
    if (res.ok) {
      await reconcile();
      await applySchedule();
    }
    return res;
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg?.action];
  if (!handler) {
    sendResponse({ error: `unknown action: ${msg?.action}` });
    return false;
  }
  handler(msg)
    .then((result) => sendResponse(result ?? { ok: true }))
    .catch((err) => sendResponse({ error: String(err?.message || err) }));
  return true;
});

/* --- Lifecycle ---------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('schemaVersion');
  if (!stored.schemaVersion) await chrome.storage.sync.set(DEFAULT_SETTINGS);

  chrome.alarms.create(ALARM_HOUSEKEEPING, { periodInMinutes: 60 });
  await reconcile();
  await applySchedule();
});

// Rules persist across restarts but settings may have changed while the worker
// was dead, so reconcile on every startup rather than trusting what's there.
chrome.runtime.onStartup.addListener(async () => {
  await reconcile();
  // The browser may have been closed across a window boundary, so decide fresh
  // rather than trusting whatever session state was left behind.
  await applySchedule();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SESSION_END) {
    // byUser: false — a timer running out is not the user quitting. Marking it
    // as such would arm schedule suppression and block the next window.
    await endSession({ byUser: false });
    return;
  }
  if (alarm.name === ALARM_OVERRIDE) {
    await reconcile();
    return;
  }
  if (alarm.name === ALARM_BADGE) {
    await tickBadge();
    return;
  }
  if (alarm.name === ALARM_SCHEDULE) {
    await applySchedule();
    return;
  }
  if (alarm.name === ALARM_HOUSEKEEPING) {
    await pruneUsage();
    await reconcile();
  }
});

// Settings edited from any surface (or synced from another machine) must take
// effect immediately.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  // Any of these changes what gets enforced or which alarms should exist. This
  // also covers edits arriving from another machine via storage.sync.
  if ('sites' in changes || 'strictness' in changes || 'schedule' in changes) {
    await reconcile();
  }
  if ('schedule' in changes) await applySchedule();
});
