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

/**
 * Anotación de GitHub Actions: el aviso sale en el resumen del run y no solo
 * enterrado en el log. Fuera de Actions se imprime como línea normal.
 */
function anotacion(nivel, mensaje) {
  const texto = String(mensaje == null ? '' : mensaje)
    .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return '::' + nivel + '::' + texto;
}

function anotar(nivel, mensaje) {
  if (process.env.GITHUB_ACTIONS === 'true') console.log(anotacion(nivel, mensaje));
  else if (nivel === 'error') console.error('[prerender] ' + mensaje);
  else console.warn('[prerender] ' + mensaje);
}

/** Valida JSON-LD y canonical de una ficha indexable. */
function validarFichaHtml(html, esperado) {
  const errores = [];
  const texto = String(html || '');
  const canonEsperada = esperado && esperado.canonical ? String(esperado.canonical) : '';
  const scripts = texto.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  if (scripts.length !== 1) errores.push('se esperaba 1 bloque JSON-LD y hay ' + scripts.length);
  else {
    const jsonLd = scripts[0].replace(/^<script[^>]*>|<\/script>$/g, '');
    try {
      const data = JSON.parse(jsonLd);
      if (!data || data['@context'] !== 'https://schema.org') errores.push('JSON-LD sin @context schema.org');
      if (!data || !data['@type']) errores.push('JSON-LD sin @type');
      if (canonEsperada) {
        const id = data && data.mainEntityOfPage && data.mainEntityOfPage['@id'];
        if (id !== canonEsperada) errores.push('JSON-LD mainEntityOfPage no coincide con canonical');
      }
    } catch (e) {
      errores.push('JSON-LD no parseable: ' + e.message);
    }
  }
  const canonicals = texto.match(/<link rel="canonical" href="[^"]*">/g) || [];
  if (canonicals.length !== 1) errores.push('se esperaba 1 canonical y hay ' + canonicals.length);
  if (canonEsperada && canonicals.length === 1) {
    const href = canonicals[0].match(/href="([^"]*)"/);
    if (!href || href[1] !== canonEsperada) errores.push('canonical no coincide con la URL esperada');
  }
  return errores;
}

/** Lápida (410 lógico): noindex,nofollow y ni canónica ni JSON-LD. */
function validarLapidaHtml(html) {
  const texto = String(html || '');
  const errores = [];
  if (!/<meta name="robots" content="noindex,nofollow">/.test(texto)) errores.push('falta robots noindex,nofollow');
  if (/<link rel="canonical"/.test(texto)) errores.push('no debe llevar canonical');
  if (/application\/ld\+json/.test(texto)) errores.push('no debe llevar JSON-LD');
  return errores;
}

/** Página de paso (301 en Pages): noindex,follow y una canónica al destino. */
function validarRedirectHtml(html, destino) {
  const texto = String(html || '');
  const errores = [];
  if (!/<meta name="robots" content="noindex,follow">/.test(texto)) errores.push('falta robots noindex,follow');
  const canonicals = texto.match(/<link rel="canonical" href="[^"]*">/g) || [];
  if (canonicals.length !== 1) errores.push('se esperaba 1 canonical y hay ' + canonicals.length);
  else if (destino) {
    const href = canonicals[0].match(/href="([^"]*)"/);
    if (!href || href[1] !== String(destino)) errores.push('canonical no apunta al destino');
  }
  if (/application\/ld\+json/.test(texto)) errores.push('no debe llevar JSON-LD');
  return errores;
}

/**
 * Valida el HTML de cada página generada según su tipo: ficha (un JSON-LD
 * parseable y una sola canónica propia), lápida (noindex,nofollow sin canónica
 * ni JSON-LD) o redirección (noindex,follow con canónica al destino). Sin esto,
 * una página rota llegaba a publicarse.
 */
