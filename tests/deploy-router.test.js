/**
 * Deploy del sitio público · único punto de disparo (`_webAnotarDeploy` en
 * apps-script/Code.gs).
 *
 * El router decide a partir del estado que ha quedado guardado en la
 * respuesta, no del que manda el cliente, para que publicar/ocultar/retirar/
 * restaurar no dependa de dos lógicas distintas que puedan divergir.
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
  const cuerpo = fuente.slice(inicio, fin + 3);
  return new Function('webDispararDeploy', cuerpo + '\nreturn _webAnotarDeploy;')(disparar);
}

function crearDisparador(opciones) {
  opciones = opciones || {};
  const llamadas = [];
  const disparar = (motivo) => {
    llamadas.push(motivo);
    if (opciones.lanza) throw new Error('boom');
    return opciones.resultado || { ok: true, disparado: true, codigo: 204 };
  };
  return { llamadas, disparar };
}

describe('_webAnotarDeploy (router)', () => {
  it('anota el deploy cuando la respuesta queda publicada', () => {
    const { llamadas, disparar } = crearDisparador();
    const r = cargarAnotarDeploy(disparar)({ status: 'success', data: { id: 'web_1', estado_publicacion: 'publicado' } }, 'publicado');
    assert.deepEqual(r.data.deploy, { ok: true, disparado: true, codigo: 204 });
    assert.deepEqual(llamadas, ['estado']);
  });

  it('no dispara con borrador y sí cuando la acción lo fuerza (restaurar)', () => {
    const { llamadas, disparar } = crearDisparador();
    const anotar = cargarAnotarDeploy(disparar);
    const borrador = anotar({ status: 'success', data: { id: 'web_2', estado_publicacion: 'borrador' } }, 'borrador');
    assert.equal(borrador.data.deploy, undefined);
    assert.equal(llamadas.length, 0);

    const restaurado = anotar({ status: 'success', data: { id: 'web_2', estado_publicacion: 'borrador' } }, 'borrador', true);
    assert.equal(restaurado.data.deploy.disparado, true);
    assert.equal(llamadas.length, 1);
  });

  it('manda el estado guardado en la respuesta, no el del cliente', () => {
    const { llamadas, disparar } = crearDisparador();
    // El cliente pide `borrador` pero la publicación sigue publicada.
    const r = cargarAnotarDeploy(disparar)({ status: 'success', data: { id: 'web_3', estado_publicacion: 'publicado' } }, 'borrador');
    assert.equal(r.data.deploy.disparado, true);
    assert.equal(llamadas.length, 1);
  });

  it('retirar publica y restaurar dispara aunque deje borrador', () => {
    const { disparar } = crearDisparador();
    const anotar = cargarAnotarDeploy(disparar);
    assert.equal(anotar({ status: 'success', success: true, data: { estado_publicacion: 'retirado' } }, 'retirado', true).data.deploy.disparado, true);
    assert.equal(anotar({ status: 'success', success: true, data: { estado_publicacion: 'borrador' } }, 'borrador', true).data.deploy.disparado, true);
  });

  it('no dispara dos veces si la respuesta ya trae deploy', () => {
    const { llamadas, disparar } = crearDisparador();
    const r = cargarAnotarDeploy(disparar)({ status: 'success', data: { estado_publicacion: 'publicado', deploy: { ok: true } } }, null);
    assert.deepEqual(r.data.deploy, { ok: true });
    assert.equal(llamadas.length, 0);
  });

  it('deja intactas las respuestas de error', () => {
    const { llamadas, disparar } = crearDisparador();
    const r = cargarAnotarDeploy(disparar)({ status: 'error', error: 'Slug no válido' }, 'publicado');
    assert.equal(r.status, 'error');
    assert.equal(r.data, undefined);
    assert.equal(llamadas.length, 0);
  });

  it('si el disparo lanza, la acción sigue siendo un éxito y se ve el motivo', () => {
    const { disparar } = crearDisparador({ lanza: true });
    const r = cargarAnotarDeploy(disparar)({ status: 'success', data: { estado_publicacion: 'publicado' } }, null);
    assert.equal(r.status, 'success');
    assert.equal(r.data.deploy.disparado, false);
    assert.match(r.data.deploy.error, /boom/);
  });
});

describe('un solo sitio dispara el deploy', () => {
  it('el router envuelve todos los endpoints web que cambian lo publicado', () => {
    const casos = [
      /return jsonResponse\(_webAnotarDeploy\(webUpsertAnimal\(body, user\)/,
      /return jsonResponse\(_webAnotarDeploy\(webEstadoAnimal\(body, user\)/,
      /return jsonResponse\(_webAnotarDeploy\(webArchivarEvento\(body, user\), 'retirado', true\)/,
      /return jsonResponse\(_webAnotarDeploy\(webRestaurarEvento\(body, user\), 'borrador', true\)/,
      /return jsonResponse\(_webAnotarDeploy\(webUpsertEvento\(body, user\)/,
      /return jsonResponse\(_webAnotarDeploy\(webEstadoEvento\(body, user\)/
    ];
    casos.forEach((re) => assert.match(CODE, re));
  });

  it('WebPublicaciones.gs ya no dispara ni anota el deploy por su cuenta', () => {
    assert.equal(WEB.indexOf('webConDeploy'), -1);
    // Solo la definición y la prueba manual del editor llaman al disparador.
    const llamadas = WEB.match(/webDispararDeploy\s*\(/g) || [];
    assert.equal(llamadas.length, 2);
  });
});
