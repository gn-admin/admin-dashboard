/**
 * Sonda de produccion: comprueba version servida, login y navegacion basica.
 * Uso: node e2e/probe-produccion.mjs [email]
 */
import { chromium } from 'playwright';

const BASE = process.env.PROD_URL || 'https://gn-admin.github.io/admin-dashboard/';
const EMAIL = process.argv[2] || 'gn.test.admin@example.test';
const PASS = process.env.AUDIT_PASSWORD || 'asdf@1234';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text().slice(0, 200)); });

try {
  const sw = await page.request.get(new URL('sw.js', BASE).href);
  const txt = await sw.text();
  console.log('SW produccion:', (txt.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1] || '?');

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#login-form', { timeout: 30000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASS);
  await page.click('#login-submit-btn');
  await page.waitForSelector('#dashboard-view.active', { timeout: 45000 });
  await page.waitForTimeout(2500);

  console.log('Login OK:', EMAIL);
  const nav = await page.$$eval('.sidebar .nav-link, .sidebar [data-action="goHash"]', (els) =>
    els.map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean));
  console.log('Nav visible:', JSON.stringify([...new Set(nav)]));
  console.log('Hash:', await page.evaluate(() => location.hash));
  console.log('Perfil rol:', await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('gn_user_profile') || 'null'); } catch { return null; }
  }));
  await page.screenshot({ path: 'test-results/probe-dashboard.png', fullPage: false });
  console.log('Errores consola:', errores.slice(0, 8));
} catch (e) {
  console.error('FALLO:', e.message);
  await page.screenshot({ path: 'test-results/probe-fallo.png' }).catch(() => {});
  console.error('Errores consola:', errores.slice(0, 15));
  process.exitCode = 1;
} finally {
  await browser.close();
}
