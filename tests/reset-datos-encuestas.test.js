'use strict';
/**
 * `evaluarEncuestasBackend` de `scripts/reset-datos.mjs`.
 *
 * El backend puede responder `intactas: false` tanto por un cambio real como
 * por no poder leer las hojas. Solo el primer caso debe abortar el reset.
 */
const { test } = require('node:test');
const assert = require('node:assert');

async function modulo() {
  return import('../scripts/reset-datos.mjs');
}

const foto = (filas) => ({ clave: 'pre-adopcion-perros', nombre: 'Perros', filas });

test('sin recuento del backend se avisa y no se da por alterado', async () => {
  const { evaluarEncuestasBackend } = await modulo();
  const r = evaluarEncuestasBackend({ ok: true, aplicar: true, filasBorradas: 28 });
  assert.deepStrictEqual(r.problemas, []);
  assert.match(r.aviso, /no devuelve el recuento/i);
});

test('con intactas true no hay problema ni aviso', async () => {
  const { evaluarEncuestasBackend } = await modulo();
  const r = evaluarEncuestasBackend({
    encuestas: { antes: [foto(84)], despues: [foto(84)], intactas: true }
  });
  assert.deepStrictEqual(r.problemas, []);
  assert.strictEqual(r.aviso, '');
});

test('con recuentos distintos se denuncia el cambio', async () => {
  const { evaluarEncuestasBackend } = await modulo();
  const r = evaluarEncuestasBackend({
    encuestas: { antes: [foto(84)], despues: [foto(83)], intactas: false }
  });
  assert.strictEqual(r.problemas.length, 1);
  assert.match(r.problemas[0], /cambios en el recuento/i);
});

test('con intactas false pero recuentos iguales solo se avisa', async () => {
  const { evaluarEncuestasBackend } = await modulo();
  const r = evaluarEncuestasBackend({
    encuestas: { antes: [foto(84)], despues: [foto(84)], intactas: false }
  });
  assert.deepStrictEqual(r.problemas, []);
  assert.match(r.aviso, /no pudo leer/i);
});

test('una encuesta de menos también es un cambio', async () => {
  const { evaluarEncuestasBackend } = await modulo();
  const r = evaluarEncuestasBackend({
    encuestas: { antes: [foto(84), foto(19)], despues: [foto(84)], intactas: false }
  });
  assert.strictEqual(r.problemas.length, 1);
});
