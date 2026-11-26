#!/usr/bin/env node
/**
 * Importa a staging de animales del panel los anuncios de Milanuncios que ya
 * se hayan revisado. No publica nada: crea la ficha interna y su publicación
 * web en estado `borrador`.
 *
 * Uso:
 *   node scripts/importar-animales.mjs                     # dry-run
 *   GN_API=".../exec" GN_TOKEN="..." node scripts/importar-animales.mjs --aplicar
 *
 * GN_API/GN_TOKEN se pueden poner en el .env (ignorado por git) en lugar de la
 * línea de comandos.
 *
 * Opciones:
 *   --aplicar             crea los registros (sin esto solo muestra el plan)
 *   --incluir-sin-revisar acepta anuncios con `revision.revisado: false`
 *   --incluir-grupos      crea también anuncios de varios animales (1 ficha)
 *   --permitir-sin-sexo   crea fichas sin sexo (el panel las marca para completar)
 *   --subir-portada       sube la primera foto local a Drive y la usa de portada;
 *                         en una ficha ya existente solo si aún no tiene portada,
 *                         así que se puede repetir sin duplicar la foto
 *   --sin-web             crea solo la ficha del animal, sin publicación web
 *
 * El token va por variable de entorno y en la query, nunca como argumento.
 */
import fs from 'node:fs';
import path from 'node:path';

function leerEnv() {
  const ruta = path.resolve(import.meta.dirname, '..', '.env');
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
const RUTA = process.env.GN_ARCHIVO || path.join('datos', 'milanuncios', 'grupo-nebak.json');
const API = String(process.env.GN_API || env.GN_API || env.API_URL || '').trim().replace(/\/+$/, '');
const TOKEN = String(process.env.GN_TOKEN || env.GN_TOKEN || '').trim();
const aplicar = process.argv.includes('--aplicar');
const incluirSinRevisar = process.argv.includes('--incluir-sin-revisar');
const incluirGrupos = process.argv.includes('--incluir-grupos');
const permitirSinSexo = process.argv.includes('--permitir-sin-sexo');
const subirPortada = process.argv.includes('--subir-portada');
const sinWeb = process.argv.includes('--sin-web');

if (!fs.existsSync(RUTA)) {
  console.error('No existe ' + RUTA + '. Ejecuta antes scripts/scrape-milanuncios.mjs.');
  process.exit(1);
}
if (aplicar && (!API || !TOKEN)) {
  console.error('Faltan GN_API o GN_TOKEN para --aplicar.');
  process.exit(1);
}

const datos = JSON.parse(fs.readFileSync(RUTA, 'utf8'));

async function api(ep, { method = 'GET', body, params } = {}) {
  const url = new URL(API);
  url.searchParams.set('endpoint', ep);
  url.searchParams.set('token', TOKEN);
  if (ep.startsWith('web-')) url.searchParams.set('todos', '1');
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
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
  if (!r.ok || json.status === 'error') throw new Error(ep + ': ' + (json.error || 'HTTP ' + r.status));
  return json.data !== undefined ? json.data : json;
}

function motivoSalto(a) {
  if (a.tipo !== 'animal') return 'no es un animal';
  if (!a.revision || a.revision.revisado !== true) return 'sin revisar';
  if (!incluirGrupos && (a.animal.grupo || a.revision.motivos.some(m => /varios animales/i.test(m)))) {
    return 'anuncio de grupo (usa --incluir-grupos)';
  }
  if (!a.animal.especie) return 'falta especie';
  if (!a.animal.sexo && !permitirSinSexo) return 'falta sexo (usa --permitir-sin-sexo)';
  return '';
}

function animalPayload(a, portadaUrl) {
  const x = a.animal;
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    nombre: x.nombre,
    especie: x.especie,
    raza: x.raza || '',
    edad: x.edad || '',
    sexo: x.sexo || '',
    tamano: x.tamano || '',
    estado: 'disponible',
    microchip: '',
    descripcion: x.descripcion || a.anuncio.descripcion,
    urgente: !!x.urgente,
    apadrinable: false,
    esterilizada: x.esterilizada === null ? '' : !!x.esterilizada,
    vacunas: x.vacunas || '',
    desparasitado: x.desparasitado || '',
    grupo: x.grupo || '',
    grupo_obligatorio: !!x.grupo_obligatorio,
    fecha_ingreso: hoy,
    portada_url: portadaUrl || a.web?.media?.coverImage?.src || '',
    portada_alt: a.animal.nombre,
    galeria: JSON.stringify(a.web?.media?.gallery || []),
    origen: 'milanuncios',
    origen_id: a.origen_id,
    origen_url: a.origen_url,
    notas: 'Importado de Milanuncios el ' + hoy + '. Revisar esterilización, edad y contacto antes de publicar.'
  };
}

function webPayload(a, animalId, portadaUrl) {
  const w = a.web || {};
  const media = {
    coverImage: portadaUrl ? { src: portadaUrl, alt: a.animal.nombre } : (w.media?.coverImage || undefined),
    gallery: w.media?.gallery || [],
    videos: [],
    icons: []
  };
  return {
    animal_id: animalId,
    estado_publicacion: 'borrador',
    slug: w.slug,
    titulo: w.titulo || a.animal.nombre,
    categoria: w.categoria || '',
    estado_publico_modo: 'auto',
    extracto: w.extracto || '',
    contenido_html: w.contenido_html || '',
    indexable: true,
    listed: true,
    featured: false,
    orden: 0,
    media,
    tags: w.tags || [],
    seo: {},
    animal: w.animal || {}
  };
}

/** Portada que ya tiene la publicación ('' si no tiene). */
function portadaDe(pub) {
  return String((pub && pub.media && pub.media.coverImage && pub.media.coverImage.src) || '').trim();
}

