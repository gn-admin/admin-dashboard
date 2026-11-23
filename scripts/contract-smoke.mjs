#!/usr/bin/env node
/**
 * Gate de contrato del canal público. SOLO LECTURA.
 *
 * No publica, no guarda, no retira y no dispara despliegues. El token viaja
 * únicamente en `?token=` (nunca en cabecera) y no se imprime.
 *
 * Uso:
 *   node scripts/contract-smoke.mjs
 *   node scripts/contract-smoke.mjs --json
 *   node scripts/contract-smoke.mjs --base "https://script.google.com/macros/s/<DEPLOY_ID>/exec"
 *   node scripts/contract-smoke.mjs --columns-report test-results/columnas.json
 *   node scripts/contract-smoke.mjs --expected-version "<VERSION>" --retired-slug "<SLUG>"
 *
 * Variables de entorno (o .env, que se lee sin imprimir valores):
 *   API_URL / CONTRACT_API_URL       URL /exec del despliegue
 *   API_TOKEN / CONTRACT_TOKEN       token obligatorio de un usuario con lectura de gestor
 *   CONTRACT_ORIGIN                  Origin permitido (por defecto, el de Pages)
 *   EXPECTED_BACKEND_VERSION         versión esperada de `web-deploy-estado`
 *   CONTRACT_RETIRED_SLUG            slug retirado para comprobar el 410 lógico
 *   CONTRACT_COLUMNS_REPORT          JSON de scripts/diagnostico-columnas.gs
 *
 * Códigos de salida: 0 gate OK; 1 fallo; 2 error de uso/configuración.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ORIGIN = 'https://gn-admin.github.io';
const DEFAULT_TIMEOUT_MS = 20000;
const PUBLIC_TYPES = new Set(['animal', 'animal_grupo', 'evento', 'historia']);

function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readDotEnv() {
  try {
    return parseDotEnv(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'));
  } catch (err) {
    return {};
  }
}

function envValue(env, ...keys) {
  for (const key of keys) {
    if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
    if (env[key] !== undefined && env[key] !== '') return env[key];
  }
  return '';
}

function redactUrl(raw) {
  try {
    const url = new URL(String(raw));
    if (url.searchParams.has('token')) url.searchParams.set('token', '***');
    return url.toString();
  } catch (err) {
    return String(raw || '').replace(/([?&]token=)[^&]*/i, '$1***');
  }
}

function payloadStatus(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.status || '').toLowerCase();
}

function payloadData(payload) {
  if (!payload || typeof payload !== 'object') return undefined;
  return payload.data !== undefined ? payload.data : undefined;
}

function isPublishedStatus(value) {
  return !!value && !['borrador', 'oculto', 'retirado'].includes(String(value).toLowerCase());
}

// Apps Script puede responder a los endpoints privados con HTTP 401 o con
// HTTP 200 y un envelope lógico (`status: "error"`, `code: 401`).
function isUnauthorized(result) {
  if (!result) return false;
  if (result.http === 401) return true;
  const json = result.json;
  if (result.http !== 200 || !json || typeof json !== 'object') return false;
  return json.status === 'error'
    && (Number(json.code) === 401 || /token no proporcionado/i.test(String(json.error || '')));
}

function findPrivateFields(value, trail = '') {
  const found = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...findPrivateFields(item, trail + '[' + i + ']')));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, val] of Object.entries(value)) {
    const here = trail ? trail + '.' + key : key;
    // `ficha` es contenido configurable público del detalle; no es una fuente
    // de datos internos y puede tener etiquetas libres.
    if (key === 'ficha') continue;
    if (['documentos_internos', 'documentosInternos', 'familia', 'family'].includes(key)) {
      if (val && (Array.isArray(val) ? val.length : typeof val === 'object' ? Object.keys(val).length : String(val).trim())) {
        found.push(here);
      }
    }
    if (key === 'microchip' && typeof val === 'string' && val.trim()) found.push(here);
    if (key === 'documents' && Array.isArray(val) && val.length) found.push(here);
    found.push(...findPrivateFields(val, here));
  }
  return found;
}

