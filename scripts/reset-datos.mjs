#!/usr/bin/env node
/**
 * Reset de la operativa del panel desde el repositorio.
 *
 * Llama al endpoint admin `reset-datos` de Apps Script, que crea la copia de
 * seguridad antes de borrar y devuelve el conteo de las encuestas antes y
 * después. Este script compara esos conteos (y los vuelve a pedir por API) y
 * falla si una sola respuesta de encuesta ha cambiado.
 *
 * Los idToken de Firebase caducan a la hora. Si una llamada se rechaza por
 * token (401 o «Token invalido»), el script pide uno nuevo con las credenciales
 * y repite esa misma llamada, para no abortar con código 2 después de haber
 * borrado. Solo se reintenta una vez por llamada.
 *
 * Uso:
 *   node scripts/reset-datos.mjs             # dry-run: solo cuenta filas
 *   node scripts/reset-datos.mjs --aplicar   # copia y borra
 *
 * Credenciales (nunca por argumento; se leen del entorno o del .env):
 *   GN_API    URL /exec del despliegue. Si falta, se usa API_URL del .env.
 *   GN_TOKEN  Token de Firebase de un administrador.
 *             Si falta, se obtiene con GN_ADMIN_EMAIL + GN_ADMIN_PASS usando la
 *             apiKey de Firebase de la configuración generada.
 *
 * Códigos de salida:
 *   0 todo correcto · 1 uso/configuración · 2 error del backend · 3 encuestas alteradas
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(import.meta.dirname, '..');

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
// Precedencia: variable de entorno > .env. Así la credencial puede vivir solo
// en el .env (ignorado por git) sin pasar por la línea de comandos.
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

function credencialesAdmin() {
  return {
    email: String(process.env.GN_ADMIN_EMAIL || env.GN_ADMIN_EMAIL || '').trim(),
    pass: String(process.env.GN_ADMIN_PASS || env.GN_ADMIN_PASS || '')
  };
}

/** Token de administrador: el de GN_TOKEN o uno nuevo por email/contraseña. */
async function obtenerToken() {
  if (TOKEN) return TOKEN;
  return loginAdmin();
}

async function loginAdmin() {
  const { email, pass } = credencialesAdmin();
  const key = apiKeyFirebase();
  if (!email || !pass || !key) {
    throw new Error('Falta GN_TOKEN (o GN_ADMIN_EMAIL + GN_ADMIN_PASS con la apiKey de Firebase).');
  }
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(key), {
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
  return TOKEN;
}

/** ¿Hay credenciales para pedir un token nuevo sin intervención? */
function puedeRenovarToken() {
  const { email, pass } = credencialesAdmin();
  return !!(email && pass && apiKeyFirebase());
}

/** Pide un token nuevo. Devuelve false si no hay credenciales para hacerlo. */
async function renovarToken() {
  if (!puedeRenovarToken()) return false;
  TOKEN = '';
  await loginAdmin();
  return true;
}

/** ¿El error es de token caducado o inválido (y por tanto reintentable)? */
export function esErrorToken(error) {
  const mensaje = String((error && error.message) || error || '');
  return /HTTP 401\b|Token invalido|Token inválido|INVALID_ID_TOKEN|TOKEN_EXPIRED|INVALID_REFRESH_TOKEN/i.test(mensaje);
}

/**
 * Llama a un endpoint del backend. Si el token ha caducado y se puede renovar,
 * pide uno nuevo y repite la misma llamada una sola vez.
 *
 * `ctx` = { api, getToken(), renovarToken() } para poder probarlo sin red.
 */
export async function pedirConReintento(ep, { method = 'GET', body, params } = {}, ctx, intento = 0) {
  const url = new URL(ctx.api);
  url.searchParams.set('endpoint', ep);
  url.searchParams.set('token', ctx.getToken());
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const r = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const texto = await r.text();
    let json;
    try { json = JSON.parse(texto); } catch (e) {
      throw new Error(ep + ': respuesta no JSON (HTTP ' + r.status + '): ' + texto.slice(0, 160));
    }
    if (!r.ok) throw new Error(ep + ': HTTP ' + r.status + ' · ' + (json.error || 'sin detalle'));
    if (json && json.status === 'error') throw new Error(ep + ': ' + (json.error || 'error del servidor'));
    return json.data !== undefined ? json.data : json;
  } catch (e) {
    if (intento < 1 && esErrorToken(e) && typeof ctx.renovarToken === 'function') {
      console.error('  token caducado o inválido en «' + ep + '»: se renueva y se repite la llamada');
      const renovado = await ctx.renovarToken();
      if (renovado === false) throw e;
      return pedirConReintento(ep, { method, body, params }, { ...ctx }, intento + 1);
    }
    throw e;
  }
}

function pedir(ep, opciones) {
  return pedirConReintento(ep, opciones, {
    api: API,
    getToken: () => TOKEN,
    renovarToken: puedeRenovarToken() ? renovarToken : null
  });
}

