import { extensionApi as chrome, trustedPage } from '../shared/browser.js';
/** The worker owns all writes. Events run in one queue, while authoritative
 * state stays in Chrome storage and survives worker suspension. */
import { compileRules } from './rules.js';
import { siteAccess } from './access.js';
import { createQueue } from './queue.js';
import { resolveMood } from './mood.js';
import { badgeText, sessionActive, OPEN_ENDED_MINUTES } from '../shared/session.js';
import { decideScheduleAction, windowEndsAt, isWithinSchedule } from '../shared/schedule.js';
import { parseInput, specKey, toRegexFilter } from '../shared/match.js';
import { parseInterstitial, safeExternalUrl } from '../shared/redirect.js';
import { blockedCopy } from '../shared/copy.js';
import { STARTER_PACKS, packById, packStatus } from '../shared/starter-packs.js';
import { summarizeAttempts, weekKeys } from '../shared/history.js';
import {
  OVERRIDE_DELAYS, MAX_SITES, initializeStorage, addSite, clearHistory,
  countRecentAttempts, getLocal, getSettings, getUsage, getUsageDays,
  patchLocal, patchSettings, pruneUsage, recordAttempt, recordOverride,
  removeSite, exportSettings, importSettings, usageKey,
} from './storage.js';

const enqueue = createQueue();
const BLOCKED_PATH = '/src/blocked/blocked.html';
const UI_PATHS = ['/src/popup/popup.html', '/src/options/options.html', '/src/welcome/welcome.html'];

async function paintBadge(session, access) {
  const text = session && !access.granted ? '!' : badgeText(session);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title: text === '!' ? 'Focusaurus · Check site access; some sites may not be blocked' : text ? `Focusaurus · ${text === '∞' ? 'Focusing' : `${text} remaining`}` : 'Focusaurus · Ready when you are' });
  if (text) {
    await chrome.action.setBadgeBackgroundColor({ color: '#4a6741' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

// Resetting periodic alarms on every write can postpone the heartbeat forever.
async function periodic(name, minutes, enabled = true) {
  if (!enabled) return chrome.alarms.clear(name);
  if (!(await chrome.alarms.get(name))) await chrome.alarms.create(name, { periodInMinutes: minutes });
}

async function deadline(name, when) {
  if (!Number.isFinite(when)) return chrome.alarms.clear(name);
  const alarm = await chrome.alarms.get(name);
  if (!alarm || alarm.scheduledTime !== when) await chrome.alarms.create(name, { when });
}

async function reconcile() {
  const [settings, local] = await Promise.all([getSettings(), getLocal()]);
  const now = Date.now();
  const enforcing = sessionActive(local.session, now);
  const overrides = enforcing ? local.overrides.filter((o) => o.expiresAt > now && settings.sites.some((s) => s.id === o.siteId)) : [];
  const desired = compileRules({ sites: settings.sites, enforcing, overrides, now,
    interstitialUrl: chrome.runtime.getURL(BLOCKED_PATH) });
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const changed = JSON.stringify(existing) !== JSON.stringify(desired);
  if (changed) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules: desired });
  }
  if (JSON.stringify(overrides) !== JSON.stringify(local.overrides)) await patchLocal({ overrides });
  await Promise.all([
    deadline('session-end', enforcing ? local.session.endsAt : null),
    deadline('override-expiry', overrides.length ? Math.min(...overrides.map((o) => o.expiresAt)) : null),
    periodic('badge-tick', 1, enforcing), periodic('schedule-check', 1, settings.schedule.enabled),
    periodic('housekeeping', 60), paintBadge(enforcing ? local.session : null, await siteAccess(settings.sites)),
  ]);
  if (enforcing && changed) await enforceOpenTabs(settings, { ...local, overrides });
  return { ok: true, enforcing, ruleCount: desired.length };
}

/** Mirrors DNR priority: any matching temporary allow outranks a block. */
function blockingSite(url, settings, local) {
  if (!sessionActive(local.session) || !/^https?:\/\//i.test(url || '')) return null;
  const matching = settings.sites.filter((s) => new RegExp(toRegexFilter(s.match), 'i').test(url));
  if (matching.some((s) => local.overrides.some((o) => o.siteId === s.id && o.expiresAt > Date.now()))) return null;
  return matching[0] || null;
}

async function enforceTab(tab, settings, local, automatic = false) {
  const site = blockingSite(tab.url, settings, local);
  if (!site || tab.pendingUrl) return;
  // No target URLs are persisted. Count user navigations separately from a
  // tab that was already open when focus started or a temporary pass ended.
  const query = `?site=${encodeURIComponent(site.id)}${automatic ? '&source=open-tab' : ''}`;
  try { await chrome.tabs.update(tab.id, { url: `${chrome.runtime.getURL(BLOCKED_PATH)}${query}#url=${tab.url}` }); }
  catch { /* A tab can close or navigate while Chrome is applying rules. */ }
}

async function enforceOpenTabs(settings, local) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) await enforceTab(tab, settings, local, true);
}

