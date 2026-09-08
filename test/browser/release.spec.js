import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

test('fresh setup, all category packs, and full blocklist persist without sync quota failures', async ({ extension: e }) => {
  await expect(e.popup.locator('#startBtn')).toBeDisabled();
  const state = await e.send('getState');
  for (const pack of state.packs) expect((await e.send('togglePack', { packId: pack.id })).ok).toBe(true);
  const configured = await e.send('getState');
  expect(configured.settings.sites.length).toBeGreaterThan(70);
  expect(configured.packs.every((p) => p.status.state === 'all')).toBe(true);
  expect(await e.worker.evaluate(() => chrome.storage.sync.get(null))).toEqual({});
  await e.popup.reload();
  await expect(e.popup.locator('#startBtn')).toBeEnabled();
  await e.popup.locator('#startBtn').click();
  await expect(e.popup.locator('#statusChip')).toHaveText('Focusing');
  expect((await e.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length).toBe(configured.settings.sites.length);
});

test('concurrent site writes preserve every site and deduplicate repeats', async ({ extension: e }) => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => e.send('addSite', { input: `site${i}.example` })));
  expect(results.every((r) => r.ok)).toBe(true);
  await Promise.all(Array.from({ length: 8 }, () => e.send('addSite', { input: 'same.example' })));
  expect((await e.send('getState')).settings.sites.length).toBe(21);
});

test('real DNR redirect, pause enforcement, attempt count, and onward navigation', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  await e.send('patchSettings', { values: { strictness: 'gentle' } });
  await e.send('startSession', { minutes: 25 });
  const blocked = await e.context.newPage();
  await blocked.goto('https://example.com/a?one=1&two=2');
  await expect(blocked).toHaveURL(/blocked\.html/);
  await expect(blocked.locator('#siteValue')).toHaveText('example.com');
  await expect(blocked.locator('#attemptsValue')).toHaveText('First time today');
  const early = await blocked.evaluate(() => chrome.runtime.sendMessage({ action: 'requestOverride' }));
  expect(early.reason).toBe('wait');
  await expect(blocked.locator('#overrideBtn')).toBeEnabled();
  // Check Chrome accepts the override and removes the redirect before opening.
  const allowed = await blocked.evaluate(() => chrome.runtime.sendMessage({ action: 'requestOverride' }));
  expect(allowed.ok).toBe(true);
  expect((await e.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules()))[0].action.type).toBe('allow');
  expect((await e.send('getState')).attemptsToday).toBe(1);
  await e.context.route('https://example.com/**', (route) => route.fulfill({ body: 'Temporary pass works.' }));
  await expect(blocked.locator('#overrideLabel')).toHaveText('Continue to site');
  await blocked.locator('#overrideBtn').click();
  await expect(blocked).toHaveURL('https://example.com/a?one=1&two=2');
  await expect(blocked.locator('body')).toHaveText('Temporary pass works.');
});

test('locked block page releases after session ends and cannot issue privileged actions', async ({ extension: e }) => {
  const added = await e.send('addSite', { input: 'example.com' });
  await e.send('patchSettings', { values: { strictness: 'locked' } });
  await e.send('startSession', { minutes: 25 });
  const blocked = await e.context.newPage();
  await blocked.goto(`${e.url('blocked/blocked.html')}?site=${added.site.id}#url=https://example.com/`);
  await expect(blocked.locator('#overrideBtn')).toBeHidden();
  expect((await blocked.evaluate(() => chrome.runtime.sendMessage({ action: 'endSession' }))).error).toBeTruthy();
  await e.send('endSession');
  await expect(blocked.locator('#overrideBtn')).toBeVisible();
  await expect(blocked.locator('#overrideLabel')).toHaveText('Continue to site');
  expect(await e.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).toEqual([]);
});

