/**
 * El PDF del servidor no debe mantener una copia manual de las estipulaciones.
 * Code.gs lleva un bloque CONTRATO_TEXTOS_PDF generado desde
 * src/js/contrato-textos.js; este test falla si se desincroniza.
 * Regenerar con: node scripts/gen-contrato-textos.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const T = require(path.join(RAIZ, 'src/js/contrato-textos.js'));

function bloqueGenerado() {
  const inicio = CODE.indexOf('// === CONTRATO_TEXTOS_PDF:INICIO ===');
  const fin = CODE.indexOf('// === CONTRATO_TEXTOS_PDF:FIN ===', inicio);
  assert.ok(inicio >= 0 && fin > inicio, 'faltan los marcadores CONTRATO_TEXTOS_PDF');
  const trozo = CODE.slice(inicio, fin);
  const desde = trozo.indexOf('{');
  const hasta = trozo.lastIndexOf('}');
  assert.ok(desde >= 0 && hasta > desde, 'el bloque generado no contiene JSON');
  return JSON.parse(trozo.slice(desde, hasta + 1));
}

describe('CONTRATO_TEXTOS_PDF generado desde ContratoTextos', () => {
  it('coincide exactamente con la fuente única', () => {
    assert.deepEqual(bloqueGenerado(), JSON.parse(JSON.stringify(T)));
  });

  it('incluye las 20 estipulaciones y la cláusula 65', () => {
    const b = bloqueGenerado();
    assert.equal(b.estipulaciones.length, 20);
    assert.equal(b.estipulaciones[19].n, 20);
    assert.ok(b.clausula65 && b.clausula65.parrafos.length);
  });
});
