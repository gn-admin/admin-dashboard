/**
 * Arnés común para la auditoría funcional del gestor contra PRODUCCIÓN.
 *
 * Principios:
 * - Se prueba el sitio real (`https://gn-admin.github.io/admin-dashboard/`),
 *   sin interceptar assets ni servir `src/` en local.
 * - Se registran las peticiones al backend para saber qué endpoints se han
 *   ejercitado de verdad desde la UI.
 * - Se mide el tiempo hasta la primera señal visual (overlay, snackbar,
 *   modal o cambio de DOM) de cada acción: eso detecta acciones que parecen
 *   "no hacer nada" hasta que llega el mensaje del endpoint.
 * - Nunca se envían correos ni se lanzan borrados masivos.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const CONFIG = require('../../src/js/config.js');

export const BASE = process.env.PROD_URL || 'https://gn-admin.github.io/admin-dashboard/';
export const PASSWORD = process.env.AUDIT_PASSWORD || 'asdf@1234';
export const SUFIJO = 'qa' + Date.now().toString(36);
export const QA = 'ZZ QA ' + SUFIJO;

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

export function crearResultados() {
  const filas = [];
  const endpoints = new Map();
  const acciones = new Map();
  return {
    filas, endpoints, acciones,
    ok(seccion, nombre, detalle = '', extra = {}) {
      filas.push({ seccion, nombre, estado: 'ok', detalle, ...extra });
      console.log(`  ✔ ${nombre}${detalle ? ' — ' + detalle : ''}`);
    },
    fallo(seccion, nombre, detalle = '', extra = {}) {
      filas.push({ seccion, nombre, estado: 'fallo', detalle, ...extra });
      console.log(`  ✘ ${nombre}${detalle ? ' — ' + detalle : ''}`);
    },
    omitido(seccion, nombre, motivo = '') {
      filas.push({ seccion, nombre, estado: 'omitido', detalle: motivo });
      console.log(`  ○ ${nombre}${motivo ? ' — ' + motivo : ''}`);
    },
    usarAccion(a) { if (a) acciones.set(a, (acciones.get(a) || 0) + 1); },
    usarEndpoint(e) { if (e) endpoints.set(e, (endpoints.get(e) || 0) + 1); },
    resumen() {
      const c = { ok: 0, fallo: 0, omitido: 0 };
      for (const f of filas) c[f.estado]++;
      return c;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Navegador y sesión                                                  */
/* ------------------------------------------------------------------ */

export async function abrirNavegador({ headless = true, ancho = 1366, alto = 900 } = {}) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    viewport: { width: ancho, height: alto },
    locale: 'es-ES',
    serviceWorkers: 'block',
    acceptDownloads: true
  });
  ctx.setDefaultTimeout(25000);
  ctx.setDefaultNavigationTimeout(90000);
  await ctx.addInitScript(() => {
    window.__qaErrores = [];
    window.addEventListener('error', (e) => { try { window.__qaErrores.push(String(e.message || e.error)); } catch {} });
    window.addEventListener('unhandledrejection', (e) => {
      try { window.__qaErrores.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason)); } catch {}
    });
  });
  return { browser, ctx };
}

/** Login por el formulario real (se prueba también esa función). */
export async function loginFormulario(page, email = 'gn.test.admin@example.test', password = PASSWORD, intentos = 3) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-form', { timeout: 40000 });
  let ultimoError = '';
  for (let i = 0; i < intentos; i++) {
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('#login-submit-btn');
    try {
      await page.waitForSelector('#dashboard-view.active', { timeout: 35000 });
      await esperarPerfil(page);
      return true;
    } catch {
      ultimoError = (await page.textContent('#login-error').catch(() => '')) || '';
      if (!(await page.isVisible('#login-view'))) throw new Error('login: estado inesperado');
      await page.waitForTimeout(1500);
    }
  }
  throw new Error('login falló tras ' + intentos + ' intentos: ' + ultimoError.slice(0, 160));
}

/** Sesión inyectada por REST de Firebase (evita repetir el formulario). */
export async function sesionREST(email = 'gn.test.admin@example.test', password = PASSWORD) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CONFIG.firebase.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    signal: AbortSignal.timeout(25000)
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('login REST falló: ' + ((j.error && j.error.message) || r.status));
  return {
    email,
    token: j.idToken,
    key: 'firebase:authUser:' + CONFIG.firebase.apiKey + ':[DEFAULT]',
    user: {
      uid: j.localId, email: j.email || email, emailVerified: true, isAnonymous: false,
      displayName: email.split('@')[0],
      providerData: [{ providerId: 'password', uid: email, email: email, displayName: email.split('@')[0] }],
      stsTokenManager: {
        refreshToken: j.refreshToken,
        accessToken: j.idToken,
        expirationTime: Date.now() + Number(j.expiresIn || 3600) * 1000
      },
      createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
      apiKey: CONFIG.firebase.apiKey, appName: '[DEFAULT]'
    }
  };
}

