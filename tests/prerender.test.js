'use strict';

const test = require('node:test');
const assert = require('node:assert');
const prerender = require('../scripts/prerender-publico.js');
const Publico = require('../src/js/publico.js');

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
  assert.match(html, /<article class="pub-detalle">/);
  assert.match(html, /pub-back/);
  assert.match(html, /pub-facts-grid/);
});
