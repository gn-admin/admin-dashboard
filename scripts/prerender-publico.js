#!/usr/bin/env node
/**
 * Prerender SEO del visor público (simulación de la web real).
 * ---------------------------------------------------------------------------
 * Genera, a partir del canal público, una página estática por ficha más
 * `sitemap.xml` y `robots.txt`. Así el contenido, las metas y el JSON-LD
 * existen sin ejecutar JavaScript, que es lo que necesita un buscador.
 *
 * Uso:
 *   node scripts/prerender-publico.js                  # canal real (bloquea si falla)
 *   node scripts/prerender-publico.js --fixture f.json # sin red (pruebas)
 *   node scripts/prerender-publico.js --dry            # solo resumen
 *   node scripts/prerender-publico.js --soft           # avisa y sigue (manual)
 *
 * Base pública: `PUBLIC_WEB_BASE_URL` o, en CI, el Pages del repositorio.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Publico = require('../src/js/publico.js');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'src');

/** Base pública sin barra final. */
function basePublica(env = process.env) {
  const explicita = String(env.PUBLIC_WEB_BASE_URL || '').trim();
  if (explicita) return explicita.replace(/\/+$/, '');
  const repo = String(env.GITHUB_REPOSITORY || '').trim();
  if (/^[^/]+\/[^/]+$/.test(repo)) {
    const [owner, nombre] = repo.split('/');
    return 'https://' + owner.toLowerCase() + '.github.io/' + nombre;
  }
  return 'https://gn-admin.github.io/admin-dashboard';
}

