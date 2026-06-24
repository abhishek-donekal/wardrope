import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__dirname, '..', 'frontend', 'assets', 'images');

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

const filePath = path.join(__dirname, 'icon-master.html');
await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
await new Promise((r) => setTimeout(r, 600));

const masterPng = path.join(__dirname, 'icon-master.png');
await page.screenshot({
  path: masterPng,
  clip: { x: 0, y: 0, width: 1024, height: 1024 },
  omitBackground: false,
});
console.log('✓ wrote', masterPng);

// Copy to frontend assets
fs.copyFileSync(masterPng, path.join(ASSETS, 'icon.png'));
console.log('✓ frontend/assets/images/icon.png');

fs.copyFileSync(masterPng, path.join(ASSETS, 'adaptive-icon.png'));
console.log('✓ frontend/assets/images/adaptive-icon.png');

// Splash icon — smaller variant uses same mark on transparent-ish bg
fs.copyFileSync(masterPng, path.join(ASSETS, 'splash-icon.png'));
console.log('✓ frontend/assets/images/splash-icon.png');

// Favicon — render at 256
await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });
await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
await new Promise((r) => setTimeout(r, 400));
const faviconPng = path.join(ASSETS, 'favicon.png');
await page.screenshot({ path: faviconPng, clip: { x: 0, y: 0, width: 256, height: 256 } });
console.log('✓ frontend/assets/images/favicon.png');

await browser.close();
console.log('Done.');