async function endSession({ byUser = true } = {}) {
  const [local, settings] = await Promise.all([getLocal(), getSettings()]);
  const suppress = byUser && settings.schedule.enabled && isWithinSchedule(settings.schedule, new Date());
  if (local.session) {
    const now = Date.now();
    const end = local.session.endsAt === null ? now : Math.min(now, local.session.endsAt);
    const day = new Date(end);
    const usage = await getUsage(day);
    usage.sessions = [...(usage.sessions || []), {
      start: local.session.startedAt, end, plannedMinutes: local.session.plannedMinutes,
      completed: local.session.endsAt !== null && now >= local.session.endsAt,
    }].slice(-500);
    await chrome.storage.local.set({ [usageKey(day)]: usage });
  }
  await patchLocal({ session: null, overrides: [],
    ...(suppress ? { scheduleSuppressedUntil: windowEndsAt(settings.schedule) } : {}) });
  await chrome.storage.session.remove('blockedVisits');
  await pruneUsage();
  return reconcile();
}

async function retireExpired() {
  const { session } = await getLocal();
  if (session && !sessionActive(session)) await endSession({ byUser: false });
}

async function startSession(minutes, source = 'manual', endsAt) {
  const settings = await getSettings();
  if (!settings.sites.length) return { ok: false, reason: 'no-sites' };
  if (!(await siteAccess(settings.sites)).granted) return { ok: false, reason: 'site-access' };
  const planned = Number(minutes);
  if (!Number.isFinite(planned) || planned <= 0 || planned > OPEN_ENDED_MINUTES) return { ok: false, reason: 'invalid-duration' };
  await retireExpired();
  if ((await getLocal()).session) return { ok: false, reason: 'already-running' };
  const now = Date.now();
  await patchLocal({ session: {
    startedAt: now, plannedMinutes: planned, source,
    endsAt: endsAt ?? (planned === OPEN_ENDED_MINUTES ? null : now + planned * 60000),
  }, recentAttempts: [], overrides: [], scheduleSuppressedUntil: null });
  await patchSettings({ onboarded: true });
  await chrome.storage.session.remove('blockedVisits');
  await pruneUsage();
  return reconcile();
}

async function applySchedule() {
  await retireExpired();
  const [settings, local] = await Promise.all([getSettings(), getLocal()]);
  const decision = decideScheduleAction({ now: new Date(), schedule: settings.schedule,
    session: local.session, suppressedUntil: local.scheduleSuppressedUntil });
  if (decision.action === 'start' && settings.sites.length) {
    const minutes = Math.max(1, Math.min(OPEN_ENDED_MINUTES, Math.ceil((decision.endsAt - Date.now()) / 60000)));
    await startSession(minutes, 'schedule', decision.endsAt);
  } else if (decision.action === 'stop') await endSession({ byUser: false });
  else if (local.session?.source === 'schedule' && isWithinSchedule(settings.schedule, new Date())) {
    const endsAt = windowEndsAt(settings.schedule);
    if (endsAt !== local.session.endsAt) {
      await patchLocal({ session: { ...local.session, endsAt } });
      await reconcile();
    }
  }
}

async function getState() {
  await pruneUsage();
  await retireExpired();
  await applySchedule();
  await reconcile();
  const now = new Date();
  const [settings, local, recentAttempts, usage] = await Promise.all([
    getSettings(), getLocal(), countRecentAttempts(), getUsageDays(weekKeys(now)),
  ]);
  const session = sessionActive(local.session) ? local.session : null;
  const { mood, because } = resolveMood({ now, schedule: settings.schedule, session, recentAttempts, budgets: [], streak: 0 });
  const history = summarizeAttempts(usage, settings.sites);
  return { settings, session, access: await siteAccess(settings.sites), overrides: local.overrides.filter((o) => o.expiresAt > Date.now()), mood, because,
    attemptsToday: history.days.at(-1)?.attempts || 0, history,
    packs: STARTER_PACKS.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, status: packStatus(p, settings.sites) })),
    strictnessDelay: OVERRIDE_DELAYS[settings.strictness] };
}

