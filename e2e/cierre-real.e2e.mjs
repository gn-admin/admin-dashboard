/**
 * E2E real: cierre de una acogida con datos temporales (sin correos).
 *
 * Crea una familia y un animal de prueba con prefijo `ZZ E2E`, les asigna un
 * caso de acogida, lo cierra desde la interfaz como «Anulada» con motivo, y
 * comprueba contra la hoja (releyendo por API) que la fila guarda `desenlace`,
 * `fecha_cierre` y `motivo_cierre`, que el animal vuelve a `disponible` y que
 * el caso sale en «Cerradas» y en el historial del animal y de la familia.
 * Al terminar borra los tres registros, aunque la prueba falle.
 *
 *   AUDIT_PASSWORD=... node e2e/cierre-real.e2e.mjs
 *
 * Requiere `AUDIT_PASSWORD`. Sirve `src/` bajo el origen de GitHub Pages para
 * que el backend acepte las peticiones CORS; no hace falta servidor local.
 * No se envía ningún correo: el flujo de cierre no usa `send-contrato-email`.
 * La fila de actividad que generaría el cierre se evita sustituyendo
 * `Dashboard._regLog` por un no-op, porque Actividad no tiene endpoint de
 * borrado y quedaría un registro de prueba permanente.
 *
 * Particularidades del entorno, no del flujo:
 * - La sesión se inyecta como la guarda el SDK de Firebase (obtenida por
 *   REST): el formulario de login devuelve a ratos un error INTERNAL.
 * - Apps Script falla o deja colgadas peticiones concurrentes y `API._fetch`
 *   no tiene timeout. Se desactiva solo la precarga de listas en segundo plano,
 *   las listas necesarias se piden de una en una y, si una actualización se
 *   queda colgada, se reenvía el mismo payload que envió la app antes de dar
 *   la comprobación por fallida (se avisa en el resumen).
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const CONFIG = require('../src/js/config.js');

// El Apps Script desplegado solo acepta peticiones CORS desde los orígenes de
// su allowlist (GitHub Pages), no desde localhost. Para probar el código local
// sin tocar el backend se sirve `src/` bajo el origen de Pages interceptando
// sus peticiones, así el navegador manda el Origin que el backend acepta.
const ORIGEN = 'https://gn-admin.github.io';
const PREFIJO = '/admin-dashboard/';
const RAIZ = path.resolve(process.cwd(), 'src');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

const PASSWORD = process.env.AUDIT_PASSWORD;
const EMAIL = 'gn.test.admin@example.test';
if (!PASSWORD) {
  console.error('Falta AUDIT_PASSWORD (contraseña de los usuarios de prueba).');
  process.exit(1);
}

const sufijo = Date.now().toString(36);
const IDS = { familia: 'e2e_fam_' + sufijo, animal: 'e2e_ani_' + sufijo, acogida: 'e2e_acg_' + sufijo };
const HOY = new Date().toISOString().slice(0, 10);
const MOTIVO = 'Prueba E2E: cierre real con datos temporales';
const NOMBRE_ANIMAL = 'ZZ E2E Animal ' + sufijo;
const NOMBRE_FAMILIA = 'ZZ E2E Familia ' + sufijo;

const fallos = [];
const avisos = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fallo = (msg) => { console.log('  ✘ ' + msg); fallos.push(msg); };
const aviso = (msg) => { console.log('  ! ' + msg); avisos.push(msg); };

// Sheets convierte las celdas de fecha: la API las devuelve como ISO en UTC
// (2026-11-18T23:00Z es el 19/11 a las 00:00 en Madrid). Se compara el día
// local, no la representación.
const aFecha = (v) => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('sv-SE');
};

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

async function sesionREST() {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CONFIG.firebase.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    signal: AbortSignal.timeout(20000)
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('login REST falló: ' + ((j.error && j.error.message) || r.status));
  const nombre = EMAIL.split('@')[0];
  return {
    key: 'firebase:authUser:' + CONFIG.firebase.apiKey + ':[DEFAULT]',
    user: {
      uid: j.localId, email: j.email || EMAIL, emailVerified: true, isAnonymous: false,
      displayName: nombre,
      providerData: [{ providerId: 'password', uid: EMAIL, email: EMAIL, displayName: nombre }],
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

async function montarSitio(page) {
  await page.route(ORIGEN + '/**', async (route) => {
    const url = new URL(route.request().url());
    let rel = decodeURIComponent(url.pathname.replace(PREFIJO, '')).replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    const fichero = path.join(RAIZ, rel);
    if (!fichero.startsWith(RAIZ)) return route.fulfill({ status: 403, body: '403' });
    try {
      const buf = await fs.readFile(fichero);
      return route.fulfill({ status: 200, contentType: TIPOS[path.extname(fichero).toLowerCase()] || 'application/octet-stream', body: buf });
    } catch (e) {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: '404' });
    }
  });
}

async function login(page) {
  await montarSitio(page);
  const sesion = await sesionREST();
  await page.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.setItem('gn_session', '1'); } catch (e) {}
  }, [sesion.key, JSON.stringify(sesion.user)]);
  // Apps Script falla a ratos con las ~15 peticiones simultáneas del arranque.
  // Se desactiva solo esa precarga; páginas, formularios y cierre son reales.
  await page.addInitScript(() => {
    window.__erroresE2E = [];
    window.addEventListener('unhandledrejection', (e) => {
      try { window.__erroresE2E.push((e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)); } catch (x) {}
    });
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof Dashboard !== 'undefined' && typeof Dashboard._startBackgroundLoads === 'function') {
        Dashboard._startBackgroundLoads = async function () {};
      }
    });
  });
  await page.goto(ORIGEN + PREFIJO + 'index.html');
  try {
    await page.waitForSelector('#dashboard-view.active', { timeout: 25000 });
  } catch (err) {
    console.log('  … sesión inyectada rechazada, se usa el formulario');
    await page.waitForSelector('#login-view.active', { timeout: 15000 });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('#login-submit-btn');
    await page.waitForSelector('#dashboard-view.active', { timeout: 25000 });
  }
  await page.waitForFunction(() => typeof Dashboard !== 'undefined' && Dashboard._profileResolved === true, null, { timeout: 30000 });
  // El perfil viaja por Apps Script: si esa petición falla el panel se queda
  // sin rol (consulta). Se reintenta el propio endpoint.
  const rol = await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      try {
        const u = await API.getUserProfile();
        Dashboard.userProfile = u;
        Dashboard.updateUserUI();
        return String((u && u.role) || '').toLowerCase();
      } catch (e) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    return null;
  });
  assert.equal(rol, 'admin', 'no se pudo resolver el rol admin: ' + rol);
}

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

// Precarga las listas necesarias de una en una y deja `_loaded` puesto para que
// las páginas pinten sin volver a pedirlas.
async function precargar(page) {
  const problemas = await page.evaluate(async () => {
    const cargar = async (fn) => {
      for (let i = 0; i < 6; i++) {
        try { const r = await fn(); return r.data || []; } catch (e) { await new Promise((res) => setTimeout(res, 3000)); }
      }
      throw new Error('lista sin cargar');
    };
    const problemas = {};
    for (const [key, fn] of [
      ['animales', () => API.getAnimales()],
      ['familias', () => API.getFamilias()],
      ['acogidas', () => API.getAcogidas()],
      ['contratos', () => API.getContratos()]
    ]) {
      try { Dashboard[key] = await cargar(fn); } catch (e) { problemas[key] = 'falló'; }
    }
    try { Dashboard.grupos = await cargar(() => API.getGrupos()); } catch (e) { Dashboard.grupos = []; }
    ['animales', 'familias', 'acogidas', 'contratos', 'grupos'].forEach((k) => {
      Dashboard._loaded[k] = true;
      Dashboard._cached[k] = true;
      try { Dashboard._cacheSet(k, Dashboard[k] || []); } catch (e) {}
    });
    return problemas;
  });
  assert.deepEqual(problemas, {}, 'no se pudieron precargar listas: ' + JSON.stringify(problemas));
}

async function abrirAcogidasActivas(page) {
  await precargar(page);
  await page.evaluate(() => { App.currentPage = null; App.navigateTo('acogidas-activas'); });
  await page.waitForFunction(() => !!document.querySelector('#page-acogidas-activas select[aria-label="Filtrar casos de acogida"]'), null, { timeout: 30000 });
}

async function irA(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((h) => (location.hash || '').replace('#', '') === h, hash, { timeout: 15000 });
}

async function crearTemporales(page) {
  return page.evaluate(async ({ IDS, NOMBRE_ANIMAL, NOMBRE_FAMILIA, HOY }) => {
    const nota = 'Registro temporal de prueba E2E (se borra al terminar)';
    const fam = await API.createFamilia({
      id: IDS.familia, nombre: NOMBRE_FAMILIA, email: 'e2e@example.test', telefono: '',
      ubicacion: 'Prueba', especialidad: 'Prueba', animales_actuales: 0, max_capacity: 1,
      capacidad: 'Libre', notas: nota
    });
    const ani = await API.createAnimal({
      id: IDS.animal, nombre: NOMBRE_ANIMAL, especie: 'Gato', raza: 'Comun', sexo: 'Hembra',
      edad: '1 ano', estado: 'disponible', notas: nota
    });
    const acg = await API.createAcogida({
      id: IDS.acogida, animal_id: IDS.animal, familia_id: IDS.familia, animal: NOMBRE_ANIMAL,
      familia: NOMBRE_FAMILIA, fase: 'entrega', estado: 'activa', inicio: HOY,
      solicitud_id: '', notas: nota
    });
    // Mismo estado que deja la asignación real desde una candidatura.
    await API.updateAnimal(IDS.animal, { estado: 'en_acogida', acogida_familia: IDS.familia });
    await API.updateFamilia(IDS.familia, { animales_actuales: 1, capacidad: 'Ocupada' });
    return { fam: fam.data && fam.data.id, ani: ani.data && ani.data.id, acg: acg.data && acg.data.id };
  }, { IDS, NOMBRE_ANIMAL, NOMBRE_FAMILIA, HOY });
}

/** Relee una lista hasta que el predicado se cumpla (la red falla a ratos). */
async function leerHasta(page, fn, arg, intentos = 8) {
  let ultimo = null;
  for (let i = 0; i < intentos; i++) {
    ultimo = await page.evaluate(fn, arg).catch((e) => ({ __error: (e && e.message) || String(e) }));
    if (ultimo && !ultimo.__error && ultimo.listo) return ultimo;
    await page.waitForTimeout(3000);
  }
  if (ultimo && ultimo.__error) throw new Error('API: ' + ultimo.__error);
  return ultimo;
}

