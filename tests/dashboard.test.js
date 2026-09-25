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

  it('tamano pedido para listado (w200)', () => {
    assert.equal(
      Dashboard._fotoSrc({ foto_drive_id: 'ABC123' }, 'w200'),
      'https://drive.google.com/thumbnail?id=ABC123&sz=w200'
    );
  });

  it('thumbnail guardado se re-dimensiona sin duplicar', () => {
    assert.equal(
      Dashboard._fotoSrc({ foto: 'https://drive.google.com/thumbnail?id=ABC123&sz=w800' }, 'w200'),
      'https://drive.google.com/thumbnail?id=ABC123&sz=w200'
    );
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

describe('_fmtFecha: fechas legibles, resto intacto', () => {
  it('ISO con hora -> fecha + hora', () => {
    const r = Dashboard._fmtFecha('2026-09-24T10:30:00.000Z');
    assert.match(r, /2026/);
    assert.match(r, /24/);
  });

  it('ISO solo fecha -> sin hora', () => {
    const r = Dashboard._fmtFecha('2026-09-24');
    assert.match(r, /2026/);
    assert.doesNotMatch(r, /:/);
  });

  it('timestamp es-ES de Forms -> legible', () => {
    const r = Dashboard._fmtFecha('24/09/2026 10:30:00');
    assert.match(r, /2026/);
    assert.match(r, /10:30/);
  });

  it('objeto Date -> legible', () => {
    const r = Dashboard._fmtFecha(new Date(2026, 8, 24, 10, 30));
    assert.match(r, /2026/);
  });

  it('vacio -> raya', () => {
    assert.equal(Dashboard._fmtFecha(''), '—');
    assert.equal(Dashboard._fmtFecha(null), '—');
    assert.equal(Dashboard._fmtFecha(undefined), '—');
  });

  it('no-fechas intactas (anio suelto, microchip, texto)', () => {
    assert.equal(Dashboard._fmtFecha('2024'), '2024');
    assert.equal(Dashboard._fmtFecha('123456789012345'), '123456789012345');
    assert.equal(Dashboard._fmtFecha('Mestizo'), 'Mestizo');
  });
});

describe('_atencionItems: pendientes mas antiguos primero', () => {
  it('filtra descartadas/aprobadas y ordena por fecha', () => {
    Dashboard.surveys = [{ id: 's1', name: 'S1' }];
    Dashboard.responses = {
      s1: [
        { id: 'nueva', fecha_creacion: '2026-09-20' },
        { id: 'vieja', fecha_creacion: '2026-09-01' },
        { id: 'aprob', fecha_creacion: '2026-08-01' },
        { id: 'desc', fecha_creacion: '2026-07-01' }
      ]
    };
    Dashboard.states = {
      's1::nueva': 'pendiente',
      's1::vieja': 'en_proceso',
      's1::aprob': 'aprobada',
      's1::desc': 'descartada'
    };
    const items = Dashboard._atencionItems(10);
    assert.deepEqual(items.map(r => r.id), ['vieja', 'nueva']);
    assert.equal(items[0]._estado, 'en_proceso');
    Dashboard.surveys = [];
    Dashboard.responses = {};
    Dashboard.states = {};
  });

  it('respeta el limite', () => {
    Dashboard.surveys = [{ id: 's1', name: 'S1' }];
    Dashboard.responses = {
      s1: [
        { id: 'a', fecha_creacion: '2026-09-01' },
        { id: 'b', fecha_creacion: '2026-09-02' }
      ]
    };
    Dashboard.states = {};
    assert.equal(Dashboard._atencionItems(1).length, 1);
    Dashboard.surveys = [];
    Dashboard.responses = {};
    Dashboard.states = {};
  });
});

describe('_diasEspera', () => {
  it('vacio o invalido -> raya', () => {
    assert.equal(Dashboard._diasEspera(''), '—');
    assert.equal(Dashboard._diasEspera(null), '—');
    assert.equal(Dashboard._diasEspera('no-fecha'), '—');
  });

  it('fecha reciente -> hoy o dias', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    assert.equal(Dashboard._diasEspera(hoy), 'hoy');
    assert.match(Dashboard._diasEspera('2020-01-01'), /días/);
  });
});

describe('_assertDeleted: borrado fantasma nunca silencioso', () => {
  it('no lanza si success true o sin campo', () => {
    assert.doesNotThrow(() => Dashboard._assertDeleted({ success: true }, 'El animal'));
    assert.doesNotThrow(() => Dashboard._assertDeleted({}, 'El animal'));
    assert.doesNotThrow(() => Dashboard._assertDeleted(null, 'El animal'));
  });

  it('lanza si success es false', () => {
    assert.throws(() => Dashboard._assertDeleted({ success: false }, 'El animal'), /no existe en la hoja/);
  });
});

describe('_plantillaPublicacion: post con datos del animal', () => {
  it('rellena todos los campos', () => {
    const t = Dashboard._plantillaPublicacion({
      nombre: 'Luna', especie: 'Perro', raza: 'Mestiza', edad: '2 años',
      sexo: 'Hembra', descripcion: 'Muy carinosa.', estado: 'disponible'
    });
    assert.match(t, /Luna/);
    assert.match(t, /Perro · Mestiza · 2 años · Hembra/);
    assert.match(t, /Muy carinosa/);
    assert.match(t, /disponible para adopcion/);
    assert.match(t, /#AdoptaNoCompres/);
    assert.match(t, /#PerroEnAdopcion/);
  });

  it('adapta situacion segun estado', () => {
    assert.match(Dashboard._plantillaPublicacion({ nombre: 'X', estado: 'en_acogida' }), /casa de acogida/);
    assert.match(Dashboard._plantillaPublicacion({ nombre: 'X', estado: 'adoptado' }), /Ya encontre mi hogar/);
  });

  it('sin datos no pone undefined ni lineas rotas', () => {
    const t = Dashboard._plantillaPublicacion({});
    assert.doesNotMatch(t, /undefined/);
    assert.match(t, /este peludo/);
    assert.match(t, /#GrupoNebak/);
    assert.doesNotMatch(t, /\n{3,}/);
  });
});

describe('_plantillaPublicacion v2: iconos, tipo y contacto', () => {
  const base = { nombre: 'Luna', especie: 'Gato', raza: 'Comun', edad: '1 año', sexo: 'Hembra', descripcion: 'Tranquila.', estado: 'disponible' };

  it('icono por especie y tipo adopcion', () => {
    const t = Dashboard._plantillaPublicacion(base, 'adopcion', {});
    assert.match(t, /🐱/);
    assert.match(t, /contrato de adopcion/);
    assert.match(t, /#GatoEnAdopcion/);
  });

  it('tipo acogida menciona acuerdo temporal', () => {
    const t = Dashboard._plantillaPublicacion(base, 'acogida', {});
    assert.match(t, /acuerdo de acogida/);
    assert.doesNotMatch(t, /contrato de adopcion/);
  });

  it('contacto configurado sale con iconos', () => {
    const t = Dashboard._plantillaPublicacion(base, 'adopcion', { telefono: '600 123 456', email: 'hola@nebak.org' });
    assert.match(t, /📞 600 123 456/);
    assert.match(t, /📩 hola@nebak\.org/);
  });

  it('sin contacto sale linea generica', () => {
    const t = Dashboard._plantillaPublicacion(base, 'adopcion', {});
    assert.match(t, /Escribenos por MD o email/);
    assert.doesNotMatch(t, /undefined/);
  });
});

describe('_dummyPermalink', () => {
  it('formato enlace instagram', () => {
    assert.equal(Dashboard._dummyPermalink('pub_mn123abc'), 'https://www.instagram.com/p/mn123abc/');
  });
});

describe('_hasHomeCache: pinta instantaneo solo con datos', () => {
  it('false sin encuestas, true con ellas', () => {
    const prev = Dashboard.surveys;
    Dashboard.surveys = [];
    assert.equal(Dashboard._hasHomeCache(), false);
    Dashboard.surveys = [{ id: 's1' }];
    assert.equal(Dashboard._hasHomeCache(), true);
    Dashboard.surveys = prev;
  });
});

describe('_ensureListas: nunca lanza', () => {
  it('claves desconocidas se ignoran', async () => {
    await Dashboard._ensureListas(['nope', null]);
    await Dashboard._ensureListas();
  });
});
