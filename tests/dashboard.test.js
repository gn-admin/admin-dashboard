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

describe('_accionItems: vencidos primero, luego por antiguedad', () => {
  it('ordena vencidos antes que solicitudes', () => {
    Dashboard.surveys = [{ id: 's1', name: 'S1' }];
    Dashboard.responses = {
      s1: [
        { id: 'nueva', fecha_creacion: '2026-09-20' },
        { id: 'vieja', fecha_creacion: '2026-09-01' },
        { id: 'aprob', fecha_creacion: '2026-08-01' }
      ]
    };
    Dashboard.states = { 's1::nueva': 'pendiente', 's1::vieja': 'en_proceso', 's1::aprob': 'aprobada' };
    Dashboard.recordatorios = [{ id: 'v1', titulo: 'V', fecha: '2000-01-01', hecho: false }];
    const items = Dashboard._accionItems(10);
    assert.equal(items[0].kind, 'vencimiento');
    assert.deepEqual(items.filter(i => i.kind === 'solicitud').map(r => r.id), ['vieja', 'nueva']);
    Dashboard.surveys = [];
    Dashboard.responses = {};
    Dashboard.states = {};
    Dashboard.recordatorios = [];
  });

  it('ignora hechos, descartadas y respeta limite', () => {
    Dashboard.surveys = [{ id: 's1', name: 'S1' }];
    Dashboard.responses = { s1: [{ id: 'a', fecha_creacion: '2026-09-01' }, { id: 'b', fecha_creacion: '2026-09-02' }] };
    Dashboard.states = { 's1::b': 'descartada' };
    Dashboard.recordatorios = [{ id: 'h', titulo: 'H', fecha: '2000-01-01', hecho: true }];
    assert.equal(Dashboard._accionItems(10).length, 1);
    Dashboard.surveys = [];
    Dashboard.responses = {};
    Dashboard.states = {};
    Dashboard.recordatorios = [];
  });
});