/* ------------------------------------------------------------------ */
/* Cierre por la interfaz                                              */
/* ------------------------------------------------------------------ */

async function cerrarPorLaInterfaz(page, peticiones) {
  await abrirAcogidasActivas(page);
  const pagina = page.locator('#page-acogidas-activas');
  const tarjeta = pagina.locator('.acogida-card', { hasText: NOMBRE_ANIMAL });
  await tarjeta.waitFor({ timeout: 40000 });
  ok('el caso temporal aparece en «En curso» antes de cerrarse');

  // Actividad no se puede borrar por API: se evita el registro de prueba.
  await page.evaluate(() => { Dashboard._regLog = () => {}; });

  await tarjeta.locator('[data-action="showCerrarAcogidaForm"]').click();
  await page.waitForSelector('#form-modal[style*="flex"]', { timeout: 10000 });
  const cuerpo = page.locator('#form-body');
  await cuerpo.locator('#ac-cerrar-resultado').selectOption('anulada');
  await cuerpo.locator('#ac-cerrar-motivo').fill(MOTIVO);
  await cuerpo.locator('#ac-cerrar-fecha').fill(HOY);
  await cuerpo.locator('button[type="submit"]').click();

  // El estado local se actualiza antes de los POST: es la señal de que la app
  // procesó el formulario con lo que se le pidió.
  await page.waitForFunction((id) => {
    const c = (Dashboard.acogidas || []).find((x) => String(x.id) === String(id));
    return !!(c && c.desenlace === 'anulada' && c.motivo_cierre);
  }, IDS.acogida, { timeout: 30000 });

  const enviado = peticiones.filter((p) => p.endpoint === 'update-acogida').pop();
  assert.ok(enviado, 'la app no envió update-acogida al cerrar');
  assert.equal(enviado.body.fase, 'finalizada');
  assert.equal(enviado.body.estado, 'anulada');
  assert.equal(enviado.body.desenlace, 'anulada');
  assert.equal(enviado.body.motivo_cierre, MOTIVO);
  assert.equal(aFecha(enviado.body.fecha_cierre), HOY);
  assert.equal(aFecha(enviado.body.fin), HOY);
  ok('la app envía fase, estado/desenlace, fin, fecha_cierre y motivo_cierre');

  // Las tres escrituras van en serie y cada una puede tardar ~30 s en Apps
  // Script, así que el formulario tarda en cerrarse.
  const inicioEspera = Date.now();
  let cerrado = false;
  for (let i = 0; i < 60 && !cerrado; i++) {
    cerrado = await page.evaluate(() => {
      const m = document.getElementById('form-modal');
      return !m || m.style.display === 'none' || !m.offsetParent;
    });
    if (!cerrado) {
      await page.waitForTimeout(5000);
      if ((i + 1) % 6 === 0) console.log('    … esperando a que terminen las escrituras (' + Math.round((Date.now() - inicioEspera) / 1000) + 's)');
    }
  }
  if (cerrado) {
    console.log('    cierre completado en ' + Math.round((Date.now() - inicioEspera) / 1000) + 's');
    ok('el cierre desde el modal se completa y el caso sale de «En curso»');
  } else {
    aviso('el modal no se cerró en 5 min: Apps Script dejó una escritura sin responder (API._fetch no tiene timeout)');
    await page.evaluate(() => Dashboard.closeFormModal());
  }
  await page.waitForFunction((n) => {
    const p = document.getElementById('page-acogidas-activas');
    return !!p && ![...p.querySelectorAll('.acogida-card')].some((c) => c.textContent.includes(n));
  }, NOMBRE_ANIMAL, { timeout: 60000 });
}