test('legacy settings migrate intact and history stays local', async ({ extension: e }) => {
  await e.popup.evaluate(async () => {
    await chrome.storage.sync.set({ schemaVersion: 1, dino: { name: 'Fern' }, strictness: 'gentle', sites: [
      { id: 'legacy', label: 'example.com', match: { kind: 'domain', value: 'example.com' }, mode: 'block' },
    ] });
    await chrome.storage.local.set({ 'usage:2026-09-08': { perSite: { legacy: { attempts: 4 } }, sessions: [] } });
    await chrome.storage.local.remove('settings');
    const { initializeStorage } = await import('../background/storage.js');
    await initializeStorage();
  });
  const state = await e.send('getState');
  expect(state.settings.dino.name).toBe('Fern');
  expect(state.settings.sites[0].id).toBe('legacy');
  expect(await e.popup.evaluate(() => chrome.storage.sync.get(null))).toEqual({});
  expect((await e.popup.evaluate(() => chrome.storage.local.get('usage:2026-09-08')))['usage:2026-09-08'].perSite.legacy.attempts).toBe(4);
});

test('invalid imports preserve settings and exports round-trip', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  for (const json of ['[]', '{}', '{"hello":"world"}', '{"format":"wrong","settings":{"sites":[]}}', '{broken']) {
    expect((await e.send('importSettings', { json })).ok).toBe(false);
    expect((await e.send('getState')).settings.sites.length).toBe(1);
  }
  const exported = await e.send('exportSettings');
  await e.send('addSite', { input: 'another.example' });
  expect((await e.send('importSettings', { json: exported.data })).ok).toBe(true);
  expect((await e.send('getState')).settings.sites.length).toBe(1);
});

test('expired sessions stop enforcement automatically and open-ended sessions remain active', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  await e.send('startSession', { minutes: 0.02 });
  // Leave no product UI running: only Chrome's alarm may retire this session.
  for (const page of e.context.pages()) if (page !== e.popup) await page.close();
  await e.popup.goto(e.url('privacy/privacy.html'));
  await expect.poll(() => e.worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules()), { timeout: 10_000 }).toEqual([]);
  expect((await e.worker.evaluate(() => chrome.storage.local.get('session'))).session).toBe(null);
  await e.popup.goto(e.url('popup/popup.html'));
  await e.send('startSession', { minutes: 720 });
  const state = await e.send('getState');
  expect(state.session.endsAt).toBe(null);
  expect(await e.popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('∞');
});

test('a stale session-end alarm cannot end a running replacement session', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  await e.send('startSession', { minutes: 25 });
  const before = (await e.send('getState')).session.startedAt;
  for (const page of e.context.pages()) if (page !== e.popup) await page.close();
  await e.popup.goto(e.url('privacy/privacy.html'));
  const staleTime = await e.popup.evaluate(async () => {
    const when = Date.now() + 200;
    await chrome.alarms.create('session-end', { when });
    return when;
  });
  // Wait for the alarm handler itself to restore the authoritative deadline.
  await expect.poll(async () => (await e.popup.evaluate(() => chrome.alarms.get('session-end')))?.scheduledTime || 0).toBeGreaterThan(staleTime + 1000);
  await e.popup.goto(e.url('popup/popup.html'));
  expect((await e.send('getState')).session.startedAt).toBe(before);
});

test('schedule starts immediately, updates its boundary, and respects manual stops', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  const schedule = await e.popup.evaluate(() => {
    const now = new Date(); const later = new Date(Date.now() + 120 * 60000);
    const clock = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: clock(new Date(Date.now() - 60000)), end: clock(later) };
  });
  await e.send('patchSettings', { values: { schedule } });
  const first = (await e.send('getState')).session;
  expect(first.source).toBe('schedule');
  const nextEnd = await e.popup.evaluate((endsAt) => {
    const d = new Date(endsAt + 60 * 60000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, first.endsAt);
  await e.send('patchSettings', { values: { schedule: { end: nextEnd } } });
  expect((await e.send('getState')).session.endsAt).toBe(first.endsAt + 60 * 60000);
  await e.send('endSession');
  expect((await e.send('getState')).session).toBe(null);
  await e.send('startSession', { minutes: 25 });
  await e.send('patchSettings', { values: { schedule: { enabled: false } } });
  expect((await e.send('getState')).session.source).toBe('manual');
});

