#!/usr/bin/env node
/**
 * Normaliza la galería del panel en la hoja «Documentos».
 *
 * Las fichas de animal se pintan desde las filas `tipo: 'galeria-foto'`. Las
 * antiguas guardaban en `url` el enlace del visor de Drive
 * (`https://drive.google.com/file/d/ID/view…`), que no carga en el `<img>` del
 * carrusel. Este script reescribe SOLO la columna `url` de esas filas con el
 * thumbnail de Drive (`thumbnail?id=ID&sz=w1600`) que usa ya el panel al
 * guardar. No sube nada, no duplica archivos en Drive y no toca otras columnas:
 * `update-documento` actualiza la fila por `id` campo a campo.
 *
 * Uso:
 *   node scripts/normalizar-galeria.mjs             # dry-run: cuenta y lista
 *   node scripts/normalizar-galeria.mjs --aplicar   # reescribe las filas
 *
 * Credenciales (nunca por argumento; entorno o `.env`):
 *   GN_API    URL /exec del despliegue. Si falta, API_URL del .env.
 *   GN_TOKEN  Token de Firebase de un administrador. Si falta, se pide con
 *             GN_ADMIN_EMAIL + GN_ADMIN_PASS y la apiKey de Firebase.
 *
 * Códigos de salida: 0 todo correcto · 1 uso/configuración · 2 error del backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pedirConReintento } from './reset-datos.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const TAMANO = 'w1600';

function leerEnv() {
  const ruta = path.join(RAIZ, '.env');
  const out = {};
  if (!fs.existsSync(ruta)) return out;
  for (let linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    linea = linea.trim();
    if (!linea || linea.startsWith('#')) continue;
    const i = linea.indexOf('=');
    if (i === -1) continue;
    const clave = linea.slice(0, i).trim();
    let valor = linea.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    out[clave] = valor;
  }
  return out;
}

const env = leerEnv();
const API = String(process.env.GN_API || env.GN_API || env.API_URL || '').trim().replace(/\/+$/, '');
let TOKEN = String(process.env.GN_TOKEN || env.GN_TOKEN || '').trim();

function apiKeyFirebase() {
  if (env.FIREBASE_API_KEY) return env.FIREBASE_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'js', 'config.js'), 'utf8')
      .replace(/^\s*const CONFIG\s*=\s*/, '').replace(/;\s*$/, ''));
    return (cfg.firebase && cfg.firebase.apiKey) || '';
  } catch (e) {
    return '';
  }
}

function puedeRenovarToken() {
  return !!((process.env.GN_ADMIN_EMAIL || env.GN_ADMIN_EMAIL) && (process.env.GN_ADMIN_PASS || env.GN_ADMIN_PASS) && apiKeyFirebase());
}

async function renovarToken() {
  const email = String(process.env.GN_ADMIN_EMAIL || env.GN_ADMIN_EMAIL || '').trim();
  const pass = String(process.env.GN_ADMIN_PASS || env.GN_ADMIN_PASS || '');
  if (!puedeRenovarToken()) return false;
  TOKEN = '';
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKeyFirebase()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass, returnSecureToken: true })
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* respuesta no JSON */ }
  if (!r.ok || !j || !j.idToken) {
    throw new Error('Login fallido (' + r.status + '): ' + ((j && j.error && j.error.message) || 'sin detalle'));
  }
  TOKEN = j.idToken;
  return true;
}

function pedir(ep, opciones) {
  return pedirConReintento(ep, opciones, {
    api: API,
    getToken: () => TOKEN,
    renovarToken: puedeRenovarToken() ? renovarToken : null
  });
}

// ---------------------------- lógica pura ----------------------------

/** Thumbnail de un fichero de Drive a partir de su id. */
export function thumbnailDrive(id, sz = TAMANO) {
  const limpio = String(id || '').trim();
  return limpio ? 'https://drive.google.com/thumbnail?id=' + limpio + '&sz=' + sz : '';
}

