#!/usr/bin/env node
/**
 * Scraping del escaparate de Milanuncios de Grupo Nebak.
 *
 * Extrae el JSON que Milanuncios incrusta en la página (`__INITIAL_PROPS__`),
 * no el HTML visible: así salen los 15 anuncios aunque la web solo pinte 5.
 * Descarga las fotos a `datos/milanuncios/fotos/<id>/` y deja un JSON de
 * staging con una propuesta de ficha editable. No publica nada.
 *
 * Uso:
 *   node scripts/scrape-milanuncios.mjs
 *   node scripts/scrape-milanuncios.mjs --sin-fotos
 *
 * Requiere Playwright (declarado en devDependencies).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_TIENDA = 'https://www.milanuncios.com/tiendas-profesionales/grupo-nebak-128461?pagina=1&limite=30';
const DIR_DATOS = path.join('datos', 'milanuncios');
const DIR_FOTOS = path.join(DIR_DATOS, 'fotos');
const sinFotos = process.argv.includes('--sin-fotos');

// Nombres que el anuncio no da de forma explícita. El resto se revisa a mano.
const NOMBRES = {
  '595568199': 'Gatitos en adopción',
  '625847108': 'Alma',
  '620076879': 'Zeus y Hera',
  '614950766': 'Zoe',
  '619749020': 'Sasha',
  '614580352': 'Linda',
  '604598687': 'Beltza',
  '610058319': 'Max',
  '573043162': 'Panther',
  '618798229': 'Luna',
  '618592296': 'Kattu',
  '617882452': 'Turba',
  '617882442': 'Oreo y sus bebés',
  '621652253': 'Keiko'
};
const SERVICIOS = new Set(['606856404']); // cuidadora a domicilio, no es un animal
const GRUPOS = new Set(['595568199', '620076879', '617882442']);

const limpiar = (s) => String(s || '')
  .replace(/\u200b/g, '')
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

const fecha = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
};

function inferirEspecie(ad) {
  const t = (ad.title + ' ' + ad.description).toLowerCase();
  if (/\b(gatos?|gatas?|gatitos?|gatitas?|felinos?|kittens?)\b/.test(t)) return 'Gato';
  if (/\b(perros?|perras?|cachorros?|cachorras?|podenco|malinois|labrador|yorkshire|maltés|maltes|pastor|teckel)\b/.test(t)) return 'Perro';
  return '';
}

function inferirSexo(ad) {
  const t = (ad.title + ' ' + ad.description).toLowerCase();
  if (/\b(hembra|gata|perra|cachorra|mamá|mama)\b/.test(t)) return 'Hembra';
  if (/\b(macho|gato|perro)\b/.test(t) && !/\b(hembra|gata|perra|cachorra)\b/.test(t)) return 'Macho';
  return '';
}

function inferirEdad(ad) {
  const t = limpiar(ad.title + '. ' + ad.description);
  if (/\bun\s+año\s+y\s+medio\b/i.test(t)) return '1 año y medio';
  if (/\bun\s+año\b/i.test(t)) return '1 año';
  let m = t.match(/(\d+)\s*años?\s*y\s*medio/i);
  if (m) return `${m[1]} años y medio`;
  m = t.match(/(\d+)\s*años?/i);
  if (m) return `${m[1]} años`;
  m = t.match(/(\d+)\s*meses?/i);
  if (m) return `${m[1]} meses`;
  if (/cachorr/i.test(t)) return 'Cachorro';
  return '';
}

// Los anuncios repiten el teléfono de la protectora. No debe viajar a la ficha
// pública: se retira del texto y se conserva el original en `anuncio`.
function sinContacto(texto) {
  return limpiar(texto)
    .replace(/\b(?:tlf|tel|teléfono|telefono|contacto|wasap|wassap|whatsapp)\b[^\n.]*?(?:\d[\d\s().-]{7,}\d)/gi, '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s*\/\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferirTamano(ad) {
  const t = (ad.title + ' ' + ad.description).toLowerCase();
  if (/tamaño mediano|mediano|21 kg|paticort/i.test(t)) return 'Mediano';
  if (/tamaño grande|grande|labrador|pastor belga/i.test(t)) return 'Grande';
  if (/yorkshire|maltés|maltes|pequeñ|pequen/i.test(t)) return 'Pequeño';
  return '';
}

function inferirSalud(ad) {
  const t = (ad.title + ' ' + ad.description).toLowerCase();
  const out = { esterilizada: null, vacunas: '', desparasitado: '' };
  if (/no\s+est[áa]\s+esterilizad/.test(t)) out.esterilizada = false;
  else if (/(est[áa]\s+esterilizad|castrad[oa]|esterilizad[oa])/.test(t)) out.esterilizada = true;
  if (/(vacunas?\s+(al\s+d[íi]a|en\s+regla)|vacunad[oa])/.test(t)) out.vacunas = 'Al día';
  if (/desparasitad[oa]/.test(t)) out.desparasitado = 'Sí';
  return out;
}

function parrafos(texto) {
  return limpiar(texto)
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/\n/g, '<br>')}</p>`)
    .join(String.fromCharCode(10));
}

function extracto(texto) {
  const t = limpiar(texto).replace(/\s+/g, ' ');
  return t.length > 180 ? t.slice(0, 177).trimEnd() + '…' : t;
}

function normalizar(ad) {
  const esServicio = SERVICIOS.has(String(ad.id));
  const especie = inferirEspecie(ad);
  const sexo = inferirSexo(ad);
  const edad = inferirEdad(ad);
  const salud = inferirSalud(ad);
  const nombre = NOMBRES[String(ad.id)] || limpiar(ad.title).replace(/^urgente\s+/i, '');
  const esGrupo = GRUPOS.has(String(ad.id));
  const imagenes = Array.isArray(ad.images) ? ad.images : [];
  const descripcionPublica = sinContacto(ad.description);
  const motivos = [];
  if (esServicio) motivos.push('No es un animal: es un servicio de la tienda.');
  if (!especie) motivos.push('Especie sin detectar.');
  if (!sexo) motivos.push('Sexo sin detectar.');
  if (esGrupo) motivos.push('Anuncio de varios animales: decidir si se crea un grupo o fichas individuales.');
  if (!edad) motivos.push('Edad sin detectar.');
  if (salud.esterilizada === null) motivos.push('Esterilización sin dato.');

  return {
    origen: 'milanuncios',
    origen_id: String(ad.id),
    origen_url: 'https://www.milanuncios.com' + ad.url,
    tipo: esServicio ? 'servicio' : 'animal',
    publicado_en: fecha(ad.publishDate),
    actualizado_en: fecha(ad.updateDate),
    anuncio: {
      titulo: limpiar(ad.title),
      descripcion: descripcionPublica,
      ciudad: ad.city?.name || '',
      provincia: ad.province?.name || '',
      precio: Number(ad.price?.cashPrice?.value || 0),
      imagenes
    },
    animal: {
      nombre,
      especie,
      raza: '',
      edad,
      sexo,
      tamano: inferirTamano(ad),
      estado: 'disponible',
      urgente: /\burgente\b/i.test(ad.title + ' ' + ad.description),
      esterilizada: salud.esterilizada,
      vacunas: salud.vacunas,
      desparasitado: salud.desparasitado,
      microchip: '',
      descripcion: descripcionPublica,
      grupo: esGrupo ? nombre : '',
      grupo_obligatorio: esGrupo,
      origen: 'milanuncios',
      origen_id: String(ad.id),
      origen_url: 'https://www.milanuncios.com' + ad.url
    },
    web: {
      titulo: limpiar(ad.title),
      slug: slug(nombre) + '-' + String(ad.id),
      categoria: especie === 'Gato' ? 'Gatos en adopción' : (especie === 'Perro' ? 'Perros en adopción' : ''),
      extracto: extracto(descripcionPublica),
      contenido_html: parrafos(descripcionPublica),
      estado_publicacion: 'borrador',
      tags: [especie, ad.city?.name, 'adopción'].filter(Boolean),
      media: {
        coverImage: imagenes[0] ? { src: imagenes[0], alt: nombre } : null,
        gallery: imagenes.slice(1).map((src, i) => ({ src, alt: nombre, caption: '', order: i + 1 })),
        videos: [],
        icons: []
      },
      animal: {
        location: { city: ad.city?.name || '', province: ad.province?.name || '' },
        health: {
          ...(salud.esterilizada === null ? {} : { neutered: salud.esterilizada }),
          ...(salud.vacunas ? { vaccinated: true } : {}),
          ...(salud.desparasitado ? { dewormed: true } : {})
        }
      }
    },
    revision: {
      revisado: false,
      motivos
    }
  };
}

async function descargarFotos(context, ad, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const rutas = [];
  for (let i = 0; i < ad.images.length; i++) {
    const url = ad.images[i];
    try {
      // La URL base del JSON no sirve: Milanuncios exige una regla de tamaño.
      // `detail_640x480` es la que usa la ficha; `hw396` queda de respaldo.
      let r = null;
      for (const regla of ['detail_640x480', 'hw396', 'hw']) {
        r = await context.request.get(url + (url.includes('?') ? '&' : '?') + 'rule=' + regla, { headers: { Referer: URL_TIENDA }, timeout: 30000 });
        if (r.ok()) break;
      }
      if (!r || !r.ok()) throw new Error('HTTP ' + (r ? r.status() : 'sin respuesta'));
      const tipo = r.headers()['content-type'] || 'image/jpeg';
      const ext = /png/i.test(tipo) ? 'png' : (/webp/i.test(tipo) ? 'webp' : 'jpg');
      const rel = path.join(dir, String(i + 1).padStart(2, '0') + '.' + ext);
      fs.writeFileSync(rel, await r.body());
      rutas.push(rel.replace(/\\/g, '/'));
    } catch (e) {
      console.warn(`  · foto ${i + 1} de ${ad.id}: ${e.message}`);
    }
  }
  return rutas;
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    locale: 'es-ES',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  console.log('Abriendo', URL_TIENDA);
  await page.goto(URL_TIENDA, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const s = Array.from(document.scripts).filter(x => !x.src).map(x => x.textContent).join(String.fromCharCode(10));
    return /window\.__INITIAL_PROPS__\s*=\s*JSON\.parse\(/.test(s);
  }, null, { timeout: 45000 });

  const data = await page.evaluate(() => {
    const s = Array.from(document.scripts).filter(x => !x.src).map(x => x.textContent).join(String.fromCharCode(10));
    const m = s.match(/window\.__INITIAL_PROPS__\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)/);
    if (!m) throw new Error('No se encontró __INITIAL_PROPS__');
    const o = JSON.parse(JSON.parse(m[1]));
    return {
      store: o.store,
      pagination: o.pagination,
      ads: o.ads
    };
  });

  console.log(`Tienda: ${data.store?.name || '?'} · ${data.ads.length} anuncios`);

  const anuncios = [];
  for (const ad of data.ads) {
    const item = normalizar(ad);
    if (!sinFotos && item.tipo === 'animal' && ad.images?.length) {
      const dir = path.join(DIR_FOTOS, String(ad.id));
      console.log(`  · fotos ${ad.id} (${ad.images.length})`);
      item.fotos_locales = await descargarFotos(context, ad, dir);
    }
    anuncios.push(item);
  }

  const salida = {
    fuente: 'milanuncios',
    tienda: {
      nombre: data.store?.name || 'GRUPO NEBAK',
      url: URL_TIENDA,
      direccion: data.store?.address || '',
      telefono: data.store?.phone || '',
      descripcion: data.store?.description || ''
    },
    extraido_en: new Date().toISOString(),
    total_anuncios: data.ads.length,
    anuncios
  };

  fs.mkdirSync(DIR_DATOS, { recursive: true });
  const destino = path.join(DIR_DATOS, 'grupo-nebak.json');
  fs.writeFileSync(destino, JSON.stringify(salida, null, 2) + '\n');
  const animales = anuncios.filter(a => a.tipo === 'animal');

  const filasRevision = animales.map(a => {
    const faltan = (a.revision.motivos || []).join('; ') || '—';
    const fotos = (a.fotos_locales || []).length;
    return `| [ ] | ${a.animal.nombre} | ${a.animal.especie || '?'} | ${a.animal.sexo || '?'} | ${a.animal.edad || '?'} | ${faltan} | [anuncio](${a.origen_url}) | ${fotos} |`;
  }).join(String.fromCharCode(10));
  const revision = [
    '# Revisión de animales · Milanuncios',
    '',
    'Extraído el ' + salida.extraido_en.slice(0, 10) + '. ' + animales.length + ' anuncios de animales y 1 servicio omitido.',
    '',
    'Corrige el JSON y pon `revision.revisado: true` en las fichas que quieras importar. El importador no crea nada sin esa marca.',
    '',
    '| Hecho | Nombre | Especie | Sexo | Edad | Pendiente | Anuncio | Fotos |',
    '|---|---|---|---|---|---|---|---|',
    filasRevision,
    '',
    '## Cómo importar',
    '',
    '    node scripts/importar-animales.mjs                         # dry-run',
    '    GN_API="<url /exec>" GN_TOKEN="<token admin>" node scripts/importar-animales.mjs --aplicar',
    '',
    'Las fotos están en `datos/milanuncios/fotos/<id>/`. Con `--subir-portada` la primera foto se sube a Drive.',
    ''
  ].join(String.fromCharCode(10));
  fs.writeFileSync(path.join(DIR_DATOS, 'REVISION.md'), revision);
  console.log(`\nGuardado: ${destino}`);
  console.log(`Animales para revisar: ${animales.length} · servicios omitidos: ${anuncios.length - animales.length}`);
  animales.forEach(a => console.log(`  ${a.animal.nombre.padEnd(22)} ${a.animal.especie.padEnd(6)} ${a.animal.sexo.padEnd(8)} ${a.revision.motivos.length ? '⚠ ' + a.revision.motivos.join(' | ') : 'OK'}`));
} finally {
  await browser.close();
}