/* ------------------------------------------------------------------ */
/* Comprobaciones contra la hoja                                       */
/* ------------------------------------------------------------------ */

async function reenviar(page, endpoint, payload) {
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(async ({ endpoint, payload }) => {
      try { return await API[endpoint](payload.id, payload); } catch (e) { return { __error: (e && e.message) || String(e) }; }
    }, { endpoint, payload });
    if (r && !r.__error) return true;
    await page.waitForTimeout(3000);
  }
  return false;
}

async function comprobarFila(page, peticiones) {
  const leer = async () => leerHasta(page, async (id) => {
    const r = await API.getAcogidas();
    const fila = (r.data || []).find((x) => String(x.id) === String(id)) || null;
    return { listo: !!(fila && fila.desenlace), fila };
  }, IDS.acogida);
  let res = await leer();
  if (!res || !res.fila || res.fila.desenlace !== 'anulada') {
    const p = peticiones.filter((x) => x.endpoint === 'update-acogida').pop();
    if (p) {
      aviso('la hoja no reflejaba el cierre; se reenvía el mismo payload que envió la app');
      await reenviar(page, 'updateAcogida', p.body);
      res = await leer();
    }
  }
  const fila = res && res.fila;
  assert.ok(fila, 'la fila de la acogida no existe tras el cierre');
  const campos = {
    fase: fila.fase, estado: fila.estado, desenlace: fila.desenlace,
    fin: fila.fin, fecha_cierre: fila.fecha_cierre, motivo_cierre: fila.motivo_cierre
  };
  console.log('    fila leída de la hoja:', JSON.stringify(campos));
  assert.equal(fila.fase, 'finalizada');
  assert.equal(fila.estado, 'anulada');
  assert.equal(fila.desenlace, 'anulada');
  assert.equal(aFecha(fila.fecha_cierre), HOY);
  assert.equal(aFecha(fila.fin), HOY);
  assert.equal(fila.motivo_cierre, MOTIVO);
  ok('la hoja guarda fase, estado/desenlace, fin, fecha_cierre y motivo_cierre');
}