describe('_cuentaMes/_sumaMes/_deltaTexto', () => {
  it('cuenta y suma mes actual vs anterior', () => {
    const now = new Date();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const esteMes = iso(now);
    const pasado = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15));
    const items = [{ f: esteMes, v: '10' }, { f: esteMes, v: '5' }, { f: pasado, v: '7' }, { f: 'x', v: '9' }, {}];
    assert.deepEqual(Dashboard._cuentaMes(items, x => x.f), { cur: 2, prev: 1 });
    assert.deepEqual(Dashboard._sumaMes(items, x => x.f, x => x.v), { cur: 15, prev: 7 });
    assert.equal(Dashboard._deltaTexto(2, 1), '+1 vs mes pasado');
    assert.equal(Dashboard._deltaTexto(1, 1), 'igual que el mes pasado');
    assert.equal(Dashboard._deltaTexto(0, 3), '-3 vs mes pasado');
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

describe('_bajoStock: aviso de inventario', () => {
  it('solo con minimo configurado y alcanzado', () => {
    assert.equal(Dashboard._bajoStock({ cantidad: 1, minimo: 2 }), true);
    assert.equal(Dashboard._bajoStock({ cantidad: 2, minimo: 2 }), true);
    assert.equal(Dashboard._bajoStock({ cantidad: 5, minimo: 2 }), false);
    assert.equal(Dashboard._bajoStock({ cantidad: 0, minimo: 0 }), false);
    assert.equal(Dashboard._bajoStock({}), false);
  });
});

describe('_totalGastos/_totalDonaciones: suman importes', () => {
  it('suma con coma decimal e ignora vacios', () => {
    assert.equal(Dashboard._totalGastos([{ importe: '10' }, { importe: '5,5' }, { importe: '' }]), 15.5);
    assert.equal(Dashboard._totalDonaciones([{ importe: '20' }, { importe: 'x' }]), 20);
    assert.equal(Dashboard._totalGastos([]), 0);
  });
});

describe('_diasHasta/_estadoRecordatorio', () => {
  it('pasado/hoy/futuro/hecho', () => {
    assert.equal(Dashboard._diasHasta('2000-01-01') < 0, true);
    assert.equal(Dashboard._diasHasta('2999-01-01') > 100, true);
    assert.equal(Dashboard._diasHasta(''), null);
    assert.deepEqual(Dashboard._estadoRecordatorio({ hecho: true }), { label: 'Hecho', cls: 'aprobada' });
    assert.equal(Dashboard._estadoRecordatorio({ fecha: '2000-01-01' }).label, 'Vencido');
    const hoy = new Date();
    const iso = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    assert.equal(Dashboard._estadoRecordatorio({ fecha: iso }).label, 'Hoy');
  });
});

describe('_esApadrinable: check + estado', () => {
  it('solo con check y disponible/en_acogida', () => {
    assert.equal(Dashboard._esApadrinable({ apadrinable: true, estado: 'disponible' }), true);
    assert.equal(Dashboard._esApadrinable({ apadrinable: true, estado: 'en_acogida' }), true);
    assert.equal(Dashboard._esApadrinable({ apadrinable: true, estado: 'adoptado' }), false);
    assert.equal(Dashboard._esApadrinable({ apadrinable: false, estado: 'disponible' }), false);
    assert.equal(Dashboard._esApadrinable({ estado: 'disponible' }), false);
    assert.equal(Dashboard._esApadrinable(null), false);
  });

  it('tolera booleanos como texto', () => {
    assert.equal(Dashboard._esApadrinable({ apadrinable: 'TRUE', estado: 'disponible' }), true);
  });
});

describe('_totalAportes: suma solo activos', () => {
  it('suma aportes de activos e ignora resto', () => {
    const list = [
      { estado: 'activo', aporte_mensual: '10' },
      { estado: 'activo', aporte_mensual: '5.5' },
      { estado: 'finalizada', aporte_mensual: '100' },
      { estado: 'activo', aporte_mensual: '' }
    ];
    assert.equal(Dashboard._totalAportes(list), 15.5);
    assert.equal(Dashboard._totalAportes([]), 0);
  });
});

describe('_tipoBadgeCls: tres perfiles', () => {
  it('mapea cada perfil', () => {
    assert.equal(Dashboard._tipoBadgeCls('Socio'), 'aprobada');
    assert.equal(Dashboard._tipoBadgeCls('Voluntario'), 'en_proceso');
    assert.equal(Dashboard._tipoBadgeCls('Ambos'), 'finalizada');
    assert.equal(Dashboard._tipoBadgeCls(''), 'finalizada');
  });
});

describe('_cuotaEstado: al dia o pendiente', () => {
  it('no aplica si no es socio', () => {
    assert.equal(Dashboard._cuotaEstado({ tipo: 'Voluntario' }), null);
    assert.equal(Dashboard._cuotaEstado({}), null);
    assert.equal(Dashboard._cuotaEstado(null), null);
  });

  it('sin pagos o sin datos', () => {
    assert.deepEqual(Dashboard._cuotaEstado({ tipo: 'Socio' }), { label: 'Sin pagos', cls: '' });
    assert.deepEqual(Dashboard._cuotaEstado({ tipo: 'Ambos', ultimo_pago: 'no-fecha' }), { label: 'Sin datos', cls: '' });
  });

  it('al dia si pago hace menos de un anio', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    assert.deepEqual(Dashboard._cuotaEstado({ tipo: 'Socio', ultimo_pago: hoy }), { label: 'Al dia', cls: 'aprobada' });
  });

  it('pendiente si pago hace mas de un anio', () => {
    assert.deepEqual(Dashboard._cuotaEstado({ tipo: 'Socio', ultimo_pago: '2020-01-01' }), { label: 'Pendiente', cls: 'descartada' });
  });
});

describe('_reservarAnimal/_liberarAnimal (con stubs de entorno)', () => {
  const G = globalThis;
  if (!G.localStorage) G.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  if (!G.document) G.document = { querySelectorAll: () => [], getElementById: () => null };
  if (!G.API) G.API = { updateAnimal: async () => ({}) };

  it('reserva pone en_adopcion + adopcion_id', async () => {
    Dashboard.animales = [{ id: 'a1', estado: 'disponible', adopcion_id: '' }];
    await Dashboard._reservarAnimal('a1', 'adp1');
    assert.equal(Dashboard.animales[0].estado, 'en_adopcion');
    assert.equal(Dashboard.animales[0].adopcion_id, 'adp1');
    Dashboard.animales = [];
  });

  it('libera solo si lo reservo ese caso', async () => {
    Dashboard.animales = [{ id: 'a1', estado: 'en_adopcion', adopcion_id: 'adp1' }];
    await Dashboard._liberarAnimal('a1', 'otro');
    assert.equal(Dashboard.animales[0].estado, 'en_adopcion');
    await Dashboard._liberarAnimal('a1', 'adp1');
    assert.equal(Dashboard.animales[0].estado, 'disponible');
    assert.equal(Dashboard.animales[0].adopcion_id, '');
    Dashboard.animales = [];
  });

  it('ignora ids ausentes', async () => {
    await Dashboard._reservarAnimal('', 'x');
    await Dashboard._liberarAnimal('zzz', 'x');
  });
});

describe('_anioFecha + _restantes2025', () => {
  it('extrae anio de ISO, es-ES e invalido', () => {
    assert.equal(Dashboard._anioFecha('2025-03-14T10:00:00.000Z'), 2025);
    assert.equal(Dashboard._anioFecha('2025-03-14'), 2025);
    assert.equal(Dashboard._anioFecha('14/03/2025 10:00:00'), 2025);
    assert.equal(Dashboard._anioFecha('14/03/2025'), 2025);
    assert.equal(Dashboard._anioFecha(''), null);
    assert.equal(Dashboard._anioFecha(null), null);
    assert.equal(Dashboard._anioFecha('sin-fecha'), null);
  });

  it('lista solo 2025 no descartadas de todas las encuestas', () => {
    Dashboard.surveys = [{ id: 's1', name: 'S1' }, { id: 's2', name: 'S2' }];
    Dashboard.responses = {
      s1: [{ id: 'a', fecha_creacion: '2025-01-01' }, { id: 'b', fecha_creacion: '2026-01-01' }],
      s2: [{ id: 'c', fecha_creacion: '15/06/2025 12:00:00' }, { id: 'd', fecha_creacion: '2025-02-02' }]
    };
    Dashboard.states = { 's2::d': 'descartada' };
    const out = Dashboard._restantes2025();
    assert.deepEqual(out.map(x => x.id).sort(), ['a', 'c']);
    Dashboard.surveys = [];
    Dashboard.responses = {};
    Dashboard.states = {};
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