function validarPaginas(paginas, base) {
  const errores = [];
  (paginas || []).forEach(p => {
    if (!p) return;
    if (p.retirada) {
      validarLapidaHtml(p.html).forEach(e => errores.push(p.slug + ' (retirada): ' + e));
      return;
    }
    if (p.redirect) {
      validarRedirectHtml(p.html, p.destino).forEach(e => errores.push(p.slug + ' (redirección): ' + e));
      return;
    }
    validarFichaHtml(p.html, { canonical: urlEstatica(base, p.slug) })
      .forEach(e => errores.push(p.slug + ': ' + e));
  });
  return errores;
}

function validarSalida(salida) {
  const errores = [];
  const sitemap = salida && salida.sitemap;
  const robots = salida && salida.robots;
  if (!sitemap || sitemap.indexOf('<urlset') === -1) errores.push('sitemap.xml sin <urlset>');
  if (!sitemap || sitemap.indexOf('<url>') === -1) errores.push('sitemap.xml sin ninguna URL');
  if (!robots || robots.indexOf('User-agent') === -1) errores.push('robots.txt sin User-agent');
  if (!robots || robots.indexOf('Sitemap:') === -1) errores.push('robots.txt sin línea Sitemap:');
  if (sitemap) {
    const urls = (sitemap.match(/<url>/g) || []).length;
    const esperadas = 1 + (salida.paginas || []).filter(p => !p.retirada && !p.redirect).length;
    if (urls !== esperadas) {
      errores.push('sitemap.xml no cuadra: ' + urls + ' URLs frente a ' + esperadas + ' páginas');
    }
  }
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
  // Los enlaces internos vuelven al visor conservando la sección (`#/eventos`).
  const cuerpo = Publico.htmlDetalle(conCanonical).replace(/href="#(\/[^"]*)"/g, 'href="../publico.html#$1"');
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
    '  <script src="../js/publico-embed.js"></script>',
    '  <script src="../js/publico-compartir.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

/**
 * Página estática de retirada: el hosting de Pages no permite devolver 410 por
 * ruta, así que se deja una página `noindex` en la canónica antigua en lugar
 * de un 404. La web real sí podrá responder 410 con esta misma ruta.
 */
