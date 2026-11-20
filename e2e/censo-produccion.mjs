/**
 * Censo de la UI real en produccion: navega cada pagina y vuelca las acciones
 * visibles (data-action), botones con texto y campos de formulario.
 * Uso: node e2e/censo-produccion.mjs [email]
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'https://gn-admin.github.io/admin-dashboard/';
const EMAIL = process.argv[2] || process.env.AUDIT_EMAIL || 'gn.test.admin@example.test';
const PASS = process.env.AUDIT_PASSWORD || 'asdf@1234';
const PAGES = ['dashboard', 'encuestas', 'encuestas-perros', 'encuestas-gatos', 'encuestas-acogida',
  'animales', 'acogidas', 'acogidas-activas', 'adopciones', 'socios', 'blacklist', 'reportes',
  'actividad', 'redes', 'donaciones', 'almacen', 'web'];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-ES' });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#login-form', { timeout: 30000 });
await page.fill('#email', EMAIL);
await page.fill('#password', PASS);
await page.click('#login-submit-btn');
await page.waitForSelector('#dashboard-view.active', { timeout: 45000 });
await page.waitForTimeout(12000);

async function esperarPagina(p, maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await page.evaluate((pg) => {
      const el = document.getElementById('page-' + pg);
      if (!el) return { len: 0, busy: null, hash: location.hash };
      return { len: (el.textContent || '').trim().length, busy: el.getAttribute('aria-busy'), hash: location.hash };
    }, p);
    if (st.hash !== '#' + p) return { ...st, redirigido: st.hash };
    if (st.len > 20 && !st.busy) return { ...st, ms: Date.now() - t0 };
    await page.waitForTimeout(400);
  }
  return { timeout: true, ms: Date.now() - t0 };
}

const censo = {};
for (const p of PAGES) {
  const t0 = Date.now();
  await page.evaluate((pg) => { location.hash = pg; }, p);
  const espera = await esperarPagina(p);
  const info = await page.evaluate((pg) => {
    const root = document.getElementById('page-' + pg);
    if (!root) return { missing: true };
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const actions = [...root.querySelectorAll('[data-action]')].filter(vis).map((e) => ({
      a: e.dataset.action,
      d0: e.dataset.arg0 || '', d1: e.dataset.arg1 || '',
      t: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
      tag: e.tagName.toLowerCase(),
      cls: (e.className || '').toString().slice(0, 40),
      dis: e.disabled === true
    }));
    const fields = [...root.querySelectorAll('input,select,textarea')].filter(vis).map((e) => ({
      tag: e.tagName.toLowerCase(), type: e.type, id: e.id, name: e.name, ph: e.placeholder || '',
      req: e.required === true
    }));
    return {
      textLen: (root.textContent || '').trim().length,
      actions, fields,
      headings: [...root.querySelectorAll('h1,h2,h3')].map((h) => (h.textContent || '').trim()).slice(0, 12)
    };
  }, p);
  censo[p] = { ...info, espera, msTotal: Date.now() - t0 };
  console.log('PAGE', p, 'len', info.textLen, 'actions', (info.actions || []).length, 'fields', (info.fields || []).length, 'wait', JSON.stringify(espera));
}

await fs.mkdir('test-results', { recursive: true });
await fs.writeFile('test-results/censo.json', JSON.stringify(censo, null, 2), 'utf8');
console.log('OK -> test-results/censo.json');
await browser.close();
