/**
 * Tests unitarios de logica pura del Dashboard (sin DOM ni red).
 * Ejecutar: npm test  (node --test tests/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Dashboard = require('../src/js/dashboard.js');

describe('_byId: busqueda tolerante a tipos', () => {
  const list = [{ id: 'ani_1' }, { id: 42 }, { id: '' }, { nombre: 'sin id' }];

  it('encuentra id string exacto', () => {
    assert.equal(Dashboard._byId(list, 'ani_1').nombre ?? 'x', 'x');
    assert.equal(Dashboard._byId(list, 'ani_1').id, 'ani_1');
  });

  it('encuentra id numerico con query string', () => {
    assert.equal(Dashboard._byId(list, '42').id, 42);
  });

  it('nunca coincide con ids vacios/falsy', () => {
    assert.equal(Dashboard._byId(list, ''), null);
    assert.equal(Dashboard._byId(list, null), null);
    assert.equal(Dashboard._byId(list, undefined), null);
  });

  it('null si no existe o lista vacia', () => {
    assert.equal(Dashboard._byId(list, 'nope'), null);
    assert.equal(Dashboard._byId([], 'ani_1'), null);
    assert.equal(Dashboard._byId(null, 'ani_1'), null);
  });
});

describe('_fotoSrc: normaliza fotos para <img>', () => {
  it('fileId directo -> thumbnail', () => {
    assert.equal(
      Dashboard._fotoSrc({ foto_drive_id: 'ABC123' }),
      'https://drive.google.com/thumbnail?id=ABC123&sz=w800'
    );
  });

  it('enlace file/d/... -> thumbnail', () => {
    assert.equal(
      Dashboard._fotoSrc({ foto: 'https://drive.google.com/file/d/XYZ9/view?usp=sharing' }),
      'https://drive.google.com/thumbnail?id=XYZ9&sz=w800'
    );
  });

  it('enlace uc?id=... -> thumbnail', () => {
    assert.equal(
      Dashboard._fotoSrc({ foto_url: 'https://drive.google.com/uc?id=QWE12&export=download' }),
      'https://drive.google.com/thumbnail?id=QWE12&sz=w800'
    );
  });

  it('URL directa/ruta pasa tal cual', () => {
    assert.equal(Dashboard._fotoSrc({ foto: 'assets/animales/luna.jpg' }), 'assets/animales/luna.jpg');
  });

  it('vacio -> cadena vacia', () => {
    assert.equal(Dashboard._fotoSrc(null), '');
    assert.equal(Dashboard._fotoSrc({}), '');
  });
});

describe('_parseSolicitud: survey::resp', () => {
  it('parsea clave compuesta', () => {
    assert.deepEqual(Dashboard._parseSolicitud('pre-adopcion-perros::resp_3'), {
      surveyId: 'pre-adopcion-perros',
      responseId: 'resp_3'
    });
  });

  it('rechaza malformadas', () => {
    assert.equal(Dashboard._parseSolicitud('sin-delimitador'), null);
    assert.equal(Dashboard._parseSolicitud(''), null);
    assert.equal(Dashboard._parseSolicitud(null), null);
  });
});

describe('_encuestaPage: survey -> ruta', () => {
  it('mapea las 3 encuestas', () => {
    assert.equal(Dashboard._encuestaPage('pre-adopcion-perros'), 'encuestas-perros');
    assert.equal(Dashboard._encuestaPage('pre-adopcion-gatos'), 'encuestas-gatos');
    assert.equal(Dashboard._encuestaPage('pre-acogida'), 'encuestas-acogida');
  });

  it('defecto a hub', () => {
    assert.equal(Dashboard._encuestaPage('otra'), 'encuestas');
  });
});

describe('_romano', () => {
  it('convierte basicos', () => {
    assert.equal(Dashboard._romano(1), 'I');
    assert.equal(Dashboard._romano(3), 'III');
    assert.equal(Dashboard._romano(4), 'IV');
    assert.equal(Dashboard._romano(5), 'V');
    assert.equal(Dashboard._romano(9), 'IX');
    assert.equal(Dashboard._romano(14), 'XIV');
  });
});

describe('estados y etiquetas', () => {
  it('_estadoLabel/_estadoCls', () => {
    assert.equal(Dashboard._estadoLabel('pendiente'), 'Pendiente');
    assert.equal(Dashboard._estadoLabel('aprobada'), 'Aprobada');
    assert.equal(Dashboard._estadoCls('en_proceso'), 'en_proceso');
  });

  it('_animalEstadoLabel con fallback', () => {
    assert.equal(Dashboard._animalEstadoLabel('disponible'), 'Disponible');
    assert.equal(Dashboard._animalEstadoLabel('adoptado'), 'Adoptado');
    assert.equal(Dashboard._animalEstadoLabel('raro'), 'raro');
  });

  it('getEstado usa clave compuesta y defecto pendiente', () => {
    Dashboard.states = { 's1::resp_1': 'aprobada' };
    assert.equal(Dashboard.getEstado('resp_1', 's1'), 'aprobada');
    assert.equal(Dashboard.getEstado('resp_9', 's1'), 'pendiente');
    Dashboard.states = {};
  });
});