/** Id de Drive de una referencia: `file_id` o el que lleve la propia URL. */
export function idDrive(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) return raw;
  if (!/^https?:\/\/(?:drive|docs)\.google\.com\//i.test(raw)) return '';
  const m = raw.match(/[?&]id=([A-Za-z0-9_-]+)/) || raw.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

/**
 * Qué filas hay que reescribir. Solo mira `galeria-foto`: las fotos de la
 * galería del panel. Una fila ya servida con thumbnail del mismo fichero no se
 * toca (se pinta igual), y una fila sin id de Drive se deja como está y se
 * devuelve aparte para avisar.
 */
export function planificarNormalizacion(documentos) {
  const filas = (Array.isArray(documentos) ? documentos : []).filter(d =>
    String((d && d.tipo) || '').trim().toLowerCase() === 'galeria-foto'
  );
  const cambios = [];
  const sinId = [];
  let yaNormalizadas = 0;

  for (const fila of filas) {
    const actual = String(fila.url || '').trim();
    // El file_id de la fila ya es un id de Drive: vale tal cual, sin heurísticas.
    const id = String(fila.file_id || '').trim() || idDrive(actual);
    if (!id) { sinId.push(fila); continue; }
    const esperada = thumbnailDrive(id, TAMANO);
    if (/^https?:\/\/drive\.google\.com\/thumbnail\?/i.test(actual) && idDrive(actual) === id) {
      yaNormalizadas++;
      continue;
    }
    cambios.push({ id: fila.id, animal: fila.animal || '', file_id: id, antes: actual, despues: esperada });
  }
  return { total: filas.length, filas, cambios, sinId, yaNormalizadas };
}

// ---------------------------- ejecución ----------------------------

async function main() {
  const args = process.argv.slice(2);
  const desconocidos = args.filter(a => a !== '--aplicar' && a !== '--dry-run');
  if (desconocidos.length) {
    console.error('Argumento no reconocido: ' + desconocidos.join(', '));
    console.error('Uso: node scripts/normalizar-galeria.mjs [--aplicar]');
    process.exit(1);
  }
  if (!API) {
    console.error('Falta GN_API (o API_URL en .env).');
    process.exit(1);
  }
  const aplicar = args.includes('--aplicar');
  if (!TOKEN && !puedeRenovarToken()) {
    console.error('Falta GN_TOKEN (o GN_ADMIN_EMAIL + GN_ADMIN_PASS con la apiKey de Firebase).');
    process.exit(1);
  }

  try {
    if (!TOKEN) await renovarToken();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const documentos = await pedir('documentos');
  const plan = planificarNormalizacion(Array.isArray(documentos) ? documentos : []);
  const total = (Array.isArray(documentos) ? documentos : []).length;

  // Forma de las URLs guardadas, para saber qué había antes de tocar nada.
  const formas = { thumbnail: 0, visor: 0, vacia: 0, otra: 0 };
  plan.filas.forEach(d => {
    const u = String(d.url || '').trim();
    if (!u) formas.vacia++;
    else if (/^https?:\/\/drive\.google\.com\/thumbnail\?/i.test(u)) formas.thumbnail++;
    else if (idDrive(u)) formas.visor++;
    else formas.otra++;
  });

  console.log('\nDocumentos: ' + total + ' filas · galeria-foto: ' + plan.total);
  console.log('  urls actuales: ' + formas.thumbnail + ' thumbnail · ' + formas.visor + ' visor · ' + formas.vacia + ' vacías · ' + formas.otra + ' otras');
  console.log('  ya con thumbnail: ' + plan.yaNormalizadas);
  console.log('  a normalizar:      ' + plan.cambios.length);
  if (plan.sinId.length) console.log('  sin id de Drive:   ' + plan.sinId.length + ' (se dejan como están)');
  plan.cambios.slice(0, 5).forEach(c => console.log('  · ' + c.id + '  ' + (c.antes || '(vacío)') + ' → ' + c.despues));

  if (!aplicar) {
    console.log('\nDRY-RUN: no se ha escrito nada. Ejecuta con --aplicar para normalizar.');
    return;
  }
  if (!plan.cambios.length) {
    console.log('\nNada que normalizar.');
    return;
  }

  console.log('\nAPLICANDO en ' + API);
  let cambiadas = 0;
  const fallos = [];
  for (const c of plan.cambios) {
    try {
      if (!c.id) throw new Error('fila sin id');
      await pedir('update-documento', { method: 'POST', body: { id: c.id, url: c.despues } });
      cambiadas++;
      if (cambiadas % 10 === 0) console.log('  ' + cambiadas + ' de ' + plan.cambios.length + '...');
    } catch (e) {
      fallos.push({ fila: c, error: e && e.message ? e.message : String(e) });
    }
  }

  console.log('\nCambiadas ' + cambiadas + ' de ' + plan.cambios.length + ' filas.');
  if (fallos.length) {
    fallos.forEach(f => console.error('  ERROR ' + f.fila.id + ': ' + f.error));
  }

  // Verificación: se vuelve a leer la hoja y no debe quedar ninguna pendiente.
  const despues = planificarNormalizacion(await pedir('documentos'));
  console.log('Verificación: ' + despues.yaNormalizadas + ' de ' + despues.total + ' galeria-foto con thumbnail, ' + despues.cambios.length + ' pendientes.');
  if (despues.cambios.length || fallos.length) process.exit(2);
}

const ejecutadoDirectamente = (() => {
  try {
    return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch (e) {
    return false;
  }
})();

if (ejecutadoDirectamente) {
  main().catch(e => {
    console.error('\nERROR: ' + (e && e.message ? e.message : e));
    process.exit(2);
  });
}
