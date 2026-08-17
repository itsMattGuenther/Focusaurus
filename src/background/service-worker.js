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
  usageKey,
} from './storage.js';
import { STARTER_PACKS, packById } from '../shared/starter-packs.js';

const INTERSTITIAL_PATH = '/src/blocked/blocked.html';

const ALARM_SESSION_END = 'session-end';
const ALARM_OVERRIDE = 'override-expiry';
const ALARM_HOUSEKEEPING = 'housekeeping';

/* --- Enforcement --------------------------------------------------------- */

function sessionActive(session, now = Date.now()) {
  return Boolean(session && session.endsAt > now);
}

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

  await Promise.all([syncAlarms(local.session, overrides), paintBadge(local.session, now)]);
  return { enforcing, ruleCount: desired.length };
}

/** Keep alarms in step with state. Re-created rather than adjusted, since
 *  chrome.alarms has no update primitive. */
async function syncAlarms(session, overrides) {
  await chrome.alarms.clear(ALARM_SESSION_END);
  await chrome.alarms.clear(ALARM_OVERRIDE);

  if (sessionActive(session)) {
    chrome.alarms.create(ALARM_SESSION_END, { when: session.endsAt });
  }
  if (overrides.length) {
    const soonest = Math.min(...overrides.map((o) => o.expiresAt));
    chrome.alarms.create(ALARM_OVERRIDE, { when: soonest });
  }
}

/* --- Badge ---------------------------------------------------------------
   Remaining minutes on the toolbar icon. Cheap, and it means you can read
   session state without opening anything. */

async function paintBadge(session, now = Date.now()) {
  if (!sessionActive(session, now)) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const minsLeft = Math.max(1, Math.ceil((session.endsAt - now) / 60000));
  await chrome.action.setBadgeText({ text: String(minsLeft) });
  await chrome.action.setBadgeBackgroundColor({ color: '#4a6741' }); // --moss
}

/* --- Sessions ------------------------------------------------------------ */

async function startSession(minutes) {
  const planned = Number(minutes);
  const now = Date.now();
  const session = {
    startedAt: now,
    plannedMinutes: Number.isFinite(planned) && planned > 0 ? planned : 25,
    endsAt: now + (Number.isFinite(planned) && planned > 0 ? planned : 25) * 60000,
  };
  // Recent-attempt history is per-session; carrying it over would leave Doug
  // stuck out of `locked_in` for ten minutes into a fresh session.
  await patchLocal({ session, recentAttempts: [] });
  return reconcile();
}

async function endSession() {
  const local = await getLocal();
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
    packs: STARTER_PACKS,
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

async function applyPack(packId) {
  const pack = packById(packId);
  if (!pack) return { ok: false, reason: 'unknown-pack' };
  let added = 0;
  for (const entry of pack.sites) {
    const res = await addSite(entry, { pack: pack.id });
    if (res.ok) added += 1;
  }
  await reconcile();
  return { ok: true, added };
}

/* --- Message routing ----------------------------------------------------
   Every handler returns a promise; the listener replies once it settles.
   `return true` keeps the channel open for the async reply. */

const HANDLERS = {
  getState: () => getState(),
  getBlockedContext: ({ siteId }) => getBlockedContext(siteId),

  startSession: ({ minutes }) => startSession(minutes),
  endSession: () => endSession(),

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
  applyPack: ({ packId }) => applyPack(packId),

  recordAttempt: async ({ siteId, line }) => {
    const attempts = await recordAttempt(siteId);
    if (line) await patchLocal({ lastBlockedLine: line });
    return { attempts };
  },
  requestOverride: ({ siteId }) => requestOverride(siteId),

  patchSettings: async (patch) => {
    await patchSettings(patch.values || {});
    await reconcile();
    return { ok: true };
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
});

// Rules persist across restarts but settings may have changed while the worker
// was dead, so reconcile on every startup rather than trusting what's there.
chrome.runtime.onStartup.addListener(reconcile);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SESSION_END) {
    await endSession();
    return;
  }
  if (alarm.name === ALARM_OVERRIDE) {
    await reconcile();
    return;
  }
  if (alarm.name === ALARM_HOUSEKEEPING) {
    await pruneUsage();
    await reconcile(); // also keeps the badge honest across a long session
  }
});

// Settings edited from any surface (or synced from another machine) must take
// effect immediately.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ('sites' in changes || 'strictness' in changes)) reconcile();
});
