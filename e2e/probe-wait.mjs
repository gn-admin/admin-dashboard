import { chromium } from 'playwright';

const BASE = 'https://gn-admin.github.io/admin-dashboard/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' });
const page = await ctx.newPage();
const t0 = Date.now();
page.on('console', (m) => { if (m.type() === 'error' && !/frame-ancestors|inline event handler/.test(m.text())) console.log('ERR', (Date.now()-t0)+'ms', m.text().slice(0,300)); });
page.on('pageerror', (e) => console.log('PAGEERROR', (Date.now()-t0)+'ms', e.message));
page.on('requestfailed', (r) => console.log('REQFAIL', (Date.now()-t0)+'ms', r.failure()?.errorText, r.url().slice(0,100)));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('script.google.com')) {
    let ep = '';
    try { ep = new URL(u).searchParams.get('endpoint') || ''; } catch {}
    let body = ''; try { body = (await r.text()).slice(0, 200); } catch {}
    console.log('API', (Date.now()-t0)+'ms', r.status(), ep, body.replace(/\s+/g,' ').slice(0,120));
  }
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#login-form', { timeout: 30000 });
await page.fill('#email', 'gn.test.admin@example.test');
await page.fill('#password', 'asdf@1234');
await page.click('#login-submit-btn');
await page.waitForSelector('#dashboard-view.active', { timeout: 45000 });
console.log('dashboard visible', (Date.now()-t0)+'ms');

for (let i = 0; i < 30; i++) {
  const st = await page.evaluate(() => ({
    t: document.getElementById('page-dashboard')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '',
    n: document.querySelectorAll('#page-dashboard [data-action]').length,
    busy: document.getElementById('page-dashboard')?.getAttribute('aria-busy'),
    resolved: typeof Dashboard !== 'undefined' ? Dashboard._profileResolved : null,
    loading: document.getElementById('loading')?.className,
    snack: document.getElementById('snackbar')?.textContent?.trim().slice(0,120) || ''
  }));
  if (i % 5 === 0 || st.n > 0) console.log(i+'s', JSON.stringify(st));
  if (st.n > 0) break;
  await page.waitForTimeout(1000);
}
console.log('profile', JSON.stringify(await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gn_profile')||'null'); } catch { return null; } })));
await page.screenshot({ path: 'test-results/probe-wait.png' });
await browser.close();
