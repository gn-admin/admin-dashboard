'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prerender = require('../scripts/prerender-publico.js');
const Publico = require('../src/js/publico.js');

const FIXTURES = path.join(__dirname, 'fixtures', 'prerender');

/** Genera la salida completa a un directorio temporal desde una fixture. */
function generar(fixture) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
  return prerender.main(['--fixture', path.join(FIXTURES, fixture), '--base', BASE, '--out', out])
    .then(salida => ({ out: out, salida: salida }));
}

const BASE = 'https://gn-admin.github.io/admin-dashboard';

const muestra = {
  slug: 'Laia 2026',
  type: 'animal',
  category: 'Gato en adopción',
  status: 'en_adopcion',
  title: 'Laia',
  excerpt: 'Gata joven, sociable y juguetona.',
  publishedAt: '2026-10-02T10:00:00Z',
  updatedAt: '2026-10-03T10:00:00Z',
  contentHtml: '<p>Laia busca familia.</p>',
  coverImage: { src: 'assets/fotos/laia.jpg', alt: 'Laia' },
  icons: [{ icon: 'edad', label: 'Edad', value: '2 años' }],
  tags: ['sociable'],
  animal: { species: 'Gato', temperament: ['Sociable'], health: { vaccinated: true } },
  seo: { metaTitle: 'Laia en adopción', metaDescription: 'Gata joven en adopción.', robots: 'index,follow', canonical: '' }
};

test('slugSeguro deja un nombre de fichero limpio', () => {
  assert.equal(prerender.slugSeguro('Laia 2026'), 'laia-2026');
  assert.equal(prerender.slugSeguro('¡Gato/Perro! ¿Ñ?'), 'gato-perro-n');
  assert.equal(prerender.slugSeguro(''), '');
  assert.equal(prerender.slugSeguro(null), '');
  assert.equal(prerender.slugSeguro('../../etc/passwd'), 'etc-passwd');
});

test('urlEstatica cuelga de /publicaciones/<slug>.html', () => {
  assert.equal(prerender.urlEstatica(BASE, 'Laia 2026'), BASE + '/publicaciones/laia-2026.html');
});

test('basePublica prioriza la variable y cae al Pages del repo', () => {
  assert.equal(prerender.basePublica({ PUBLIC_WEB_BASE_URL: 'https://gruponebak.net/' }), 'https://gruponebak.net');
  assert.equal(prerender.basePublica({ GITHUB_REPOSITORY: 'gn-admin/admin-dashboard' }), BASE);
  assert.equal(prerender.basePublica({}), BASE);
});

