/**
 * Tests de la capa de API (_resultado): el contrato HTTP 200 + campo `status`.
 * Sin red: se le pasa un objeto res falso. Ejecutar: npm test (node --test tests/*.test.js)
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const API = require('../src/js/api.js');

const res = (payload, opts = {}) => ({
  ok: opts.ok !== false,
  status: opts.status ?? 200,
  statusText: opts.statusText ?? 'OK',
  json: async () => {
    if (opts.badJson) throw new Error('Unexpected token');
    return payload;
  }
});

describe('API._resultado: HTTP no valido', () => {
  it('lanza con status error en 4xx/5xx', async () => {
    await assert.rejects(() => API._resultado(res(null, { ok: false, status: 500, statusText: 'Server Error' })),
      (err) => {
        assert.equal(err.message, 'HTTP 500: Server Error');
        assert.equal(err.status, 'error');
        return true;
      });
  });

  it('body no parseable -> error claro', async () => {
    await assert.rejects(() => API._resultado(res(null, { badJson: true })), (err) => {
      assert.equal(err.message, 'Respuesta no valida del servidor');
      assert.equal(err.status, 'error');
      return true;
    });
  });

  it('body null -> error claro', async () => {
    await assert.rejects(() => API._resultado(res(null)), /Respuesta no valida del servidor/);
  });
});

describe('API._resultado: campo status del backend', () => {
  it('status success devuelve los datos', async () => {
    const out = await API._resultado(res({ status: 'success', data: [1, 2] }));
    assert.deepEqual(out.data, [1, 2]);
  });

  it('sin status y sin error se considera success', async () => {
    const out = await API._resultado(res({ data: 'ok' }));
    assert.equal(out.data, 'ok');
  });

  it('status error se lanza con err.status=error', async () => {
    await assert.rejects(() => API._resultado(res({ status: 'error', error: 'Hoja no configurada' })),
      (err) => {
        assert.equal(err.message, 'Hoja no configurada');
        assert.equal(err.status, 'error');
        return true;
      });
  });

  it('status warning se lanza con err.status=warning (snackbar ambar)', async () => {
    await assert.rejects(() => API._resultado(res({ status: 'warning', error: 'Aviso parcial' })),
      (err) => {
        assert.equal(err.message, 'Aviso parcial');
        assert.equal(err.status, 'warning');
        return true;
      });
  });

  it('sin status pero con error se infiere como error', async () => {
    await assert.rejects(() => API._resultado(res({ error: 'Boom' })), (err) => {
      assert.equal(err.status, 'error');
      assert.equal(err.message, 'Boom');
      return true;
    });
  });

  it('mensajes por defecto cuando no hay texto', async () => {
    await assert.rejects(() => API._resultado(res({ status: 'warning' })), /Aviso del servidor/);
    await assert.rejects(() => API._resultado(res({ status: 'error' })), /Error del servidor/);
  });

  it('usa message de respaldo y conserva detail/code', async () => {
    await assert.rejects(() => API._resultado(res({ status: 'error', message: 'Otro texto', detail: 'd', code: 'C1' })),
      (err) => {
        assert.equal(err.message, 'Otro texto');
        assert.equal(err.detail, 'd');
        assert.equal(err.code, 'C1');
        return true;
      });
  });
});

// Contrato de peticion: Apps Script no responde preflights con application/json,
// asi que el POST tiene que ir como text/plain (regla de CORS del proyecto).
describe('API: forma de las peticiones', () => {
  const fetchReal = global.fetch;
  let llamadas;

  beforeEach(() => {
    llamadas = [];
    global.Auth = { getIdToken: async () => 'TOKEN123' };
    global.CONFIG = { apiUrl: 'https://script.google.com/macros/s/ABC/exec' };
    global.fetch = async (url, opts) => {
      llamadas.push({ url, opts });
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 'success', data: { ok: 1 } }) };
    };
  });

  afterEach(() => {
    global.fetch = fetchReal;
    delete global.Auth;
    delete global.CONFIG;
  });

  it('_post envia text/plain (nunca application/json) con token y endpoint', async () => {
    await API._post('animales', { nombre: 'Luna' });
    const c = llamadas[0];
    assert.equal(c.opts.method, 'POST');
    assert.equal(c.opts.headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.deepEqual(JSON.parse(c.opts.body), { nombre: 'Luna' });
    assert.match(c.url, /endpoint=animales/);
    assert.match(c.url, /token=TOKEN123/);
  });

  it('_get lleva el token en la query y no lleva body', async () => {
    await API._get('estados');
    const c = llamadas[0];
    assert.equal(c.opts, undefined);
    assert.match(c.url, /endpoint=estados/);
    assert.match(c.url, /token=TOKEN123/);
  });

  it('setEstado guarda la clave compuesta response_id + survey_id', async () => {
    await API.setEstado('resp_1', 'pre-adopcion-perros', 'aprobada');
    assert.deepEqual(JSON.parse(llamadas[0].opts.body),
      { response_id: 'resp_1', survey_id: 'pre-adopcion-perros', estado: 'aprobada' });
  });

  it('setNota guarda la clave compuesta', async () => {
    await API.setNota('resp_2', 'pre-acogida', 'texto');
    assert.deepEqual(JSON.parse(llamadas[0].opts.body),
      { response_id: 'resp_2', survey_id: 'pre-acogida', nota: 'texto' });
  });

  it('updateXxx exige registro devuelto (si no, el id no esta sincronizado)', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: null }) });
    await assert.rejects(() => API.updateAnimal('a1', { estado: 'adoptado' }), /id sin sincronizar/);

    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'a1' } }) });
    const r = await API.updateAnimal('a1', { estado: 'adoptado' });
    assert.equal(r.data.id, 'a1');
  });
});

describe('API._fetch: reintenta una vez si la red falla', () => {
  it('el segundo intento vuelve a la red', async () => {
    const fetchReal = global.fetch;
    let intentos = 0;
    global.fetch = async () => {
      intentos++;
      if (intentos === 1) throw new Error('red caida');
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: 1 }) };
    };
    try {
      const r = await API._fetch('https://x');
      assert.equal(intentos, 2);
      assert.equal(r.ok, true);
    } finally { global.fetch = fetchReal; }
  });
});
