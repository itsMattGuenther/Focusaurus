import { browserOptions } from './browser.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Use the same happy Doug as the product. The cleaned source retains the
// illustration's alpha; trim only empty margins before proportional scaling.
const source = readFileSync(new URL('../assets/art/doug-stoked.webp', import.meta.url));
const browser = await chromium.launch({ ...browserOptions });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const icons = await page.evaluate(async (url) => {
    const image = new Image(); image.src = url; await image.decode();
    const source = document.createElement('canvas');
    source.width = image.width; source.height = image.height;
    const ctx = source.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
    let left = source.width, top = source.height, right = 0, bottom = 0;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (pixels[(y * source.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    const width = right - left + 1, height = bottom - top + 1;
    return [16, 32, 48, 128].map((size) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const target = canvas.getContext('2d'); target.imageSmoothingQuality = 'high';
      const scale = (size - 2 * Math.max(0.5, size / 32)) / Math.max(width, height);
      target.drawImage(source, left, top, width, height,
        (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
      return [size, canvas.toDataURL('image/png').split(',')[1]];
    });
  }, `data:image/webp;base64,${source.toString('base64')}`);
  for (const [size, base64] of icons) {
    const data = Buffer.from(base64, 'base64');
    writeFileSync(new URL(`../assets/icons/icon${size}.png`, import.meta.url), data);
    console.log(`icon${size}.png · ${data.length} bytes`);
  }
} finally { await browser.close(); }
