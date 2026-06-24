import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __d = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(__d, '..', 'frontend', 'assets', 'images');

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// Master 1024x1024
await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
const masterHtml = path.join(__d, 'icon-option-2-architect.html').replace(/\\/g, '/');
await page.goto(`file:///${masterHtml}`);
await new Promise(r => setTimeout(r, 600));
const masterPng = path.join(__d, 'icon-final.png');
await page.screenshot({ path: masterPng, clip: { x:0, y:0, width:1024, height:1024 } });
console.log('✓ master 1024x1024 ->', masterPng);

// Copy to all three large assets
fs.copyFileSync(masterPng, path.join(ASSETS, 'icon.png'));
fs.copyFileSync(masterPng, path.join(ASSETS, 'adaptive-icon.png'));
fs.copyFileSync(masterPng, path.join(ASSETS, 'splash-icon.png'));
console.log('✓ icon.png / adaptive-icon.png / splash-icon.png');

// Favicon 256x256
await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 1 });
await page.goto(`file:///${masterHtml}`);
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: path.join(ASSETS, 'favicon.png'), clip: { x:0, y:0, width:256, height:256 } });
console.log('✓ favicon.png');

await browser.close();
console.log('Done.');
