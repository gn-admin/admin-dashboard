import { chromium } from 'playwright';

const pg = process.argv[2] || 'web';
const BASE = 'https://gn-admin.github.io/admin-dashboard/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' });
const page = await ctx.newPage();
let blocked = 0, api = 0;
page.on('response', async (r) => {
  if (!r.url().includes('script.google.com')) return;
  api++;
  try { const t = await r.text(); if (/blocked/.test(t.slice(0, 200))) { blocked++; console.log('BLOCKED', new URL(r.url()).searchParams.get('endpoint')); } } catch {}
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#login-form', { timeout: 30000 });
await page.fill('#email', 'gn.test.admin@example.test');
await page.fill('#password', 'asdf@1234');
await page.click('#login-submit-btn');
await page.waitForSelector('#dashboard-view.active', { timeout: 45000 });
await page.waitForTimeout(12000);
await page.evaluate((p) => { location.hash = p; }, pg);
for (let i = 1; i <= 25; i++) {
  await page.waitForTimeout(1000);
  const st = await page.evaluate((p) => {
    const el = document.getElementById('page-' + p);
    return { len: el ? (el.textContent || '').trim().length : -1, busy: el?.getAttribute('aria-busy'), html: el ? el.innerHTML.length : -1, hash: location.hash };
  }, pg);
  if (i % 5 === 0 || st.len > 20) console.log(i + 's', JSON.stringify(st));
  if (st.len > 20) break;
}
console.log('api', api, 'blocked', blocked);
console.log('TEXT', (await page.textContent('#page-' + pg)).replace(/\s+/g, ' ').slice(0, 400));
await page.screenshot({ path: `test-results/page-${pg}.png` });
await browser.close();
