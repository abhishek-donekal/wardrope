import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// iOS-style status bar icons (signal bars + wifi arc + battery)
const IOS_ICONS_SVG = `<svg style="display:inline-block;vertical-align:middle;margin:0 6px" width="56" height="32" viewBox="0 0 56 32" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="22" width="7" height="10" rx="1.5" fill="white"/><rect x="11" y="16" width="7" height="16" rx="1.5" fill="white"/><rect x="22" y="10" width="7" height="22" rx="1.5" fill="white"/><rect x="33" y="4" width="7" height="28" rx="1.5" fill="white"/></svg><svg style="display:inline-block;vertical-align:middle;margin:0 6px" width="44" height="32" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M4 16 Q22 2 40 16"/><path d="M10 22 Q22 12 34 22"/><circle cx="22" cy="26" r="2" fill="white" stroke="none"/></svg><svg style="display:inline-block;vertical-align:middle;margin:0 6px" width="60" height="32" viewBox="0 0 60 32" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="8" width="48" height="20" rx="5" fill="none" stroke="white" stroke-width="2.5"/><rect x="50" y="14" width="4" height="8" rx="1.5" fill="white"/><rect x="6" y="12" width="36" height="12" rx="2.5" fill="white"/></svg>`;

const replacements = [
  // Pattern A: single-line span with text content
  [/<span class="icons">[^<]*<\/span>/g, `<span class="icons">${IOS_ICONS_SVG}</span>`],
  // Pattern B: nested spans variant
  [/<div class="icons"><span>[^<]*<\/span><span>[^<]*<\/span><span>[^<]*<\/span><\/div>/g, `<div class="icons">${IOS_ICONS_SVG}</div>`],
];

const targets = [
  { name: '1-closet', w: 1242, h: 2688 },
  { name: '2-stylist', w: 1242, h: 2688 },
  { name: '3-looks', w: 1242, h: 2688 },
  { name: '4-add-item', w: 1242, h: 2688 },
  { name: '5-profile', w: 1242, h: 2688 },
  { name: 'iap-buy-points', w: 1242, h: 2688 },
  { name: 'iap-subscription', w: 1242, h: 2688 },
  { name: 'ipad-1-closet', w: 2048, h: 2732 },
  { name: 'ipad-2-stylist', w: 2048, h: 2732 },
];

// Step 1: rewrite HTML files
for (const t of targets) {
  const htmlPath = path.join(__dirname, `${t.name}.html`);
  if (!fs.existsSync(htmlPath)) {
    console.log(`SKIP ${t.name}.html (missing)`);
    continue;
  }
  let html = fs.readFileSync(htmlPath, 'utf8');
  let changed = false;
  for (const [pat, sub] of replacements) {
    const newHtml = html.replace(pat, sub);
    if (newHtml !== html) {
      changed = true;
      html = newHtml;
    }
  }
  if (changed) {
    fs.writeFileSync(htmlPath, html);
    console.log(`✓ rewrote ${t.name}.html`);
  } else {
    console.log(`= no change ${t.name}.html`);
  }
}

// Step 2: regenerate PNGs
const browser = await puppeteer.launch({ headless: true });
for (const t of targets) {
  const htmlPath = path.join(__dirname, `${t.name}.html`);
  if (!fs.existsSync(htmlPath)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: t.w, height: t.h, deviceScaleFactor: 1 });
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({
    path: path.join(__dirname, `${t.name}.png`),
    clip: { x: 0, y: 0, width: t.w, height: t.h },
  });
  console.log(`✓ ${t.name}.png (${t.w}x${t.h})`);
  await page.close();
}
await browser.close();
console.log('Done.');
