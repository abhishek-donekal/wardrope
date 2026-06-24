import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1024, height: 1024 });
const filePath = path.join(__d, 'icon-option-2b-final.html').replace(/\\/g, '/');
await p.goto(`file:///${filePath}`);
await new Promise(r => setTimeout(r, 500));
await p.screenshot({
  path: path.join(__d, 'icon-option-2b-final.png'),
  clip: { x: 0, y: 0, width: 1024, height: 1024 },
});
await b.close();
console.log('done');