/** Foto de las encuestas por API: conteo y huella del contenido (sin _row). */
async function fotoEncuestas() {
  const encuestas = await pedir('surveys');
  const lista = Array.isArray(encuestas) ? encuestas : [];
  const foto = [];
  for (const e of lista) {
    const id = e.id || e.survey_id || e.clave;
    if (!id) continue;
    const data = await pedir('responses', { params: { id } });
    const filas = Array.isArray(data) ? data : [];
    const huella = crypto.createHash('sha256')
      .update(JSON.stringify(filas.map(f => {
        const copia = { ...f };
        delete copia._row;
        delete copia.id;
        return copia;
      })))
      .digest('hex')
      .slice(0, 16);
    foto.push({ id, nombre: e.name || e.nombre || id, filas: filas.length, huella });
  }
  return foto;
}

/** Comprueba que las encuestas siguen exactamente igual. Devuelve los problemas. */
function diferencias(antes, despues) {
  const problemas = [];
  if (antes.length !== despues.length) {
    problemas.push('el número de encuestas cambió: ' + antes.length + ' → ' + despues.length);
  }
  antes.forEach(a => {
    const d = despues.find(x => String(x.id) === String(a.id));
    if (!d) { problemas.push('desapareció la encuesta ' + a.id); return; }
    if (a.filas !== d.filas) problemas.push(a.id + ': ' + a.filas + ' → ' + d.filas + ' respuestas');
    else if (a.huella !== d.huella) problemas.push(a.id + ': mismo número de respuestas pero contenido distinto');
  });
  return problemas;
}

function tablaEncuestas(foto) {
  return foto.map(f => '  ' + String(f.id).padEnd(24) + String(f.filas).padStart(4) + ' respuestas · ' + f.huella).join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const desconocidos = args.filter(a => a !== '--aplicar' && a !== '--dry-run');
  if (desconocidos.length) {
    console.error('Argumento no reconocido: ' + desconocidos.join(', '));
    console.error('Uso: node scripts/reset-datos.mjs [--aplicar]');
    process.exit(1);
  }
  const aplicar = args.includes('--aplicar');

  if (!API) {
    console.error('Falta GN_API (o API_URL en .env).');
    process.exit(1);
  }
  try {
    await obtenerToken();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  console.log('\nEncuestas antes del reset:');
  const antes = await fotoEncuestas();
  console.log(tablaEncuestas(antes) || '  (no hay encuestas configuradas)');

  console.log('\n' + (aplicar ? 'APLICANDO reset' : 'DRY-RUN reset') + ' en ' + API);
  const res = await pedir('reset-datos', { method: 'POST', body: aplicar ? { aplicar: true, confirmar: 'BORRAR' } : { aplicar: false } });

  if (!res || res.ok === false) {
    console.error('\nEl backend no ha reseteado nada: ' + ((res && res.error) || 'sin detalle'));
    process.exit(2);
  }

  console.log('\n' + (res.aplicar ? 'Borradas ' + res.filasBorradas + ' filas' : 'Se borrarían ' + res.totalFilas + ' filas') + ':');
  (res.hojas || []).forEach(h => {
    const estado = h.omitida ? 'OMITIDA (' + h.omitida + ')' : (h.error ? 'ERROR ' + h.error : h.filas + ' filas');
    console.log('  ' + String(h.clave).padEnd(24) + estado);
  });

  if (!res.aplicar) {
    const despuesDry = await fotoEncuestas();
    const problemasDry = diferencias(antes, despuesDry);
    if (problemasDry.length) {
      console.error('\nLas encuestas han cambiado durante el dry-run:');
      problemasDry.forEach(p => console.error('  - ' + p));
      process.exit(3);
    }
    console.log('\nEncuestas intactas. Sin cambios. Ejecuta con --aplicar para borrar.');
    return;
  }

  if (!res.copia) {
    console.error('\nEl backend dice haber borrado sin devolver la copia de seguridad. Revisa el panel antes de seguir.');
    process.exit(2);
  }
  console.log('\nCopia de seguridad: ' + res.copia);

  console.log('\nEncuestas después del reset:');
  const despues = await fotoEncuestas();
  console.log(tablaEncuestas(despues) || '  (no hay encuestas configuradas)');

  const problemas = diferencias(antes, despues);
  const backendIntactas = !!(res.encuestas && res.encuestas.intactas);
  if (!backendIntactas) problemas.push('el backend no pudo confirmar las encuestas intactas');

  if (problemas.length) {
    console.error('\nENCUESTAS ALTERADAS:');
    problemas.forEach(p => console.error('  - ' + p));
    console.error('\nRestaura la copia: ' + res.copia);
    process.exit(3);
  }

  console.log('\nEncuestas intactas: ' + antes.length + ' encuestas, ' + antes.reduce((n, f) => n + f.filas, 0) + ' respuestas sin cambios.');
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