test('Chrome rejects oversized path rules before they replace working settings', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  const input = `example.com/${'界'.repeat(150)}`;
  expect(await e.send('addSite', { input })).toEqual({ ok: false, reason: 'unsupported-pattern' });
  expect(await e.send('importSettings', { json: JSON.stringify({ sites: [{ label: input }] }) }))
    .toEqual({ ok: false, reason: 'unsupported-pattern' });
  expect((await e.send('getState')).settings.sites.map((s) => s.label)).toEqual(['example.com']);
  expect((await e.send('startSession', { minutes: 25 })).ok).toBe(true);
});

test('failed writes show an error, restore controls, and never report Saved', async ({ extension: e }) => {
  const settings = await e.context.newPage(); await settings.goto(e.url('options/options.html'));
  await expect(settings.locator('#dinoName')).toHaveValue('Doug');
  await settings.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message) => ['patchSettings', 'addSite'].includes(message.action)
      ? Promise.resolve({ error: 'Test write failed.' }) : original(message);
  });
  await settings.locator('#themeSelect').selectOption('dark');
  await expect(settings.locator('#appError')).toHaveText('Test write failed.');
  await expect(settings.locator('#savedFlag')).not.toHaveAttribute('data-on', 'true');
  await settings.locator('#siteInput').fill('example.com');
  await settings.locator('#addForm button').click();
  await expect(settings.locator('#addForm button')).toBeEnabled();
  expect((await e.send('getState')).settings.sites).toEqual([]);
  expect((await e.send('getState')).settings.theme).toBe('system');
});

test('worker suspension preserves session and rules and restores missing alarms', async ({ extension: e }) => {
  await e.send('addSite', { input: 'example.com' });
  await e.send('startSession', { minutes: 25 });
  const before = (await e.send('getState')).session;
  await e.popup.evaluate(() => chrome.alarms.clearAll());
  const cdp = await e.context.newCDPSession(e.popup);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  const after = await e.send('getState');
  expect(after.session).toEqual(before);
  expect((await e.popup.evaluate(() => chrome.alarms.getAll())).map((a) => a.name)).toContain('session-end');
  expect((await e.popup.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length).toBe(1);
  await cdp.detach();
});

test('clear history confirms in the UI, preserves settings and the current session', async ({ extension: e }) => {
  const site = (await e.send('addSite', { input: 'example.com' })).site;
  await e.send('startSession', { minutes: 25 });
  const blocked = await e.context.newPage();
  await blocked.goto(`${e.url('blocked/blocked.html')}?site=${site.id}#url=https://example.com/`);
  await expect(blocked.locator('#attemptsValue')).toHaveText('First time today');
  const settings = await e.context.newPage(); await settings.goto(e.url('options/options.html'));
  await settings.locator('#clearHistoryBtn').click();
  await expect(settings.locator('#confirmDialog')).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await settings.locator('#confirmBtn').click();
  await expect(settings.locator('#dataNote')).toHaveText('History cleared.');
  const state = await e.send('getState');
  expect(state.attemptsToday).toBe(0); expect(state.settings.sites.length).toBe(1); expect(state.session).not.toBe(null);
});

test('keyboard category focus survives updates and selection is announced', async ({ extension: e }) => {
  // A slow reply gives Chrome time to blur the disabled category button.
  // Exercise that timing on fast local machines as well as hosted Linux CI.
  await e.popup.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message.action === 'togglePack') await new Promise((resolve) => setTimeout(resolve, 250));
      return original(message);
    };
  });
  const pack = e.popup.locator('#packChips button').first();
  await pack.focus(); await e.popup.keyboard.press('Space');
  await expect(pack).toHaveAttribute('aria-pressed', 'true');
  await expect(pack).toBeFocused();
  await e.popup.keyboard.press('Space');
  await expect(pack).toBeDisabled();
  await e.popup.locator('#siteInput').focus();
  await expect(pack).toHaveAttribute('aria-pressed', 'false');
  await expect(e.popup.locator('#siteInput')).toBeFocused();
  const duration = e.popup.locator('[data-minutes="50"]');
  await duration.focus(); await e.popup.keyboard.press('Enter');
  await expect(duration).toHaveAttribute('aria-pressed', 'true');
  await e.popup.locator('#siteInput').fill('invalid');
  await e.popup.locator('#siteInput').press('Enter');
  await expect(e.popup.locator('#addError')).not.toBeEmpty();
  await expect(e.popup.locator('#addError')).toHaveAttribute('role', 'status');
});

