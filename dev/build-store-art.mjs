import { browserOptions } from './browser.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve('.'); const out = join(root, 'docs/store-assets'); mkdirSync(out, { recursive: true });
const data = (path, mime) => `data:${mime};base64,${readFileSync(join(root, path)).toString('base64')}`;
const art = data('assets/art/doug-chill.webp', 'image/webp');
const mark = data('assets/icons/icon128.png', 'image/png');
const fonts = `@font-face{font-family:F;src:url('${data('assets/fonts/fraunces.woff2', 'font/woff2')}');font-weight:400 700}@font-face{font-family:P;src:url('${data('assets/fonts/publicsans.woff2', 'font/woff2')}');font-weight:400 700}`;
const browser = await chromium.launch({ ...browserOptions });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, width, height] of [['promo-small', 440, 280], ['promo-marquee', 1400, 560]]) {
    const small = width === 440;
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><html><head><style>${fonts}
      *{box-sizing:border-box}body{margin:0;background:#f2ede1;color:#241f19;font-family:P,sans-serif;width:${width}px;height:${height}px;overflow:hidden}
      main{position:relative;height:100%;padding:${small ? '26px 28px' : '56px 88px'};border-top:3px solid #4a6741}
      .brand{display:flex;gap:10px;align-items:center;font-family:F,serif;font-size:${small ? 18 : 28}px;font-weight:700}.brand img{width:${small ? 25 : 38}px}
      h1{font:500 ${small ? 34 : 80}px/1.08 F,serif;letter-spacing:-.04em;position:relative;margin:${small ? '30px' : '55px'} 0 0;z-index:2}
      p{font-size:${small ? 11 : 17}px;line-height:1.6;color:#5c544a;max-width:${small ? 175 : 370}px;margin-top:${small ? 14 : 24}px}
      .art{position:absolute;width:${small ? 204 : 500}px;right:${small ? -5 : 90}px;bottom:${small ? 18 : 12}px;z-index:1}
      .ring{position:absolute;right:${small ? -8 : 50}px;bottom:${small ? 0 : -20}px;width:${small ? 226 : 550}px;height:${small ? 226 : 550}px;background:radial-gradient(ellipse,#4a67412e,transparent 68%);filter:blur(${small ? 12 : 24}px)}
      .foot{position:absolute;bottom:${small ? 18 : 32}px;left:${small ? 28 : 88}px;font-size:${small ? 8 : 11}px;letter-spacing:.15em;text-transform:uppercase;color:#4a6741}
      </style></head><body><main><div class="brand"><img src="${mark}" alt="">Focusaurus</div><div class="ring"></div><img class="art" src="${art}" alt=""><h1>A little room<br>to focus.</h1><p>Your dinosaur companion<br>for a quieter browser.</p><span class="foot">One tab at a time.</span></main></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, `${name}.png`) });
  }
} finally { await browser.close(); }

// Actual product screenshots, taken with an installed extension and a sample
// configuration. No remote sites, accounts, or real user history are used.
const context = await chromium.launchPersistentContext('', { ...browserOptions, headless: true,
  viewport: { width: 1280, height: 800 }, args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
try {
  let worker = context.serviceWorkers()[0]; worker ||= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host; const url = (p) => `chrome-extension://${id}/src/${p}`;
  const control = await context.newPage(); await control.goto(url('popup/popup.html'));
  await control.locator('#statusChip').filter({ hasText: 'Idle' }).waitFor();
  const send = (action, payload = {}) => control.evaluate((msg) => chrome.runtime.sendMessage(msg), { action, ...payload });
  await send('togglePack', { packId: 'social' });
  const site = (await send('getState')).settings.sites[0];
  const page = await context.newPage(); await page.goto(url('welcome/welcome.html'));
  await page.locator('#packChips button').first().waitFor(); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, 'screenshot-01-welcome.png'), animations: 'disabled' });
  await send('startSession', { minutes: 25 });
  await page.goto(`${url('blocked/blocked.html')}?site=${site.id}#url=https://${site.label}/`);
  await page.locator('#attemptsValue').filter({ hasText: 'First time today' }).waitFor(); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, 'screenshot-02-focus.png'), animations: 'disabled' });
  await send('patchSettings', { values: { theme: 'dark' } });
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: join(out, 'screenshot-03-lamplight.png'), animations: 'disabled' });
} finally { await context.close(); }
copyFileSync(join(root, 'assets/icons/icon128.png'), join(out, 'store-icon-128.png'));
console.log(`Store artwork and three 1280×800 screenshots: ${out}`);
