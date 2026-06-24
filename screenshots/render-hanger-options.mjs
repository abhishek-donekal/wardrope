import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options = [
  'icon-option-2a-hanger-w',
  'icon-option-2b-garment-on-hanger',
  'icon-option-2c-cradle',
  'icon-option-2d-pure-hanger',
];

const browser = await puppeteer.launch({ headless: true });
for (const name of options) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  const filePath = path.join(__dirname, `${name}.html`);
  await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(__dirname, `${name}.png`),
    clip: { x: 0, y: 0, width: 1024, height: 1024 },
  });
  console.log('✓', name + '.png');
  await page.close();
}
await browser.close();