async function comprobarAnimalYFamilia(page, peticiones) {
  const leer = async () => leerHasta(page, async ({ animal, familia }) => {
    const a = ((await API.getAnimales()).data || []).find((x) => String(x.id) === String(animal));
    const f = ((await API.getFamilias()).data || []).find((x) => String(x.id) === String(familia));
    return {
      listo: !!(a && a.estado === 'disponible' && f && String(f.animales_actuales) === '0'),
      animal: a ? { estado: a.estado, acogida_familia: a.acogida_familia } : null,
      familia: f ? { animales_actuales: f.animales_actuales, capacidad: f.capacidad } : null
    };
  }, { animal: IDS.animal, familia: IDS.familia });
  let res = await leer();
  if (!res || !res.animal || res.animal.estado !== 'disponible') {
    const p = peticiones.filter((x) => x.endpoint === 'update-animal').pop();
    if (p) { aviso('la hoja no reflejaba el alta del animal; se reenvía el payload de la app'); await reenviar(page, 'updateAnimal', p.body); }
    res = await leer();
  }
  if (!res || !res.familia || String(res.familia.animales_actuales) !== '0') {
    const p = peticiones.filter((x) => x.endpoint === 'update-familia').pop();
    if (p) { aviso('la hoja no reflejaba el hueco de la familia; se reenvía el payload de la app'); await reenviar(page, 'updateFamilia', p.body); }
    res = await leer();
  }
  console.log('    animal:', JSON.stringify(res.animal), '· familia:', JSON.stringify(res.familia));
  assert.ok(res.animal, 'el animal temporal no existe');
  assert.equal(res.animal.estado, 'disponible');
  assert.equal(res.animal.acogida_familia, '');
  assert.equal(String(res.familia.animales_actuales), '0');
  assert.equal(res.familia.capacidad, 'Libre');
  ok('el animal vuelve a disponible y la familia recupera el hueco');
}

