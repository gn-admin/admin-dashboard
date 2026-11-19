/**
 * E2E real: idempotencia de las altas con id generado en el front.
 *
 *   AUDIT_PASSWORD=... node e2e/idempotencia-real.e2e.mjs
 *
 * Envía dos veces el mismo POST de alta (`animales` y `familias`) con el
 * mismo `id`, como haría un reintento tras un fallo de red, y comprueba
 * releyendo la hoja por API que solo hay una fila por id. Si el backend
 * duplicara, el segundo POST habría añadido otra fila.
 *
 * Se llama al Apps Script desplegado directamente desde Node (sin CORS). El
 * alta de familia no envía correos: solo `send-contrato-email` usa MailApp.
 *
 * Al terminar borra los dos registros temporales, aunque la prueba falle.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CONFIG = require('../src/js/config.js');

const PASSWORD = process.env.AUDIT_PASSWORD;
const EMAIL = 'gn.test.admin@example.test';
if (!PASSWORD) {
  console.error('Falta AUDIT_PASSWORD (contraseña de los usuarios de prueba).');
  process.exit(1);
}

const sufijo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ID_ANI = 'ani_e2e_' + sufijo;
const ID_FAM = 'fam_e2e_' + sufijo;
const NOMBRE = 'ZZ E2E Idempotencia ' + sufijo;
const HOY = new Date().toISOString().slice(0, 10);

const ANIMAL = {
  id: ID_ANI, nombre: NOMBRE, especie: 'perro', raza: '', edad: '', sexo: 'hembra',
  estado: 'disponible', descripcion: 'Registro temporal de prueba de idempotencia',
  fecha_ingreso: HOY
};
const FAMILIA = {
  id: ID_FAM, nombre: NOMBRE, email: 'e2e-idempotencia@example.test', telefono: '',
  ubicacion: 'Vigo', especialidad: '', max_capacity: 2, notas: 'Registro temporal de prueba',
  capacidad: 'Libre', animales_actuales: 0
};

const fallos = [];
const ok = (msg) => console.log('  ✔ ' + msg);
const fallo = (msg) => { console.log('  ✘ ' + msg); fallos.push(msg); };

let token = '';

async function sesionREST() {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CONFIG.firebase.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    signal: AbortSignal.timeout(20000)
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('login REST falló: ' + ((j.error && j.error.message) || r.status));
  token = j.idToken;
}

async function pedir(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(45000), ...opts });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('respuesta no válida (HTTP ' + res.status + ')');
  if (data.error) {
    const e = new Error(data.error);
    e.status = data.status || 'error';
    throw e;
  }
  return data;
}

const url = (endpoint, extra = '') =>
  CONFIG.apiUrl + '?endpoint=' + encodeURIComponent(endpoint) + '&token=' + encodeURIComponent(token) + extra;

async function post(endpoint, body) {
  return pedir(url(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
}

async function getLista(endpoint) {
  const data = await pedir(url(endpoint));
  return Array.isArray(data.data) ? data.data : [];
}

const filasDe = (lista, id) => lista.filter((r) => String(r.id) === String(id));

async function borrar(endpoint, id, maximo = 5) {
  // `deleteSheetRow` borra una fila por llamada; se repite por si hubiera
  // duplicados, para no dejar restos de la prueba.
  for (let i = 0; i < maximo; i++) {
    const r = await post(endpoint, { id });
    if (r.success === false) return;
  }
}

async function main() {
  console.log('Idempotencia real de altas · ids ' + ID_ANI + ' / ' + ID_FAM);
  await sesionREST();
  ok('sesión de ' + EMAIL);

  try {
    const a1 = await post('animales', ANIMAL);
    const a2 = await post('animales', ANIMAL);
    assert.equal(String(a1.data.id), ID_ANI);
    assert.equal(String(a2.data.id), ID_ANI);
    ok('dos POST de animal con el mismo id responden con ' + ID_ANI);

    const animales = await getLista('animales');
    const filasAni = filasDe(animales, ID_ANI);
    assert.equal(filasAni.length, 1, 'animales tiene ' + filasAni.length + ' filas con ' + ID_ANI);
    assert.equal(filasAni[0].nombre, NOMBRE);
    ok('animal: una sola fila tras repetir el alta');

    const f1 = await post('familias', FAMILIA);
    const f2 = await post('familias', FAMILIA);
    assert.equal(String(f1.data.id), ID_FAM);
    assert.equal(String(f2.data.id), ID_FAM);
    ok('dos POST de familia con el mismo id responden con ' + ID_FAM);

    const familias = await getLista('familias');
    const filasFam = filasDe(familias, ID_FAM);
    assert.equal(filasFam.length, 1, 'familias tiene ' + filasFam.length + ' filas con ' + ID_FAM);
    assert.equal(filasFam[0].nombre, NOMBRE);
    ok('familia: una sola fila tras repetir el alta');
  } catch (err) {
    fallo(err.message);
  } finally {
    try {
      await borrar('delete-animal', ID_ANI);
      await borrar('delete-familia', ID_FAM);
    } catch (err) {
      fallo('limpieza: ' + err.message);
    }
    try {
      const restosAni = filasDe(await getLista('animales'), ID_ANI).length;
      const restosFam = filasDe(await getLista('familias'), ID_FAM).length;
      if (restosAni === 0 && restosFam === 0) ok('registros temporales borrados');
      else fallo('quedan restos: animales=' + restosAni + ', familias=' + restosFam);
    } catch (err) {
      fallo('no se pudo verificar la limpieza: ' + err.message);
    }
  }

  console.log(fallos.length ? '\n' + fallos.length + ' fallo(s)' : '\nTodo correcto');
  process.exitCode = fallos.length ? 1 : 0;
}

main();
