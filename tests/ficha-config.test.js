/**
 * C3 (propuesta): helpers puros de ficha configurable (Fase 1, sin wiring runtime).
 * Verifican normalización/validación, compatibilidad (sin ficha) y regla de rendimiento
 * (no incluir ficha en listados).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const FC = require('../src/js/ficha-config.js');

describe('FichaConfig (C3 propuesta)', () => {
  it('sin ficha => null (compatibilidad, comportamiento actual)', () => {
    assert.equal(FC.normalizarFicha(null), null);
    assert.equal(FC.normalizarFicha(undefined), null);
    assert.equal(FC.normalizarFicha(''), null);
    assert.equal(FC.normalizarFicha('no-json'), null);
    const v = FC.validarFicha(null);
    assert.equal(v.ok, true);
    assert.equal(v.ficha, null);
  });

  it('normaliza defaults: plantilla ficha, bloques true, mostrarLectura true', () => {
    const f = FC.normalizarFicha({});
    assert.equal(f.plantilla, 'ficha');
    assert.equal(f.mostrarLectura, true);
    assert.deepEqual(f.bloques, {
      datos: true, galeria: true, videos: true, fichaAnimal: true, etiquetas: true, cta: true
    });
  });

  it('acepta plantilla historia y cierra valores inválidos a ficha', () => {
    assert.equal(FC.normalizarFicha({ plantilla: 'historia' }).plantilla, 'historia');
    assert.equal(FC.normalizarFicha({ plantilla: 'rara' }).plantilla, 'ficha');
  });

  it('normaliza bloques respetando overrides y default true', () => {
    const f = FC.normalizarFicha({ bloques: { galeria: false, videos: false } });
    assert.equal(f.bloques.galeria, false);
    assert.equal(f.bloques.videos, false);
    assert.equal(f.bloques.datos, true);
    assert.equal(f.bloques.cta, true);
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
    const f = FC.normalizarFicha('{"plantilla":"historia","mostrarLectura":false}');
    assert.equal(f.plantilla, 'historia');
    assert.equal(f.mostrarLectura, false);
  });

  it('validarFicha rechaza JSON inválido y tipos erróneos, pero normaliza', () => {
    assert.equal(FC.validarFicha('{malo').ok, false);
    const bad = FC.validarFicha({ plantilla: 'x', cta: { kind: 'nope' } });
    assert.equal(bad.ok, false);
    assert.ok(bad.errores.length >= 1);
    assert.equal(bad.ficha.plantilla, 'ficha'); // normalizada con fallback
  });

  it('regla de rendimiento: listado nunca incluye ficha, detalle sí', () => {
    const ficha = { plantilla: 'ficha', bloques: { datos: true } };
    assert.equal(FC.fichaParaListado(ficha), null);
    assert.ok(FC.fichaParaDetalle(ficha));
    assert.equal(FC.fichaParaListado(null), null);
    assert.equal(FC.fichaParaDetalle(null), null);
  });
});
