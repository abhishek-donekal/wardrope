import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const screens = [
  'ipad-1-closet',
  'ipad-2-stylist',
];

const browser = await puppeteer.launch({ headless: true });

for (const name of screens) {
  const page = await browser.newPage();
  await page.setViewport({ width: 2048, height: 2732, deviceScaleFactor: 1 });
  const filePath = path.join(__dirname, `${name}.html`);
  await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(__dirname, `${name}.png`),
    clip: { x: 0, y: 0, width: 2048, height: 2732 },
  });
  console.log(`✓ ${name}.png`);
  await page.close();
}

await browser.close();
console.log('Done!');
