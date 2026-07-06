import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'images', 'landing');
const port = process.env.PORT || 3538;
const baseUrl = `http://localhost:${port}/`;

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

async function capture(name, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.landing-preview', { timeout: 15000 });
  const preview = page.locator('.landing-preview').first();
  await preview.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`[capture] ${name}.png (${viewport.width}x${viewport.height})`);
}

try {
  await capture('dashboard-desktop', { width: 1280, height: 900 });
  await capture('dashboard-mobile', { width: 390, height: 844 });
} finally {
  await browser.close();
}
