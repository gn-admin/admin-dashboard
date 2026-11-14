/**
 * Gestor web · lógica pura del frontend (sin DOM ni red).
 * Cubre slug, completitud, parsers de media y el contrato de payload.
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Web = require('../src/js/web.js');

describe('Web.normalizarSlug', () => {
  it('quita acentos, mayúsculas y signos', () => {
    assert.equal(Web.normalizarSlug('Luna en Adopción!!'), 'luna-en-adopcion');
    assert.equal(Web.normalizarSlug('  Gató  Pérez  '), 'gato-perez');
  });

  it('colapsa separadores y recorta guiones', () => {
    assert.equal(Web.normalizarSlug('---perro   joven---'), 'perro-joven');
    assert.equal(Web.normalizarSlug('a/b_c.d'), 'a-b-c-d');
  });

  it('vacío o solo símbolos devuelve cadena vacía', () => {
    assert.equal(Web.normalizarSlug(''), '');
    assert.equal(Web.normalizarSlug(null), '');
    assert.equal(Web.normalizarSlug('¿¡!?'), '');
  });

  it('limita a 80 caracteres sin terminar en guion', () => {
    const largo = Web.normalizarSlug('a'.repeat(120));
    assert.equal(largo.length, 80);
  });
});

describe('Web: publicaciones frente a fichas internas', () => {
  const lista = [
    { animal_id: 'a1', nombre: 'Luna', publicacion_id: 'p1' },
    { animal_id: 'a2', nombre: 'Nube' },
    { animal_id: 'a3', nombre: 'Laia', publicacion_id: 'p2' },
    null
  ];

  it('publicacionesAnimales solo devuelve las que ya tienen publicación', () => {
    assert.deepEqual(Web.publicacionesAnimales(lista).map(a => a.animal_id), ['a1', 'a3']);
  });

  it('animalesSinPublicacion devuelve las internas (candidatas del selector)', () => {
    assert.deepEqual(Web.animalesSinPublicacion(lista).map(a => a.animal_id), ['a2']);
  });

  it('tolera listas nulas o vacías', () => {
    assert.deepEqual(Web.publicacionesAnimales(null), []);
    assert.deepEqual(Web.animalesSinPublicacion(undefined), []);
  });
});

describe('Web._pickerLista', () => {
  it('solo lista animales sin publicación y filtra por búsqueda', () => {
    Web.animales = [
      { animal_id: 'a1', nombre: 'Luna', especie: 'perro' },
      { animal_id: 'a2', nombre: 'Laia', publicacion_id: 'p1' },
      { animal_id: 'a3', nombre: 'Nube', especie: 'gato' }
    ];
    Web._pickerQ = '';
    const html = Web._pickerLista();
    assert.match(html, /Luna/);
    assert.match(html, /Nube/);
    assert.doesNotMatch(html, /Laia/);
    assert.match(html, /crearPublicacionWeb/);

    Web._pickerQ = 'nub';
    assert.match(Web._pickerLista(), /Nube/);
    assert.doesNotMatch(Web._pickerLista(), /Luna/);

    Web._pickerQ = 'zzz';
    assert.match(Web._pickerLista(), /Ningún animal sin publicar coincide/);
  });

  it('sin candidatos lo dice y no ofrece botones', () => {
    Web.animales = [{ animal_id: 'a2', nombre: 'Laia', publicacion_id: 'p1' }];
    Web._pickerQ = '';
    const html = Web._pickerLista();
    assert.match(html, /No quedan animales sin publicación web/);
    assert.doesNotMatch(html, /crearPublicacionWeb/);
  });
});

describe('Web.seoTitle', () => {
  it('respeta el meta título guardado', () => {
    assert.equal(Web.seoTitle({ titulo: 'Laia', seo: { metaTitle: 'Laia, border collie en adopción' } }), 'Laia, border collie en adopción');
  });

  it('cae al título cuando el meta título está vacío', () => {
    assert.equal(Web.seoTitle({ titulo: 'Jornada de puertas abiertas', seo: { metaTitle: '' } }), 'Jornada de puertas abiertas');
    assert.equal(Web.seoTitle({ titulo: 'Jornada de puertas abiertas', seo: { metaTitle: '   ' } }), 'Jornada de puertas abiertas');
    assert.equal(Web.seoTitle({ titulo: 'Jornada de puertas abiertas' }), 'Jornada de puertas abiertas');
  });

  it('tolera publicaciones sin datos', () => {
    assert.equal(Web.seoTitle(null), '');
    assert.equal(Web.seoTitle({}), '');
  });
});

describe('Web._avisoPublicados', () => {
  it('avisa y enlaza a la web cuando no hay nada publicado', () => {
    Web.resumen = { totales: { publicados: 0 } };
    const html = Web._avisoPublicados();
    assert.match(html, /Todavía no hay nada visible/);
    assert.match(html, /publico\.html/);
  });

  it('no muestra aviso si ya hay publicaciones', () => {
    Web.resumen = { totales: { publicados: 2 } };
    assert.equal(Web._avisoPublicados(), '');
    Web.resumen = null;
    assert.match(Web._avisoPublicados(), /Todavía no hay nada visible/);
  });
});

describe('Web.slugValido', () => {
  it('acepta slugs normalizados', () => {
    assert.equal(Web.slugValido('luna-en-adopcion'), true);
    assert.equal(Web.slugValido('luna-2026'), true);
  });

  it('rechaza vacíos, guiones sueltos y acentos', () => {
    assert.equal(Web.slugValido(''), false);
    assert.equal(Web.slugValido('luna--gato'), false);
    assert.equal(Web.slugValido('-luna'), false);
    assert.equal(Web.slugValido('luna adopcion'), false);
    assert.equal(Web.slugValido('luna-adopción'), false);
  });
});

describe('Web.completitud', () => {
  const completa = {
    titulo: 'Luna busca familia',
    slug: 'luna-busca-familia',
    categoria: 'Perros en adopción',
    contenido_html: '<p>Luna es una perra sociable que busca una familia responsable.</p>',
    extracto: 'Perra sociable',
    media: { coverImage: { src: 'https://x/luna.jpg' } },
    seo: { metaDescription: 'Luna, perra sociable en adopción' }
  };

  it('sin pendientes devuelve lista vacía', () => {
    assert.deepEqual(Web.completitud(completa), []);
  });

  it('detecta cada campo que impide publicar', () => {
    const faltan = Web.completitud({});
    assert.ok(faltan.includes('titulo'));
    assert.ok(faltan.includes('slug'));
    assert.ok(faltan.includes('categoria'));
    assert.ok(faltan.includes('contenido'));
    assert.ok(faltan.includes('imagen'));
    assert.ok(faltan.includes('seo'));
  });

  it('usa el extracto como respaldo de la meta descripción', () => {
    const p = { ...completa, seo: {} };
    assert.equal(Web.completitud(p).includes('seo'), false);
  });

  it('una descripción demasiado corta se considera pendiente', () => {
    const p = { ...completa, contenido_html: 'Muy corta' };
    assert.ok(Web.completitud(p).includes('contenido'));
  });
});

describe('Web.parseGaleria / parseIconos / parseVideos / parseLista', () => {
  it('galería: una URL por línea con orden y alt', () => {
    const g = Web.parseGaleria('https://a.jpg\n\n https://b.jpg ', 'Luna');
    assert.equal(g.length, 2);
    assert.deepEqual(g[0], { src: 'https://a.jpg', alt: 'Luna 1', order: 0 });
    assert.deepEqual(g[1], { src: 'https://b.jpg', alt: 'Luna 2', order: 1 });
  });

  it('iconos: icono|etiqueta|valor y descarta líneas incompletas', () => {
    const i = Web.parseIconos('vacuna|Vacunado|Sí\nsoloetiqueta\n|Chip|Sí');
    assert.deepEqual(i[0], { icon: 'vacuna', label: 'Vacunado', value: 'Sí' });
    assert.deepEqual(i[1], { icon: '', label: 'Chip', value: 'Sí' });
    assert.equal(i.length, 2);
  });

  it('vídeos: título|url con proveedor detectado', () => {
    const v = Web.parseVideos('Presentación|https://youtu.be/abc\nVimeo|https://vimeo.com/1\ninvalido');
    assert.equal(v.length, 2);
    assert.equal(v[0].provider, 'youtube');
    assert.equal(v[1].provider, 'vimeo');
  });

  it('listas por comas', () => {
    assert.deepEqual(Web.parseLista(' sociable, juguetón ,, tranquilo '), ['sociable', 'juguetón', 'tranquilo']);
    assert.deepEqual(Web.parseLista(''), []);
  });
});

describe('Web.estadoLabel / estadoCls', () => {
  it('traduce estados de publicación a etiqueta y clase', () => {
    assert.equal(Web.estadoLabel('publicado'), 'Publicado');
    assert.equal(Web.estadoLabel('borrador'), 'Borrador');
    assert.equal(Web.estadoLabel('oculto'), 'Oculto');
    assert.equal(Web.estadoLabel('sin_publicar'), 'Sin publicar');
    assert.equal(Web.estadoLabel('otro'), 'Sin publicar');
  });

  it('clases de badge coherentes con el panel', () => {
    assert.equal(Web.estadoCls('publicado'), 'aprobada');
    assert.equal(Web.estadoCls('borrador'), 'pendiente');
    assert.equal(Web.estadoCls('oculto'), 'descartada');
    assert.equal(Web.estadoCls('sin_publicar'), '');
  });
});

describe('Web: helpers de escape', () => {
  it('escapa HTML cuando no hay Dashboard cargado', () => {
    assert.equal(Web._esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    assert.equal(Web._esc(null), '');
  });
});
