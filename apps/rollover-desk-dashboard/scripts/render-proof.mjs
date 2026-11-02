// Signs in through the real stack and checks every listed route at three widths in both themes: axe, overflow, screenshots.
// Needs the API and dashboard running, with the demo data seeded. Add routes through PROOF_ROUTES as a comma list.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = new URL('../render-proof/', import.meta.url).pathname;
const WIDTHS = [390, 1024, 1440];
const THEMES = ['light', 'dark'];
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
let failures = 0;

async function check(page, name) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(axeSource);
  const axe = await page.evaluate(() =>
    window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  for (const v of axe.violations) {
    failures += 1;
    console.error(
      `${name}: ${v.id}: ${v.nodes
        .map((n) => n.target.join(' '))
        .join(' | ')
        .slice(0, 300)}`,
    );
  }
  if (overflow > 0) {
    failures += 1;
    console.error(`${name}: page overflows by ${overflow}px`);
  }
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await page.goto(`${BASE}/sign-in`);
    await check(page, `sign-in-${theme}-${width}`);
    await page.fill('input[name=email]', 'analyst@prairie-ridge.example');
    await page.fill('input[name=password]', 'demo-prairie-analyst');
    await page.click('button[type=submit]');
    await page.waitForURL(`${BASE}/`);
    await page.waitForSelector('tbody a');
    const href = await page.getAttribute('tbody a', 'href');
    const extra = (process.env.PROOF_ROUTES ?? '').split(',').filter(Boolean);
    for (const route of ['/', '/account', href, ...extra.map((r) => `${href}${r}`)]) {
      await page.goto(`${BASE}${route}`);
      await check(
        page,
        `${route.replace(/\/p\/[^/]+/, 'property').replace(/\W+/g, '_') || 'home'}-${theme}-${width}`,
      );
    }
    await context.close();
  }
}
await browser.close();
console.log(failures ? `${failures} problem(s).` : 'Render proof clean.');
process.exit(failures ? 1 : 0);
