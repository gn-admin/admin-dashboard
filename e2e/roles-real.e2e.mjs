/**
 * Auditoría Playwright de roles contra el backend real (solo lectura).
 *
 *   AUDIT_PASSWORD=... node e2e/roles-real.e2e.mjs
 *
 * Para cada usuario de prueba (`Roles.gs` → `gn.test.*@example.test`):
 *  1. inicia sesión con su token real de Firebase (el rol lo resuelve el
 *     backend en `user-profile`, no el front),
 *  2. comprueba la matriz de `puedeAccederPagina` contra la política esperada,
 *  3. comprueba que la navegación visible coincide (ni de más ni de menos),
 *  4. abre cada página permitida y verifica que pinta (o su estado vacío) sin
 *     mensajes de permisos ni errores de página,
 *  5. intenta una página vetada y verifica que el router la rechaza,
 *  6. revisa `puedeEditar` para los módulos sensibles.
 *
 * La política esperada es la del backend (`Roles.gs`/`Code.gs`, cubierta por
 * `tests/roles-d1.test.js`): el front no debe ofrecer páginas cuyas listas el
 * rol no puede leer.
 *
 * No escribe nada: solo lecturas (GET). El Apps Script desplegado no acepta
 * CORS desde localhost, así que `src/` se sirve bajo el origen de GitHub Pages
 * interceptando sus peticiones, igual que en `cierre-real.e2e.mjs`.
 *
 * Usuario revocado (`gn.test.revocado@example.test`): si existe en Firebase se
 * comprueba que entra como `sin_acceso` y sin ninguna página; si no existe, se
 * omite con un aviso.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const CONFIG = require('../src/js/config.js');

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
if (!PASSWORD) {
  console.error('Falta AUDIT_PASSWORD (contraseña de los usuarios de prueba).');
  process.exit(1);
}

// Política esperada (la del front en `_paginasPorRol` y la de `Roles.gs`).
const PAGINAS = ['dashboard', 'encuestas', 'encuestas-perros', 'encuestas-gatos', 'encuestas-acogida',
  'animales', 'acogidas', 'acogidas-activas', 'adopciones', 'socios', 'blacklist', 'reportes',
  'actividad', 'redes', 'donaciones', 'almacen', 'web'];

const USUARIOS = [
  {
    email: 'gn.test.admin@example.test', rol: 'admin',
    permitidas: PAGINAS.filter((p) => p !== 'redes'),
    vetadas: [], // admin no tiene páginas vetadas; `redes` está oculta para todos
    edita: { animales: true, acogidas: true, donaciones: true, almacen: true, socios: true },
    noEdita: {}
  },
  {
    email: 'gn.test.coordinador@example.test', rol: 'coordinador',
    permitidas: ['dashboard', 'encuestas', 'encuestas-perros', 'encuestas-gatos', 'encuestas-acogida',
      'animales', 'acogidas', 'acogidas-activas', 'adopciones', 'socios', 'blacklist', 'reportes', 'actividad', 'web'],
    vetadas: ['donaciones', 'almacen'],
    edita: { animales: true, acogidas: true, adopciones: true, socios: true, web: true },
    noEdita: { donaciones: false, almacen: false }
  },
  {
    email: 'gn.test.voluntario@example.test', rol: 'voluntario',
    permitidas: ['dashboard', 'animales', 'reportes', 'actividad'],
    vetadas: ['acogidas-activas', 'adopciones', 'donaciones', 'socios', 'blacklist'],
    edita: { animales: true, reportes: true },
    noEdita: { acogidas: false, adopciones: false, donaciones: false, socios: false }
  },
  {
    email: 'gn.test.tesoreria@example.test', rol: 'tesoreria',
    // Sin «reportes»: necesita estados/acogidas, que el backend le niega.
    permitidas: ['dashboard', 'animales', 'donaciones', 'almacen', 'actividad'],
    vetadas: ['acogidas-activas', 'adopciones', 'socios', 'blacklist', 'web', 'reportes'],
    edita: { donaciones: true, almacen: true },
    noEdita: { animales: false, acogidas: false, adopciones: false, socios: false, reportes: false }
  },
  {
    email: 'gn.test.consulta@example.test', rol: 'consulta',
    permitidas: ['dashboard', 'animales'],
    vetadas: ['acogidas-activas', 'adopciones', 'donaciones', 'socios', 'reportes', 'web'],
    edita: {},
    noEdita: { animales: false, acogidas: false, donaciones: false, socios: false }
  }
];

const REVOCADO = { email: 'gn.test.revocado@example.test', rol: 'sin_acceso' };

const fallos = [];
const avisos = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fallo = (msg) => { console.log('  ✘ ' + msg); fallos.push(msg); };
const aviso = (msg) => { console.log('  ! ' + msg); avisos.push(msg); };

const RUIDO = /frame-ancestors|Executing inline event handler|blocked by CORS policy|Failed to load resource|ERR_FAILED/;

/* ------------------------------------------------------------------ */
/* Sitio local bajo el origen permitido por el backend                 */
/* ------------------------------------------------------------------ */