test('paginaEstatica incluye metas, canonical propio y JSON-LD', () => {
  const html = prerender.paginaEstatica(muestra, BASE);
  assert.match(html, /<title>Laia en adopción<\/title>/);
  assert.match(html, /<meta name="description" content="Gata joven en adopción\.">/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/gn-admin\.github\.io\/admin-dashboard\/publicaciones\/laia-2026\.html">/);
  assert.match(html, /<meta property="og:url" content="[^"]*laia-2026\.html">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org"/);
  assert.match(html, /"mainEntityOfPage":\{"@type":"WebPage","@id":"[^"]*laia-2026\.html"\}/);
});

test('paginaEstatica prerenderiza el contenido y resuelve la imagen OG', () => {
  const html = prerender.paginaEstatica(muestra, BASE);
  assert.match(html, /<h1>Laia<\/h1>/);
  assert.match(html, /pub-ficha-hero/);
  assert.match(html, /Datos destacados/);
  assert.match(html, /<p>Laia busca familia\.<\/p>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/gn-admin\.github\.io\/admin-dashboard\/publicaciones\/assets\/fotos\/laia\.jpg">/);
});

test('paginaEstatica no arrastra scripts ni enlaces de hash', () => {
  const html = prerender.paginaEstatica(muestra, BASE);
  assert.equal(/<script src=/.test(html), false);
  assert.equal(/href="#\//.test(html), false);
  assert.match(html, /href="\.\.\/publico\.html"/);
});

test('sitemapXml escapa URLs y añade lastmod', () => {
  const xml = prerender.sitemapXml([
    { loc: BASE + '/publico.html' },
    { loc: 'https://ejemplo.test/a?b=1&c=2', lastmod: '2026-10-03T10:00:00Z' }
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/gn-admin\.github\.io\/admin-dashboard\/publico\.html<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ejemplo\.test\/a\?b=1&amp;c=2<\/loc>/);
  assert.match(xml, /<lastmod>2026-10-03<\/lastmod>/);
});

test('robotsTxt permite lo público y apunta al sitemap', () => {
  const txt = prerender.robotsTxt(BASE);
  assert.match(txt, /^User-agent: \*$/m);
  assert.match(txt, /^Allow: \/admin-dashboard\/publico\.html$/m);
  assert.match(txt, /^Allow: \/admin-dashboard\/publicaciones\/$/m);
  assert.match(txt, /^Disallow: \/admin-dashboard\/$/m);
  assert.match(txt, /^Sitemap: https:\/\/gn-admin\.github\.io\/admin-dashboard\/sitemap\.xml$/m);
});

test('construirSalida omite lo no listado y normaliza los slugs', () => {
  const salida = prerender.construirSalida([
    muestra,
    { slug: 'oculta', listed: false, title: 'Oculta' },
    { slug: '', title: 'Sin slug' }
  ], BASE);
  assert.equal(salida.paginas.length, 1);
  assert.equal(salida.paginas[0].slug, 'laia-2026');
  assert.equal(salida.sitemap.split('<url>').length - 1, 2); // listado + ficha
  assert.match(salida.sitemap, /publicaciones\/laia-2026\.html/);
  const indice = JSON.parse(salida.indice);
  assert.deepEqual(indice.publicados, ['laia-2026']);
  assert.deepEqual(indice.retirados, []);
  assert.ok(indice.generadoEn);
});

test('el índice incluye retiradas y omite el slug publicado que recupera su ficha', () => {
  const salida = prerender.construirSalida([muestra], BASE, [{ slug: 'historia-retirada' }, { slug: 'laia-2026' }]);
  const indice = JSON.parse(salida.indice);
  assert.deepEqual(indice.publicados, ['laia-2026']);
  assert.deepEqual(indice.retirados, ['historia-retirada']);
});

test('anotacion produce comandos de GitHub Actions escapados', () => {
  assert.equal(prerender.anotacion('warning', 'linea1\nlinea2 100%'),
    '::warning::linea1%0Alinea2 100%25');
  assert.equal(prerender.anotacion('error', 'sin salto'), '::error::sin salto');
});

test('fixture ficha normal: HTML completo sin JavaScript', async () => {
  const { out } = await generar('ficha-normal.json');
  try {
    const html = fs.readFileSync(path.join(out, 'publicaciones', 'laia.html'), 'utf8');
    const indice = JSON.parse(fs.readFileSync(path.join(out, 'publicaciones', 'index.json'), 'utf8'));
    assert.ok(indice.publicados.includes('laia'));
    assert.match(html, /<title>Laia, border collie en adopción<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/gn-admin\.github\.io\/admin-dashboard\/publicaciones\/laia\.html"/);
    assert.match(html, /<meta property="og:image"/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /Border collie de 4 años/);
    assert.match(html, /alt="Laia jugando en el parque"/);
    assert.match(html, /<figcaption>Laia en el parque<\/figcaption>/);
    assert.doesNotMatch(html, /<script src=/);
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<url>/g) || []).length, 2);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('fixture sin portada: OG sin imagen y tarjeta simple', async () => {
  const { out } = await generar('sin-portada.json');
  try {
    const html = fs.readFileSync(path.join(out, 'publicaciones', 'jornada-acogida.html'), 'utf8');
    assert.match(html, /Jornada de acogida/);
    assert.doesNotMatch(html, /og:image/);
    assert.match(html, /name="twitter:card" content="summary"/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('fixture retirada: lapidas noindex fuera del sitemap', async () => {
  const { out } = await generar('retirada.json');
  try {
    const retirada = fs.readFileSync(path.join(out, 'publicaciones', 'historia-retirada.html'), 'utf8');
    assert.match(retirada, /<meta name="robots" content="noindex,nofollow">/);
    assert.match(retirada, /Publicación retirada/);
    assert.doesNotMatch(retirada, /rel="canonical"/);
    assert.ok(fs.existsSync(path.join(out, 'publicaciones', 'historia-vieja.html')));
    assert.ok(fs.existsSync(path.join(out, 'publicaciones', 'laia.html')));
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<url>/g) || []).length, 2);
    assert.doesNotMatch(sitemap, /historia-retirada/);
    const robots = fs.readFileSync(path.join(out, 'robots.txt'), 'utf8');
    assert.match(robots, /Sitemap: https:\/\/gn-admin\.github\.io\/admin-dashboard\/sitemap\.xml/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('validarSalida exige sitemap y robots utilizables', () => {
  const ok = prerender.construirSalida([muestra], BASE);
  assert.deepEqual(prerender.validarSalida(ok), []);

  const vacia = prerender.validarSalida({ paginas: [], sitemap: '', robots: '' }).join(' ');
  assert.match(vacia, /sitemap\.xml sin <urlset>/);
  assert.match(vacia, /sitemap\.xml sin ninguna URL/);
  assert.match(vacia, /robots\.txt sin User-agent/);
  assert.match(vacia, /robots\.txt sin línea Sitemap:/);

  const descuadre = prerender.validarSalida({ paginas: [], sitemap: ok.sitemap, robots: ok.robots }).join(' ');
  assert.match(descuadre, /sitemap\.xml no cuadra: 2 URLs frente a 1 páginas/);
});

test('una retirada genera página noindex fuera del sitemap', () => {
  const salida = prerender.construirSalida([muestra], BASE, [{ slug: 'historia-retirada' }]);
  assert.equal(salida.paginas.length, 2);
  const retirada = salida.paginas.find(p => p.slug === 'historia-retirada');
  assert.ok(retirada && retirada.retirada);
  assert.match(retirada.html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(retirada.html, /Publicación retirada/);
  assert.doesNotMatch(retirada.html, /rel="canonical"/);
  assert.doesNotMatch(retirada.html, /application\/ld\+json/);
  assert.doesNotMatch(salida.sitemap, /historia-retirada/);
  assert.equal((salida.sitemap.match(/<url>/g) || []).length, 2);
  assert.deepEqual(prerender.validarSalida(salida), []);
});

test('una ficha publicada manda sobre una lápida del mismo slug', () => {
  const salida = prerender.construirSalida([muestra], BASE, [{ slug: muestra.slug }]);
  assert.equal(salida.paginas.filter(p => p.slug === 'laia-2026').length, 1);
  assert.match(salida.paginas[0].html, /rel="canonical"/);
  assert.deepEqual(prerender.validarSalida(salida), []);
});

test('htmlDetalle se puede usar sin DOM (lo reutiliza el prerender)', () => {
  const html = Publico.htmlDetalle(muestra);
  assert.match(html, /<article class="pub-detalle( [^"]*)?">/);
  assert.match(html, /pub-back/);
  assert.match(html, /pub-facts-grid/);
});

test('validarFichaHtml exige canonical único y un JSON-LD coherente', () => {
  const html = prerender.paginaEstatica(muestra, BASE);
  const canonical = prerender.urlEstatica(BASE, muestra.slug);
  assert.deepEqual(prerender.validarFichaHtml(html, { canonical: canonical }), []);

  const sinLd = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  assert.match(prerender.validarFichaHtml(sinLd, { canonical: canonical }).join(' '), /1 bloque JSON-LD/);

  const dosCanon = html.replace('</head>', '  <link rel="canonical" href="' + canonical + '">\n</head>');
  assert.match(prerender.validarFichaHtml(dosCanon, { canonical: canonical }).join(' '), /1 canonical/);

  const canonMal = html.replace(/("mainEntityOfPage":\{"@type":"WebPage","@id":")[^"]+"/, '$1https://otro.test/x"');
  assert.match(prerender.validarFichaHtml(canonMal, { canonical: canonical }).join(' '), /mainEntityOfPage/);
});

test('fixture ficha normal: JSON-LD y canonical únicos y coherentes', async () => {
  const { out } = await generar('ficha-normal.json');
  try {
    const html = fs.readFileSync(path.join(out, 'publicaciones', 'laia.html'), 'utf8');
    const canonical = prerender.urlEstatica(BASE, 'laia');
    assert.deepEqual(prerender.validarFichaHtml(html, { canonical: canonical }), []);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('fixture ficha oculta/no listada: no se genera ni entra en sitemap', async () => {
  const { out } = await generar('oculta.json');
  try {
    assert.ok(fs.existsSync(path.join(out, 'publicaciones', 'visible.html')));
    assert.equal(fs.existsSync(path.join(out, 'publicaciones', 'oculta.html')), false);
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /publicaciones\/visible\.html/);
    assert.doesNotMatch(sitemap, /oculta\.html/);
    assert.equal((sitemap.match(/<url>/g) || []).length, 2); // listado + visible
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('construirSalida omite fichas no listadas (ocultas)', () => {
  const salida = prerender.construirSalida([
    muestra,
    { slug: 'oculta-2', listed: false, title: 'Oculta' }
  ], BASE);
  assert.equal(salida.paginas.filter(p => p.slug === 'oculta-2').length, 0);
  assert.doesNotMatch(salida.sitemap, /oculta-2/);
  assert.deepEqual(prerender.validarSalida(salida), []);
});

test('fixture redirect 301: genera página de paso noindex y no va al sitemap', async () => {
  const { out } = await generar('redirect-301.json');
  try {
    const destino = prerender.urlEstatica(BASE, 'luna-nueva');
    assert.ok(fs.existsSync(path.join(out, 'publicaciones', 'luna-nueva.html')));
    const redir = fs.readFileSync(path.join(out, 'publicaciones', 'luna-vieja.html'), 'utf8');
    assert.match(redir, /<meta name="robots" content="noindex,follow">/);
    assert.match(redir, /rel="canonical" href="https:\/\/gn-admin\.github\.io\/admin-dashboard\/publicaciones\/luna-nueva\.html"/);
    assert.match(redir, /http-equiv="refresh"/);
    assert.match(redir, /location\.replace/);
    assert.match(redir, /href="https:\/\/gn-admin\.github\.io\/admin-dashboard\/publicaciones\/luna-nueva\.html"/);
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /luna-nueva\.html/);
    assert.doesNotMatch(sitemap, /luna-vieja\.html/);
    assert.equal((sitemap.match(/<url>/g) || []).length, 2); // listado + destino
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('construirSalida genera redirecciones 301 estáticas fuera del sitemap', () => {
  const destino = prerender.urlEstatica(BASE, 'laia-2026');
  const salida = prerender.construirSalida([muestra], BASE, [], [
    { slug: 'laia-antigua', currentSlug: 'laia-2026', status: 301 }
  ]);
  assert.equal(salida.paginas.length, 2);
  const redir = salida.paginas.find(p => p.slug === 'laia-antigua');
  assert.ok(redir && redir.redirect);
  assert.match(redir.html, /<meta name="robots" content="noindex,follow">/);
  assert.match(redir.html, new RegExp('rel="canonical" href="' + destino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
  assert.doesNotMatch(redir.html, /application\/ld\+json/);
  assert.doesNotMatch(salida.sitemap, /laia-antigua/);
  assert.deepEqual(prerender.validarSalida(salida), []);
});