async function comprobarCerradasYHistorial(page) {
  const pagina = page.locator('#page-acogidas-activas');
  const filtro = pagina.locator('select[aria-label="Filtrar casos de acogida"]');
  await filtro.selectOption('cerradas');
  const tarjeta = pagina.locator('.acogida-card', { hasText: NOMBRE_ANIMAL });
  await tarjeta.waitFor({ timeout: 20000 });
  assert.match(await page.evaluate(() => document.getElementById('page-acogidas-activas').textContent), /Anulada/);
  ok('el caso sale en el filtro «Cerradas» como Anulada');

  await tarjeta.locator('[data-action="viewAcogida"]').click();
  await page.waitForFunction((m) => (document.getElementById('page-acogidas-activas')?.textContent || '').includes(m), MOTIVO, { timeout: 20000 });
  const avisoCaso = await page.evaluate(() => {
    const el = document.querySelector('#page-acogidas-activas .alert-item');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  console.log('    aviso del caso:', avisoCaso);
  ok('la ficha del caso muestra el motivo del cierre');

  await irA(page, 'animales');
  await page.waitForSelector('#page-animales .animal-card', { timeout: 45000 });
  await page.locator(`[data-action="viewAnimal"][data-arg0="${IDS.animal}"]`).first().click();
  await page.waitForFunction(() => (document.querySelector('#page-animales')?.textContent || '').includes('Historial de casos'), null, { timeout: 20000 });
  const fichaAnimal = await page.evaluate(() => document.getElementById('page-animales').textContent);
  assert.match(fichaAnimal, /Anulada/);
  assert.ok(fichaAnimal.includes(MOTIVO), 'el historial del animal no incluye el motivo');
  ok('el historial del animal conserva el caso cerrado y su motivo');

  await irA(page, 'acogidas');
  await page.waitForSelector('#page-acogidas .response-list', { timeout: 45000 });
  await page.locator(`[data-action="viewFosterFamily"][data-arg0="${IDS.familia}"]`).first().click();
  await page.waitForFunction(() => (document.querySelector('#page-acogidas')?.textContent || '').includes('Historial de acogidas'), null, { timeout: 20000 });
  const fichaFamilia = await page.evaluate(() => document.getElementById('page-acogidas').textContent);
  assert.ok(fichaFamilia.includes(MOTIVO), 'el historial de la familia no incluye el motivo');
  ok('el historial de la familia conserva el caso cerrado y su motivo');
}

/* ------------------------------------------------------------------ */
/* Limpieza                                                            */
/* ------------------------------------------------------------------ */

async function borrarConReintentos(page, endpoint, id) {
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(async ({ endpoint, id }) => {
      try { return await API[endpoint](id); } catch (e) { return { __error: (e && e.message) || String(e) }; }
    }, { endpoint, id });
    if (r && !r.__error) return r;
    await page.waitForTimeout(3000);
  }
  return null;
}

async function limpiar(page) {
  const borrados = [];
  for (const [endpoint, id] of [['deleteAcogida', IDS.acogida], ['deleteAnimal', IDS.animal], ['deleteFamilia', IDS.familia]]) {
    const r = await borrarConReintentos(page, endpoint, id);
    borrados.push(endpoint + ':' + id + ' → ' + (r ? 'ok' : 'FALLÓ'));
  }
  console.log('    borrado:', borrados.join(' · '));

  const quedan = await leerHasta(page, async (ids) => {
    const tiene = (lista, id) => (lista || []).some((x) => String(x.id) === String(id));
    return {
      listo: true,
      acogidas: tiene((await API.getAcogidas()).data, ids.acogida),
      animales: tiene((await API.getAnimales()).data, ids.animal),
      familias: tiene((await API.getFamilias()).data, ids.familia)
    };
  }, IDS).catch(() => ({ acogidas: true, animales: true, familias: true }));
  const restos = { acogidas: !!quedan.acogidas, animales: !!quedan.animales, familias: !!quedan.familias };
  if (restos.acogidas || restos.animales || restos.familias) {
    throw new Error('quedaron registros de prueba: ' + JSON.stringify(restos) + ' ' + JSON.stringify(IDS));
  }
  ok('registros temporales borrados (acogida, animal y familia) y sin restos');
}

const conLimite = (p, ms, etiqueta) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout de ' + etiqueta)), ms))
]);

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // Ruido conocido: CSP en <meta> y los CORS intermitentes del propio Apps
  // Script, que la app ya reintenta (se avisa aparte si impide la prueba).
  if (/frame-ancestors|Executing inline event handler|blocked by CORS policy|Failed to load resource|ERR_FAILED/.test(m.text())) return;
  errores.push('console: ' + m.text());
});
// Payload real que manda la app; sirve para verificar sin depender del transporte.
const peticiones = [];
page.on('request', (r) => {
  if (!r.url().startsWith('https://script.google.com') || r.method() !== 'POST') return;
  let endpoint = '';
  try { endpoint = new URL(r.url()).searchParams.get('endpoint') || ''; } catch (e) {}
  let body = null;
  try { body = JSON.parse(r.postData() || '{}'); } catch (e) {}
  peticiones.push({ endpoint, body });
});
let hayRegistros = false;

