/* Rasterize Doug to the Chrome toolbar icon set.
   Same geometry as doug.js — 16px uses the head crop so he remains a
   dinosaur rather than a green pebble. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { ICON_VIEWBOX, dougSVG } from "../src/shared/doug.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "assets/icons");

const sizes = [
  { px: 16, viewBox: ICON_VIEWBOX },
  { px: 48, viewBox: "0 0 200 200" },
  { px: 128, viewBox: "0 0 200 200" },
];

const pageHtml = (px, viewBox) => {
  const svg = dougSVG("chill", { breathing: false, viewBox }).replace(
    "<svg ",
    `<svg width="${px}" height="${px}" `,
  );
  return `<!doctype html>
<html>
<head>
<style>
  :root {
    --doug-body: #6f9160;
    --doug-body-dim: #5a7a4d;
    --doug-belly: #cfdcc0;
    --doug-plate: #45613a;
    --doug-eye: #fbf8f0;
    --doug-ink: #241f19;
    --moss-bright: #5f8353;
    --ink-faint: #8d8478;
    --font-display: Georgia, serif;
    --ease-soft: linear;
  }
  html, body { margin: 0; width: ${px}px; height: ${px}px; background: transparent; overflow: hidden; }
  .doug { display: block; width: ${px}px; height: ${px}px; }
</style>
</head>
<body>${svg}</body>
</html>`;
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 256, height: 256 },
  deviceScaleFactor: 1,
});

for (const { px, viewBox } of sizes) {
  const page = await context.newPage();
  await page.setViewportSize({ width: Math.max(px, 32), height: Math.max(px, 32) });
  await page.setContent(pageHtml(px, viewBox), { waitUntil: "load" });
  const svg = page.locator("svg.doug");
  await svg.waitFor();
  const buf = await svg.screenshot({ omitBackground: true, type: "png" });
  const dest = join(outDir, `icon${px}.png`);
  writeFileSync(dest, buf);
  console.log(`wrote ${dest} (${buf.length} bytes)`);
  await page.close();
}

await browser.close();
