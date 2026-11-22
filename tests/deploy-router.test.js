/**
 * Deploy del sitio público · único punto de disparo (`_webAnotarDeploy` en
 * apps-script/Code.gs).
 *
 * El router decide con el estado que ha quedado guardado en la respuesta, no
 * con el que manda el cliente; `forzar` cubre las acciones que cambian lo
 * publicado dejando la publicación en borrador (restaurar una retirada).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const WEB = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'WebPublicaciones.gs'), 'utf8');

/** Extrae `_webAnotarDeploy` del router sin cargar el resto de `Code.gs`. */
function cargarAnotarDeploy(disparar) {
  const fuente = CODE.replace(/\r\n/g, '\n');
  const inicio = fuente.indexOf('function _webAnotarDeploy(');
  assert.notEqual(inicio, -1, 'Code.gs debe definir _webAnotarDeploy');
  const fin = fuente.indexOf('\n}\n', inicio);
  assert.notEqual(fin, -1, 'No se pudo delimitar _webAnotarDeploy');
  return new Function(
    'webDispararDeploy',
    fuente.slice(inicio, fin + 3) + '\nreturn _webAnotarDeploy;'
  )(disparar);
}

function crearDisparador(opciones) {
  opciones = opciones || {};
  const llamadas = [];
  const disparar = (motivo) => {
    llamadas.push(motivo);
    if (opciones.lanza) throw new Error('boom');
    return { ok: true, disparado: true, codigo: 204 };
  };
  return { llamadas, disparar };
}

const respuesta = (estado) => ({ status: 'success', data: { id: 'web_1', estado_publicacion: estado } });

describe('_webAnotarDeploy (router)', () => {
  it('dispara con los estados que cambian lo publicado', () => {
    ['publicado', 'oculto', 'retirado'].forEach((estado) => {
      const { llamadas, disparar } = crearDisparador();
      const r = cargarAnotarDeploy(disparar)(respuesta(estado));
      assert.deepEqual(r.data.deploy, { ok: true, disparado: true, codigo: 204 }, estado);
      assert.deepEqual(llamadas, ['estado'], estado);
    });
  });

  it('no dispara con borrador ni cuando la respuesta no dice el estado', () => {
    const { llamadas, disparar } = crearDisparador();
    const anotar = cargarAnotarDeploy(disparar);
    assert.equal(anotar(respuesta('borrador')).data.deploy, undefined);
    assert.equal(anotar({ status: 'success', data: { id: 'web_2' } }).data.deploy, undefined);
    assert.equal(llamadas.length, 0);
  });

  it('forzar dispara aunque la publicación quede en borrador (restaurar)', () => {
    const { llamadas, disparar } = crearDisparador();
    const r = cargarAnotarDeploy(disparar)(respuesta('borrador'), true);
    assert.equal(r.data.deploy.disparado, true);
    assert.equal(llamadas.length, 1);
  });

  it('deja intactas las respuestas de error y las que no son de éxito', () => {
    const { llamadas, disparar } = crearDisparador();
    const anotar = cargarAnotarDeploy(disparar);
    const fallo = anotar({ status: 'error', error: 'Slug no válido' });
    assert.equal(fallo.status, 'error');
    assert.equal(fallo.data, undefined);
    const aviso = anotar({ status: 'warning', error: 'No se puede publicar todavía' });
    assert.equal(aviso.data, undefined);
    assert.equal(llamadas.length, 0);
  });

  it('si el disparo lanza, la acción sigue siendo un éxito y se ve el motivo', () => {
    const { disparar } = crearDisparador({ lanza: true });
    const r = cargarAnotarDeploy(disparar)(respuesta('publicado'));
    assert.equal(r.status, 'success');
    assert.equal(r.data.deploy.disparado, false);
    assert.match(r.data.deploy.error, /boom/);
  });
});

describe('un solo sitio dispara el deploy', () => {
  it('el router envuelve todos los endpoints web que cambian lo publicado', () => {
    const casos = [
      /return jsonResponse\(_webAnotarDeploy\(webUpsertAnimal\(body, user\)\)\)/,
      /return jsonResponse\(_webAnotarDeploy\(webEstadoAnimal\(body, user\)\)\)/,
      /return jsonResponse\(_webAnotarDeploy\(webArchivarEvento\(body, user\)\)\)/,
      /return jsonResponse\(_webAnotarDeploy\(webRestaurarEvento\(body, user\), true\)\)/,
      /return jsonResponse\(_webAnotarDeploy\(webUpsertEvento\(body, user\)\)\)/,
      /return jsonResponse\(_webAnotarDeploy\(webEstadoEvento\(body, user\)\)\)/
    ];
    casos.forEach((re) => assert.match(CODE, re));
  });

  it('el router expone el diagnóstico del cuerpo que responde', () => {
    assert.match(CODE, /case 'web-deploy-cuerpo'/);
    assert.match(CODE, /estado_evento_cola: _src\.slice\(-200\)/);
    assert.match(CODE, /construir_con_saneado: String\(webConstruirPublicacion\)\.indexOf\('webSanearHtml'\) !== -1/);
  });

  it('WebPublicaciones.gs ya no dispara ni anota el deploy por su cuenta', () => {
    // Sin llamadas al hook antiguo (el diagnóstico solo lo nombra como texto).
    assert.doesNotMatch(WEB, /webConDeploy\s*\(/);
    // Solo la definición y la prueba manual del editor llaman al disparador.
    assert.equal((WEB.match(/webDispararDeploy\s*\(/g) || []).length, 3);
  });
});

/** Extrae `_webConCache` para probar la invalidación por versión sin cargar el router. */
function cargarConCache(version) {
  const fuente = CODE.replace(/\r\n/g, '\n');
  const inicio = fuente.indexOf('function _webConCache(');
  assert.notEqual(inicio, -1, 'Code.gs debe definir _webConCache');
  const fin = fuente.indexOf('\n}\n', inicio);
  assert.notEqual(fin, -1, 'No se pudo delimitar _webConCache');
  const datos = {};
  const cache = {
    get: (k) => (k in datos ? datos[k] : null),
    put: (k, v) => { datos[k] = v; }
  };
  return new Function(
    'CacheService', 'webVersionInstantanea',
    fuente.slice(inicio, fin + 3) + '\nreturn _webConCache;'
  )({ getScriptCache: () => cache }, () => version.v);
}

// La caché por consulta también se invalida: la versión del canal entra en la
// clave, así que un guardado del gestor no deja respuestas viejas servidas.
describe('_webConCache: invalidación por versión', () => {
  it('un guardado deja sin efecto las respuestas por consulta', () => {
    const version = { v: 'v1' };
    const conCache = cargarConCache(version);
    let llamadas = 0;
    const responder = () => { llamadas++; return { status: 'success', total: llamadas }; };
    assert.equal(conCache('pub_list_x', responder).total, 1);
    assert.equal(conCache('pub_list_x', responder).total, 1, 'sin cambios sale de la caché');
    version.v = 'v2';
    assert.equal(conCache('pub_list_x', responder).total, 2, 'con versión nueva se recompone');
  });

  it('`nocache=1` no lee ni escribe la caché', () => {
    const conCache = cargarConCache({ v: 'v1' });
    let llamadas = 0;
    const responder = () => ({ status: 'success', total: ++llamadas });
    assert.equal(conCache('pub_list_x', responder, true).total, 1);
    assert.equal(conCache('pub_list_x', responder, true).total, 2);
  });
});