export async function loginInyectado(page, email, { sinCargasFondo = false } = {}) {
  const s = await sesionREST(email);
  await page.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.setItem('gn_session', '1'); } catch {}
  }, [s.key, JSON.stringify(s.user)]);
  if (sinCargasFondo) {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        if (typeof Dashboard !== 'undefined' && typeof Dashboard._startBackgroundLoads === 'function') {
          Dashboard._startBackgroundLoads = async function () {};
        }
      });
    });
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#dashboard-view.active', { timeout: 60000 });
  await esperarPerfil(page);
  return s;
}

export async function esperarPerfil(page) {
  await page.waitForFunction(
    () => typeof Dashboard !== 'undefined' && Dashboard._profileResolved === true,
    null, { timeout: 60000 }
  );
}

/* ------------------------------------------------------------------ */
/* Navegación y esperas                                                */
/* ------------------------------------------------------------------ */

const PAGINAS = ['dashboard', 'encuestas', 'encuestas-perros', 'encuestas-gatos', 'encuestas-acogida',
  'animales', 'acogidas', 'acogidas-activas', 'adopciones', 'socios', 'blacklist', 'reportes',
  'actividad', 'redes', 'donaciones', 'almacen', 'web'];

/** Navega por hash y espera a que la página pinte contenido real. */
export async function ir(page, ruta, { timeout = 45000, minimo = 20 } = {}) {
  const t0 = Date.now();
  await page.evaluate((r) => { location.hash = r; }, ruta);
  await page.waitForFunction(({ r, minimo }) => {
    if (location.hash !== '#' + r) return false;
    const el = document.getElementById('page-' + r);
    if (!el) return false;
    const texto = (el.textContent || '').trim();
    return texto.length >= minimo && !el.getAttribute('aria-busy');
  }, { r: ruta, minimo }, { timeout });
  return Date.now() - t0;
}

/** Espera a que una página concreta esté lista (sin navegar). */
export async function esperarPagina(page, ruta, { timeout = 45000, minimo = 20 } = {}) {
  await page.waitForFunction(({ r, minimo }) => {
    const el = document.getElementById('page-' + r);
    if (!el) return false;
    return (el.textContent || '').trim().length >= minimo && !el.getAttribute('aria-busy');
  }, { r: ruta, minimo }, { timeout });
}

export async function esperarModal(page, selector = '.modal-overlay.active, .modal.active, [role="dialog"]:visible', timeout = 15000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  await page.waitForTimeout(150);
}

export async function cerrarModales(page) {
  for (let i = 0; i < 6; i++) {
    const abierto = await page.evaluate(() => {
      const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const el = [...document.querySelectorAll('.modal-overlay, .modal, [role="dialog"]')].find((x) => vis(x) && !x.classList.contains('hidden'));
      return !!el;
    });
    if (!abierto) return;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }
}

export async function snack(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const el = document.getElementById('error-message');
    if (!el) return false;
    return (el.textContent || '').trim().length > 0 && el.classList.contains('active');
  }, null, { timeout });
  return (await page.textContent('#error-message')).replace(/\s+/g, ' ').trim();
}

export async function esperarSnack(page, patron, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = (await page.textContent('#error-message').catch(() => '')) || '';
    if (patron.test(t)) return t.replace(/\s+/g, ' ').trim();
    await page.waitForTimeout(250);
  }
  return null;
}

/** Limpia el snackbar para poder detectar el siguiente. */
export async function limpiarSnack(page) {
  await page.evaluate(() => {
    const el = document.getElementById('error-message');
    if (el) { el.textContent = ''; el.classList.remove('active'); }
  }).catch(() => {});
}

/** Espera a que desaparezca un overlay de carga global. */
export async function esperarSinOverlay(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const el = document.getElementById('loading');
    return !el || !el.classList.contains('active');
  }, null, { timeout }).catch(() => {});
}

