// Happy path through the real stack in a browser, on a freshly seeded database. Numbers are compared with the answer key.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000';
const SAMPLES = new URL('../../../data/synthetic/samples/', import.meta.url);
const key = JSON.parse(readFileSync(new URL('answer-key.json', SAMPLES), 'utf8'));
const occupied = key.leases.filter((l) => l.status === 'occupied');
const rentCents = occupied.reduce((n, l) => n + (l.annualRentCents ?? 0), 0);
const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(rentCents / 100);

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(15_000);
const step = (name) => console.log(`ok: ${name}`);

async function signIn(email, password) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`);
  await page.waitForSelector('tbody a');
}

// A wrong password says so and stays on the page.
await page.goto(`${BASE}/sign-in`);
await page.fill('input[name=email]', 'analyst@prairie-ridge.example');
await page.fill('input[name=password]', 'wrong');
await page.click('button[type=submit]');
await page.getByRole('alert').waitFor();
step('wrong password is refused');

await signIn('analyst@prairie-ridge.example', 'demo-prairie-analyst');
const property = await page.getAttribute('tbody a', 'href');
step('signed in');

await page.goto(`${BASE}${property}`);
await page.getByText('No rent roll yet').waitFor();
step('empty state before any rent roll');

const upload = async (name) => {
  await page.goto(`${BASE}${property}/rent-rolls`);
  await page.setInputFiles('#rent-roll-file', new URL(name, SAMPLES).pathname);
  await page.waitForURL(/rent-rolls\/[\w-]+$/);
  await page.getByRole('heading', { name: 'Column mapping' }).waitFor();
};

await upload('property-manager-export.xlsx');
await page.getByText('Blocks').first().waitFor();
assert.equal(await page.getByRole('button', { name: 'Confirm rent roll' }).isDisabled(), true);
step('messy file shows blocking issues and cannot be confirmed');

await upload('clean.xlsx');
const ack = page.getByRole('checkbox');
if (await ack.count()) await ack.check();
await page.getByRole('button', { name: 'Confirm rent roll' }).click();
await page.waitForURL(`${BASE}${property}`);
await page.getByText(dollars, { exact: true }).first().waitFor();
step(`confirmed; Desk annual rent matches the answer key, ${dollars}`);

const first = page.locator('li:has(button:text-is("Done"))').first();
const message = await first.locator('p').innerText();
await first.getByRole('button', { name: 'Done' }).click();
await page.getByText(/^Handled \(1\)$/).click();
await page.getByRole('button', { name: 'Undo' }).click();
await page.locator('p', { hasText: message }).first().waitFor();
await page.getByText(/^Handled/).waitFor({ state: 'detached' });
step('attention item marked done, then undone');

await page.getByRole('button', { name: 'Show table' }).click();
await page.getByRole('region', { name: 'Rollover by year' }).waitFor();
step('rollover table view');

await page.goto(`${BASE}${property}/pipeline`);
const card = page.locator('article').first();
const suite = (await card.locator('a').first().innerText()).trim();
await card.getByLabel('Stage').selectOption('vacating');
await card.getByLabel('Why are they vacating?').fill('Downsizing');
await card.getByRole('button', { name: 'Mark vacating' }).click();
const vacating = page.locator('section', { has: page.getByRole('heading', { name: 'Vacating' }) });
await vacating.getByText(suite).waitFor();
await vacating.getByText('Vacating: Downsizing').waitFor();
step('pipeline move to Vacating with a reason');

await page.goto(`${BASE}${property}`);
await page.getByText(/^1 lease,/).waitFor();
step('projected vacating updated on the Desk');

await page.goto(`${BASE}${property}/leases`);
await page.waitForSelector('tbody a');
await page.locator('tbody a').first().click();
await page.getByRole('heading', { name: 'Critical dates' }).waitFor();
await page.getByText('Why this risk score').waitFor();
step('lease detail with dates and risk');

await page.goto(`${BASE}${property}/dates`);
await page.getByRole('heading', { name: /Missing dates/ }).waitFor();
step('critical dates');

await page.goto(`${BASE}${property}`);
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Download workbook' }).click(),
]);
assert.match(download.suggestedFilename(), /^rollover-desk-.*\.xlsx$/);
assert.equal(await download.failure(), null);
step('workbook downloaded');

await page.goto(`${BASE}${property}/rent-rolls`);
await page.getByRole('button', { name: 'Revert' }).click();
await page.getByRole('button', { name: 'Revert rent roll' }).click();
await page.getByText('Reverted').first().waitFor();
step('revert with a two-step confirm');

// Keep the token, to check that signing out ended it at the API and not only in this browser.
const token = (await page.context().cookies()).find((c) => c.name === 'rd_session')?.value;
assert.ok(token);
await page.getByRole('button', { name: 'Sign out' }).click();
await page.waitForURL(`${BASE}/sign-in`);
await page.goto(`${BASE}/`);
await page.waitForURL(`${BASE}/sign-in`);
const reused = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
assert.equal(reused.status, 401);
step('signed out for real, and the old token no longer works');

await signIn('viewer@prairie-ridge.example', 'demo-prairie-viewer');
await page.goto(`${BASE}${property}/rent-rolls`);
await page.getByRole('heading', { name: 'History' }).waitFor();
assert.equal(await page.locator('#rent-roll-file').count(), 0);
step('viewer gets no upload control');

await browser.close();
console.log('Happy path passed.');