function blockedInput(sender) {
  const url = new URL(sender.url);
  const { siteId, rawTarget } = parseInterstitial(url.search, url.hash);
  const target = safeExternalUrl(rawTarget);
  if (!target || !Number.isInteger(sender.tab?.id) || !sender.documentId) return null;
  return { siteId, target, tabKey: String(sender.tab.id), documentId: sender.documentId };
}

async function blockedContext(sender, record = true) {
  await retireExpired();
  await reconcile();
  const input = blockedInput(sender);
  if (!input) return { ok: false, reason: 'invalid-context' };
  const [settings, local] = await Promise.all([getSettings(), getLocal()]);
  const site = settings.sites.find((s) => s.id === input.siteId);
  const matches = site && new RegExp(toRegexFilter(site.match), 'i').test(input.target);
  if (!matches) return { ok: true, released: true, name: settings.dino.name };
  const released = !blockingSite(input.target, settings, local);
  const stored = await chrome.storage.session.get('blockedVisits');
  const visits = stored.blockedVisits || {};
  let visit = visits[input.tabKey];
  const fresh = !visit || visit.documentId !== input.documentId || visit.siteId !== site.id || visit.startedAt !== local.session?.startedAt;
  if (!released && record && fresh) {
    const automatic = new URL(sender.url).searchParams.get('source') === 'open-tab';
    const attempts = automatic ? 0 : await recordAttempt(site.id);
    const copy = automatic ? { line: 'A little room for your focus.', subline: 'This tab is paused while your session is running.' } : blockedCopy(attempts, local.lastBlockedLine);
    visit = { documentId: input.documentId, siteId: site.id, startedAt: local.session.startedAt,
      reachedAt: Date.now(), attempts, copy };
    const kept = Object.entries(visits).filter(([, v]) => v.startedAt === local.session.startedAt).slice(-99);
    await chrome.storage.session.set({ blockedVisits: { ...Object.fromEntries(kept), [input.tabKey]: visit } });
    await patchLocal({ lastBlockedLine: copy.line });
  }
  const delay = OVERRIDE_DELAYS[settings.strictness];
  return { ok: true, released, site, session: released ? null : local.session, name: settings.dino.name,
    attempts: visit?.attempts || 0, copy: visit?.copy,
    strictnessDelay: delay, readyAt: visit && delay !== null ? visit.reachedAt + delay * 1000 : null,
    overrideMinutes: settings.overrideMinutes };
}

async function requestOverride(sender) {
  const ctx = await blockedContext(sender, false);
  if (!ctx.ok) return ctx;
  if (ctx.released) return { ok: true, released: true };
  if (ctx.strictnessDelay === null) return { ok: false, reason: 'locked' };
  if (!ctx.readyAt || Date.now() < ctx.readyAt) return { ok: false, reason: 'wait', readyAt: ctx.readyAt };
  const local = await getLocal();
  const expiresAt = Date.now() + ctx.overrideMinutes * 60000;
  await patchLocal({ overrides: [...local.overrides.filter((o) => o.siteId !== ctx.site.id && o.expiresAt > Date.now()),
    { siteId: ctx.site.id, expiresAt }] });
  await recordOverride(ctx.site.id);
  await reconcile();
  return { ok: true, expiresAt };
}

async function togglePack(packId) {
  const pack = packById(packId);
  if (!pack) return { ok: false, reason: 'unknown-pack' };
  const settings = await getSettings();
  const keys = new Set(pack.sites.map((s) => specKey(parseInput(s))));
  const all = packStatus(pack, settings.sites).state === 'all';
  let sites;
  if (all) sites = settings.sites.filter((s) => !keys.has(specKey(s.match)));
  else {
    const present = new Set(settings.sites.map((s) => specKey(s.match)));
    const extra = pack.sites.map(parseInput).filter((spec) => !present.has(specKey(spec)))
      .map((match) => ({ id: `s_${crypto.randomUUID()}`, label: match.value, match, mode: 'block', budgetMinutes: null, pack: pack.id }));
    sites = [...settings.sites, ...extra];
    if (sites.length > MAX_SITES) return { ok: false, reason: 'site-limit' };
  }
  await patchSettings({ sites }); await applySchedule(); await reconcile();
  return { ok: true, action: all ? 'removed' : 'added' };
}