async function montarSitio(contexto) {
  await contexto.route(ORIGEN + '/**', async (route) => {
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

async function sesionREST(email) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CONFIG.firebase.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    signal: AbortSignal.timeout(20000)
  });
  const j = await r.json();
  if (!j.idToken) return { error: (j.error && j.error.message) || ('HTTP ' + r.status) };
  const nombre = email.split('@')[0];
  return {
    key: 'firebase:authUser:' + CONFIG.firebase.apiKey + ':[DEFAULT]',
    user: {
      uid: j.localId, email: j.email || email, emailVerified: true, isAnonymous: false, displayName: nombre,
      providerData: [{ providerId: 'password', uid: email, email: email, displayName: nombre }],
      stsTokenManager: {
        refreshToken: j.refreshToken, accessToken: j.idToken,
        expirationTime: Date.now() + Number(j.expiresIn || 3600) * 1000
      },
      createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
      apiKey: CONFIG.firebase.apiKey, appName: '[DEFAULT]'
    }
  };
}

/* ------------------------------------------------------------------ */
/* Sesión de un usuario                                                */
/* ------------------------------------------------------------------ */

async function abrirComo(navegador, usuario) {
  const contexto = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 1360, height: 900 } });
  await montarSitio(contexto);
  const page = await contexto.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(0, 3).join(' / ')));
  page.on('console', (m) => { if (m.type() === 'error' && !RUIDO.test(m.text())) errores.push('console: ' + m.text()); });

  const sesion = await sesionREST(usuario.email);
  if (sesion.error) { await contexto.close(); return { error: sesion.error }; }
  await page.addInitScript(({ k, v }) => {
    try { localStorage.setItem(k, v); localStorage.setItem('gn_session', '1'); } catch (e) {}
  }, { k: sesion.key, v: JSON.stringify(sesion.user) });
  // El arranque dispara ~15 peticiones a la vez y el navegador solo abre 6
  // conexiones por host: con Apps Script a 3-7 s por respuesta, las páginas
  // se quedan esperando. La auditoría mide cada página, así que se desactiva
  // la precarga en segundo plano (no cambia permisos ni render).
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof Dashboard !== 'undefined' && typeof Dashboard._startBackgroundLoads === 'function') {
        Dashboard._startBackgroundLoads = async function () {};
      }
    });
  });

  await page.goto(ORIGEN + PREFIJO + 'index.html');
  try {
    await page.waitForSelector('#dashboard-view.active', { timeout: 30000 });
  } catch (e) {
    await contexto.close();
    return { error: 'no se abrió el panel (¿sesión rechazada?)' };
  }
  await page.waitForFunction(() => typeof Dashboard !== 'undefined' && Dashboard._profileResolved === true, null, { timeout: 40000 });
  return { contexto, page, errores };
}

/** Navega a una página y espera a que el panel pinte algo estable. */
async function abrirPagina(page, id) {
  // El router puede devolver a otra página mientras resuelve el perfil: se
  // insiste hasta que el hash se queda donde toca.
  for (let intento = 0; intento < 3; intento++) {
    await page.evaluate((p) => { location.hash = p; }, id);
    const fijado = await page.waitForFunction((p) => (location.hash || '').replace('#', '') === p, id, { timeout: 10000 })
      .then(() => true).catch(() => false);
    if (fijado) break;
    await page.waitForTimeout(1500);
  }
  const listo = (p) => page.waitForFunction((x) => {
    const el = document.getElementById('page-' + x);
    if (!el || !el.classList.contains('active')) return false;
    return !!el.querySelector('.card, .animal-card, .acogida-card, .response-card, .empty-state, .error-state, table, .detail-section, h2');
  }, p, { timeout: 30000 }).then(() => true).catch(() => false);
  let pintada = await listo(id);
  // Apps Script falla a ratos: la pantalla propia ofrece «Reintentar».
  const reintentar = page.locator(`#page-${id} button[data-action="loadPage"]`);
  if ((await reintentar.count().catch(() => 0)) && !pintada) {
    await reintentar.first().click().catch(() => {});
    pintada = await listo(id);
  }
  return page.evaluate((p) => {
    const el = document.getElementById('page-' + p);
    return {
      activa: !!el && el.classList.contains('active'),
      texto: (el ? el.innerText : '').trim(),
      esqueleto: !!el && !!el.querySelector('[class*="skeleton"], .page-skeleton'),
      error: !!el && !!el.querySelector('.error-state, .empty-state')
    };
  }, id);
}