console.log('\nCierre real de acogida · ids temporales:', JSON.stringify(IDS));
try {
  await login(page);
  hayRegistros = true;
  const creados = await crearTemporales(page);
  assert.deepEqual(creados, { fam: IDS.familia, ani: IDS.animal, acg: IDS.acogida }, 'no se crearon los registros temporales');
  ok('creados familia, animal y caso de acogida temporales');
  await cerrarPorLaInterfaz(page, peticiones);
  await comprobarFila(page, peticiones);
  await comprobarAnimalYFamilia(page, peticiones);
  await comprobarCerradasYHistorial(page);
} catch (err) {
  fallo((err && err.message) || String(err));
  const estado = await page.evaluate(() => ({
    hash: location.hash,
    rol: Dashboard._rolActual(),
    profile: Dashboard.userProfile ? Dashboard.userProfile.role : null,
    pendientes: Dashboard._queueOps ? Dashboard._queueOps().length : null,
    ultimosErrores: (window.__erroresE2E || []).slice(-2)
  })).catch(() => null);
  if (estado) console.log('    ESTADO PÁGINA:', JSON.stringify(estado));
  await page.screenshot({ path: 'e2e-cierre-real-fallo.png', fullPage: true }).catch(() => {});
} finally {
  if (hayRegistros) {
    try {
      await conLimite(limpiar(page), 180000, 'limpieza');
    } catch (err) {
      fallo('limpieza: ' + ((err && err.message) || err));
      console.log('    LIMPIAR A MANO:', JSON.stringify(IDS));
    }
  } else {
    console.log('    (no se creó ningún registro: no hay nada que limpiar)');
  }
  await navegador.close();
}

if (errores.length) console.log('\nErrores de página (no esperados):', errores.slice(0, 4));
if (avisos.length) {
  console.log('\nAvisos del entorno (' + avisos.length + '):');
  avisos.forEach((a) => console.log(' - ' + a));
}
if (fallos.length) {
  console.log('\nFALLOS (' + fallos.length + '):');
  fallos.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('\nTodo en verde.');
