import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1242, height: 2688, deviceScaleFactor: 1 });
const filePath = path.join(__dirname, 'iap-buy-points.html');
await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
await new Promise(r => setTimeout(r, 600));
await page.screenshot({
  path: path.join(__dirname, 'iap-buy-points.png'),
  clip: { x: 0, y: 0, width: 1242, height: 2688 },
});
console.log('✓ iap-buy-points.png');
await browser.close();