function parseArgs(argv) {
  const out = {
    base: '',
    token: undefined,
    origin: undefined,
    columnsReport: '',
    retiredSlug: '',
    expectedVersion: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error('Falta valor para ' + arg);
      return value;
    };
    switch (arg) {
      case '--base': out.base = next(); break;
      case '--token': out.token = next(); break;
      case '--origin': out.origin = next(); break;
      case '--columns-report': out.columnsReport = next(); break;
      case '--retired-slug': out.retiredSlug = next(); break;
      case '--expected-version': out.expectedVersion = next(); break;
      case '--timeout': {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 1000) throw new Error('--timeout debe ser >= 1000 ms');
        out.timeoutMs = n;
        break;
      }
      case '--json': out.json = true; break;
      case '--help':
      case '-h': out.help = true; break;
      default: throw new Error('Argumento no reconocido: ' + arg);
    }
  }
  return out;
}

function usage() {
  return [
    'Contract smoke · solo lectura',
    '',
    '  node scripts/contract-smoke.mjs [opciones]',
    '',
    'Opciones:',
    '  --base URL               URL /exec (si falta, usa API_URL/.env)',
    '  --token TOKEN            token de lectura (obligatorio; mejor API_TOKEN)',
    '  --origin URL             Origin permitido (por defecto ' + DEFAULT_ORIGIN + ')',
    '  --columns-report FILE    JSON de scripts/diagnostico-columnas.gs (obligatorio)',
    '  --retired-slug SLUG      comprueba que una ficha retirada responde gone',
    '  --expected-version VER   versión esperada de web-deploy-estado',
    '  --json                   salida JSON (sin token)',
    '  --timeout MS             timeout por petición (por defecto 20000)',
    '  -h, --help               esta ayuda',
    '',
    'No escribe, no publica y no despliega. El token solo va en ?token=.'
  ].join('\n');
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, Object.assign({}, init, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ejecuta el gate. Exportado para tests; no imprime ni sale del proceso.
 * @param {object} options
 * @param {string} [options.base]
 * @param {string} [options.token]
 * @param {string} [options.origin]
 * @param {Function} [options.fetchImpl]
 * @param {object} [options.env]
 * @param {string} [options.columnsReport]
 * @param {string} [options.retiredSlug]
 * @param {string} [options.expectedVersion]
 * @param {number} [options.timeoutMs]
 */
export async function runSmoke(options = {}) {
  const env = options.env || readDotEnv();
  const base = String(options.base || envValue(env, 'CONTRACT_API_URL', 'API_URL')).trim();
  if (!base) throw new Error('Falta API_URL (o --base) con la URL /exec del despliegue');

  const token = options.token !== undefined
    ? String(options.token || '')
    : envValue(env, 'CONTRACT_TOKEN', 'API_TOKEN', 'TOKEN');
  const origin = options.origin !== undefined
    ? String(options.origin || '')
    : (envValue(env, 'CONTRACT_ORIGIN') || DEFAULT_ORIGIN);
  const columnsReport = String(options.columnsReport || envValue(env, 'CONTRACT_COLUMNS_REPORT')).trim();
  const retiredSlug = String(options.retiredSlug || envValue(env, 'CONTRACT_RETIRED_SLUG')).trim();
  const expectedVersion = String(options.expectedVersion || envValue(env, 'EXPECTED_BACKEND_VERSION')).trim();
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Este Node no tiene fetch; usa Node 18+');

  const results = [];
  const add = (id, name, status, detail = '', evidence = '') => {
    results.push({ id, name, status, detail: String(detail || ''), evidence: String(evidence || '') });
  };
  const pass = (id, name, detail, evidence) => add(id, name, 'PASS', detail, evidence);
  const fail = (id, name, detail, evidence) => add(id, name, 'FAIL', detail, evidence);
  const warn = (id, name, detail, evidence) => add(id, name, 'WARN', detail, evidence);
  const skip = (id, name, detail, evidence) => add(id, name, 'SKIP', detail, evidence);

  async function call(endpoint, params = {}, opts = {}) {
    const url = new URL(base);
    url.searchParams.set('endpoint', endpoint);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const useToken = opts.token === undefined ? token : opts.token;
    if (useToken) url.searchParams.set('token', useToken);
    else url.searchParams.delete('token');
    const headers = {};
    if (origin) headers.Origin = origin;
    const init = { method: opts.method || 'GET', headers, redirect: 'follow' };
    if (init.method === 'POST') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body || {});
    }
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, url, init, timeoutMs);
    } catch (err) {
      return {
        http: 0,
        ok: false,
        json: null,
        text: '',
        error: err && err.name === 'AbortError' ? 'timeout' : String((err && err.message) || err),
        url: redactUrl(url)
      };
    }
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (err) { json = null; }
    const http = Number(response.status) || 0;
    return {
      http,
      ok: http >= 200 && http < 300,
      json,
      text,
      url: redactUrl(url)
    };
  }

  /* P0-01 · configuración pública y endpoint legado cerrado */
  const cfg = await call('config-publica', { nocache: '1' });
  const cfgData = payloadData(cfg.json);
  if (cfg.http === 200 && payloadStatus(cfg.json) === 'success' && cfgData && cfgData.seo && cfgData.site && cfgData.contact) {
    const missing = ['site.url', 'seo.baseUrl', 'contact.email'].filter((key) => {
      const value = key.split('.').reduce((obj, part) => (obj && obj[part] !== undefined ? obj[part] : undefined), cfgData);
      return !String(value || '').trim();
    });
    if (missing.length) warn('P0-01a', 'config-publica', 'Faltan datos públicos: ' + missing.join(', '), cfg.url);
    else pass('P0-01a', 'config-publica', 'site/contact/seo presentes', cfg.url);
  } else {
    fail('P0-01a', 'config-publica', 'HTTP ' + cfg.http + (cfg.error ? ' · ' + cfg.error : ''), cfg.url);
  }

  const legacy = await call('config', { nocache: '1' }, { token: '' });
  if (isUnauthorized(legacy)) {
    pass('P0-01b', 'config legado cerrado', '401 sin token', legacy.url);
  } else {
    fail('P0-01b', 'config legado cerrado', 'Se esperaba 401 y llegó HTTP ' + legacy.http, legacy.url);
  }

  /* P0-02 · listado público */
  let pubs = [];
  const list = await call('publicaciones', { pageSize: '100', nocache: '1' });
  const listData = payloadData(list.json);
  if (list.http === 200 && payloadStatus(list.json) === 'success' && Array.isArray(listData)) {
    pubs = listData;
    const drafts = pubs.filter((p) => !isPublishedStatus(p && p.status));
    const withFicha = pubs.filter((p) => p && Object.prototype.hasOwnProperty.call(p, 'ficha'));
    const malformed = pubs.filter((p) => !p || !String(p.slug || '').trim() || !PUBLIC_TYPES.has(String(p.type)));
    if (drafts.length) fail('P0-02a', 'listado sin borradores/ocultos/retirados', drafts.length + ' ficha(s) con estado no público', list.url);
    else pass('P0-02a', 'listado sin borradores/ocultos/retirados', pubs.length + ' publicaciones', list.url);
    if (withFicha.length) fail('P0-02b', 'listado sin ficha configurable', withFicha.length + ' ficha(s) llevan `ficha` en el listado', list.url);
    else pass('P0-02b', 'listado sin ficha configurable', '0 fichas con `ficha`', list.url);
    if (malformed.length) fail('P0-02c', 'forma del listado', malformed.length + ' ficha(s) sin slug/type válido', list.url);
    else pass('P0-02c', 'forma del listado', 'slug/type válidos', list.url);
    if (!pubs.length) warn('P0-02d', 'catálogo vacío', 'No hay publicaciones para comprobar detalle/filtros', list.url);
  } else {
    fail('P0-02', 'listado público', 'HTTP ' + list.http + ' · ' + (payloadStatus(list.json) || list.error || 'sin JSON'), list.url);
  }

  /* P0-03 · detalle y privacidad, una muestra por tipo (animal, grupo, evento, historia) */
  const samples = [];
  for (const p of pubs) {
    if (!p || !p.slug) continue;
    if (!samples.some((s) => s.type === p.type)) samples.push(p);
  }
  if (!samples.length) {
    warn('P0-03', 'detalle y privacidad', 'Sin slug publicado para comprobar', '');
  } else {
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const suffix = i === 0 ? '' : '-' + sample.type;
      const detail = await call('publicacion', { slug: sample.slug, nocache: '1' });
      const detailData = payloadData(detail.json);
      if (detail.http === 200 && payloadStatus(detail.json) === 'success' && detailData && detailData.slug === sample.slug) {
        // Solo se audita el bloque `animal` (o el grupo, que también usa `animal`)
        // y los campos privados de primer nivel. `event`, `historia` y `ficha`
        // tienen campos editoriales libres y no son origen de datos internos.
        const leaks = [
          ...findPrivateFields(detailData.animal || {}, 'animal'),
          ...findPrivateFields({
            documentos_internos: detailData.documentos_internos,
            familia: detailData.familia,
            family: detailData.family,
            documents: detailData.documents
          }, 'detalle')
        ];
        if (leaks.length) fail('P0-03a' + suffix, 'detalle sin datos privados', 'Campos: ' + leaks.join(', '), detail.url);
        else pass('P0-03a' + suffix, 'detalle sin datos privados', sample.type + ': sin microchip/documentos/familia', detail.url);
        if (detailData.ficha !== undefined && (detailData.ficha === null || typeof detailData.ficha !== 'object' || Array.isArray(detailData.ficha))) {
          fail('P0-03b' + suffix, 'ficha configurable', '`ficha` no es objeto', detail.url);
        } else {
          pass('P0-03b' + suffix, 'ficha configurable', detailData.ficha ? sample.type + ': ficha objeto' : sample.type + ': sin ficha (válido)', detail.url);
        }
      } else {
        fail('P0-03' + suffix, 'detalle público', sample.type + ': HTTP ' + detail.http + ' · ' + (payloadStatus(detail.json) || detail.error || 'sin JSON'), detail.url);
      }
    }
  }

  /* P0-04/06 · filtros del contrato R2–R5 */
  async function filterCheck(id, endpoint, params, predicate, label) {
    const res = await call(endpoint, Object.assign({ pageSize: '100', nocache: '1' }, params));
    const data = payloadData(res.json);
    if (res.http === 200 && payloadStatus(res.json) === 'success' && Array.isArray(data)) {
      if (!data.length) warn(id, label, 'Sin filas: no se puede confirmar el filtro con datos actuales', res.url);
      else if (data.every(predicate)) pass(id, label, data.length + ' fila(s) coherentes', res.url);
      else fail(id, label, 'Hay filas que no cumplen el filtro', res.url);
      return data;
    }
    fail(id, label, 'HTTP ' + res.http + ' · ' + (payloadStatus(res.json) || res.error || 'sin JSON'), res.url);
    return [];
  }

  await filterCheck('P0-04', 'publicaciones', { featured: '1' }, (p) => p && p.featured === true, 'featured=1');
  await filterCheck('P0-05', 'publicaciones', { featured: '0' }, (p) => p && p.featured === false, 'featured=0');
  await filterCheck('P0-06', 'animales-publicos', { sponsor: '1' }, (p) => !!(p && p.sponsor && p.sponsor.available === true), 'sponsor=1');
  await filterCheck('P0-07', 'publicaciones', { category: 'Caso externo' }, (p) => p && p.category === 'Caso externo', 'category=Caso externo');

  const tax = await call('taxonomias', { type: 'animal', nocache: '1' });
  const taxData = payloadData(tax.json);
  if (tax.http === 200 && payloadStatus(tax.json) === 'success' && taxData && Array.isArray(taxData.status)) {
    const mixed = taxData.status.filter((s) => ['programado', 'publicado'].includes(String(s).toLowerCase()));
    if (mixed.length) fail('P0-08', 'taxonomias&type=animal', 'Estados de evento filtrados: ' + mixed.join(', '), tax.url);
    else pass('P0-08', 'taxonomias&type=animal', 'sin estados de evento', tax.url);
  } else {
    fail('P0-08', 'taxonomias&type=animal', 'HTTP ' + tax.http + ' · ' + (payloadStatus(tax.json) || tax.error || 'sin JSON'), tax.url);
  }

  /* P0-09 · sitemap y redirects */
  const sitemap = await call('sitemap', { nocache: '1' });
  const sitemapData = payloadData(sitemap.json);
  if (sitemap.http === 200 && payloadStatus(sitemap.json) === 'success' && Array.isArray(sitemapData)) {
    const locs = sitemapData.map((x) => String((x && x.loc) || '')).filter(Boolean);
    const duplicated = locs.filter((x, i) => locs.indexOf(x) !== i);
    if (duplicated.length) fail('P0-09a', 'sitemap sin duplicados', duplicated.length + ' URL(s) repetidas', sitemap.url);
    else pass('P0-09a', 'sitemap sin duplicados', locs.length + ' URL(s)', sitemap.url);
    if (pubs.length && !locs.length) {
      if (String((cfgData && cfgData.seo && cfgData.seo.baseUrl) || '').includes('github.io')) {
        // La demo de Pages no tiene rutas /animales/<slug>: el sitemap se valida
        // al configurar el dominio de `main`, no antes. No es un WARN de release.
        skip('P0-09b', 'sitemap en demo', 'Base GitHub Pages: se valida al configurar el dominio de main', sitemap.url);
      } else {
        fail('P0-09b', 'sitemap con publicaciones', 'Hay publicaciones y el sitemap está vacío', sitemap.url);
      }
    } else {
      pass('P0-09b', 'sitemap coherente', 'URLs de ficha presentes', sitemap.url);
    }
  } else {
    fail('P0-09', 'sitemap', 'HTTP ' + sitemap.http + ' · ' + (payloadStatus(sitemap.json) || sitemap.error || 'sin JSON'), sitemap.url);
  }

  const redirects = await call('redirects', { nocache: '1' });
  if (redirects.http === 200 && payloadStatus(redirects.json) === 'success' && Array.isArray(payloadData(redirects.json))) {
    const bad = payloadData(redirects.json).filter((r) => !r || Number(r.status) !== 301 || !r.from || !r.to);
    if (bad.length) fail('P0-10', 'redirects 301', bad.length + ' redirección(es) incompletas', redirects.url);
    else pass('P0-10', 'redirects 301', payloadData(redirects.json).length + ' redirección(es)', redirects.url);
  } else {
    fail('P0-10', 'redirects 301', 'HTTP ' + redirects.http + ' · ' + (payloadStatus(redirects.json) || redirects.error || 'sin JSON'), redirects.url);
  }

  /* P0-11 · slug inexistente y lápida opcional */
  const missing = await call('publicacion', { slug: 'contract-smoke-missing-' + Date.now(), nocache: '1' });
  const notFound = !!(missing.json && /no encontrada/i.test(String(missing.json.error || '')));
  if (missing.http === 200 && payloadStatus(missing.json) === 'error' && notFound) {
    pass('P0-11a', 'slug inexistente', 'error controlado, sin 500', missing.url);
  } else if (missing.http >= 500) {
    fail('P0-11a', 'slug inexistente', 'HTTP ' + missing.http, missing.url);
  } else {
    warn('P0-11a', 'slug inexistente', 'Respuesta no reconocida: HTTP ' + missing.http, missing.url);
  }
  if (retiredSlug) {
    const gone = await call('publicacion', { slug: retiredSlug, nocache: '1' });
    if (payloadStatus(gone.json) === 'gone' && gone.json.code === 'gone') {
      pass('P0-11b', 'lápida 410 lógica', retiredSlug, gone.url);
    } else {
      fail('P0-11b', 'lápida 410 lógica', 'Se esperaba gone para ' + retiredSlug + ' y llegó ' + (payloadStatus(gone.json) || gone.http), gone.url);
    }
  } else {
    warn('P0-11b', 'lápida 410 lógica', 'Sin --retired-slug: no se comprueba', '');
  }

  /* P0-12 · autenticación y lectura de gestor */
  const noToken = await call('web-resumen', {}, { token: '' });
  if (isUnauthorized(noToken)) {
    pass('P0-12a', 'gestor sin token', '401 sin token', noToken.url);
  } else {
    fail('P0-12a', 'gestor sin token', 'Se esperaba 401 y llegó HTTP ' + noToken.http, noToken.url);
  }

  if (!token) {
    fail('P0-12b', 'lectura autenticada', 'Falta API_TOKEN/CONTRACT_TOKEN', '');
  } else {
    const summary = await call('web-resumen', { nocache: '1' });
    if (summary.http === 200 && payloadStatus(summary.json) === 'success' && payloadData(summary.json) && payloadData(summary.json).totales) {
      pass('P0-12b', 'web-resumen', 'totales presentes', summary.url);
    } else {
      fail('P0-12b', 'web-resumen', 'HTTP ' + summary.http + ' · ' + (payloadStatus(summary.json) || summary.error || 'sin totales'), summary.url);
    }
  }

  /* P0-13 · versión y cuerpo desplegado (diagnóstico POST de solo lectura) */
  if (!token) {
    fail('P0-13', 'versión del backend', 'Falta token para web-deploy-estado', '');
  } else {
    const deploy = await call('web-deploy-estado', {}, { method: 'POST', body: {}, token });
    const deployData = payloadData(deploy.json);
    if (deploy.http === 200 && payloadStatus(deploy.json) === 'success' && deployData) {
      if (deployData.configurado !== true) fail('P0-13a', 'deploy configurado', '`configurado` no es true', deploy.url);
      else pass('P0-13a', 'deploy configurado', 'repo/ref/workflow presentes', deploy.url);
      if (expectedVersion && String(deployData.version || '') !== expectedVersion) {
        fail('P0-13b', 'versión del backend', 'Esperada ' + expectedVersion + ' y desplegada ' + (deployData.version || '?'), deploy.url);
      } else if (expectedVersion) {
        pass('P0-13b', 'versión del backend', expectedVersion, deploy.url);
      } else {
        warn('P0-13b', 'versión del backend', 'Observada ' + (deployData.version || '?') + '; define EXPECTED_BACKEND_VERSION para fijarla', deploy.url);
      }
    } else {
      fail('P0-13', 'versión del backend', 'HTTP ' + deploy.http + ' · ' + (payloadStatus(deploy.json) || deploy.error || 'sin JSON'), deploy.url);
    }

    const body = await call('web-deploy-cuerpo', {}, { method: 'POST', body: {}, token });
    const bodyData = payloadData(body.json);
    if (body.http === 200 && payloadStatus(body.json) === 'success' && bodyData) {
      if (bodyData.construir_con_saneado === true) pass('P0-13c', 'cuerpo con saneado', 'construir_con_saneado=true', body.url);
      else fail('P0-13c', 'cuerpo con saneado', 'El cuerpo desplegado no incluye el saneado esperado', body.url);
    } else {
      fail('P0-13c', 'cuerpo desplegado', 'HTTP ' + body.http + ' · ' + (payloadStatus(body.json) || body.error || 'sin JSON'), body.url);
    }
  }

  /* P0-14 · columnas aditivas: informe real del editor de Apps Script */
  if (columnsReport) {
    try {
      const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, columnsReport), 'utf8'));
      const sheets = report && report.sheets && typeof report.sheets === 'object' ? report.sheets : {};
      const missing = [];
      for (const [sheet, info] of Object.entries(sheets)) {
        const absent = (info && Array.isArray(info.missing)) ? info.missing : [];
        if (absent.length) missing.push(sheet + ': ' + absent.join(', '));
      }
      if (Object.keys(sheets).length === 0) fail('P0-14', 'columnas aditivas', 'El informe no contiene `sheets`', columnsReport);
      else if (missing.length) fail('P0-14', 'columnas aditivas', 'Faltan: ' + missing.join(' · '), columnsReport);
      else pass('P0-14', 'columnas aditivas', 'WebPublicaciones y Animales completas', columnsReport);
    } catch (err) {
      fail('P0-14', 'columnas aditivas', 'No se pudo leer el informe: ' + ((err && err.message) || err), columnsReport);
    }
  } else {
    fail('P0-14', 'columnas aditivas', 'Falta --columns-report', '');
  }

  const summary = results.reduce((acc, r) => {
    acc.total++;
    acc[r.status.toLowerCase()]++;
    return acc;
  }, { total: 0, pass: 0, fail: 0, warn: 0, skip: 0 });
  const ok = summary.fail === 0 && summary.warn === 0;
  return {
    ok,
    generatedAt: new Date().toISOString(),
    base: redactUrl(base),
    expectedVersion: expectedVersion || null,
    summary,
    results
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String((err && err.message) || err));
    process.exit(2);
  }
  if (args.help) {
    console.log(usage());
    return;
  }
  let result;
  try {
    result = await runSmoke(args);
  } catch (err) {
    console.error('No se pudo ejecutar el gate: ' + String((err && err.message) || err));
    process.exit(2);
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Contract smoke · ' + result.base);
    for (const r of result.results) {
      const extra = r.detail ? ' — ' + r.detail : '';
      console.log('[' + r.status + '] ' + r.id + ' ' + r.name + extra);
    }
    const s = result.summary;
    console.log('Resumen: ' + s.pass + ' PASS · ' + s.warn + ' WARN · ' + s.fail + ' FAIL · ' + s.skip + ' SKIP');
    console.log('Gate: ' + (result.ok ? 'PASS' : (result.summary.fail ? 'FAIL' : 'FAIL (WARN)')));
  }
  process.exit(result.ok ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
