/**
 * Tests de los textos del contrato de acogida (fuente única del PDF y del modal).
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const T = require('../src/js/acogida-textos.js');

describe('AcogidaTextos: documento de la asociación', () => {
  it('trae las ocho condiciones en orden', () => {
    assert.equal(T.condiciones.length, 8);
    assert.match(T.condiciones[0], /cuidados adecuados durante las horas/);
    assert.match(T.condiciones[1], /responsable de cualquier accidente/);
    assert.match(T.condiciones[3], /ánimo de lucro/);
    assert.match(T.condiciones[5], /cambio en mi dirección y número de teléfono/);
  });

  it('los dos preavisos son de dos días', () => {
    assert.match(T.condiciones[6], /dos días de antelación/);
    assert.match(T.condiciones[7], /dos días de antelación/);
    assert.match(T.condiciones[7], /compromiso de adopción/);
  });

  it('el material es el checklist de nueve ítems', () => {
    assert.equal(T.material.length, 9);
    assert.ok(T.material.includes('Jaula varikennel / transportín'));
    assert.ok(T.material.includes('Cartilla de identificación y vacunación'));
    assert.ok(T.material.includes('Otros'));
    assert.equal(T.materialOtros, 'Otros (detallar):');
  });

  it('conserva la renuncia a denunciar y las dos firmas', () => {
    assert.match(T.aceptacion, /renuncio al derecho de denunciar/);
    assert.equal(T.firmas.entidad, 'Firma o sello Asociación Grupo Nebak');
    assert.equal(T.firmas.familia, 'Firma Casa de Acogida');
  });

  it('lleva el pie real de la asociación y su versión', () => {
    assert.match(T.pie[0], /C\/ Santiago 27/);
    assert.match(T.pie[1], /625 14 05 88/);
    assert.equal(T.version, '1.0');
    assert.equal(T.titulo, 'Contrato de acogida temporal de un animal de compañía');
  });
});
