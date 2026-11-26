'use strict';
/**
 * Reintento por token caducado en `scripts/reset-datos.mjs`.
 *
 * El reset borra en una llamada y verifica las encuestas en las siguientes: si
 * el idToken de Firebase caduca en medio, el script debe pedir uno nuevo y
 * repetir esa misma llamada, no abortar con código 2 dejando el trabajo a medias.
 */
const { test } = require('node:test');
const assert = require('node:assert');

function respuesta(cuerpo, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(cuerpo)
  };
}

async function modulo() {
  return import('../scripts/reset-datos.mjs');
}

/** Sustituye fetch durante la prueba y lo restaura siempre. */
async function conFetch(falso, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = falso;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test('renueva el token caducado y repite la llamada con el token nuevo', async () => {
  const { pedirConReintento } = await modulo();
  const llamadas = [];
  let token = 'viejo';
  let renovaciones = 0;

  await conFetch(async url => {
    llamadas.push(String(url));
    if (llamadas.length === 1) return respuesta({ status: 'error', error: 'Token invalido' }, 401);
    return respuesta({ data: [{ id: 'pre-adopcion-perros' }] });
  }, async () => {
    const datos = await pedirConReintento('surveys', {}, {
      api: 'https://ejemplo.test/exec',
      getToken: () => token,
      renovarToken: async () => { renovaciones++; token = 'nuevo'; return true; }
    });
    assert.deepStrictEqual(datos, [{ id: 'pre-adopcion-perros' }]);
  });

  assert.strictEqual(llamadas.length, 2, 'debe repetir la llamada una vez');
  assert.strictEqual(renovaciones, 1, 'debe renovar el token una vez');
  assert.match(llamadas[0], /token=viejo/);
  assert.match(llamadas[1], /token=nuevo/);
});

test('repite el POST del reset con el mismo cuerpo', async () => {
  const { pedirConReintento } = await modulo();
  const cuerpos = [];
  let token = 'viejo';

  await conFetch(async (url, opciones) => {
    cuerpos.push(opciones && opciones.body ? String(opciones.body) : '');
    if (cuerpos.length === 1) return respuesta({ status: 'error', error: 'Token invalido' }, 401);
    return respuesta({ data: { ok: true, aplicar: true, filasBorradas: 190 } });
  }, async () => {
    const datos = await pedirConReintento('reset-datos', {
      method: 'POST',
      body: { aplicar: true, confirmar: 'BORRAR' }
    }, {
      api: 'https://ejemplo.test/exec',
      getToken: () => token,
      renovarToken: async () => { token = 'nuevo'; return true; }
    });
    assert.strictEqual(datos.filasBorradas, 190);
  });

  assert.strictEqual(cuerpos.length, 2);
  assert.deepStrictEqual(JSON.parse(cuerpos[1]), { aplicar: true, confirmar: 'BORRAR' });
});

test('sin credenciales para renovar, propaga el error sin reintentar', async () => {
  const { pedirConReintento } = await modulo();
  let llamadas = 0;

  await conFetch(async () => {
    llamadas++;
    return respuesta({ status: 'error', error: 'Token invalido' }, 401);
  }, async () => {
    await assert.rejects(
      () => pedirConReintento('surveys', {}, {
        api: 'https://ejemplo.test/exec',
        getToken: () => 'solo-token',
        renovarToken: null
      }),
      /Token invalido/
    );
  });

  assert.strictEqual(llamadas, 1, 'sin renovación no debe repetir');
});

test('no reintenta un error que no es de token', async () => {
  const { pedirConReintento } = await modulo();
  let llamadas = 0;
  let renovaciones = 0;

  await conFetch(async () => {
    llamadas++;
    return respuesta({ status: 'error', error: 'Fallo interno' }, 500);
  }, async () => {
    await assert.rejects(
      () => pedirConReintento('surveys', {}, {
        api: 'https://ejemplo.test/exec',
        getToken: () => 'token',
        renovarToken: async () => { renovaciones++; return true; }
      }),
      /HTTP 500/
    );
  });

  assert.strictEqual(llamadas, 1);
  assert.strictEqual(renovaciones, 0);
});

test('reintenta una sola vez aunque el token siga sin valer', async () => {
  const { pedirConReintento } = await modulo();
  let llamadas = 0;
  let renovaciones = 0;

  await conFetch(async () => {
    llamadas++;
    return respuesta({ status: 'error', error: 'Token invalido' }, 401);
  }, async () => {
    await assert.rejects(
      () => pedirConReintento('surveys', {}, {
        api: 'https://ejemplo.test/exec',
        getToken: () => 'token',
        renovarToken: async () => { renovaciones++; return true; }
      }),
      /Token invalido/
    );
  });

  assert.strictEqual(llamadas, 2, 'dos intentos como máximo');
  assert.strictEqual(renovaciones, 1);
});

test('esErrorToken reconoce los errores de token y descarta el resto', async () => {
  const { esErrorToken } = await modulo();
  assert.strictEqual(esErrorToken(new Error('surveys: HTTP 401 · Token invalido')), true);
  assert.strictEqual(esErrorToken(new Error('surveys: Token invalido')), true);
  assert.strictEqual(esErrorToken(new Error('surveys: respuesta no JSON (HTTP 401): <html>')), true);
  assert.strictEqual(esErrorToken(new Error('Login fallido (400): INVALID_ID_TOKEN')), true);
  assert.strictEqual(esErrorToken(new Error('surveys: HTTP 500 · Fallo interno')), false);
  assert.strictEqual(esErrorToken(null), false);
});
