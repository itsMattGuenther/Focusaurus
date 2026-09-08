import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../assets/icons/mark.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const data = await page.screenshot({ omitBackground: true });
    writeFileSync(new URL(`../assets/icons/icon${size}.png`, import.meta.url), data);
    console.log(`icon${size}.png · ${data.length} bytes`);
  }
} finally { await browser.close(); }
