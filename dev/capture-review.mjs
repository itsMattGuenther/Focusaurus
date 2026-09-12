import { browserOptions } from './browser.mjs';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('.');
const out = resolve('docs/review'); mkdirSync(out, { recursive: true });
const context = await chromium.launchPersistentContext('', { ...browserOptions, headless: true,
  viewport: { width: 1280, height: 800 }, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
try {
  let worker = context.serviceWorkers()[0]; worker ||= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const url = (p) => `chrome-extension://${id}/src/${p}`;
  const page = await context.newPage();
  await page.goto(url('popup/popup.html'));
  await page.locator('#statusChip').filter({ hasText: 'Idle' }).waitFor();
  const send = (action, payload = {}) => page.evaluate((msg) => chrome.runtime.sendMessage(msg), { action, ...payload });
  await send('togglePack', { packId: 'social' });
  const { settings } = await send('getState');
  const site = settings.sites[0];
  const welcome = await context.newPage();
  await welcome.goto(url('welcome/welcome.html')); await welcome.locator('#packChips button').first().waitFor();
  await welcome.screenshot({ path: `${out}/welcome-light.png`, fullPage: true, animations: 'disabled' });
  await send('startSession', { minutes: 25 });
  const blocked = await context.newPage();
  await blocked.goto(`${url('blocked/blocked.html')}?site=${site.id}#url=https://${site.label}/`);
  await blocked.locator('#attemptsValue').filter({ hasText: 'First time today' }).waitFor();
  await blocked.screenshot({ path: `${out}/blocked-light.png`, animations: 'disabled' });
  await page.reload(); await page.locator('#statusChip').filter({ hasText: 'Focusing' }).waitFor();
  await page.setViewportSize({ width: 420, height: 800 });
  await page.screenshot({ path: `${out}/popup-light.png`, fullPage: true, animations: 'disabled' });
  const options = await context.newPage();
  await options.goto(url('options/options.html')); await options.locator('#appVersion').filter({ hasText: '1.0.0' }).waitFor();
  await options.screenshot({ path: `${out}/settings-light.png`, fullPage: true, animations: 'disabled' });
  await send('patchSettings', { values: { theme: 'dark' } });
  for (const [surface, name] of [[blocked, 'blocked'], [page, 'popup'], [options, 'settings'], [welcome, 'welcome']]) {
    await surface.reload(); await surface.locator('html[data-theme="dark"]').waitFor();
    await surface.screenshot({ path: `${out}/${name}-dark.png`, fullPage: name !== 'blocked', animations: 'disabled' });
  }
  await options.setViewportSize({ width: 360, height: 800 });
  await options.screenshot({ path: `${out}/settings-narrow.png`, fullPage: true, animations: 'disabled' });
  await send('patchSettings', { values: { strictness: 'locked' } });
  await page.reload(); await page.locator('#lockedNote').waitFor();
  await page.screenshot({ path: `${out}/popup-locked-dark.png`, fullPage: true, animations: 'disabled' });
  const manager = await context.newPage(); await manager.goto(`chrome://extensions/?id=${id}`);
  await manager.evaluate((extensionId) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId, hostAccess: 'ON_CLICK' }), id);
  for (const theme of ['light', 'dark']) {
    await send('patchSettings', { values: { theme } });
    await page.reload(); await page.locator('#siteAccess').waitFor();
    await page.screenshot({ path: `${out}/popup-access-${theme}.png`, fullPage: true, animations: 'disabled' });
  }
  console.log(`Review images: ${out}`);
} finally { await context.close(); }