/**
 * Payload para volver a guardar una publicación existente cambiando solo la
 * portada: el backend reescribe la fila, así que se reenvía lo que devuelve el
 * detalle para no perder slug, extracto, galería ni el bloque `animal`.
 */
function webPayloadExistente(pub, animalId, portadaUrl) {
  const body = {
    animal_id: animalId,
    slug: pub.slug,
    titulo: pub.titulo,
    categoria: pub.categoria,
    estado_publicacion: pub.estado_publicacion || 'borrador',
    indexable: pub.indexable,
    listed: pub.listed,
    featured: pub.featured,
    orden: pub.orden,
    extracto: pub.extracto,
    contenido_html: pub.contenido_html,
    tags: pub.tags,
    seo: pub.seo,
    cta: pub.cta,
    animal: pub.animal,
    media: Object.assign({}, pub.media || {}, {
      coverImage: { src: portadaUrl, alt: pub.titulo || pub.slug || '' }
    }),
    media_folder_id: pub.media_folder_id || ''
  };
  if (pub.ficha) body.ficha = pub.ficha;
  return body;
}

async function subirPrimeraFoto(a) {
  const rel = (a.fotos_locales || [])[0];
  if (!rel) return '';
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) return '';
  const buf = fs.readFileSync(abs);
  if (buf.length > 5 * 1024 * 1024) throw new Error('foto demasiado grande: ' + rel);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
  const data = await api('upload-foto-animal', {
    method: 'POST',
    body: { foto_base64: buf.toString('base64'), mime_type: mime, nombre: a.origen_id + ext }
  });
  if (!data || !data.fileId) throw new Error('Drive no devolvió fileId');
  return 'https://drive.google.com/thumbnail?id=' + data.fileId + '&sz=w1200';
}

const anuncios = datos.anuncios || [];
const candidatos = anuncios.filter(a => a.tipo === 'animal');
const plan = candidatos.filter(a => !motivoSalto(a));

console.log(`\n${aplicar ? 'APLICANDO' : 'DRY-RUN'}: ${plan.length} ficha(s) listas de ${candidatos.length} animales.`);
candidatos.forEach(a => {
  const motivo = motivoSalto(a);
  const estado = motivo ? 'OMITIDO · ' + motivo : 'LISTO';
  console.log(`  ${String(a.animal.nombre).padEnd(22)} ${String(a.animal.especie).padEnd(6)} ${String(a.animal.sexo).padEnd(8)} ${estado}${!motivo && subirPortada && a.fotos_locales?.length ? ' · subir portada' : ''}`);
});

if (!aplicar) {
  console.log('\nSin cambios. Revisa el JSON, marca `revision.revisado: true` en las fichas correctas y ejecuta con --aplicar.');
  process.exit(0);
}

let existentes = [];
try {
  existentes = await api('animales');
  if (!Array.isArray(existentes)) existentes = [];
} catch (e) {
  console.error('No se pudo leer animales: ' + e.message);
  process.exit(2);
}
const porOrigen = new Map(existentes.filter(a => a.origen_url).map(a => [String(a.origen_url), a]));

let creados = 0, portadas = 0, saltados = 0, errores = 0;
for (const a of plan) {
  try {
    const existente = porOrigen.get(String(a.origen_url));

    if (existente) {
      if (!subirPortada) {
        console.log('YA EXISTE ' + a.animal.nombre + ' (' + existente.id + ')');
        saltados++;
        continue;
      }
      const tienePortadaAnimal = !!String(existente.portada_url || '').trim();
      const pub = sinWeb ? null : await api('web-animales', { params: { id: existente.id } });
      const tienePortadaWeb = pub ? !!portadaDe(pub) : true;
      if (tienePortadaAnimal && tienePortadaWeb) {
        console.log('YA EXISTE ' + a.animal.nombre + ' (' + existente.id + ') · ya tiene portada');
        saltados++;
        continue;
      }
      const portada = await subirPrimeraFoto(a);
      if (!portada) {
        console.log('YA EXISTE ' + a.animal.nombre + ' (' + existente.id + ') · sin foto local para la portada');
        saltados++;
        continue;
      }
      if (!tienePortadaWeb) {
        await api('web-animales', { method: 'POST', body: webPayloadExistente(pub, existente.id, portada) });
      }
      if (!tienePortadaAnimal) {
        await api('update-animal', {
          method: 'POST',
          body: { id: existente.id, portada_url: portada, portada_alt: (pub && pub.titulo) || a.animal.nombre }
        });
      }
      portadas++;
      console.log('PORTADA   ' + a.animal.nombre + ' · animal ' + existente.id);
      continue;
    }

    let portada = '';
    if (subirPortada) portada = await subirPrimeraFoto(a);
    const animal = await api('animales', { method: 'POST', body: animalPayload(a, portada) });
    if (!animal || !animal.id) throw new Error('el alta del animal no devolvió id');
    creados++;
    if (sinWeb) {
      console.log('CREADO    ' + a.animal.nombre + ' · animal ' + animal.id + ' · sin publicación web');
      continue;
    }
    const web = await api('web-animales', { method: 'POST', body: webPayload(a, animal.id, portada) });
    if (!web || web.status === 'error') throw new Error('no se creó la publicación web');
    console.log('CREADO    ' + a.animal.nombre + ' · animal ' + animal.id + ' · web borrador ' + (web.id || ''));
  } catch (e) {
    errores++;
    console.error('ERROR     ' + a.animal.nombre + ': ' + e.message);
  }
}
console.log(`\nHecho: ${creados} creados, ${portadas} portadas añadidas, ${saltados} ya existentes, ${errores} errores.`);
if (errores) process.exit(3);