const HANDLERS = {
  getState, getBlockedContext: (_, sender) => blockedContext(sender), requestOverride: (_, sender) => requestOverride(sender),
  startSession: ({ minutes }) => startSession(minutes), endSession: () => endSession(),
  addSite: async ({ input }) => {
    const match = parseInput(input);
    if (match && !(await supportsMatch(match))) return { ok: false, reason: 'unsupported-pattern' };
    const res = await addSite(input);
    if (res.ok) { await applySchedule(); await reconcile(); }
    return res;
  },
  removeSite: async ({ siteId }) => { await removeSite(siteId); await reconcile(); return { ok: true }; },
  togglePack: ({ packId }) => togglePack(packId),
  toggleScheduleDay: async ({ day }) => {
    if (!Number.isInteger(day) || day < 0 || day > 6) return { ok: false, reason: 'invalid-day' };
    const { schedule } = await getSettings(); const days = new Set(schedule.days);
    days.has(day) ? days.delete(day) : days.add(day);
    await patchSettings({ schedule: { days: [...days] } });
    await applySchedule(); await reconcile(); return { ok: true };
  },
  patchSettings: async ({ values }) => {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return { ok: false, reason: 'invalid-settings' };
    const allowed = Object.fromEntries(Object.entries(values).filter(([key]) => ['dino', 'schedule', 'strictness', 'overrideMinutes', 'theme', 'onboarded'].includes(key)));
    await patchSettings(allowed); await applySchedule(); await reconcile(); return { ok: true };
  },
  exportSettings: async () => ({ ok: true, data: await exportSettings() }),
  importSettings: async ({ json }) => {
    const res = await importSettings(json, async (settings) => {
      for (const site of settings.sites) if (!(await supportsMatch(site.match))) return false;
      return true;
    });
    if (res.ok) { await patchLocal({ overrides: [] }); await applySchedule(); await reconcile(); }
    return res;
  },
  clearHistory: async () => { await clearHistory(); return { ok: true }; },
};

// Chrome limits compiled regex memory independently of input length. Validate
// before saving, including while idle, so a long path cannot break the next session.
async function supportsMatch(match) {
  const result = await chrome.declarativeNetRequest.isRegexSupported({
    regex: toRegexFilter(match), isCaseSensitive: false, requireCapturing: true,
  });
  return result.isSupported;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const path = trustedPage(sender);
  if (!path) { sendResponse({ error: 'Untrusted message source.' }); return false; }
  const blockedAction = ['getBlockedContext', 'requestOverride'].includes(msg?.action);
  const allowed = blockedAction ? path === BLOCKED_PATH : UI_PATHS.includes(path);
  if (!allowed || !Object.hasOwn(HANDLERS, msg?.action)) {
    sendResponse({ error: 'This action is not available here.' }); return false;
  }
  enqueue(() => HANDLERS[msg.action](msg, sender)).then((result) => sendResponse(result ?? { ok: true }))
    .catch((error) => {
      console.error('Focusaurus action failed:', error);
      sendResponse({ error: 'Focusaurus could not apply that change. Reopen the extension and try again.' });
    });
  return true;
});

function event(operation) {
  enqueue(operation).catch((error) => console.error('Focusaurus lifecycle failed:', error));
}
async function recover() {
  await initializeStorage(); await pruneUsage(); await retireExpired(); await applySchedule(); await reconcile();
}
chrome.runtime.onInstalled.addListener((details) => event(async () => {
  await recover();
  if (details.reason === 'install') await chrome.tabs.create({ url: chrome.runtime.getURL('/src/welcome/welcome.html') });
}));
chrome.runtime.onStartup.addListener(() => event(recover));
async function accessChanged() {
  await recover();
  const [settings, local] = await Promise.all([getSettings(), getLocal()]);
  // Restoring permission can activate existing DNR rules without changing them.
  await enforceOpenTabs(settings, local);
}
chrome.permissions.onAdded.addListener(() => event(accessChanged));
chrome.permissions.onRemoved.addListener(() => event(accessChanged));
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  event(async () => {
    const [settings, local] = await Promise.all([getSettings(), getLocal()]);
    if (!sessionActive(local.session)) return;
    let tab;
    try { tab = await chrome.tabs.get(details.tabId); } catch { return; }
    if (tab.url !== details.url) return; // Ignore superseded route changes.
    await enforceTab(tab, settings, local);
  });
}, { url: [{ schemes: ['http', 'https'] }] });
chrome.alarms.onAlarm.addListener((alarm) => event(async () => {
  if (alarm.name === 'housekeeping') await pruneUsage();
  // An old queued alarm must never terminate a newer timer or extended schedule.
  await retireExpired(); await applySchedule(); await reconcile();
}));
// Register listeners synchronously, then recover before handling any mutations.
event(recover);