test('all surfaces pass automated accessibility in both themes and reflow at 360px', async ({ extension: e }) => {
  const added = await e.send('addSite', { input: 'example.com' });
  await e.send('startSession', { minutes: 25 });
  const paths = ['popup/popup.html', 'welcome/welcome.html', 'options/options.html', 'privacy/privacy.html',
    `blocked/blocked.html?site=${added.site.id}#url=https://example.com/`];
  for (const theme of ['light', 'dark']) {
    await e.send('patchSettings', { values: { theme } });
    for (const path of paths) {
      const page = await e.context.newPage();
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(e.url(path));
      await page.evaluate(() => document.fonts.ready);
      if (!path.startsWith('privacy')) await expect(page.locator('.doug')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), `${theme} ${path}`).toEqual([]);
      await page.setViewportSize({ width: 360, height: 800 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).map((el) => `${el.tagName}.${el.className}: ${el.getBoundingClientRect().right}`) }));
      expect(layout.scroll <= layout.width, `${theme} ${path} overflow: ${JSON.stringify(layout)}`).toBe(true);
      if (!path.startsWith('privacy')) expect(await page.locator('.doug__body').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
      await page.close();
    }
  }
});

test('already-open tabs pause without adding attempts, and in-page routes are blocked', async ({ extension: e }) => {
  await e.context.route('https://route.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Route test</title><h1>Work area</h1>' }));
  const existing = await e.context.newPage(); await existing.goto('https://route.example/shorts');
  await e.send('addSite', { input: 'route.example/shorts' });
  await e.send('startSession', { minutes: 25 });
  await expect(existing).toHaveURL(/blocked\.html/);
  await expect(existing.locator('#attemptsValue')).toHaveText('Paused open tab');
  expect((await e.send('getState')).attemptsToday).toBe(0);
  const spa = await e.context.newPage(); await spa.goto('https://route.example/work');
  await spa.evaluate(() => history.pushState({}, '', '/shorts/video'));
  await expect(spa).toHaveURL(/blocked\.html/);
  await expect(spa.locator('#attemptsValue')).toHaveText('First time today');
});

test('a full browser restart preserves settings and resumes the existing session', async ({}, testInfo) => {
  const root = resolve(process.env.FOCUSAURUS_EXTENSION_PATH || '.');
  const profile = testInfo.outputPath('restart-profile');
  let context;
  const open = async () => {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/src/popup/popup.html`);
    return (action, payload = {}) => page.evaluate((msg) => chrome.runtime.sendMessage(msg), { action, ...payload });
  };
  try {
    const first = await open();
    await first('addSite', { input: 'example.com' });
    await first('startSession', { minutes: 25 });
    const before = await first('getState');
    await context.close();
    const second = await open();
    const after = await second('getState');
    expect(after.settings).toEqual(before.settings);
    expect(after.session).toEqual(before.session);
    const worker = context.serviceWorkers()[0];
    expect((await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).length).toBe(1);
    expect((await worker.evaluate(() => chrome.alarms.get('session-end'))).scheduledTime).toBe(before.session.endsAt);
  } finally { await context?.close(); }
});
