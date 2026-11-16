/**
 * C3 · helpers puros de ficha configurable (modelo v1.1).
 * Verifican normalización/validación, compatibilidad (sin ficha), orden de
 * bloques, precedencia de campos y regla de rendimiento (sin ficha en listados).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const FC = require('../src/js/ficha-config.js');

const ORDEN_DEF = ['datos', 'etiquetas', 'contenido', 'galeria', 'videos', 'fichaAnimal', 'cta'];

describe('FichaConfig (C3)', () => {
  it('sin ficha => null (compatibilidad, comportamiento actual)', () => {
    assert.equal(FC.normalizarFicha(null), null);
    assert.equal(FC.normalizarFicha(undefined), null);
    assert.equal(FC.normalizarFicha(''), null);
    assert.equal(FC.normalizarFicha('no-json'), null);
    const v = FC.validarFicha(null);
    assert.equal(v.ok, true);
    assert.equal(v.ficha, null);
  });

  it('normaliza defaults: plantilla ficha, bloques true, orden completo y vídeo en enlace', () => {
    const f = FC.normalizarFicha({});
    assert.equal(f.plantilla, 'ficha');
    assert.equal(f.mostrarLectura, true);
    assert.equal(f.videoModo, 'enlace');
    assert.deepEqual(f.orden, ORDEN_DEF);
    assert.deepEqual(f.bloques, {
      datos: true, etiquetas: true, contenido: true,
      galeria: true, videos: true, fichaAnimal: true, cta: true
    });
  });

  it('acepta plantilla historia y cierra valores inválidos a ficha', () => {
    assert.equal(FC.normalizarFicha({ plantilla: 'historia' }).plantilla, 'historia');
    assert.equal(FC.normalizarFicha({ plantilla: 'rara' }).plantilla, 'ficha');
  });

  it('normaliza bloques respetando overrides y default true', () => {
    const f = FC.normalizarFicha({ bloques: { galeria: false, videos: false, contenido: false } });
    assert.equal(f.bloques.galeria, false);
    assert.equal(f.bloques.videos, false);
    assert.equal(f.bloques.contenido, false);
    assert.equal(f.bloques.datos, true);
    assert.equal(f.bloques.cta, true);
  });

  it('ordena bloques: descarta desconocidos, deduplica y completa los que falten', () => {
    const f = FC.normalizarFicha({ orden: ['cta', 'datos', 'raro', 'cta', 'galeria'] });
    assert.deepEqual(f.orden, ['cta', 'datos', 'galeria', 'etiquetas', 'contenido', 'videos', 'fichaAnimal']);
    assert.deepEqual(FC.normalizarOrden(null), ORDEN_DEF);
  });

  it('videoModo cerrado: enlace por defecto, embed cuando se pide', () => {
    assert.equal(FC.normalizarFicha({ videoModo: 'embed' }).videoModo, 'embed');
    assert.equal(FC.normalizarFicha({ videoModo: 'iframe' }).videoModo, 'enlace');
  });

  it('normaliza etiquetas propias de la ficha (máx. 20, 40 caracteres, sin duplicados)', () => {
    const f = FC.normalizarFicha({ tags: ['perro', ' perro ', '', 'x'.repeat(60)] });
    assert.equal(f.tags.length, 2);
    assert.equal(f.tags[0], 'perro');
    assert.equal(f.tags[1].length, 40);
    assert.equal(FC.normalizarFicha({ tags: 'gato, gato, casa' }).tags.join(','), 'gato,casa');
    assert.equal(FC.normalizarFicha({}).tags, undefined);
  });

  it('normaliza CTA con kind cerrado', () => {
    assert.deepEqual(FC.normalizarFicha({ cta: { label: 'Adoptar', url: 'https://x.test', kind: 'adopcion' } }).cta,
      { label: 'Adoptar', url: 'https://x.test', kind: 'adopcion' });
    assert.equal(FC.normalizarFicha({ cta: { label: 'Ir', url: 'u', kind: 'raro' } }).cta.kind, 'url');
  });

  it('normaliza galería (src/alt/caption) y filtra vacíos', () => {
    const f = FC.normalizarFicha({ gallery: [
      { src: 'https://a/img.jpg', alt: 'a', caption: 'pie' },
      { url: 'https://b/img.jpg' },
      { src: '' },
      null
    ] });
    assert.equal(f.gallery.length, 2);
    assert.equal(f.gallery[0].src, 'https://a/img.jpg');
    assert.equal(f.gallery[0].caption, 'pie');
    assert.equal(f.gallery[1].src, 'https://b/img.jpg');
  });

  it('normaliza icons y videos', () => {
    const f = FC.normalizarFicha({
      icons: [{ icon: 'edad', label: 'Edad', value: '2 años' }, { label: '', value: '', icon: '' }],
      videos: [{ title: 'V', url: 'https://v', note: 'n' }, { title: 'x' }]
    });
    assert.equal(f.icons.length, 1);
    assert.equal(f.icons[0].icon, 'edad');
    assert.equal(f.videos.length, 1);
    assert.equal(f.videos[0].url, 'https://v');
  });

  it('acepta ficha como JSON string', () => {
    const f = FC.normalizarFicha('{"plantilla":"historia","mostrarLectura":false,"videoModo":"embed"}');
    assert.equal(f.plantilla, 'historia');
    assert.equal(f.mostrarLectura, false);
    assert.equal(f.videoModo, 'embed');
  });

  it('bloquesEfectivos desactiva la ficha del animal en plantilla historia', () => {
    const historia = FC.normalizarFicha({ plantilla: 'historia' });
    assert.equal(FC.bloquesEfectivos(historia).fichaAnimal, false);
    const ficha = FC.normalizarFicha({ plantilla: 'ficha' });
    assert.equal(FC.bloquesEfectivos(ficha).fichaAnimal, true);
  });

  it('camposEfectivos aplica la precedencia ficha > publicación', () => {
    const cfg = FC.normalizarFicha({
      tags: ['propia'],
      gallery: [],
      cta: { label: 'Propio', url: 'https://x/propio', kind: 'url' }
    });
    const pub = {
      tags: ['base'], gallery: [{ src: 'https://x/base.jpg' }],
      icons: [{ label: 'Base', value: '1' }], videos: [{ url: 'https://v' }],
      cta: { label: 'Base', url: 'https://x/base' }
    };
    const out = FC.camposEfectivos(pub, cfg);
    assert.deepEqual(out.tags, ['propia']);
    assert.deepEqual(out.gallery, []); // lista vacía explícita oculta la base
    assert.equal(out.cta.label, 'Propio');
    assert.equal(out.icons.length, 1); // sin override, hereda
    assert.equal(out.videos.length, 1);
    // Sin ficha se comporta como siempre.
    assert.equal(FC.camposEfectivos(pub, null).tags[0], 'base');
  });

  it('validarFicha rechaza JSON inválido, tipos erróneos y valores cerrados', () => {
    assert.equal(FC.validarFicha('{malo').ok, false);
    const bad = FC.validarFicha({ plantilla: 'x', cta: { kind: 'nope' } });
    assert.equal(bad.ok, false);
    assert.ok(bad.errores.length >= 1);
    assert.equal(bad.ficha.plantilla, 'ficha'); // normalizada con fallback
    assert.equal(FC.validarFicha({ videoModo: 'raro' }).ok, false);
    assert.equal(FC.validarFicha({ orden: 'datos' }).ok, false);
    assert.equal(FC.validarFicha({ orden: ['datos', 'raro'] }).ok, false);
    assert.equal(FC.validarFicha({ orden: ['cta', 'datos'] }).ok, true);
  });

  it('regla de rendimiento: listado nunca incluye ficha, detalle sí', () => {
    const ficha = { plantilla: 'ficha', bloques: { datos: true } };
    assert.equal(FC.fichaParaListado(ficha), null);
    assert.ok(FC.fichaParaDetalle(ficha));
    assert.equal(FC.fichaParaListado(null), null);
    assert.equal(FC.fichaParaDetalle(null), null);
  });
});
