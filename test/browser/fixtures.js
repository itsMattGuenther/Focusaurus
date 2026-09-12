import { browserOptions } from '../../dev/browser.mjs';
import { test as base, chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';

export const test = base.extend({
  extension: async ({}, use) => {
    const root = resolve(process.env.FOCUSAURUS_EXTENSION_PATH || '.');
    const context = await chromium.launchPersistentContext('', {
      ...browserOptions, headless: true, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    });
    let worker = context.serviceWorkers()[0];
    worker ||= await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const errors = [];
    context.on('page', (page) => page.on('pageerror', (err) => errors.push(err.message)));
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
    await expect(popup.locator('#statusChip')).toHaveText('Idle');
    const send = (action, payload = {}) => popup.evaluate((msg) => chrome.runtime.sendMessage(msg), { action, ...payload });
    await use({ context, worker, id, popup, send, errors,
      url: (path) => `chrome-extension://${id}/src/${path}` });
    await context.close();
    expect(errors).toEqual([]);
  },
});
export { expect };
