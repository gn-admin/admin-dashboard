#!/usr/bin/env node
/**
 * Crea la publicación web en BORRADOR de cada animal que aún no la tiene.
 *
 * Sirve para revisar en el gestor cómo quedaría la ficha pública (portada,
 * galería y descripción) sin publicar nada: `estado_publicacion` queda en
 * `borrador`, así que el canal no la sirve.
 *
 * La descripción HTML se compone solo con datos reales de la ficha (especie,
 * raza, edad, sexo, tamaño, color, salud, grupo y el texto de descripción). Lo
 * que no está en la hoja no se escribe: nada de textos inventados.
 *
 * Uso:
 *   node scripts/crear-borradores.mjs             # dry-run: cuenta y muestra una
 *   node scripts/crear-borradores.mjs --aplicar   # crea los borradores
 *
 * Credenciales: GN_API (o API_URL del .env) y GN_TOKEN, o GN_ADMIN_EMAIL +
 * GN_ADMIN_PASS. Nunca por argumento.
 *
 * Códigos: 0 ok · 1 uso/configuración · 2 error del backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pedirConReintento } from './reset-datos.mjs';

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
  if (!puedeRenovarToken()) return false;
  const email = String(process.env.GN_ADMIN_EMAIL || env.GN_ADMIN_EMAIL || '').trim();
  const pass = String(process.env.GN_ADMIN_PASS || env.GN_ADMIN_PASS || '');
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

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para meterlo en el HTML público (lista blanca: p, h2, ul, li, strong, em). */
export function escaparHtml(valor) {
  return String(valor === undefined || valor === null ? '' : valor).replace(/[&<>"']/g, c => ESCAPES[c]);
}

/** Slug estable a partir del nombre: sin acentos, minúsculas y guiones. */
export function slugDe(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Trocea la descripción en frases: los anuncios suelen venir con «.» pegado. */
export function parrafosDe(texto) {
  // Los anuncios importados pierden los emojis y dejan restos tipo «por /.».
  const limpio = String(texto || '')
    .replace(/\/\s*\./g, '.')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) return [];
  return limpio
    .replace(/([.!?])(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, '$1 ')
    .split(/(?<=[.!?])\s+/)
    .map(p => p.trim())
    .filter(Boolean);
}

function texto(valor) {
  return String(valor === undefined || valor === null ? '' : valor).trim();
}

function siNo(valor) {
  const v = texto(valor).toLowerCase();
  if (!v) return '';
  if (['si', 'sí', 'true', '1', 'yes'].indexOf(v) !== -1) return 'Sí';
  if (['no', 'false', '0'].indexOf(v) !== -1) return 'No';
  return texto(valor);
}

/** Lista `<li>` con los datos que existen en la ficha (nunca rellena huecos). */
function filaDatos(etiqueta, valor) {
  const v = texto(valor);
  return v ? `<li><strong>${escaparHtml(etiqueta)}:</strong> ${escaparHtml(v)}</li>` : '';
}

/**
 * HTML de la ficha pública a partir del animal. Solo etiquetas permitidas por
 * el saneado (`p`, `h2`, `ul`, `li`, `strong`, `em`) y solo datos reales.
 */
export function contenidoHtml(animal) {
  const a = animal || {};
  const nombre = texto(a.nombre) || 'este animal';
  const partes = [];

  // Frases del anuncio agrupadas de dos en dos: se lee mejor que un bloque
  // largo y no se corta el texto a la primera frase.
  const frases = parrafosDe(a.descripcion).slice(0, 6);
  if (frases.length) {
    const grupos = [];
    for (let i = 0; i < frases.length; i += 2) grupos.push(frases.slice(i, i + 2).join(' '));
    // El anuncio importado trae «.» pegado y minúscula detrás: al abrir
    // párrafo se ve más limpio con mayúscula inicial.
    const capitalizar = s => (/^[a-záéíóúüñ]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    partes.push(grupos.map(g => `<p>${escaparHtml(capitalizar(g))}</p>`).join(''));
  } else {
    partes.push(`<p>${escaparHtml(nombre)} está en adopción. Escríbenos para conocer más sobre ${escaparHtml(nombre.toLowerCase())}.</p>`);
  }

  const datos = [
    filaDatos('Especie', a.especie),
    filaDatos('Raza', a.raza),
    filaDatos('Edad', a.edad),
    filaDatos('Sexo', a.sexo),
    filaDatos('Tamaño', a.tamano),
    filaDatos('Capa', a.capa),
    filaDatos('Color', a.color)
  ].filter(Boolean);
  // Un grupo con el nombre del propio grupo se lee raro como «Cómo es X».
  const esGrupo = texto(a.grupo) && texto(a.grupo).toLowerCase() === nombre.toLowerCase();
  if (datos.length) {
    partes.push(`<h2>${esGrupo ? 'Quiénes son' : 'Cómo es ' + escaparHtml(nombre)}</h2><ul>${datos.join('')}</ul>`);
  }

  // El microchip no se publica (el canal lo oculta a propósito).
  const salud = [
    filaDatos('Vacunas', a.vacunas),
    filaDatos('Esterilización', siNo(a.esterilizada)),
    filaDatos('Desparasitado', siNo(a.desparasitado))
  ].filter(Boolean);
  if (salud.length) partes.push(`<h2>Salud</h2><ul>${salud.join('')}</ul>`);

  if (texto(a.necesidades_especiales)) {
    partes.push(`<h2>Necesidades especiales</h2><p>${escaparHtml(a.necesidades_especiales)}</p>`);
  }

  if (texto(a.grupo)) {
    const bloque = esGrupo
      ? `${escaparHtml(nombre)} se entrega en grupo, junto con el resto de sus compañeros.`
      : `${escaparHtml(nombre)} forma parte de <strong>${escaparHtml(a.grupo)}</strong> y se entrega junto al resto del grupo.`;
    partes.push(`<h2>Se adopta en grupo</h2><p>${bloque}</p>`);
  }

  partes.push(`<p><em>Si quieres conocer a ${escaparHtml(nombre)}, escríbenos y te contamos cómo es el proceso de adopción.</em></p>`);
  return partes.join('\n');
}

/** Extracto corto para listados y meta descripción. */
export function extractoDe(animal) {
  const limpio = String((animal && animal.descripcion) || '')
    .replace(/([.!?])(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) {
    const nombre = texto(animal && animal.nombre) || 'Este animal';
    const raza = texto(animal && animal.raza);
    return (nombre + ' busca familia' + (raza ? ' (' + raza + ')' : '') + '.').slice(0, 160);
  }
  if (limpio.length <= 157) return limpio;
  return limpio.slice(0, 157).replace(/\s+\S*$/, '') + '…';
}

/** Galería de la publicación desde la columna `galeria` del animal. */
export function galeriaDe(animal) {
  let lista = animal && animal.galeria;
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista); } catch (e) { lista = []; }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .map(f => {
      if (typeof f === 'string') return { src: f, alt: '' };
      const src = f && (f.src || f.url || '');
      return src ? { src: String(src), alt: texto(f.alt) } : null;
    })
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * Payload de `web-animales` para dejar la publicación en borrador. Devuelve
 * null si el animal ya tiene publicación (no se toca).
 */
export function construirBorrador(animal, publicacionExistente, opciones) {
  const a = animal || {};
  const regenerar = !!(opciones && opciones.regenerar);
  if (!a.id || !texto(a.nombre)) return null;
  if (publicacionExistente) {
    const tiene = !!(publicacionExistente.id || publicacionExistente.publicacion_id || publicacionExistente.slug);
    if (!tiene) { /* sin publicación: se crea */ } else {
      // Con `--regenerar` solo se reescriben los borradores: lo publicado o
      // retirado no se toca nunca desde este script.
      const estado = texto(publicacionExistente.estado_publicacion || publicacionExistente.estado_estado || publicacionExistente.estado);
      if (!regenerar || estado !== 'borrador') return null;
    }
  }

  const portada = texto(a.portada_url || a.foto || a.foto_url);
  const galeria = galeriaDe(a);
  const extracto = extractoDe(a);
  const alt = texto(a.portada_alt) || texto(a.nombre);

  return {
    animal_id: String(a.id),
    estado_publicacion: 'borrador',
    slug: slugDe(a.nombre),
    titulo: texto(a.nombre),
    extracto,
    contenido_html: contenidoHtml(a),
    categoria: '',
    estado_publico: '',
    estado_publico_modo: 'auto',
    indexable: true,
    listed: true,
    featured: !!a.urgente,
    orden: 0,
    media: {
      coverImage: portada ? { src: portada, alt } : {},
      gallery: galeria,
      videos: [],
      icons: []
    },
    seo: { metaDescription: extracto },
    animal: {
      size: texto(a.tamano),
      color: texto(a.color)
    },
    tags: []
  };
}

// ---------------------------- ejecución ----------------------------

async function main() {
  const args = process.argv.slice(2);
  const conocidos = ['--aplicar', '--dry-run', '--regenerar'];
  const desconocidos = args.filter(a => conocidos.indexOf(a) === -1);
  if (desconocidos.length) {
    console.error('Argumento no reconocido: ' + desconocidos.join(', '));
    console.error('Uso: node scripts/crear-borradores.mjs [--aplicar] [--regenerar]');
    process.exit(1);
  }
  if (!API) {
    console.error('Falta GN_API (o API_URL en .env).');
    process.exit(1);
  }
  const aplicar = args.includes('--aplicar');
  const regenerar = args.includes('--regenerar');
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

  const animales = await pedir('animales');
  const filas = await pedir('web-animales', { params: { todos: 1 } });
  const publicadas = new Map((Array.isArray(filas) ? filas : []).map(f => [String(f.animal_id || ''), f]));

  const planes = [];
  const yaTienen = [];
  (Array.isArray(animales) ? animales : []).forEach(a => {
    const existente = publicadas.get(String(a.id)) || null;
    const borrador = construirBorrador(a, existente, { regenerar });
    if (borrador) planes.push(borrador);
    else yaTienen.push(texto(a.nombre) || String(a.id));
  });

  console.log('\nAnimales: ' + (Array.isArray(animales) ? animales.length : 0));
  console.log('Sin tocar: ' + yaTienen.length + (yaTienen.length ? ' (' + yaTienen.join(', ') + ')' : ''));
  console.log('Borradores a ' + (regenerar ? 'regenerar' : 'crear') + ': ' + planes.length);

  if (!planes.length) {
    console.log('\nNada que crear.');
    return;
  }

  if (!aplicar) {
    const muestra = planes[0];
    console.log('\nMuestra: ' + muestra.titulo + ' · /' + muestra.slug + ' · ' + muestra.media.gallery.length + ' fotos de galería');
    console.log(muestra.contenido_html);
    console.log('\nDRY-RUN: no se ha escrito nada. Ejecuta con --aplicar para crear los borradores.');
    return;
  }

  let creados = 0;
  const fallos = [];
  for (const plan of planes) {
    try {
      await pedir('web-animales', { method: 'POST', body: plan });
      creados++;
      console.log('  + ' + plan.titulo + ' → /' + plan.slug);
    } catch (e) {
      fallos.push({ titulo: plan.titulo, error: e && e.message ? e.message : String(e) });
    }
  }

  console.log('\nCreados ' + creados + ' de ' + planes.length + ' borradores.');
  fallos.forEach(f => console.error('  ERROR ' + f.titulo + ': ' + f.error));

  const despues = await pedir('web-animales', { params: { todos: 1 } });
  const conPub = (Array.isArray(despues) ? despues : []).filter(f => f.publicacion_id).length;
  console.log('Verificación: ' + conPub + ' animales con publicación (' + (Array.isArray(despues) ? despues.length : 0) + ' en total).');
  if (fallos.length) process.exit(2);
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
