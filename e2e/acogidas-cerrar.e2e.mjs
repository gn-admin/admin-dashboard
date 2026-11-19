/**
 * E2E (Playwright) del cambio «cerrar, no borrar» en acogidas.
 *
 *   node e2e/acogidas-cerrar.e2e.mjs          # flujo completo con API simulada
 *   MOCK=0 node e2e/acogidas-cerrar.e2e.mjs   # solo lectura contra el backend real
 *
 * Credenciales por variables de entorno (nunca en el repo):
 *   AUDIT_PASSWORD   contraseña de los usuarios de prueba
 *   AUDIT_BASE_URL   servidor local (por defecto http://localhost:8080)
 *
 * Con MOCK activo se interceptan las llamadas a Apps Script y se usa un
 * conjunto de datos en memoria: se ejerce el flujo real de UI (login Firebase,
 * listado, filtro, modal, guardado) sin escribir en la hoja de producción y
 * sin enviar ningún correo.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:8080';
const PASSWORD = process.env.AUDIT_PASSWORD;
const MOCK = process.env.MOCK !== '0';

if (!PASSWORD) {
  console.error('Falta AUDIT_PASSWORD (contraseña de los usuarios de prueba).');
  process.exit(1);
}

const ROLES = {
  'gn.test.admin@example.test': 'admin',
  'gn.test.coordinador@example.test': 'coordinador',
  'gn.test.voluntario@example.test': 'voluntario',
  'gn.test.tesoreria@example.test': 'tesoreria',
  'gn.test.consulta@example.test': 'consulta'
};

const pendientes = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fallo = (msg) => { console.log('  ✘ ' + msg); pendientes.push(msg); };

function datosSemilla() {
  return {
    animales: [
      { id: 'a1', nombre: 'Luna Prueba', especie: 'Gato', raza: 'Comun', sexo: 'Hembra', estado: 'en_acogida', acogida_familia: 'f1', edad: '2 anos' },
      { id: 'a2', nombre: 'Toby Prueba', especie: 'Perro', raza: 'Mestizo', sexo: 'Macho', estado: 'en_acogida', acogida_familia: 'f2', edad: '4 anos' }
    ],
    familias: [
      { id: 'f1', nombre: 'Familia Prueba Uno', email: 'familia1@example.test', especialidad: 'Gatos', ubicacion: 'Logrono', animales_actuales: '1', max_capacity: '1', capacidad: 'Ocupada' },
      { id: 'f2', nombre: 'Familia Prueba Dos', email: 'familia2@example.test', especialidad: 'Perros', ubicacion: 'Logrono', animales_actuales: '1', max_capacity: '2', capacidad: 'Libre' }
    ],
    acogidas: [
      { id: 'c1', animal_id: 'a1', animal: 'Luna Prueba', familia_id: 'f1', familia: 'Familia Prueba Uno', fase: 'en_casa', estado: 'activa', inicio: '2026-10-01', notas: '' },
      { id: 'c2', animal_id: 'a2', animal: 'Toby Prueba', familia_id: 'f2', familia: 'Familia Prueba Dos', fase: 'entrega', estado: 'activa', inicio: '2026-11-10', notas: '' },
      { id: 'c3', animal_id: 'a1', animal: 'Luna Prueba', familia_id: 'f2', familia: 'Familia Prueba Dos', fase: 'finalizada', estado: 'finalizada', desenlace: 'finalizada', inicio: '2026-01-05', fin: '2026-03-05', fecha_cierre: '2026-03-05', motivo_cierre: 'Periodo acordado cumplido' }
    ],
    contratos: [], adopciones: [], candidaturas: [], socios: [], blacklist: [], actividad: [],
    gastos: [], recordatorios: [], donaciones: [], seguimientos: [], documentos: [],
    inventario: [], grupos: [], apadrinamientos: [], 'historial-fases-adopcion': []
  };
}

async function montarMock(page, estado) {
  await page.route('https://script.google.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const endpoint = url.searchParams.get('endpoint') || '';
    const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });

    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      estado.peticiones.push({ endpoint, body });
      for (const [ep, lista] of [['update-acogida', 'acogidas'], ['update-animal', 'animales'], ['update-familia', 'familias'], ['update-adopcion', 'adopciones']]) {
        if (endpoint === ep) {
          const fila = estado.datos[lista].find((x) => x.id === body.id);
          if (fila) Object.assign(fila, body);
          return json({ status: 'success', data: fila || body });
        }
      }
      return json({ status: 'success', data: body, ok: true });
    }

    if (endpoint === 'user-profile') {
      return json({ status: 'success', email: estado.email, role: estado.role, name: 'Test ' + estado.role });
    }
    if (endpoint === 'estados' || endpoint === 'notas') return json({ status: 'success', data: {} });
    if (Object.prototype.hasOwnProperty.call(estado.datos, endpoint)) return json({ status: 'success', data: estado.datos[endpoint] });
    return json({ status: 'success', data: [] });
  });
}

async function login(page, email) {
  for (let intento = 1; intento <= 2; intento++) {
    await page.goto(BASE + '/');
    await page.waitForSelector('#login-view.active', { timeout: 20000 });
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('#login-submit-btn');
    try {
      await page.waitForSelector('#dashboard-view.active', { timeout: 25000 });
      await page.waitForFunction(() => typeof Dashboard !== 'undefined' && Dashboard._profileResolved === true, null, { timeout: 30000 });
      return;
    } catch (err) {
      const msg = await page.locator('#login-error').textContent().catch(() => '');
      if (intento === 2) throw new Error('login falló para ' + email + (msg ? ': ' + msg.trim() : ''));
      console.log('  … login reintentado (' + (msg || 'sin mensaje').trim() + ')');
      await page.waitForTimeout(8000);
    }
  }
}

async function irA(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((h) => (location.hash || '').replace('#', '') === h, hash, { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function flujoCompleto(page, estado) {
  console.log('\n[1] Admin · cerrar acogida sin borrar (API simulada)');
  estado.email = 'gn.test.admin@example.test';
  estado.role = 'admin';
  await login(page, estado.email);

  await irA(page, 'acogidas-activas');
  const pagina = page.locator('#page-acogidas-activas');
  const filtro = pagina.locator('select[aria-label="Filtrar casos de acogida"]');
  await filtro.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#page-acogidas-activas .acogida-card').length === 2, null, { timeout: 20000 });
  ok('el listado carga solo los casos en curso (2)');
  assert.match(await filtro.locator('option[value="abiertas"]').innerText(), /En curso \(2\)/);
  assert.match(await filtro.locator('option[value="cerradas"]').innerText(), /Cerradas \(1\)/);
  assert.match(await filtro.locator('option[value="todas"]').innerText(), /Todas \(3\)/);
  ok('el filtro cuenta en curso / cerradas / todas');

  assert.equal(await pagina.locator('[data-action="deleteAcogida"]').count(), 0);
  assert.equal(await pagina.locator('.btn-danger').count(), 0);
  ok('las tarjetas ya no ofrecen eliminar el caso');

  const tarjeta = pagina.locator('.acogida-card', { hasText: 'Luna Prueba' });
  assert.equal(await tarjeta.locator('[data-action="showCerrarAcogidaForm"]').count(), 1);
  assert.equal(await tarjeta.locator('[data-action="avanzarFaseAcogida"]').count(), 0);
  ok('un caso en casa ofrece «Cerrar acogida» y no «Finalizar» directo');

  await tarjeta.locator('[data-action="showCerrarAcogidaForm"]').click();
  await page.waitForSelector('#form-modal[style*="flex"]', { timeout: 10000 });
  const cuerpo = page.locator('#form-body');
  assert.match(await cuerpo.innerText(), /no se elimina/i);
  ok('el modal avisa de que el caso no se elimina');

  await cuerpo.locator('#ac-cerrar-resultado').selectOption('anulada');
  await cuerpo.locator('#ac-cerrar-motivo').fill('');
  await cuerpo.locator('button[type="submit"]').click();
  await page.waitForFunction(() => (document.getElementById('error-message') || {}).textContent?.includes('motivo'), null, { timeout: 10000 });
  assert.equal(estado.peticiones.filter((p) => p.endpoint === 'update-acogida').length, 0);
  ok('anular sin motivo se rechaza y no llama al backend');

  await cuerpo.locator('#ac-cerrar-motivo').fill('Cambio de circunstancias de la familia');
  await cuerpo.locator('#ac-cerrar-fecha').fill('2026-11-19');
  await cuerpo.locator('button[type="submit"]').click();
  await page.waitForSelector('#form-modal', { state: 'hidden', timeout: 20000 });

  const cierre = estado.peticiones.find((p) => p.endpoint === 'update-acogida' && p.body.id === 'c1');
  assert.ok(cierre, 'no se envió update-acogida');
  assert.equal(cierre.body.fase, 'finalizada');
  assert.equal(cierre.body.estado, 'anulada');
  assert.equal(cierre.body.desenlace, 'anulada');
  assert.equal(cierre.body.motivo_cierre, 'Cambio de circunstancias de la familia');
  assert.equal(cierre.body.fin, '2026-11-19');
  assert.equal(cierre.body.fecha_cierre, '2026-11-19');
  ok('el cierre persiste resultado, fecha y motivo en la fila (sin borrarla)');

  const bajaAnimal = estado.peticiones.find((p) => p.endpoint === 'update-animal' && p.body.id === 'a1');
  assert.ok(bajaAnimal, 'el animal no volvió a disponible');
  assert.equal(bajaAnimal.body.estado, 'disponible');
  assert.equal(bajaAnimal.body.acogida_familia, '');
  const bajaFamilia = estado.peticiones.find((p) => p.endpoint === 'update-familia' && p.body.id === 'f1');
  assert.ok(bajaFamilia, 'la familia no liberó el hueco');
  assert.equal(String(bajaFamilia.body.animales_actuales), '0');
  assert.equal(bajaFamilia.body.capacidad, 'Libre');
  ok('el animal vuelve a disponible y la familia recupera el hueco');

  assert.equal(estado.peticiones.filter((p) => /delete-(acogida|contrato|animal|familia)/.test(p.endpoint)).length, 0);
  ok('ningún cierre dispara un borrado');

  await page.waitForFunction(() => document.querySelectorAll('#page-acogidas-activas .acogida-card').length === 1, null, { timeout: 20000 });
  assert.match(await filtro.locator('option[value="cerradas"]').innerText(), /Cerradas \(2\)/);
  ok('el caso anulado sale de «En curso» y pasa a «Cerradas»');

  await filtro.selectOption('cerradas');
  await page.waitForFunction(() => document.querySelectorAll('#page-acogidas-activas .acogida-card').length === 2, null, { timeout: 15000 });
  const textoCerradas = await pagina.locator('.response-list').innerText();
  assert.match(textoCerradas, /Anulada/);
  assert.match(textoCerradas, /hasta 2026\/11\/19/);
  ok('el filtro «Cerradas» conserva el caso anulado con su fecha de fin');

  const tarjetaCerrada = pagina.locator('.acogida-card', { hasText: 'Familia Prueba Uno' });
  assert.equal(await tarjetaCerrada.locator('[data-action="showCerrarAcogidaForm"], [data-action="avanzarFaseAcogida"]').count(), 0);
  ok('un caso cerrado no admite más cambios de fase ni de cierre');

  await tarjetaCerrada.locator('[data-action="viewAcogida"]').click();
  await page.waitForFunction(() => (document.querySelector('#page-acogidas-activas')?.innerText || '').includes('Cambio de circunstancias de la familia'), null, { timeout: 15000 });
  assert.match(await pagina.innerText(), /Acogida anulada/);
  ok('la ficha del caso anulado muestra el resultado y el motivo');

  console.log('\n[2] Historial en las fichas de animal y familia');
  await irA(page, 'animales');
  await page.waitForSelector('#page-animales .animal-grid', { timeout: 20000 });
  await page.locator('[data-action="viewAnimal"][data-arg0="a1"]').first().click();
  await page.waitForFunction(() => (document.querySelector('#page-animales')?.textContent || '').includes('Historial de casos'), null, { timeout: 15000 });
  const fichaAnimal = await page.evaluate(() => document.getElementById('page-animales').textContent);
  assert.match(fichaAnimal, /Acogida · Familia Prueba Uno/);
  assert.match(fichaAnimal, /Cambio de circunstancias de la familia/);
  assert.match(fichaAnimal, /Anulada/);
  ok('la ficha del animal muestra el historial de acogidas con el motivo');

  await irA(page, 'acogidas');
  await page.waitForSelector('#page-acogidas .response-list', { timeout: 20000 });
  await page.locator('[data-action="viewFosterFamily"][data-arg0="f1"]').first().click();
  await page.waitForFunction(() => (document.querySelector('#page-acogidas')?.textContent || '').includes('Historial de acogidas'), null, { timeout: 15000 });
  const fichaFamilia = await page.evaluate(() => document.getElementById('page-acogidas').textContent);
  assert.match(fichaFamilia, /Historial de acogidas/);
  assert.match(fichaFamilia, /Cambio de circunstancias de la familia/);
  assert.doesNotMatch(fichaFamilia, /Casos activos/);
  ok('la ficha de la familia separa casos activos e historial');
}

async function rolConsulta(page, estado) {
  console.log('\n[3] Consulta · sin acciones de cierre (API simulada)');
  await page.evaluate(() => App && Auth && Auth.logout());
  await page.waitForSelector('#login-view.active', { timeout: 20000 });
  estado.email = 'gn.test.consulta@example.test';
  estado.role = 'consulta';
  await login(page, estado.email);

  await page.evaluate(() => { location.hash = 'acogidas-activas'; });
  await page.waitForFunction(() => (location.hash || '').replace('#', '') !== 'acogidas-activas', null, { timeout: 15000 });
  assert.equal(await page.locator('#page-acogidas-activas').innerText(), '');
  assert.match(await page.evaluate(() => location.hash), /#(dashboard|animales)/);
  ok('consulta no puede entrar en Acogidas activas y vuelve a una página permitida');
}

async function backendReal(page) {
  console.log('\n[4] Solo lectura contra el backend real');
  const RUIDO_CONOCIDO = [/frame-ancestors/, /Executing inline event handler violates/];
  const errores = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (RUIDO_CONOCIDO.some((rx) => rx.test(m.text()))) return;
    errores.push(m.text());
  });
  await login(page, 'gn.test.admin@example.test');

  const rol = await page.evaluate(() => Dashboard._rolActual());
  ok('login real con usuario de prueba; rol recibido: ' + rol);
  assert.notEqual(rol, 'sin_acceso');

  await irA(page, 'acogidas-activas');
  const pagina = page.locator('#page-acogidas-activas');
  await pagina.locator('select[aria-label="Filtrar casos de acogida"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => {
    const p = document.getElementById('page-acogidas-activas');
    return !!p && (p.querySelectorAll('.acogida-card').length > 0 || p.querySelector('.empty-state'));
  }, null, { timeout: 30000 });
  const tarjetas = await pagina.locator('.acogida-card').count();
  const texto = await pagina.innerText();
  assert.doesNotMatch(texto, /Sin acceso autorizado|Sin permisos/);
  assert.equal(await pagina.locator('[data-action="deleteAcogida"]').count(), 0);
  ok('el listado real pinta ' + tarjetas + ' tarjeta(s) y el filtro En curso / Cerradas / Todas');
  assert.match(await pagina.locator('select[aria-label="Filtrar casos de acogida"]').innerText(), /Cerradas/);

  await irA(page, 'animales');
  await page.waitForFunction(() => {
    const p = document.getElementById('page-animales');
    return !!p && (p.querySelectorAll('.animal-card').length > 0 || p.querySelector('.empty-state'));
  }, null, { timeout: 30000 });
  ok('la pantalla de animales carga con datos reales');

  // Ninguna interacción de este bloque escribe: solo lecturas.
  if (errores.length) fallo('errores de consola: ' + errores.slice(0, 3).join(' | '));
  else ok('sin errores de consola propios');
}

async function rolesReales(page) {
  console.log('\n[5] Roles reales (solo lectura)');
  const esperado = {
    'gn.test.admin@example.test': { rol: 'admin', paginas: ['acogidas-activas', 'donaciones', 'web'] },
    'gn.test.coordinador@example.test': { rol: 'coordinador', paginas: ['acogidas-activas', 'adopciones', 'web'], vetadas: ['donaciones', 'almacen'] },
    'gn.test.voluntario@example.test': { rol: 'voluntario', paginas: ['animales'], vetadas: ['acogidas-activas', 'adopciones', 'donaciones'] },
    'gn.test.tesoreria@example.test': { rol: 'tesoreria', paginas: ['donaciones', 'almacen'], vetadas: ['acogidas-activas', 'adopciones'] },
    'gn.test.consulta@example.test': { rol: 'consulta', paginas: ['animales'], vetadas: ['acogidas-activas', 'adopciones', 'donaciones', 'socios'] }
  };
  for (const [email, exp] of Object.entries(esperado)) {
    try {
      if (email !== 'gn.test.admin@example.test') {
        await page.evaluate(() => Auth.logout());
        await page.waitForSelector('#login-view.active', { timeout: 20000 });
        await login(page, email);
      }
      const rol = await page.evaluate(() => Dashboard._rolActual());
      assert.equal(rol, exp.rol, email + ' recibió rol ' + rol);
      const visibles = await page.evaluate(() => [...document.querySelectorAll('.sidebar-link[data-page]')]
        .filter((l) => l.style.display !== 'none').map((l) => l.dataset.page));
      for (const p of exp.paginas) assert.ok(visibles.includes(p), email + ' no ve ' + p);
      for (const p of exp.vetadas || []) assert.ok(!visibles.includes(p), email + ' ve ' + p + ' y no debería');
      ok(exp.rol + ': navegación coherente (' + visibles.length + ' páginas)');
    } catch (err) {
      fallo(exp.rol + ': ' + ((err && err.message) || err));
    }
  }
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();
const erroresConsola = [];
page.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text()); });
page.on('pageerror', (e) => erroresConsola.push('pageerror: ' + e.message));

try {
  if (MOCK) {
    const estado = { email: '', role: 'admin', datos: datosSemilla(), peticiones: [] };
    await montarMock(page, estado);
    await flujoCompleto(page, estado);
    await rolConsulta(page, estado);
  } else {
    await backendReal(page);
    await rolesReales(page);
  }
} catch (err) {
  fallo((err && err.message) || String(err));
  if (erroresConsola.length) console.log('Consola:', erroresConsola.slice(-6));
  const textoFallo = await page.evaluate(() => (document.getElementById('page-animales') || {}).textContent || '').catch(() => '');
  if (textoFallo) console.log('Texto animales (500):', textoFallo.slice(0, 500));
  await page.screenshot({ path: 'e2e-fallo.png', fullPage: true }).catch(() => {});
} finally {
  await navegador.close();
}

if (pendientes.length) {
  console.log('\nFALLOS (' + pendientes.length + '):');
  pendientes.forEach((p) => console.log(' - ' + p));
  process.exit(1);
}
console.log('\nTodo en verde.');