/* ------------------------------------------------------------------ */
/* Comprobaciones por rol                                             */
/* ------------------------------------------------------------------ */

async function auditar(navegador, usuario) {
  console.log('\n· ' + usuario.rol.toUpperCase() + ' (' + usuario.email + ')');
  const ses = await abrirComo(navegador, usuario);
  if (ses.error) { fallo(usuario.rol + ': ' + ses.error); return; }
  const { contexto, page, errores } = ses;
  try {
    const rol = await page.evaluate(() => Dashboard._rolActual());
    assert.equal(rol, usuario.rol, 'rol recibido ' + rol);
    ok('el backend resuelve el rol «' + rol + '»');

    // 1. Matriz de permisos frente a la política esperada.
    const matriz = await page.evaluate((paginas) => {
      const r = {};
      paginas.forEach((p) => { r[p] = !!Dashboard.puedeAccederPagina(p); });
      return r;
    }, PAGINAS);
    const permitidas = PAGINAS.filter((p) => matriz[p]);
    const esperadas = usuario.permitidas.filter((p) => p !== 'redes');
    assert.deepEqual(permitidas.sort(), esperadas.slice().sort(),
      'páginas permitidas: ' + permitidas.join(','));
    ok('permisos de página: ' + permitidas.length + ' permitidas, coincide con la política');

    // 2. Navegación visible = permitidas que existen en el menú. `actividad`
    //    no está en la navegación (se llega desde el panel de inicio).
    const nav = await page.evaluate(() => {
      const sel = '.sidebar-link[data-page], .mas-menu-item[data-page], .bottom-nav-item[data-page]';
      const todas = [...document.querySelectorAll(sel)];
      return {
        enDom: [...new Set(todas.map((l) => l.dataset.page))],
        visibles: [...new Set(todas.filter((l) => l.style.display !== 'none').map((l) => l.dataset.page))]
      };
    });
    const esperadasNav = esperadas.filter((p) => nav.enDom.includes(p));
    assert.deepEqual(nav.visibles.sort(), esperadasNav.slice().sort(), 'menú visible: ' + nav.visibles.join(','));
    assert.ok(!nav.visibles.includes('redes'), 'el menú muestra «redes»');
    const sobrantes = nav.visibles.filter((p) => !permitidas.includes(p));
    assert.deepEqual(sobrantes, [], 'el menú muestra páginas no permitidas: ' + sobrantes.join(','));
    ok('menú lateral/móvil coherente: ' + nav.visibles.length + ' entradas, sin «redes»');

    // 3. Cada página permitida pinta, sin mensajes de permisos.
    for (const p of permitidas) {
      const t0 = Date.now();
      let res = await abrirPagina(page, p);
      if (res.activa && !res.texto && res.esqueleto) {
        // Una petición colgada deja `_loading[key]` sin resolver y la pantalla
        // en el esqueleto. Se recarga (estado limpio) para saber si la página
        // funciona o si el problema persiste por sí solo.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#dashboard-view.active', { timeout: 30000 }).catch(() => {});
        await page.waitForFunction(() => typeof Dashboard !== 'undefined' && Dashboard._profileResolved === true, null, { timeout: 40000 }).catch(() => {});
        res = await abrirPagina(page, p);
        if (res.texto) aviso(usuario.rol + ' · ' + p + ': la primera carga se queda colgada; tras recargar pinta');
      }
      const seg = Math.round((Date.now() - t0) / 1000);
      if (!res.activa) { fallo(usuario.rol + ' · ' + p + ': la página no queda activa'); continue; }
      if (/Sin acceso autorizado|Sin permisos|No tienes permiso/i.test(res.texto)) {
        fallo(usuario.rol + ' · ' + p + ': muestra un aviso de permisos');
        continue;
      }
      if (!res.texto) {
        const que = res.esqueleto ? 'solo el esqueleto (carga sin terminar)' : (res.error ? 'estado de error vacío' : 'en blanco');
        fallo(usuario.rol + ' · ' + p + ': ' + que + ' también tras recargar');
        continue;
      }
      ok(p + ' pinta (' + seg + 's)');
    }

    // 4. Una página vetada por rol: el router la rechaza.
    for (const p of usuario.vetadas.slice(0, 2)) {
      await page.evaluate((x) => { location.hash = x; }, p);
      await page.waitForTimeout(1200);
      const estado = await page.evaluate((x) => ({
        hash: (location.hash || '').replace('#', ''),
        activa: !!document.querySelector('#page-' + x + '.active')
      }), p);
      if (estado.activa || estado.hash === p) fallo(usuario.rol + ': pudo entrar en ' + p + ' (hash ' + estado.hash + ')');
      else ok('«' + p + '» vetada: el router la rechaza (queda en «' + estado.hash + '»)');
    }

    // 5. Permisos de edición de los módulos sensibles.
    const edicion = await page.evaluate((mods) => {
      const r = {};
      mods.forEach((m) => { r[m] = !!Dashboard.puedeEditar(m); });
      return r;
    }, Object.keys({ ...usuario.edita, ...usuario.noEdita }));
    for (const [m, esperado] of Object.entries({ ...usuario.edita, ...usuario.noEdita })) {
      if (edicion[m] !== esperado) fallo(usuario.rol + ' · puedeEditar(' + m + ') = ' + edicion[m] + ', se esperaba ' + esperado);
    }
    if (!Object.entries({ ...usuario.edita, ...usuario.noEdita }).some(([m, v]) => edicion[m] !== v)) {
      ok('edición coherente (' + Object.keys(edicion).map((m) => m + ':' + (edicion[m] ? 'sí' : 'no')).join(', ') + ')');
    }

    if (errores.length) fallo(usuario.rol + ': errores de página → ' + errores.slice(0, 3).join(' | '));
    else ok('sin errores de página ni de consola propios');
  } catch (err) {
    fallo(usuario.rol + ': ' + ((err && err.message) || err));
  } finally {
    await contexto.close().catch(() => {});
  }
}

