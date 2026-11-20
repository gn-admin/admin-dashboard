import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'https://gn-admin.github.io/admin-dashboard/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#login-form', { timeout: 30000 });
await page.fill('#email', 'gn.test.admin@example.test');
await page.fill('#password', 'asdf@1234');
await page.click('#login-submit-btn');
await page.waitForSelector('#dashboard-view.active', { timeout: 45000 });
await page.waitForTimeout(5000);

const out = {};
out.pages = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => ({ id: p.id, active: p.classList.contains('active'), len: p.innerHTML.length, text: (p.textContent || '').replace(/\s+/g, ' ').slice(0, 160) })));
out.actions = await page.evaluate(() => [...document.querySelectorAll('[data-action]')].map((e) => ({ a: e.getAttribute('data-action'), d0: e.getAttribute('data-arg0'), t: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) })));
out.mainText = (await page.textContent('#main-content')).replace(/\s+/g, ' ').slice(0, 2000);
await fs.writeFile('test-results/probe.json', JSON.stringify(out, null, 2), 'utf8');
console.log('pages', JSON.stringify(out.pages));
console.log('actions', out.actions.length, JSON.stringify(out.actions.slice(0, 40)));
console.log('mainText', out.mainText.slice(0, 600));
await browser.close();