/** `apiUrl` de la config generada por `npm run build`. */
function apiUrlDeConfig(archivo = path.join(RAIZ, 'src', 'js', 'config.js')) {
  let texto = '';
  try { texto = fs.readFileSync(archivo, 'utf8'); } catch (e) { return ''; }
  const m = texto.match(/apiUrl\s*:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '';
}

/** Slug apto para nombre de fichero (sin rutas ni acentos). */
function slugSeguro(valor) {
  return String(valor == null ? '' : valor)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function urlEstatica(base, slug) {
  return String(base).replace(/\/+$/, '') + '/publicaciones/' + slugSeguro(slug) + '.html';
}

function escXml(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fechaCorta(valor) {
  const s = String(valor || '');
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function sitemapXml(urls) {
  const entradas = (urls || []).filter(u => u && u.loc);
  const cuerpo = entradas.map(u => {
    const lastmod = fechaCorta(u.lastmod);
    return '  <url>\n    <loc>' + escXml(u.loc) + '</loc>' +
      (lastmod ? '\n    <lastmod>' + lastmod + '</lastmod>' : '') + '\n  </url>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    cuerpo + '\n</urlset>\n';
}

function validarSalida(salida) {
  const errores = [];
  const sitemap = String((salida && salida.sitemap) || '');
  const robots = String((salida && salida.robots) || '');
  const paginas = (salida && salida.paginas) || [];
  const urls = (sitemap.match(/<url>/g) || []).length;
  if (!/<urlset[\s>]/.test(sitemap)) errores.push('sitemap.xml sin <urlset>');
  if (urls < 1) errores.push('sitemap.xml sin ninguna URL');
  if (urls !== paginas.length + 1) {
    errores.push('sitemap.xml no cuadra: ' + urls + ' URLs frente a ' + (paginas.length + 1) + ' páginas');
  }
  if (!/^User-agent:\s*\*/m.test(robots)) errores.push('robots.txt sin User-agent');
  if (!/^Sitemap:\s+\S+/m.test(robots)) errores.push('robots.txt sin línea Sitemap:');
  return errores;
}

function robotsTxt(base) {
  const limpia = String(base).replace(/\/+$/, '');
  let dir = '';
  try { dir = new URL(limpia).pathname.replace(/\/+$/, ''); } catch (e) { dir = ''; }
  // Las rutas Allow son más largas que el Disallow general, así que ganan.
  return [
    'User-agent: *',
    'Allow: ' + dir + '/publico.html',
    'Allow: ' + dir + '/publicaciones/',
    'Disallow: ' + dir + '/',
    'Sitemap: ' + limpia + '/sitemap.xml',
    ''
  ].join('\n');
}

/** Página estática de una ficha: metas, JSON-LD y contenido ya renderizado. */
function paginaEstatica(pub, base) {
  const slug = slugSeguro(pub && pub.slug);
  const canonical = urlEstatica(base, slug);
  const conCanonical = Object.assign({}, pub, {
    canonical: canonical,
    seo: Object.assign({}, (pub && pub.seo) || {}, { canonical: canonical })
  });
  const meta = Publico.metaDe(conCanonical);
  const ld = Publico.jsonLd(conCanonical);
  const cuerpo = Publico.htmlDetalle(conCanonical).replace(/href="#\/"/g, 'href="../publico.html"');
  const imagen = Publico.urlSegura(meta.image);
  let imagenAbs = '';
  if (imagen) {
    if (/^https?:\/\//i.test(imagen)) imagenAbs = imagen;
    else { try { imagenAbs = new URL(imagen, canonical).href; } catch (e) { imagenAbs = ''; } }
  }

  const metas = [
    '  <meta name="theme-color" content="#0F5F31">',
    '  <meta name="referrer" content="no-referrer">',
    '  <title>' + Publico.esc(meta.title) + '</title>',
    '  <meta name="description" content="' + Publico.esc(meta.description) + '">',
    '  <meta name="robots" content="' + Publico.esc(meta.robots) + '">',
    '  <link rel="canonical" href="' + Publico.esc(canonical) + '">',
    '  <meta property="og:site_name" content="Grupo Nebak">',
    '  <meta property="og:type" content="article">',
    '  <meta property="og:title" content="' + Publico.esc(meta.title) + '">',
    '  <meta property="og:description" content="' + Publico.esc(meta.description) + '">',
    '  <meta property="og:url" content="' + Publico.esc(canonical) + '">',
    imagenAbs ? '  <meta property="og:image" content="' + Publico.esc(imagenAbs) + '">' : '',
    '  <meta name="twitter:card" content="' + (imagenAbs ? 'summary_large_image' : 'summary') + '">',
    '  <meta name="twitter:title" content="' + Publico.esc(meta.title) + '">',
    '  <meta name="twitter:description" content="' + Publico.esc(meta.description) + '">',
    imagenAbs ? '  <meta name="twitter:image" content="' + Publico.esc(imagenAbs) + '">' : '',
    '  <link rel="icon" href="../assets/icons/logo-nebak.jpg">',
    '  <link rel="stylesheet" href="../css/publico.css">',
    ld ? '  <script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>' : ''
  ].filter(Boolean).join('\n');

  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    metas,
    '</head>',
    '<body>',
    '  <header class="pub-header">',
    '    <a class="pub-brand" href="../publico.html">',
    '      <img src="../assets/icons/logo-nebak.jpg" alt="Grupo Nebak" width="44" height="44">',
    '      <span><strong>Grupo Nebak</strong><small>Publicaciones</small></span>',
    '    </a>',
    '    <a class="pub-link-panel" href="../publico.html">Todas las publicaciones</a>',
    '  </header>',
    '  <main id="pub-contenido" class="pub-main">',
    '    ' + cuerpo,
    '  </main>',
    '  <footer class="pub-footer"><p>Grupo Nebak · Contenido público. <a href="../publico.html">Ver todas las publicaciones</a></p></footer>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

/** Salida completa a disco: páginas, sitemap y robots. */
function construirSalida(publicaciones, base) {
  const paginas = [];
  const urls = [{ loc: String(base).replace(/\/+$/, '') + '/publico.html' }];
  (publicaciones || []).forEach(pub => {
    if (!pub || pub.listed === false) return;
    const slug = slugSeguro(pub.slug);
    if (!slug) return;
    paginas.push({ slug: slug, html: paginaEstatica(pub, base) });
    urls.push({ loc: urlEstatica(base, slug), lastmod: pub.updatedAt || pub.publishedAt });
  });
  return { paginas: paginas, sitemap: sitemapXml(urls), robots: robotsTxt(base) };
}

async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function recolectar(api, fallos) {
  const lista = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await json(api + (api.indexOf('?') === -1 ? '?' : '&') +
      'endpoint=publicaciones&page=' + page + '&pageSize=50');
    if (!res || res.status !== 'success') {
      throw new Error((res && (res.error || res.detail)) || 'El canal no devolvió publicaciones');
    }
    lista.push(...(res.data || []));
    totalPages = (res.pagination && res.pagination.totalPages) || 1;
    page += 1;
  } while (page <= totalPages && page <= 20);

  const detalle = [];
  for (const item of lista) {
    if (item.listed === false || !slugSeguro(item.slug)) continue;
    try {
      const res = await json(api + (api.indexOf('?') === -1 ? '?' : '&') +
        'endpoint=publicacion&slug=' + encodeURIComponent(item.slug));
      if (res && res.status === 'success' && res.data) detalle.push(res.data);
    } catch (e) {
      if (fallos) fallos.push(item.slug + ': ' + e.message);
      else console.warn('[prerender] Se omite "' + item.slug + '": ' + e.message);
    }
  }
  return detalle;
}

function leerArgs(argv) {
  const args = { soft: false, dry: false, fixture: '', api: '', base: '', out: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--soft' || a === '--allow-empty') args.soft = true;
    else if (a === '--dry') args.dry = true;
    else if (a === '--fixture') { args.fixture = argv[i + 1] || ''; i += 1; }
    else if (a === '--api') { args.api = argv[i + 1] || ''; i += 1; }
    else if (a === '--base') { args.base = argv[i + 1] || ''; i += 1; }
    else if (a === '--out') { args.out = argv[i + 1] || ''; i += 1; }
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = leerArgs(argv);
  const base = String(args.base || basePublica()).replace(/\/+$/, '');
  const out = path.resolve(args.out || SALIDA);
  const api = args.api || apiUrlDeConfig();
  const fallos = [];
  let publicaciones = [];

  try {
    if (args.fixture) {
      const datos = JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8'));
      publicaciones = Array.isArray(datos) ? datos : (datos.publicaciones || []);
    } else {
      if (!api) throw new Error('Falta API_URL en src/js/config.js (ejecuta npm run build)');
      publicaciones = await recolectar(api, fallos);
    }
  } catch (err) {
    const mensaje = 'No se pudo leer el canal: ' + err.message +
      '. Sin datos no hay sitemap ni robots que publicar.';
    if (!args.soft) throw new Error(mensaje + ' Se detiene el despliegue.');
    console.warn('[prerender] Aviso: ' + mensaje + ' Se continúa por --soft.');
    return { paginas: [], sitemap: '', robots: '' };
  }

  if (fallos.length) {
    const mensaje = 'No se pudieron generar ' + fallos.length + ' ficha(s): ' + fallos.join(' · ');
    if (!args.soft) throw new Error(mensaje + '. Se detiene el despliegue para no dejar páginas sin generar.');
    console.warn('[prerender] Aviso: ' + mensaje);
  }

  const salida = construirSalida(publicaciones, base);
  const errores = validarSalida(salida);
  if (errores.length) {
    const mensaje = 'Salida incompleta: ' + errores.join('; ');
    if (!args.soft) {
      throw new Error(mensaje + '. Se detiene el despliegue para no publicar sin sitemap ni robots.');
    }
    console.warn('[prerender] Aviso: ' + mensaje);
    return salida;
  }

  if (args.dry) {
    console.log('[prerender] dry-run: ' + salida.paginas.length + ' fichas para ' + base);
    return salida;
  }

  const dir = path.join(out, 'publicaciones');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  salida.paginas.forEach(p => fs.writeFileSync(path.join(dir, p.slug + '.html'), p.html, 'utf8'));
  fs.writeFileSync(path.join(out, 'sitemap.xml'), salida.sitemap, 'utf8');
  fs.writeFileSync(path.join(out, 'robots.txt'), salida.robots, 'utf8');
  console.log('[prerender] ' + salida.paginas.length + ' fichas estáticas + sitemap.xml + robots.txt en ' + out);
  return salida;
}

module.exports = {
  basePublica, apiUrlDeConfig, slugSeguro, urlEstatica,
  sitemapXml, robotsTxt, validarSalida, paginaEstatica, construirSalida, main
};

if (require.main === module) {
  main().catch(err => {
    console.error('[prerender] ' + err.message);
    process.exit(1);
  });
}
