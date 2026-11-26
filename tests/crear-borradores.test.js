'use strict';
/**
 * Borradores de publicación web (`scripts/crear-borradores.mjs`).
 *
 * La descripción HTML se compone solo con datos reales de la ficha: ni campos
 * inventados ni etiquetas fuera de la lista blanca del saneado público.
 */
const { test } = require('node:test');
const assert = require('node:assert');

let mod;
async function modulo() {
  return (mod ||= await import('../scripts/crear-borradores.mjs'));
}

const animal = {
  id: 'ani_1',
  nombre: 'Beltza',
  especie: 'Perro',
  raza: 'Mestiza de labrador',
  edad: '11 años',
  sexo: 'Hembra',
  tamano: 'Grande',
  color: '',
  capa: '',
  descripcion: 'Buscamos urgentemente adopción para Beltza.Es una perra de unos 11 años muy buena.Su familia está en una situación vulnerable.',
  vacunas: 'Sí',
  esterilizada: 'No',
  desparasitado: '',
  microchip: '',
  grupo: '',
  portada_url: 'https://drive.google.com/thumbnail?id=PORT1&sz=w1200',
  portada_alt: 'Beltza tumbada',
  galeria: JSON.stringify([
    { src: 'https://drive.google.com/thumbnail?id=G1&sz=w1200', alt: 'Beltza' },
    { src: 'https://drive.google.com/thumbnail?id=G2&sz=w1200', alt: '' }
  ])
};

test('slugDe normaliza acentos, mayúsculas y símbolos', async () => {
  const { slugDe } = await modulo();
  assert.equal(slugDe('Oreo y sus bebés'), 'oreo-y-sus-bebes');
  assert.equal(slugDe('  Zeus y Hera  '), 'zeus-y-hera');
  assert.equal(slugDe('Gatitos en adopción'), 'gatitos-en-adopcion');
  assert.equal(slugDe(''), '');
});

test('parrafosDe separa frases pegadas sin espacio tras el punto', async () => {
  const { parrafosDe } = await modulo();
  const ps = parrafosDe('Buscamos adopción.Es muy buena.su familia no puede.');
  assert.equal(ps.length, 3);
  assert.equal(ps[0], 'Buscamos adopción.');
  assert.equal(ps[2], 'su familia no puede.');
});

test('el contenido usa solo etiquetas de la lista blanca del saneado', async () => {
  const { contenidoHtml } = await modulo();
  const html = contenidoHtml(animal);
  const etiquetas = [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map(m => m[1].toLowerCase());
  const permitidas = ['p', 'h2', 'ul', 'li', 'strong', 'em'];
  etiquetas.forEach(t => assert.ok(permitidas.includes(t), 'etiqueta no permitida: ' + t));
});

test('el contenido escapa el texto del anuncio', async () => {
  const { contenidoHtml } = await modulo();
  const html = contenidoHtml(Object.assign({}, animal, { descripcion: 'Muerde <script>alert(1)</script> y dice "hola" & adiós.' }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;hola&quot;/);
  assert.match(html, /&amp;/);
});

test('solo lista los campos que existen en la ficha', async () => {
  const { contenidoHtml } = await modulo();
  const html = contenidoHtml(animal);
  assert.match(html, /<strong>Raza:<\/strong> Mestiza de labrador/);
  assert.match(html, /<strong>Edad:<\/strong> 11 años/);
  assert.match(html, /<strong>Vacunas:<\/strong> Sí/);
  assert.match(html, /<strong>Esterilización:<\/strong> No/);
  assert.doesNotMatch(html, /Color|Capa|Microchip|Desparasitado|Necesidades especiales|Se adopta en grupo/);
  assert.doesNotMatch(html, /1111|chip/i);
});

test('un animal sin descripción no inventa datos clínicos', async () => {
  const { contenidoHtml } = await modulo();
  const html = contenidoHtml({ nombre: 'Luna', especie: 'Gato' });
  assert.match(html, /Luna está en adopción/);
  assert.doesNotMatch(html, /Vacunas|Esterilización|Salud/);
  assert.doesNotMatch(html, /Se adopta en grupo/);
});

test('construirBorrador arma el payload en borrador con portada y galería', async () => {
  const { construirBorrador } = await modulo();
  const plan = construirBorrador(animal, null);
  assert.equal(plan.estado_publicacion, 'borrador');
  assert.equal(plan.animal_id, 'ani_1');
  assert.equal(plan.slug, 'beltza');
  assert.equal(plan.titulo, 'Beltza');
  assert.equal(plan.media.coverImage.src, animal.portada_url);
  assert.equal(plan.media.coverImage.alt, 'Beltza tumbada');
  assert.equal(plan.media.gallery.length, 2);
  assert.equal(plan.seo.metaDescription, plan.extracto);
  assert.ok(plan.extracto.length <= 160);
  assert.equal(plan.estado_publico_modo, 'auto');
});

test('no toca un animal que ya tiene publicación', async () => {
  const { construirBorrador } = await modulo();
  assert.equal(construirBorrador(animal, { id: 'web_1', slug: 'beltza' }), null);
  assert.equal(construirBorrador(animal, { publicacion_id: 'web_1' }), null);
  assert.equal(construirBorrador({ id: 'x' }, null), null);
});

test('--regenerar reescribe solo borradores, nunca lo publicado', async () => {
  const { construirBorrador } = await modulo();
  const borrador = { publicacion_id: 'web_1', slug: 'beltza', estado_publicacion: 'borrador' };
  assert.equal(construirBorrador(animal, borrador), null);
  assert.ok(construirBorrador(animal, borrador, { regenerar: true }));
  assert.equal(construirBorrador(animal, { publicacion_id: 'web_1', estado_publicacion: 'publicado' }, { regenerar: true }), null);
  assert.equal(construirBorrador(animal, { publicacion_id: 'web_1', estado_publicacion: 'retirado' }, { regenerar: true }), null);
});

test('los párrafos empiezan en mayúscula aunque el anuncio venga en minúscula', async () => {
  const { contenidoHtml } = await modulo();
  // Tres frases → dos párrafos: el segundo arranca con la minúscula del anuncio.
  const html = contenidoHtml(Object.assign({}, animal, { descripcion: 'Buscamos adopción.Es una perra muy buena.su familia no puede hacerse cargo.' }));
  assert.match(html, /<p>Su familia no puede hacerse cargo\.<\/p>/);
});

test('agrupa las frases de dos en dos para que no quede un bloque de texto', async () => {
  const { contenidoHtml } = await modulo();
  const html = contenidoHtml(Object.assign({}, animal, { descripcion: 'Una.Dos.Tres.Cuatro.' }));
  assert.match(html, /<p>Una\. Dos\.<\/p><p>Tres\. Cuatro\.<\/p>/);
});

test('la galería admite texto JSON, objetos y entradas vacías', async () => {
  const { galeriaDe } = await modulo();
  assert.equal(galeriaDe({ galeria: '[{"src":"https://x/1.jpg","alt":"Uno"}]' })[0].alt, 'Uno');
  assert.equal(galeriaDe({ galeria: ['https://x/2.jpg'] })[0].src, 'https://x/2.jpg');
  assert.deepEqual(galeriaDe({ galeria: '[{"alt":"sin src"}]' }), []);
  assert.deepEqual(galeriaDe({ galeria: 'no-json' }), []);
});