/** Click sobre un [data-action="..."] (o selector) con medición de feedback. */
export async function accion(page, actionOrSelector, { timeout = 20000, esperarSnack: esperar = true, permitirDescarga = false } = {}) {
  const sel = actionOrSelector.startsWith('.') || actionOrSelector.startsWith('#') || actionOrSelector.startsWith('[')
    ? actionOrSelector
    : `[data-action="${actionOrSelector}"]`;
  const el = page.locator(sel).filter({ visible: true }).first();
  await el.waitFor({ state: 'visible', timeout });
  const action = await el.getAttribute('data-action').catch(() => null);

  await page.evaluate(() => {
    const el = document.getElementById('snackbar');
    if (el) el.textContent = '';
    window.__qaFeedback = { t0: performance.now(), overlay: false, snack: false, modal: false, cambio: false };
    const marca = (k) => { if (!window.__qaFeedback[k]) window.__qaFeedback[k] = performance.now() - window.__qaFeedback.t0; };
    window.__qaObs && window.__qaObs.disconnect();
    const obs = new MutationObserver(() => marca('cambio'));
    obs.observe(document.getElementById('main-content') || document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    window.__qaObs = obs;
    const snackEl = document.getElementById('snackbar');
    if (snackEl) {
      new MutationObserver(() => { if ((snackEl.textContent || '').trim()) marca('snack'); })
        .observe(snackEl, { subtree: true, childList: true, characterData: true });
    }
    const loop = () => {
      const ov = document.getElementById('loading');
      if (ov && ov.classList.contains('active')) marca('overlay');
      if (document.querySelector('.modal-overlay.active, .modal.active')) marca('modal');
      if (!window.__qaFeedback.done) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  const descarga = permitirDescarga ? page.waitForEvent('download', { timeout: 25000 }).catch(() => null) : Promise.resolve(null);
  const popup = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  const t0 = Date.now();
  await el.click({ timeout });
  const [dl, pop] = await Promise.all([descarga, popup]);

  let mensaje = '';
  if (esperar) {
    try {
      mensaje = await snack(page, 20000);
    } catch { /* algunas acciones no muestran snackbar */ }
  }
  const ms = Date.now() - t0;
  const feedback = await page.evaluate(() => {
    const f = window.__qaFeedback || {};
    f.done = true;
    return f;
  }).catch(() => ({}));
  if (dl) await dl.cancel().catch(() => {});
  if (pop && !pop.isClosed?.()) await pop.close().catch(() => {});
  return { accion: action, ms, mensaje, feedback, descarga: !!dl, popup: !!pop };
}

/** Rellena un campo y dispara input/change (para maxlength/validaciones). */
export async function rellenar(page, selector, valor) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  await el.fill(String(valor));
  await el.dispatchEvent('input').catch(() => {});
  await el.dispatchEvent('change').catch(() => {});
}

export async function elegir(page, selector, valor) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  await el.selectOption(String(valor));
}

/** Confirma el diálogo propio de la app. */
export async function confirmar(page, { aceptar = true, timeout = 15000 } = {}) {
  await page.waitForSelector('#confirm-modal.active, #confirm-modal[style*="flex"]', { timeout }).catch(async () => {
    await page.waitForSelector('#confirm-ok', { state: 'visible', timeout });
  });
  await page.click(aceptar ? '#confirm-ok' : '#confirm-cancel');
  await page.waitForTimeout(300);
}

export async function textoConfirm(page) {
  return (await page.textContent('#confirm-message').catch(() => '')) || '';
}

/* ------------------------------------------------------------------ */
/* API desde la propia página (limpieza y comprobaciones)              */
/* ------------------------------------------------------------------ */

export async function apiPagina(page, endpoint, body) {
  return page.evaluate(async ({ endpoint, body }) => {
    const nombre = String(endpoint).split('&')[0];
    const qs = '?endpoint=' + encodeURIComponent(nombre) + (String(endpoint).includes('&') ? '&' + String(endpoint).split('&').slice(1).join('&') : '');
    const token = await Auth.getIdToken();
    const url = CONFIG.apiUrl + qs + '&token=' + encodeURIComponent(token);
    const res = await fetch(url, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
    });
    try { return await res.json(); } catch { return { status: 'error', error: 'no JSON' }; }
  }, { endpoint, body });
}

/* ------------------------------------------------------------------ */
/* Capturas y ficheros                                                 */
/* ------------------------------------------------------------------ */

export async function carpetaSalida(nombre = 'auditoria-produccion') {
  const dir = path.resolve('test-results', nombre + '-' + new Date().toISOString().slice(0, 10));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function captura(page, dir, nombre) {
  try {
    await page.screenshot({ path: path.join(dir, nombre.replace(/[^\w.-]+/g, '-') + '.png'), fullPage: false });
  } catch { /* la captura no debe romper la prueba */ }
}

export function erroresPagina(page) {
  return page.evaluate(() => (window.__qaErrores || []).slice(-5)).catch(() => []);
}

export { PAGINAS };