function paginaRetirada() {
  const titulo = 'Publicación retirada · Grupo Nebak';
  const descripcion = 'Esta publicación ya no está disponible.';
  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta name="theme-color" content="#0F5F31">',
    '  <meta name="referrer" content="no-referrer">',
    '  <title>' + Publico.esc(titulo) + '</title>',
    '  <meta name="description" content="' + Publico.esc(descripcion) + '">',
    '  <meta name="robots" content="noindex,nofollow">',
    '  <link rel="icon" href="../assets/icons/logo-nebak.jpg">',
    '  <link rel="stylesheet" href="../css/publico.css">',
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
    '    <section class="pub-error">',
    '      <h1>Publicación retirada</h1>',
    '      <p>Esta publicación ya no está disponible. Su enlace se ha retirado de forma permanente.</p>',
    '      <a class="pub-btn" href="../publico.html">Ver todas las publicaciones</a>',
    '    </section>',
    '  </main>',
    '  <footer class="pub-footer"><p>Grupo Nebak · Contenido público. <a href="../publico.html">Ver todas las publicaciones</a></p></footer>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

/** Salida completa a disco: páginas, sitemap y robots. */
/**
 * Página estática de redirección (301 en el canal): en Pages no se puede emitir
 * 301 real por fichero, así que se genera una página de paso noindex con
 * canonical al destino y redirección por meta refresh/JS. No va al sitemap.
 */
function paginaRedirect(destinoUrl) {
  const destino = String(destinoUrl || '').replace(/"/g, '&quot;');
  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>Publicación movida – Grupo Nebak</title>',
    '  <meta name="description" content="Esta publicación se ha movido a una nueva dirección.">',
    '  <meta name="robots" content="noindex,follow">',
    '  <link rel="canonical" href="' + destino + '">',
    '  <meta http-equiv="refresh" content="0; url=' + destino + '">',
    '  <link rel="stylesheet" href="../css/variables.css">',
    '  <link rel="stylesheet" href="../css/publico.css">',
    '  <link rel="icon" href="../assets/icon-192.png">',
    '</head>',
    '<body>',
    '  <a href="#contenido" class="skip-link">Saltar al contenido</a>',
    '  <header class="pub-header">',
    '    <a href="../publico.html" class="pub-marca"><img src="../assets/icon-192.png" alt="" width="40" height="40"><span>Grupo Nebak</span></a>',
    '    <nav aria-label="Principal"><a href="../publico.html">Publicaciones</a></nav>',
    '  </header>',
    '  <main id="contenido" class="pub-main">',
    '    <section class="pub-error">',
    '      <h1>Publicación movida</h1>',
    '      <p>Esta publicación se encuentra ahora en otra dirección.</p>',
    '      <a class="pub-btn" href="' + destino + '">Ir a la publicación actual</a>',
    '    </section>',
    '  </main>',
    '  <footer class="pub-footer"><p>Grupo Nebak – Contenido público. <a href="../publico.html">Ver todas las publicaciones</a></p></footer>',
    '  <script>location.replace(' + JSON.stringify(destinoUrl || '') + ');</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

/** Salida completa a disco: páginas, sitemap y robots. */
function construirSalida(publicaciones, base, retiradas, redirects) {
  const paginas = [];
  const urls = [{ loc: String(base).replace(/\/+$/, '') + '/publico.html' }];
  const publicados = new Set();
  const lapidas = new Set((retiradas || [])
    .map(r => slugSeguro(r && (r.slug || r)))
    .filter(Boolean));
  (publicaciones || []).forEach(pub => {
    if (!pub || pub.listed === false) return;
    const slug = slugSeguro(pub.slug);
    if (!slug) return;
    lapidas.delete(slug);
    publicados.add(slug);
    paginas.push({ slug: slug, html: paginaEstatica(pub, base) });
    urls.push({ loc: urlEstatica(base, slug), lastmod: pub.updatedAt || pub.publishedAt });
  });
  lapidas.forEach(slug => {
    paginas.push({ slug: slug, retirada: true, html: paginaRetirada() });
  });
  (redirects || []).forEach(r => {
    const from = slugSeguro(r && (r.slug || r.from || r.fromSlug));
    const toSlug = slugSeguro(r && (r.currentSlug || r.toSlug));
    if (!from || publicados.has(from) || lapidas.has(from)) return;
    const destino = (r && r.to) || (toSlug ? urlEstatica(base, toSlug) : '');
    if (!destino) return;
    paginas.push({ slug: from, redirect: true, destino: destino, html: paginaRedirect(destino) });
  });
  // Índice de páginas generadas: el visor solo declara como canónica una
  // estática que ya existe (una ficha recién publicada aún no la tiene).
  const indice = JSON.stringify({
    generadoEn: new Date().toISOString(),
    publicados: Array.from(publicados).sort(),
    retirados: Array.from(lapidas).sort()
  }, null, 2);
  return { paginas: paginas, sitemap: sitemapXml(urls), robots: robotsTxt(base), indice: indice };
}

async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function recolectarRetiradas(api) {
  // `nocache=1` evita que el prerender publique una lápida obsoleta si el canal
  // acaba de restaurar/retirar una publicación (cache interna ~60 s).
  const res = await json(api + (api.indexOf('?') === -1 ? '?' : '&') + 'endpoint=retiradas&nocache=1');
  if (!res || res.status !== 'success') {
    throw new Error((res && (res.error || res.detail)) || 'El canal no devolvió retiradas');
  }
  return (res.data || []).map(r => ({
    slug: r && r.slug,
    tipo: r && r.tipo,
    retiradoEn: r && (r.retiradoEn || r.retirado_en)
  }));
}

async function recolectar(api, fallos) {
  const lista = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await json(api + (api.indexOf('?') === -1 ? '?' : '&') +
      'endpoint=publicaciones&page=' + page + '&pageSize=50&nocache=1');
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
        'endpoint=publicacion&slug=' + encodeURIComponent(item.slug) + '&nocache=1');
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
  let retiradas = [];
  let redirects = [];

  try {
    if (args.fixture) {
      const datos = JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8'));
      publicaciones = Array.isArray(datos) ? datos : (datos.publicaciones || []);
      retiradas = Array.isArray(datos) ? [] : (datos.retiradas || []);
      redirects = Array.isArray(datos) ? [] : (datos.redirects || []);
    } else {
      if (!api) throw new Error('Falta API_URL en src/js/config.js (ejecuta npm run build)');
      publicaciones = await recolectar(api, fallos);
      try {
        retiradas = await recolectarRetiradas(api);
      } catch (e) {
        const mensaje = 'No se pudieron leer las retiradas (' + e.message +
          '). No se pueden generar las páginas de retirada.';
        if (!args.soft) throw new Error(mensaje + ' Se detiene el despliegue.');
        anotar('warning', mensaje + ' Se continúa por --soft.');
      }
      try {
        const r = await json(api + (api.indexOf('?') === -1 ? '?' : '&') + 'endpoint=redirects&nocache=1');
        redirects = (r && r.data) || [];
      } catch (e) {
        anotar('warning', 'No se pudieron leer las redirecciones (' + e.message + '). Se continúa sin páginas de redirección.');
      }
    }
  } catch (err) {
    const mensaje = 'No se pudo leer el canal: ' + err.message +
      '. Sin datos no hay sitemap ni robots que publicar.';
    if (!args.soft) throw new Error(mensaje + ' Se detiene el despliegue.');
    anotar('warning', mensaje + ' Se continúa por --soft.');
    return { paginas: [], sitemap: '', robots: '' };
  }

  if (fallos.length) {
    const mensaje = 'No se pudieron generar ' + fallos.length + ' ficha(s): ' + fallos.join(' · ');
    if (!args.soft) throw new Error(mensaje + '. Se detiene el despliegue para no dejar páginas sin generar.');
    anotar('warning', mensaje);
  }

  const salida = construirSalida(publicaciones, base, retiradas, redirects);
  const errores = validarSalida(salida).concat(validarPaginas(salida.paginas, base));
  if (errores.length) {
    const mensaje = 'Salida incompleta: ' + errores.join('; ');
    if (!args.soft) {
      throw new Error(mensaje + '. Se detiene el despliegue para no publicar sin sitemap ni robots.');
    }
    anotar('warning', mensaje);
    return salida;
  }

  if (args.dry) {
    const retiradasN = salida.paginas.filter(p => p.retirada).length;
    const redirN = salida.paginas.filter(p => p.redirect).length;
    console.log('[prerender] dry-run: ' + (salida.paginas.length - retiradasN - redirN) + ' fichas, ' +
      retiradasN + ' retiradas y ' + redirN + ' redirecciones para ' + base);
    return salida;
  }

  const dir = path.join(out, 'publicaciones');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  salida.paginas.forEach(p => fs.writeFileSync(path.join(dir, p.slug + '.html'), p.html, 'utf8'));
  fs.writeFileSync(path.join(dir, 'index.json'), salida.indice, 'utf8');
  fs.writeFileSync(path.join(out, 'sitemap.xml'), salida.sitemap, 'utf8');
  fs.writeFileSync(path.join(out, 'robots.txt'), salida.robots, 'utf8');
  const totalRetiradas = salida.paginas.filter(p => p.retirada).length;
  const totalRedir = salida.paginas.filter(p => p.redirect).length;
  console.log('[prerender] ' + (salida.paginas.length - totalRetiradas - totalRedir) + ' fichas + ' +
    totalRetiradas + ' retiradas + ' + totalRedir + ' redirecciones + index.json + sitemap.xml + robots.txt en ' + out);
  return salida;
}

module.exports = {
  basePublica, apiUrlDeConfig, slugSeguro, urlEstatica,
  sitemapXml, robotsTxt, validarSalida, validarPaginas, validarFichaHtml, validarLapidaHtml,
  validarRedirectHtml, anotacion, anotar,
  paginaEstatica, paginaRetirada, paginaRedirect, construirSalida, main
};

if (require.main === module) {
  main().catch(err => {
    anotar('error', err.message);
    process.exit(1);
  });
}