async function auditarRevocado(navegador) {
  console.log('\n· REVOCADO (' + REVOCADO.email + ')');
  const ses = await abrirComo(navegador, REVOCADO);
  if (ses.error) {
    aviso('usuario revocado: no se pudo iniciar sesión (' + ses.error + '); no existe en Firebase, se omite');
    return;
  }
  const { contexto, page } = ses;
  try {
    const estado = await page.evaluate(() => ({
      rol: Dashboard._rolActual(),
      permitidas: ['dashboard', 'animales', 'acogidas-activas', 'donaciones']
        .filter((p) => Dashboard.puedeAccederPagina(p)),
      nav: [...document.querySelectorAll('.sidebar-link[data-page], .mas-menu-item[data-page], .bottom-nav-item[data-page]')]
        .filter((l) => l.style.display !== 'none').length,
      texto: (document.getElementById('dashboard-view').innerText || '').replace(/\s+/g, ' ').slice(0, 200)
    }));
    assert.equal(estado.rol, 'sin_acceso', 'rol recibido: ' + estado.rol);
    assert.equal(estado.permitidas.length, 0, 'páginas permitidas: ' + estado.permitidas.join(','));
    assert.equal(estado.nav, 0, 'entradas de menú visibles: ' + estado.nav);
    if (!/sin acceso|sin permisos|no tienes acceso/i.test(estado.texto)) {
      aviso('sin_acceso entra al panel con: «' + estado.texto + '»');
    }
    ok('acceso revocado: sin rol útil, sin menú y sin páginas');
  } catch (err) {
    fallo('revocado: ' + ((err && err.message) || err));
  } finally {
    await contexto.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */

const SOLO = String(process.env.AUDIT_ROL || '').toLowerCase();
const aAuditar = SOLO ? USUARIOS.filter((u) => u.rol === SOLO) : USUARIOS;
if (!aAuditar.length) {
  console.error('AUDIT_ROL no coincide con ningún rol: ' + USUARIOS.map((u) => u.rol).join(', '));
  process.exit(1);
}

const navegador = await chromium.launch();
console.log('Auditoría de roles contra el backend real (' + aAuditar.length + ' usuario(s) de prueba)');
try {
  for (const u of aAuditar) await auditar(navegador, u);
  if (!SOLO) await auditarRevocado(navegador);
} finally {
  await navegador.close();
}

if (avisos.length) {
  console.log('\nAvisos (' + avisos.length + '):');
  avisos.forEach((a) => console.log(' - ' + a));
}
if (fallos.length) {
  console.log('\nFALLOS (' + fallos.length + '):');
  fallos.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('\nTodo en verde: ' + aAuditar.length + ' rol(es) funcionan según la política.');
