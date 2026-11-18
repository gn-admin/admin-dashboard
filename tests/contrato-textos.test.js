/**
 * Tests de los textos del contrato de adopción (fuente única del modal y del PDF).
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const T = require('../src/js/contrato-textos.js');

describe('ContratoTextos: estipulaciones del documento', () => {
  it('trae las 20 estipulaciones numeradas en orden', () => {
    assert.equal(T.estipulaciones.length, 20);
    assert.deepEqual(T.estipulaciones.map(e => e.n), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal(T.version, '2.1');
  });

  it('la estipulación 3 conserva las nueve prohibiciones', () => {
    const tres = T.estipulaciones.find(e => e.n === 3);
    assert.equal(tres.lista.length, 9);
    assert.equal(tres.lista[0], 'Caza de cualquier tipo y circunstancia.');
    assert.ok(tres.lista.includes('Perro policía o fines militares.'));
  });

  it('la 20ª cierra con el consentimiento y los tres folios a doble cara', () => {
    const veinte = T.texto(T.estipulaciones.find(e => e.n === 20), {});
    const texto = veinte.parrafos.join(' ');
    assert.match(texto, /tres folios a doble cara/);
    assert.match(texto, /prestan libre y voluntariamente su consentimiento/);
  });

  it('las erratas del documento quedan corregidas', () => {
    const todo = T.estipulaciones.map(e => T.texto(e, {})).map(x => x.parrafos.concat(x.lista).join(' ')).join(' ');
    assert.doesNotMatch(todo, /dolor|¡Indicios|con este contrato/);
  });
});

describe('ContratoTextos: anexo de condiciones complementarias (D-C5)', () => {
  it('trae las cuatro cláusulas legacy con título y texto', () => {
    assert.ok(T.anexo);
    assert.match(T.anexo.titulo, /Anexo/);
    assert.equal(T.anexo.clausulas.length, 4);
    T.anexo.clausulas.forEach(cl => {
      assert.ok(cl.titulo, 'cada cláusula lleva título');
      assert.ok(Array.isArray(cl.parrafos) && cl.parrafos.length > 0, 'cada cláusula lleva texto');
    });
  });

  it('cubre periodo de prueba, seguimiento, microchip y datos personales', () => {
    const todo = T.anexo.clausulas.map(cl => cl.titulo + ' ' + cl.parrafos.join(' ')).join(' ');
    assert.match(todo, /Periodo de prueba/);
    assert.match(todo, /seguimiento/i);
    assert.match(todo, /microchip/i);
    assert.match(todo, /Protección de datos personales/);
  });
});

describe('ContratoTextos.texto', () => {
  it('rellena donación e indemnización', () => {
    const est = { parrafos: ['Entrega {donacion} € y responde con {indemnizacion} €.'], lista: [] };
    const x = T.texto(est, { donacion: 100, indemnizacion: 900 });
    assert.equal(x.parrafos[0], 'Entrega 100 € y responde con 900 €.');
  });

  it('deja los marcadores vacíos si faltan los importes y no rompe sin datos', () => {
    const est = { parrafos: ['Importe {donacion}.'], lista: [] };
    assert.equal(T.texto(est, {}).parrafos[0], 'Importe .');
    assert.deepEqual(T.texto(null), { parrafos: [], lista: [] });
  });

  it('no muta la estipulación original', () => {
    const est = T.estipulaciones.find(e => (e.parrafos || []).some(p => p.includes('{donacion}')));
    T.texto(est, { donacion: 999 });
    assert.ok(est.parrafos.some(p => p.includes('{donacion}')));
  });
});
