/**
 * Tests unitarios de logica pura del Dashboard (sin DOM ni red).
 * Ejecutar: npm test  (node --test tests/)
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
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
  it('ISO con hora -> AAAA/MM/DD hh:mm AM/PM', () => {
    assert.equal(Dashboard._fmtFecha('2026-09-24T10:30:00.000Z'), '2026/09/24 10:30 AM');
    assert.equal(Dashboard._fmtFecha('2026-09-24T15:05:00'), '2026/09/24 03:05 PM');
    assert.equal(Dashboard._fmtFecha('2026-09-24T00:05:00'), '2026/09/24 12:05 AM');
    assert.equal(Dashboard._fmtFecha('2026-09-24T12:05:00'), '2026/09/24 12:05 PM');
  });

  it('ISO solo fecha -> AAAA/MM/DD sin hora', () => {
    assert.equal(Dashboard._fmtFecha('2026-09-24'), '2026/09/24');
    assert.doesNotMatch(Dashboard._fmtFecha('2026-09-24'), /:/);
  });

  it('timestamp es-ES de Forms -> AAAA/MM/DD hh:mm AM/PM', () => {
    assert.equal(Dashboard._fmtFecha('24/09/2026 10:30:00'), '2026/09/24 10:30 AM');
    assert.equal(Dashboard._fmtFecha('13 abr 2025'), '2025/04/13');
  });

  it('objeto Date -> legible', () => {
    assert.equal(Dashboard._fmtFecha(new Date(2026, 8, 24, 10, 30)), '2026/09/24 10:30 AM');
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

describe('_collapsibleSection: desglose progresivo', () => {
  const G = globalThis;
  if (!G.Icons) G.Icons = { chevronDown: '<svg></svg>' };

  it('abierta por defecto solo si se pide o estaba abierta', () => {
    Dashboard._openSections = new Set(['info']);
    const cerrada = Dashboard._collapsibleSection('pubs', 'Pubs', '<p>x</p>', false);
    assert.match(cerrada, /data-sec="pubs"/);
    assert.doesNotMatch(cerrada, /collapsible open/);
    assert.match(cerrada, /display:none/);
    const abierta = Dashboard._collapsibleSection('info', 'Info', '<p>y</p>', false);
    assert.match(abierta, /collapsible open/);
    const forzada = Dashboard._collapsibleSection('otra', 'O', '<p>z</p>', true);
    assert.match(forzada, /collapsible open/);
    delete Dashboard._openSections;
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
  it('false sin encuestas ni datos, true con cache completo', () => {
    const prev = Dashboard.surveys;
    const prevCached = Dashboard._cached;
    const prevLoaded = Dashboard._loaded;
    Dashboard.surveys = [];
    Dashboard._cached = {};
    Dashboard._loaded = {};
    assert.equal(Dashboard._hasHomeCache(), false);
    Dashboard.surveys = [{ id: 's1' }];
    assert.equal(Dashboard._hasHomeCache(), false);
    Dashboard._cached = { responses: true, estados: true };
    assert.equal(Dashboard._hasHomeCache(), true);
    Dashboard.surveys = prev;
    Dashboard._cached = prevCached;
    Dashboard._loaded = prevLoaded;
  });
});

describe('_ensureListas: nunca lanza', () => {
  it('claves desconocidas se ignoran', async () => {
    await Dashboard._ensureListas(['nope', null]);
    await Dashboard._ensureListas();
  });
});

describe('_euros: formato monetario uniforme', () => {
  it('dos decimales siempre', () => {
    assert.equal(Dashboard._euros('45.5'), '45.50');
    assert.equal(Dashboard._euros('45,5'), '45.50');
    assert.equal(Dashboard._euros('30'), '30.00');
    assert.equal(Dashboard._euros(''), '0.00');
    assert.equal(Dashboard._euros(null), '0.00');
    assert.equal(Dashboard._euros('x'), '0.00');
  });
});

describe('_contratoEjemploHtml: ejemplo en guia', () => {
  it('iframe con el contrato real escapado', () => {
    const G = globalThis;
    const prev = G.PdfExport;
    G.PdfExport = { _logoFallback: 'x', _buildContracto: () => '<html><body class="x" id="y">T</body></html>' };
    const out = Dashboard._contratoEjemploHtml();
    assert.match(out, /<iframe/);
    assert.match(out, /srcdoc="/);
    assert.match(out, /&quot;/);
    if (prev === undefined) delete G.PdfExport; else G.PdfExport = prev;
  });
});

describe('grupos: un mismo nombre => un mismo grupo_id (opcion A)', () => {
  const conAnimales = (list, fn) => {
    const prev = Dashboard.animales;
    Dashboard.animales = list;
    try { return fn(); } finally { Dashboard.animales = prev; }
  };

  it('_normGrupo: mayusculas, acentos y espacios no parten el grupo', () => {
    assert.equal(Dashboard._normGrupo('  Camada   Luna '), 'camada luna');
    assert.equal(Dashboard._normGrupo('CAMILA'), Dashboard._normGrupo('camila'));
    assert.equal(Dashboard._normGrupo('Última Camada'), 'ultima camada');
    assert.equal(Dashboard._normGrupo('Ultima Camada'), 'ultima camada');
    assert.equal(Dashboard._normGrupo(''), '');
    assert.equal(Dashboard._normGrupo(null), '');
    assert.equal(Dashboard._normGrupo(undefined), '');
  });

  it('nombre vacio -> sin grupo', () => {
    assert.equal(Dashboard._resolveGrupoId('', null), '');
    assert.equal(Dashboard._resolveGrupoId('   ', null), '');
  });

  it('reutiliza el id del animal existente con el mismo nombre', () => {
    conAnimales([{ id: 'a1', grupo: 'Jula y Unda', grupo_id: 'gpo_111' }], () => {
      assert.equal(Dashboard._resolveGrupoId('jula y unda', null), 'gpo_111');
      assert.equal(Dashboard._resolveGrupoId('  JULA Y UNDA  ', null), 'gpo_111');
    });
  });

  it('crear un segundo animal en el mismo grupo no genera otro id', () => {
    conAnimales([{ id: 'a1', grupo: 'Jula y Unda', grupo_id: 'gpo_111' }], () => {
      assert.equal(Dashboard._resolveGrupoId('Jula y Unda', null), 'gpo_111');
    });
  });

  it('nombre nuevo -> id nuevo y distinto', () => {
    conAnimales([], () => {
      const a = Dashboard._resolveGrupoId('Camada Nueva', null);
      const b = Dashboard._resolveGrupoId('Otro Grupo', null);
      assert.match(a, /^gpo_/);
      assert.notEqual(a, b);
    });
  });

  it('al editar conserva su propio id si el nombre no cambia', () => {
    conAnimales([
      { id: 'a1', grupo: 'X', grupo_id: 'gpo_x' },
      { id: 'a2', grupo: 'X', grupo_id: 'gpo_x' }
    ], () => {
      assert.equal(Dashboard._resolveGrupoId('X', 'a2'), 'gpo_x');
    });
  });

  it('al cambiar el nombre se va al grupo destino y sale del anterior', () => {
    conAnimales([
      { id: 'a1', grupo: 'Viejo', grupo_id: 'gpo_v' },
      { id: 'a2', grupo: 'Nuevo', grupo_id: 'gpo_n' }
    ], () => {
      assert.equal(Dashboard._resolveGrupoId('Nuevo', 'a1'), 'gpo_n');
      assert.match(Dashboard._resolveGrupoId('Solo mio', 'a1'), /^gpo_/);
    });
  });

  it('dos nombres distintos no comparten id', () => {
    conAnimales([{ id: 'a1', grupo: 'Uno', grupo_id: 'gpo_1' }], () => {
      assert.notEqual(Dashboard._resolveGrupoId('Dos', null), 'gpo_1');
    });
  });

  it('_grupoSize cuenta por grupo_id y no por nombre', () => {
    conAnimales([
      { id: 'a1', grupo: 'X', grupo_id: 'gpo_x' },
      { id: 'a2', grupo: 'X', grupo_id: 'gpo_x' },
      { id: 'a3', grupo: 'X', grupo_id: 'gpo_otro' }
    ], () => {
      assert.equal(Dashboard._grupoSize('gpo_x'), 2);
      assert.equal(Dashboard._grupoSize('gpo_otro'), 1);
    });
  });
});


describe('grupos: layout y resumen', () => {
  const conAnimales = (list, fn) => {
    const prev = Dashboard.animales;
    Dashboard.animales = list;
    try { return fn(); } finally { Dashboard.animales = prev; }
  };

  const A = (id, grupo, gid, extra) => Object.assign({ id, grupo, grupo_id: gid }, extra || {});

  it('2+ miembros visibles -> bloque; el resto suelto', () => {
    conAnimales([
      A('a1', 'Luna', 'gpo_l', { estado: 'disponible' }),
      A('a2', 'Luna', 'gpo_l', { estado: 'disponible' }),
      A('a3', 'Solo', 'gpo_s', { estado: 'disponible' }),
      A('a4', null, '', { estado: 'disponible' })
    ], () => {
      const { bloques, sueltos } = Dashboard._bloquesDeGrupo(Dashboard.animales);
      assert.equal(bloques.length, 1);
      assert.equal(bloques[0].gid, 'gpo_l');
      assert.equal(bloques[0].items.length, 2);
      assert.equal(sueltos.length, 2);
      assert.deepEqual(sueltos.map(a => a.id).sort(), ['a3', 'a4']);
    });
  });

  it('grupo partido en dos ids no se agrupa (sigue siendo visible)', () => {
    conAnimales([
      A('a1', 'X', 'gpo_1'),
      A('a2', 'X', 'gpo_2')
    ], () => {
      const { bloques, sueltos } = Dashboard._bloquesDeGrupo(Dashboard.animales);
      assert.equal(bloques.length, 0);
      assert.equal(sueltos.length, 2);
    });
  });

  it('un solo miembro visible no forma bloque', () => {
    conAnimales([A('a1', 'Luna', 'gpo_l')], () => {
      const { bloques, sueltos } = Dashboard._bloquesDeGrupo(Dashboard.animales);
      assert.equal(bloques.length, 0);
      assert.equal(sueltos.length, 1);
    });
  });

  it('solo con nombre e id se considera grupo', () => {
    conAnimales([
      A('a1', '', 'gpo_x'),
      A('a2', 'X', '')
    ], () => {
      const { bloques, sueltos } = Dashboard._bloquesDeGrupo(Dashboard.animales);
      assert.equal(bloques.length, 0);
      assert.equal(sueltos.length, 2);
    });
  });

  it('_grupoResumen cuenta miembros, disponibles y especies', () => {
    conAnimales([
      A('a1', 'Luna', 'gpo_l', { estado: 'disponible', especie: 'Gato' }),
      A('a2', 'Luna', 'gpo_l', { estado: 'adoptado', especie: 'Gato' }),
      A('a3', 'Luna', 'gpo_l', { estado: 'disponible', especie: 'Perro' })
    ], () => {
      assert.equal(Dashboard._grupoResumen('gpo_l'), '3 animales · 2 disponibles · Gato / Perro');
    });
  });

  it('_grupoMiembros devuelve los del id exacto', () => {
    conAnimales([
      A('a1', 'X', 'gpo_1'),
      A('a2', 'X', 'gpo_2')
    ], () => {
      assert.equal(Dashboard._grupoMiembros('gpo_1').length, 1);
      assert.equal(Dashboard._grupoMiembros('gpo_9').length, 0);
    });
  });
});

describe('grupos: destino al renombrar (fusion si choca)', () => {
  const conAnimales = (list, fn) => {
    const prev = Dashboard.animales;
    Dashboard.animales = list;
    try { return fn(); } finally { Dashboard.animales = prev; }
  };
  const A = (id, grupo, gid) => ({ id, grupo, grupo_id: gid });

  it('sin choque devuelve el mismo id', () => {
    conAnimales([A('a1', 'Luna', 'gpo_l'), A('a2', 'Luna', 'gpo_l')], () => {
      assert.deepEqual(Dashboard._grupoDestino('gpo_l', 'Cachorros'), { destino: 'gpo_l', choque: false });
    });
  });

  it('si otro grupo ya tiene ese nombre, se converge en el suyo', () => {
    conAnimales([
      A('a1', 'Luna', 'gpo_l'),
      A('a2', 'Sol', 'gpo_s')
    ], () => {
      assert.deepEqual(Dashboard._grupoDestino('gpo_l', 'Sol'), { destino: 'gpo_s', choque: true });
    });
  });

  it('el propio grupo no cuenta como choque', () => {
    conAnimales([A('a1', 'Luna', 'gpo_l'), A('a2', 'Luna', 'gpo_l')], () => {
      const r = Dashboard._grupoDestino('gpo_l', 'Luna');
      assert.equal(r.choque, false);
      assert.equal(r.destino, 'gpo_l');
    });
  });

  it('choque detecta diferencias de mayusculas y acentos', () => {
    conAnimales([
      A('a1', 'Cachorros de Vera', 'gpo_1'),
      A('a2', 'Atun', 'gpo_2')
    ], () => {
      assert.equal(Dashboard._grupoDestino('gpo_2', 'CACHORROS de VERA').choque, true);
      assert.equal(Dashboard._grupoDestino('gpo_2', 'ATÚN').choque, false);
    });
  });

  it('un animal sin grupo_id no provoca choque', () => {
    conAnimales([A('a1', 'Luna', '')], () => {
      assert.equal(Dashboard._grupoDestino('gpo_l', 'Luna').choque, false);
    });
  });
});

describe('_snackTipo: el color depende del status del backend', () => {
  const T = (e) => Dashboard._snackTipo(e);

  it('respeta los cuatro status explicitos', () => {
    assert.equal(T({ status: 'success' }), 'success');
    assert.equal(T({ status: 'warning' }), 'warning');
    assert.equal(T({ status: 'error' }), 'error');
    assert.equal(T({ status: 'neutral' }), 'neutral');
  });

  it('sin status explicito, gris neutro aunque haya mensaje', () => {
    assert.equal(T(new Error('boom')), 'neutral');
    assert.equal(T({ message: 'HTTP 500: Internal Server Error' }), 'error');
    assert.equal(T(new TypeError('Failed to fetch')), 'neutral');
    assert.equal(T(null), 'neutral');
    assert.equal(T(undefined), 'neutral');
  });

  it('hoja sin configurar -> warning, aunque no traiga status', () => {
    assert.equal(T(new Error('Hoja Grupos sin configurar: crea la hoja y rellena SHEET_GRUPOS_ID')), 'warning');
    assert.equal(T({ error: 'DRIVE_FOTOS_FOLDER_ID no configurado' }), 'warning');
  });

  it('rate limit -> warning (429 o por mensaje)', () => {
    assert.equal(T({ code: 429, message: 'demasiadas peticiones' }), 'warning');
    assert.equal(T({ message: 'Demasiadas peticiones: espera unos segundos y reintenta' }), 'warning');
  });

  it('un status desconocido no se cuela como verde ni como rojo', () => {
    assert.equal(T({ status: 'ok' }), 'neutral');
    assert.equal(T({ status: '' }), 'neutral');
  });

  it('mensajes sin status no se pintan en rojo', () => {
    assert.equal(T(new Error('El backend no devolvio el registro (id sin sincronizar)')), 'neutral');
    assert.equal(T(new Error('Token invalido')), 'neutral');
    assert.equal(T(new Error('No se pudo subir la foto')), 'neutral');
  });
});

describe('_esUrgente: marca de acogida/adopcion prioritaria', () => {
  const E = (v) => Dashboard._esUrgente({ urgente: v });

  it('acepta todas las formas que puede devolver la hoja', () => {
    assert.equal(E(true), true);
    assert.equal(E(1), true);
    assert.equal(E('1'), true);
    assert.equal(E('TRUE'), true);
    assert.equal(E('true'), true);
    assert.equal(E('SI'), true);
    assert.equal(E('Si'), true);
  });

  it('todo lo demas no es urgente', () => {
    assert.equal(E(false), false);
    assert.equal(E('FALSE'), false);
    assert.equal(E(''), false);
    assert.equal(E(0), false);
    assert.equal(E(null), false);
    assert.equal(E(undefined), false);
    assert.equal(Dashboard._esUrgente(null), false);
    assert.equal(Dashboard._esUrgente(undefined), false);
    assert.equal(Dashboard._esUrgente({}), false);
  });
});

describe('_ordenaUrgentes: los urgentes salen primero', () => {
  const A = (id, urgente) => ({ id, urgente, estado: 'disponible' });

  it('sube los urgentes sin reordenar dentro de cada tramo', () => {
    const lista = [A('a', false), A('b', true), A('c', false), A('d', true), A('e', false)];
    assert.deepEqual(Dashboard._ordenaUrgentes(lista).map(x => x.id), ['b', 'd', 'a', 'c', 'e']);
  });

  it('no muta la lista original', () => {
    const lista = [A('a', false), A('b', true)];
    Dashboard._ordenaUrgentes(lista);
    assert.deepEqual(lista.map(x => x.id), ['a', 'b']);
  });

  it('con cero urgentes ni con lista vacia no rompe', () => {
    assert.deepEqual(Dashboard._ordenaUrgentes([A('a', false), A('b', false)]).map(x => x.id), ['a', 'b']);
    assert.deepEqual(Dashboard._ordenaUrgentes([]), []);
    assert.deepEqual(Dashboard._ordenaUrgentes(null), []);
    assert.deepEqual(Dashboard._ordenaUrgentes(undefined), []);
  });

  it('entiende la marca venga como texto de la hoja', () => {
    const lista = [{ id: 'x', estado: 'disponible' }, { id: 'y', urgente: 'TRUE', estado: 'disponible' }];
    assert.deepEqual(Dashboard._ordenaUrgentes(lista).map(x => x.id), ['y', 'x']);
  });

  it('un animal que ya no necesita hogar no se adelanta', () => {
    const lista = [
      { id: 'a', estado: 'disponible' },
      { id: 'b', urgente: true, estado: 'adoptado' },
      { id: 'c', urgente: true, estado: 'fallecido' },
      { id: 'd', urgente: true, estado: 'en_adopcion' },
      { id: 'e', urgente: true, estado: 'disponible' }
    ];
    assert.deepEqual(Dashboard._ordenaUrgentes(lista).map(x => x.id), ['e', 'a', 'b', 'c', 'd']);
  });
});

describe('_esPrioritario: solo lo que sigue necesitando hogar', () => {
  const P = (estado) => Dashboard._esPrioritario({ urgente: true, estado });

  it('visible en disponible y en acogida', () => {
    assert.equal(P('disponible'), true);
    assert.equal(P('en_acogida'), true);
  });

  it('oculto si ya esta reservado, adoptado o de baja', () => {
    assert.equal(P('en_adopcion'), false);
    assert.equal(P('adoptado'), false);
    assert.equal(P('fallecido'), false);
    assert.equal(P(undefined), false);
  });

  it('sin la marca de urgencia nunca es prioritario', () => {
    assert.equal(Dashboard._esPrioritario({ estado: 'disponible' }), false);
    assert.equal(Dashboard._esPrioritario(null), false);
    assert.equal(Dashboard._esPrioritario(undefined), false);
  });
});

describe('_listaGrupos: opciones del selector de grupo', () => {
  const conTodo = (animales, grupos, fn) => {
    const pa = Dashboard.animales, pg = Dashboard.grupos;
    Dashboard.animales = animales;
    Dashboard.grupos = grupos || [];
    try { return fn(); } finally { Dashboard.animales = pa; Dashboard.grupos = pg; }
  };

  it('une la entidad grupos con los que ya tienen animales, por nombre normalizado', () => {
    conTodo([
      { id: 'a1', grupo: 'Camada Luna', grupo_id: 'gpo_1' },
      { id: 'a2', grupo: 'camada luna', grupo_id: 'gpo_1' },
      { id: 'a3', grupo: 'Turbo', grupo_id: 'gpo_2' }
    ], [{ id: 'gpo_9', nombre: 'Huerfanos' }], () => {
      const l = Dashboard._listaGrupos();
      assert.deepEqual(l.map(g => g.nombre), ['Camada Luna', 'Huerfanos', 'Turbo']);
      assert.equal(l.find(g => g.norm === 'camada luna').n, 2);
      assert.equal(l.find(g => g.norm === 'huerfanos').n, 0);
      assert.equal(l.find(g => g.norm === 'camada luna').gid, 'gpo_1');
    });
  });

  it('sin nombre de grupo no se cuela el id como opcion', () => {
    conTodo([{ id: 'a1', grupo: '', grupo_id: 'gpo_1' }], [], () => {
      assert.deepEqual(Dashboard._listaGrupos(), []);
    });
  });

  it('animal sin nombre usa el nombre de la fila de la entidad', () => {
    conTodo([{ id: 'a1', grupo: '', grupo_id: 'gpo_7' }], [{ id: 'gpo_7', nombre: 'Los Setos' }], () => {
      const l = Dashboard._listaGrupos();
      assert.equal(l.length, 1);
      assert.equal(l[0].nombre, 'Los Setos');
      assert.equal(l[0].n, 1);
      assert.equal(l[0].gid, 'gpo_7');
    });
  });

  it('lista vacia no rompe', () => {
    conTodo([], null, () => assert.deepEqual(Dashboard._listaGrupos(), []));
    conTodo(null, undefined, () => assert.deepEqual(Dashboard._listaGrupos(), []));
  });
});


describe('_tsFecha: normaliza fechas de las hojas', () => {
  const T = (f) => Dashboard._tsFecha(f);

  it('ISO (YYYY-MM-DD) con o sin hora', () => {
    assert.equal(T('2026-03-05'), Date.UTC(2026, 2, 5));
    assert.equal(T('2026-03-05T10:20:30.000Z'), Date.UTC(2026, 2, 5));
  });

  it('dd/mm/aaaa (formato Sheets es-ES)', () => {
    assert.equal(T('5/3/2026'), Date.UTC(2026, 2, 5));
    assert.equal(T('05/03/2026'), Date.UTC(2026, 2, 5));
  });

  it('iso con separador de espacio', () => {
    assert.equal(T('2026-12-31 23:59:00'), Date.UTC(2026, 11, 31));
  });

  it('basura o vacio -> 0', () => {
    assert.equal(T(''), 0);
    assert.equal(T(null), 0);
    assert.equal(T(undefined), 0);
    assert.equal(T('no es fecha'), 0);
  });
});

describe('_tipoLogLabel / _tipoLogCls: etiquetas del registro', () => {
  it('conoce los tipos que escribe _regLog', () => {
    assert.equal(Dashboard._tipoLogLabel('adopcion'), 'Adopcion');
    assert.equal(Dashboard._tipoLogLabel('voluntariado'), 'Voluntariado');
    assert.equal(Dashboard._tipoLogLabel('padrino-convertido'), 'Padrino a socio');
    assert.equal(Dashboard._tipoLogLabel('apadrinamiento-fin'), 'Fin apadrinamiento');
  });

  it('tipo desconocido o vacio no deja hueco', () => {
    assert.equal(Dashboard._tipoLogLabel('pepito'), 'pepito');
    assert.equal(Dashboard._tipoLogLabel(''), 'General');
    assert.equal(Dashboard._tipoLogLabel(null), 'General');
  });

  it('cls: rojo solo para lista negra, ambar para dinero, verde para proceso', () => {
    assert.equal(Dashboard._tipoLogCls('blacklist'), 'descartada');
    assert.equal(Dashboard._tipoLogCls('gasto'), 'en_proceso');
    assert.equal(Dashboard._tipoLogCls('donacion'), 'en_proceso');
    assert.equal(Dashboard._tipoLogCls('adopcion'), 'aprobada');
    assert.equal(Dashboard._tipoLogCls('voluntariado'), '');
    assert.equal(Dashboard._tipoLogCls(undefined), '');
  });
});

describe('_busyStart / _busyEnd: anti doble-tap de fase', () => {
  it('el segundo toque mientras esta en vuelo se ignora', () => {
    assert.equal(Dashboard._busyStart('fase:a1'), true);
    assert.equal(Dashboard._busyStart('fase:a1'), false);
    Dashboard._busyEnd('fase:a1');
    assert.equal(Dashboard._busyStart('fase:a1'), true);
    Dashboard._busyEnd('fase:a1');
  });

  it('llaves distintas no se pisan', () => {
    assert.equal(Dashboard._busyStart('fase:a1'), true);
    assert.equal(Dashboard._busyStart('fase:a2'), true);
    Dashboard._busyEnd('fase:a1');
    Dashboard._busyEnd('fase:a2');
    assert.equal(Dashboard._busyStart('fase:a1'), true);
    Dashboard._busyEnd('fase:a1');
  });

  it('end sin start no revienta', () => {
    assert.doesNotThrow(() => Dashboard._busyEnd('nunca-empezo'));
  });
});

describe('_especiesDomesticas: opciones del selector de especie', () => {
  it('incluye perro y gato primero', () => {
    const l = Dashboard._especiesDomesticas();
    assert.equal(l[0], 'Perro');
    assert.equal(l[1], 'Gato');
  });

  it('anima domesticos comunes y sin "Otro..." (lo anade el formulario)', () => {
    const l = Dashboard._especiesDomesticas();
    ['Conejo', 'Hámster', 'Pájaro', 'Tortuga', 'Hurón', 'Cobaya', 'Erizo', 'Pez'].forEach(e => {
      assert.ok(l.includes(e), 'falta ' + e);
    });
    assert.ok(!l.includes('__otro__'));
    assert.ok(!l.includes('Otro...'));
  });

  it('sin duplicados y todo string', () => {
    const l = Dashboard._especiesDomesticas();
    assert.equal(new Set(l).size, l.length);
    assert.ok(l.every(s => typeof s === 'string' && s.trim() !== ''));
  });
});

describe('_renderFormMode: desde donde se abre el form', () => {
  it('listado visible -> from-list (se oculta la lista)', () => {
    assert.equal(Dashboard._renderFormMode(false, false), 'from-list');
    assert.equal(Dashboard._renderFormMode(false, true), 'from-list');
  });

  it('listado oculto + ficha abierta -> from-detail (solo form)', () => {
    assert.equal(Dashboard._renderFormMode(true, true), 'from-detail');
  });

  it('sin listado ni ficha -> none (no se pinta nada)', () => {
    assert.equal(Dashboard._renderFormMode(true, false), 'none');
  });
});

describe('_formCancelAction: que pasa al cancelar/guardar', () => {
  it('form abierto desde la ficha -> restaura la ficha', () => {
    assert.equal(Dashboard._formCancelAction({ active: true, hasPrev: true, hasForm: true, listHidden: true }), 'restore');
  });

  it('form abierto desde la lista -> cierra la ficha y vuelve al listado', () => {
    assert.equal(Dashboard._formCancelAction({ active: true, hasPrev: false, hasForm: true, listHidden: true }), 'clear-detail');
  });

  it('ficha abierta sin form -> no toca la ficha', () => {
    assert.equal(Dashboard._formCancelAction({ active: true, hasPrev: false, hasForm: false, listHidden: true }), 'clear-container');
  });

  it('sin ficha activa -> limpia el contenedor de forms', () => {
    assert.equal(Dashboard._formCancelAction({ active: false }), 'clear-container');
    assert.equal(Dashboard._formCancelAction(), 'clear-container');
  });

  it('form con la lista visible (caso raro) -> solo quita el form', () => {
    assert.equal(Dashboard._formCancelAction({ active: true, hasPrev: false, hasForm: true, listHidden: false }), 'remove-form');
  });
});

describe('_inicialesNombre: avatar del hero de socio', () => {
  it('primera letra en mayusculas', () => {
    assert.equal(Dashboard._inicialesNombre('marta garcia'), 'M');
    assert.equal(Dashboard._inicialesNombre('  izon '), 'I');
  });

  it('vacio o nulo -> interrogacion', () => {
    assert.equal(Dashboard._inicialesNombre(''), '?');
    assert.equal(Dashboard._inicialesNombre(null), '?');
    assert.equal(Dashboard._inicialesNombre(undefined), '?');
    assert.equal(Dashboard._inicialesNombre('   '), '?');
  });
});
describe('home v22: serie, sparkline, donut y variaciones', () => {
  beforeEach(() => {
    Dashboard.states = {};
    Dashboard.responses = {};
    Dashboard.animales = [];
  });

  afterEach(() => {
    Dashboard.states = {};
    Dashboard.responses = {};
    Dashboard.animales = [];
  });

  it('_serieSolicitudes: 12 meses y excluye descartadas', () => {
    const now = new Date();
    const dentro = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    Dashboard.responses = {
      s1: [
        { id: 'r1', fecha_creacion: dentro, _surveyId: 's1' },
        { id: 'r2', fecha_creacion: dentro, _surveyId: 's1' },
        { id: 'r3', fecha_creacion: '', _surveyId: 's1' }
      ]
    };
    Dashboard.states = { 's1::r2': 'descartada' };
    const serie = Dashboard._serieSolicitudes();
    assert.equal(serie.length, 12);
    assert.equal(serie.reduce((a, b) => a + b.count, 0), 1);
    assert.equal(serie[11].count, 1, 'la solicitud de este mes cae en la ultima columna');
  });

  it('_sparkline: un punto por valor y vacio sin datos', () => {
    const svg = Dashboard._sparkline([0, 5, 2]);
    assert.match(svg, /<svg class="dash-spark-svg"/);
    assert.equal((svg.match(/,/g) || []).length, 3);
    assert.equal(Dashboard._sparkline([]), '');
  });

  it('_donaGradiente: gris sin datos y tramos completos con datos', () => {
    assert.match(Dashboard._donaGradiente([]), /var\(--gray-200\) 0% 100%/);
    const grad = Dashboard._donaGradiente([['A', 1, '#111'], ['B', 3, '#222']]);
    assert.match(grad, /^conic-gradient\(/);
    assert.match(grad, /#111 0\.00% 25\.00%/);
    assert.match(grad, /#222 25\.00% 100\.00%/);
    assert.doesNotMatch(grad, /gray-200/);
  });

  it('_deltaInfo: sube, baja o sin cambios', () => {
    assert.deepEqual(Dashboard._deltaInfo(5, 2), { cls: 'up', text: '+3' });
    assert.deepEqual(Dashboard._deltaInfo(1, 4), { cls: 'down', text: '-3' });
    assert.deepEqual(Dashboard._deltaInfo(2, 2), { cls: 'flat', text: 'sin cambios' });
  });

  it('_saludo segun la hora', () => {
    assert.equal(Dashboard._saludo(5), 'Buenas noches');
    assert.equal(Dashboard._saludo(8), 'Buenos dias');
    assert.equal(Dashboard._saludo(15), 'Buenas tardes');
    assert.equal(Dashboard._saludo(22), 'Buenas noches');
  });

  it('_eur formatea en euros es-ES', () => {
    assert.equal(Dashboard._eur(12345.5), '12.345,50 €');
    assert.equal(Dashboard._eur('7'), '7,00 €');
    assert.equal(Dashboard._eur(null), '0,00 €');
  });

  it('_funnelStages comparte el embudo y excluye descartadas', () => {
    Dashboard.responses = { s1: ['r1', 'r2', 'r3'].map(id => ({ id, _surveyId: 's1' })) };
    Dashboard.states = { 's1::r1': 'pendiente', 's1::r2': 'en_proceso', 's1::r3': 'descartada' };
    Dashboard.animales = [{ id: 'a1', estado: 'adoptado' }];
    assert.deepEqual(Dashboard._funnelStages().map(s => s[1]), [1, 1, 0, 1]);
  });
});

describe('fases de adopcion: requisitos, checklists y contrato', () => {
  it('_fasesAdopcion mantiene el orden historico', () => {
    assert.deepEqual(Dashboard._fasesAdopcion(), [
      'Encuesta recibida', 'Revision', 'Visita domiciliaria', 'Contrato', 'Entrega', 'Prueba', 'Seguimiento'
    ]);
    assert.equal(Dashboard._faseIdx('Entrega'), 4);
    assert.equal(Dashboard._faseIdx('No existe'), -1);
  });

  it('_faseInfo distingue Prueba (adaptacion) de Seguimiento (largo plazo)', () => {
    assert.match(Dashboard._faseInfo('Prueba').desc, /adaptacion/i);
    assert.match(Dashboard._faseInfo('Seguimiento').desc, /largo plazo/i);
    assert.equal(Dashboard._faseInfo('Contrato').tono, 'warning');
    assert.equal(Dashboard._faseInfo('Seguimiento').tono, 'success');
  });

  it('_requisitoAvance: sin contrato no se pasa de Contrato', () => {
    assert.match(Dashboard._requisitoAvance({ fase: 'Contrato' }, null), /Firma el contrato/);
    assert.equal(Dashboard._requisitoAvance({ fase: 'Contrato' }, { id: 'ctr_1' }), null);
    assert.equal(Dashboard._requisitoAvance({ fase: 'Revision' }, null), null);
  });

  it('_requisitoAvance: la entrega exige fecha y checklist completo', () => {
    const completo = {};
    Dashboard._entregaChecklist().filter(x => !x.opcional).forEach(x => { completo[x.id] = true; });
    assert.match(Dashboard._requisitoAvance({ fase: 'Entrega' }, { id: 'ctr_1' }), /fecha de entrega/);
    assert.match(Dashboard._requisitoAvance({ fase: 'Entrega', fecha_entrega: '2025-04-13' }, { id: 'ctr_1' }), /checklist/i);
    assert.match(Dashboard._requisitoAvance({ fase: 'Entrega', fecha_entrega: '2025-04-13', entrega_checklist: JSON.stringify({ contrato: true }) }, { id: 'ctr_1' }), /checklist/i);
    assert.equal(Dashboard._requisitoAvance({ fase: 'Entrega', fecha_entrega: '2025-04-13', entrega_checklist: JSON.stringify(completo) }, { id: 'ctr_1' }), null);
  });

  it('_requisitoAvance: la prueba de adaptacion es obligatoria antes de Seguimiento', () => {
    const p = { id: 'ad1', fase: 'Prueba' };
    assert.match(Dashboard._requisitoAvance(p, { id: 'ctr_1' }, []), /prueba/i);
    assert.equal(Dashboard._requisitoAvance(p, { id: 'ctr_1' }, [{ adopcion_id: 'ad1', tipo: 'Prueba' }]), null);
  });

  it('_entregaFaltantes ignora los items opcionales', () => {
    const completo = {};
    Dashboard._entregaChecklist().filter(x => !x.opcional).forEach(x => { completo[x.id] = true; });
    completo.esterilizacion = false;
    assert.deepEqual(Dashboard._entregaFaltantes({ entrega_checklist: JSON.stringify(completo) }), []);
    assert.ok(Dashboard._entregaFaltantes({ entrega_checklist: '{}' }).length > 0);
  });

  it('_sumaMeses y _seguimientoHitos calculan 1, 3, 6 y 12 meses desde la entrega', () => {
    assert.equal(Dashboard._sumaMeses('2025-01-15', 1), '2025-02-15');
    const hitos = Dashboard._seguimientoHitos(
      { id: 'ad1', fecha_entrega: '2025-01-15' },
      [{ adopcion_id: 'ad1', tipo: 'Seguimiento', hito: '1m', fecha: '2025-02-15' }]
    );
    assert.equal(hitos.length, 4);
    assert.equal(hitos[0].fecha, '2025-02-15');
    assert.equal(hitos[0].hecho, true);
    assert.equal(hitos[1].fecha, '2025-04-15');
    assert.equal(hitos[1].hecho, false);
    assert.equal(Dashboard._seguimientoHitos({ id: 'ad1' })[0].fecha, '');
  });

  it('_entregaChecklist y _pruebaChecklist tienen ids unicos', () => {
    const entrega = Dashboard._entregaChecklist();
    const prueba = Dashboard._pruebaChecklist();
    assert.ok(entrega.length >= 8);
    assert.ok(prueba.length >= 6);
    assert.equal(new Set(entrega.map(x => x.id)).size, entrega.length);
    assert.equal(new Set(prueba.map(x => x.id)).size, prueba.length);
    assert.ok(entrega.some(x => /contrato/i.test(x.label)));
  });

  it('_checklistMarks tolera JSON, objetos y basura', () => {
    assert.deepEqual(Dashboard._checklistMarks('{"a":true}'), { a: true });
    assert.deepEqual(Dashboard._checklistMarks({ b: true }), { b: true });
    assert.deepEqual(Dashboard._checklistMarks('{roto'), {});
    assert.deepEqual(Dashboard._checklistMarks(''), {});
  });

  it('_faseGuia avisa cuando falta el contrato o la entrega', () => {
    const g1 = Dashboard._faseGuia({ fase: 'Contrato' }, null);
    assert.equal(g1.tono, 'warning');
    assert.equal(g1.cta, 'contrato');
    const g2 = Dashboard._faseGuia({ fase: 'Contrato' }, { id: 'ctr_1' });
    assert.equal(g2.tono, 'success');
    const g3 = Dashboard._faseGuia({ fase: 'Entrega' }, { id: 'ctr_1' });
    assert.equal(g3.cta, 'entrega');
    assert.match(g3.text, /Registra la fecha/);
  });

  it('_mailtoHref codifica destinatarios, asunto y cuerpo', () => {
    const href = Dashboard._mailtoHref({ animal: 'Luna' }, ['a@x.com', 'b@y.com'], {});
    assert.match(href, /^mailto:a@x\.com,b@y\.com\?subject=/);
    assert.match(href, /Luna/);
    assert.ok(href.includes('mailto:'));
  });

  it('_debeOfrecerMailto reconoce endpoint ausente o no configurado', () => {
    assert.equal(Dashboard._debeOfrecerMailto(new Error('Endpoint no encontrado')), true);
    assert.equal(Dashboard._debeOfrecerMailto(new Error('HTTP 404: Not Found')), true);
    assert.equal(Dashboard._debeOfrecerMailto(new Error('Cloud no configurado')), true);
    assert.equal(Dashboard._debeOfrecerMailto(new Error('Token invalido')), false);
    assert.equal(Dashboard._debeOfrecerMailto(null), false);
  });

  it('_contratoTerminosHtml incluye clausulas y escapa los nombres', () => {
    const html = Dashboard._contratoTerminosHtml({ adoptante: 'Ana <b>X</b>', animal: 'Luna' });
    assert.match(html, /Contrato de adopcion responsable/);
    assert.match(html, /seguimiento posterior a la adopcion/);
    assert.match(html, /Ana &lt;b&gt;X&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>X<\/b>/);
  });

  it('_contratoTerminosHtml muestra datos y firmas cuando hay contrato', () => {
    const html = Dashboard._contratoTerminosHtml(
      { adoptante: 'Ana', animal: 'Luna' },
      { f1_nombre: 'Ana', f1_dni: '123', fecha: '2025-04-13', ciudad: 'Madrid', f1_firma: 'data:image/png;base64,AAA' }
    );
    assert.match(html, /Documento firmado/);
    assert.match(html, /DNI 123/);
    assert.match(html, /data:image\/png;base64,AAA/);
  });

  it('_contratoTerminosHtml no muestra el rol del adoptante y añade el sello', () => {
    const html = Dashboard._contratoTerminosHtml({ adoptante: 'Ana', animal: 'Luna' });
    assert.doesNotMatch(html, /<div class="label">Rol<\/div>/);
    assert.match(html, /SELLO DE LA ENTIDAD/);
    assert.match(html, /REUNIDOS/);
    assert.match(html, /EXPONEN/);
  });

  it('_contratoTerminosHtml pone los datos del tutor en una pagina propia', () => {
    const html = Dashboard._contratoTerminosHtml(
      { adoptante: 'Ana', animal: 'Luna' },
      { f1_nombre: 'Ana', f1_dni: '123', f2_nombre: 'Luis', f2_rol: 'Tutor', f2_dni: '456' }
    );
    assert.match(html, /contrato-doc-tutor-page/);
    assert.match(html, /Anexo I\. Datos del tutor/);
    assert.match(html, /Tutor \/ persona de apoyo/);
  });

  it('_terminosAdopcionHtml es un anexo independiente con sus clausulas', () => {
    const html = Dashboard._terminosAdopcionHtml({ adoptante: 'Ana', animal: 'Luna' }, { f1_dni: '123' });
    assert.match(html, /Cláusulas de adopción responsable/);
    assert.match(html, /Aceptado por el adoptante/);
    assert.match(html, /Datos personales/);
    assert.match(html, /SELLO DE LA ENTIDAD/);
    assert.doesNotMatch(html, /<div class="label">Rol<\/div>/);
  });

  it('_contratoEntidadDatos usa el nombre por defecto y no inventa CIF', () => {
    const ent = Dashboard._contratoEntidadDatos({});
    assert.equal(ent.nombre, 'Asociación Grupo Nebak');
    assert.equal(ent.cif, '');
    assert.equal(ent.domicilio, '');
  });
});

describe('_contratoTutor: tutor real vs entidad', () => {
  it('distingue al tutor de la entidad y no confunde el segundo firmante', () => {
    assert.equal(Dashboard._contratoTutor({ f2_nombre: 'Luis', f2_rol: 'Tutor legal' }).f2_nombre, 'Luis');
    assert.equal(Dashboard._contratoTutor({ f2_nombre: 'Grupo Nebak', f2_rol: 'Entidad' }), null);
    assert.equal(Dashboard._contratoTutor({}), null);
  });
});

describe('_contratoAcogidaDatos: documento opcional de acogida', () => {
  it('mezcla caso, animal, familia y datos de la solicitud', () => {
    const prev = { animales: Dashboard.animales, familias: Dashboard.familias, responses: Dashboard.responses };
    try {
      Dashboard.animales = [{ id: 'a1', nombre: 'Luna', especie: 'Perro', raza: 'Mestiza', foto: 'assets/luna.jpg' }];
      Dashboard.familias = [{ id: 'f1', nombre: 'Ana', email: 'ana@x.es', telefono: '600123123', ubicacion: 'Irun' }];
      Dashboard.responses = { 'pre-acogida': [{ id: 'r1', dni: '12345678A', direccion: 'Calle Mayor 1', ciudad: 'Irun' }] };
      const d = Dashboard._contratoAcogidaDatos({
        id: 'acg1', animal_id: 'a1', familia_id: 'f1', animal: 'Luna', familia: 'Ana',
        solicitud_id: 'pre-acogida::r1', inicio: '2026-01-02', fase: 'en_casa'
      });
      assert.equal(d.id, 'acg1');
      assert.equal(d.animal.nombre, 'Luna');
      assert.equal(d.animal.especie, 'Perro');
      assert.equal(d.familia.nombre, 'Ana');
      assert.equal(d.familia.dni, '12345678A');
      assert.equal(d.familia.direccion, 'Calle Mayor 1');
      assert.equal(d.familia.telefono, '600123123');
      assert.equal(d.ciudad, 'Irun');
      assert.equal(d.inicio, '2026-01-02');
      assert.equal(d.fase, 'en_casa');
      assert.match(d.fecha, /^\d{4}-\d{2}-\d{2}$/);
    } finally {
      Dashboard.animales = prev.animales;
      Dashboard.familias = prev.familias;
      Dashboard.responses = prev.responses;
    }
  });
});

describe('contratos de acogida: copia persistida y snapshot', () => {
  let prev;

  beforeEach(() => {
    prev = Dashboard.contratos;
    Dashboard.contratos = [];
  });

  afterEach(() => {
    Dashboard.contratos = prev;
  });

  it('_contratoAcogidaDe encuentra solo la copia de acogida y no confunde adopciones', () => {
    Dashboard.contratos = [
      { id: 'adop1', adopcion_id: 'ad1', datos_json: '{}' },
      { id: 'acg1', tipo: 'acogida', acogida_id: 'acg1', datos_json: '{}' }
    ];
    assert.equal(Dashboard._contratoAcogidaDe('acg1').id, 'acg1');
    assert.equal(Dashboard._contratoAcogidaDe('ad1'), null);
    assert.deepEqual(Dashboard._contratosAdopcion().map(c => c.id), ['adop1']);
  });

  it('_contratoAcogidaSnapshot parsea datos_json y descarta copias invalidas', () => {
    const datos = { animal: { nombre: 'Luna' }, familia: { nombre: 'Ana' }, fecha: '2026-11-10' };
    Dashboard.contratos = [
      { id: 'acg1', tipo: 'acogida', acogida_id: 'acg1', datos_json: JSON.stringify(datos) },
      { id: 'acg2', tipo: 'acogida', acogida_id: 'acg2', datos_json: 'no-json' },
      { id: 'adop1', adopcion_id: 'ad1', datos_json: JSON.stringify(datos) }
    ];
    assert.equal(Dashboard._contratoAcogidaSnapshot(Dashboard._contratoAcogidaDe('acg1')).animal.nombre, 'Luna');
    assert.equal(Dashboard._contratoAcogidaSnapshot(Dashboard._contratoAcogidaDe('acg2')), null);
    assert.equal(Dashboard._contratoAcogidaSnapshot(Dashboard._contratoAcogidaDe('ad1')), null);
  });

  it('_contratoAcogidaFila conserva el id y guarda la copia completa', () => {
    Dashboard.contratos = [{ id: 'ctr_old', tipo: 'acogida', acogida_id: 'acg1' }];
    const datos = { animal: { nombre: 'Luna' }, familia: { nombre: 'Ana' }, fecha: '2026-11-10' };
    const fila = Dashboard._contratoAcogidaFila({ id: 'acg1', animal: 'Luna', familia: 'Ana', animal_id: 'a1', familia_id: 'f1' }, datos);
    assert.equal(fila.id, 'ctr_old');
    assert.equal(fila.tipo, 'acogida');
    assert.equal(fila.acogida_id, 'acg1');
    assert.equal(fila.animal, 'Luna');
    assert.equal(fila.familia, 'Ana');
    assert.equal(fila.estado, 'guardado');
    assert.equal(fila.datos_json, JSON.stringify(datos));
    assert.match(fila.guardado_en, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('multiusuario: identidad y cache no resucita borrados', () => {
  const G = globalThis;
  let previa;
  let storage;

  const memoria = () => ({
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  });

  beforeEach(() => {
    previa = G.localStorage;
    storage = memoria();
    G.localStorage = storage;
    Dashboard._userUid = 'u1';
    Dashboard._loaded = {};
    Dashboard._loading = {};
    Dashboard._cached = {};
  });

  afterEach(() => {
    if (previa === undefined) delete G.localStorage;
    else G.localStorage = previa;
    Dashboard.animales = [];
    Dashboard._userUid = null;
    Dashboard._loaded = {};
    Dashboard._loading = {};
    Dashboard._cached = {};
  });

  it('_identity usa la cuenta actual y traduce el rol', () => {
    const u = Dashboard._identity(null, { name: 'Ana Pérez', email: 'ana@example.com', role: 'admin' });
    assert.equal(u.name, 'Ana Pérez');
    assert.equal(u.roleLabel, 'Administrador');
    assert.equal(u.avatar, 'A');
    assert.equal(Dashboard._roleLabel('usuario'), 'Usuario');
  });

  it('_pendingKey relaciona los metodos de API con su lista', () => {
    assert.equal(Dashboard._pendingKey('createAnimal'), 'animales');
    assert.equal(Dashboard._pendingKey('updateContrato'), 'contratos');
    assert.equal(Dashboard._pendingKey('deleteBlacklist'), 'blacklist');
    assert.equal(Dashboard._pendingKey('createActividad'), '');
  });

  it('_loadList descarta una fila que ya no existe en el servidor', async () => {
    storage.setItem('gn_data_uid', 'u1');
    Dashboard.animales = [{ id: 'a1', nombre: 'Servidor viejo' }, { id: 'a2', nombre: 'Borrado por otro usuario' }];
    const out = await Dashboard._loadList('animales', async () => ({ data: [{ id: 'a1', nombre: 'Servidor' }] }), true);
    assert.deepEqual(out.map(a => a.id), ['a1']);
    assert.equal(out[0].nombre, 'Servidor');
  });

  it('_loadList conserva solo la fila local con una operacion pendiente', async () => {
    storage.setItem('gn_data_uid', 'u1');
    storage.setItem('gn_pending_ops', JSON.stringify([{ m: 'createAnimal', a: [{ id: 'a2' }], uid: 'u1' }]));
    Dashboard.animales = [{ id: 'a1' }, { id: 'a2', nombre: 'Pendiente de subir' }, { id: 'a3', nombre: 'Borrado' }];
    const out = await Dashboard._loadList('animales', async () => ({ data: [{ id: 'a1' }] }), true);
    assert.deepEqual(out.map(a => a.id), ['a1', 'a2']);
  });
});

describe('identidad del animal en contratos', () => {
  it('el editor exige foto cuando el animal no tiene', () => {
    const html = Dashboard._contratoAnimalEditorHtml({ prefix: 'ct-animal', nombre: 'Luna <3', foto: '' });
    assert.match(html, /id="ct-animal-nombre"/);
    assert.match(html, /id="ct-animal-foto"/);
    assert.match(html, /Falta foto/);
    assert.match(html, /Obligatoria/);
    assert.match(html, /Luna &lt;3/);
    assert.doesNotMatch(html, /Luna <3/);
  });

  it('con foto incluida se puede mantener o sustituir', () => {
    const html = Dashboard._contratoAnimalEditorHtml({ prefix: 'ac-animal', nombre: 'Luna', foto: 'https://drive.google.com/thumbnail?id=f1&sz=w800' });
    assert.match(html, /Foto incluida/);
    assert.match(html, /Puedes mantener la foto actual/);
    assert.match(html, /ac-animal-foto-preview/);
    assert.doesNotMatch(html, /Obligatoria/);
  });

  it('_fotoSrc prepara la foto de la ficha para el contrato', () => {
    assert.equal(Dashboard._fotoSrc({ foto_drive_id: 'abc' }, 'w800'), 'https://drive.google.com/thumbnail?id=abc&sz=w800');
    assert.equal(Dashboard._fotoSrc({ foto: 'https://x/y.jpg' }, 'w800'), 'https://x/y.jpg');
    assert.equal(Dashboard._fotoSrc({}, 'w800'), '');
  });
});

describe('stepper de fases de adopcion', () => {
  it('_faseProgreso calcula indice, total y porcentaje', () => {
    assert.deepEqual(Dashboard._faseProgreso({ fase: 'Encuesta recibida' }), { idx: 0, total: 7, pct: 0 });
    assert.deepEqual(Dashboard._faseProgreso({ fase: 'Contrato' }), { idx: 3, total: 7, pct: 50 });
    assert.deepEqual(Dashboard._faseProgreso({ fase: 'Seguimiento' }), { idx: 6, total: 7, pct: 100 });
  });

  it('marca hechas, actual y pendientes', () => {
    const html = Dashboard._faseStepperHtml(Dashboard._fasesAdopcion(), 'Entrega');
    assert.match(html, /aria-current="step"/);
    assert.equal((html.match(/is-done/g) || []).length, 4);
    assert.equal((html.match(/is-current/g) || []).length, 1);
    assert.match(html, /is-pending/);
    assert.match(html, />Entrega</);
  });

  it('escapa el nombre de la fase', () => {
    const html = Dashboard._faseStepperHtml(['<b>A</b>', 'B'], '<b>A</b>');
    assert.match(html, /&lt;b&gt;A&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>A<\/b>/);
  });
});
