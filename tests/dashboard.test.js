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

  it('respeta los tres status explicitos', () => {
    assert.equal(T({ status: 'success' }), 'success');
    assert.equal(T({ status: 'warning' }), 'warning');
    assert.equal(T({ status: 'error' }), 'error');
  });

  it('sin status, error por defecto', () => {
    assert.equal(T(new Error('boom')), 'error');
    assert.equal(T({ message: 'HTTP 500: Internal Server Error' }), 'error');
    assert.equal(T(null), 'error');
    assert.equal(T(undefined), 'error');
  });

  it('hoja sin configurar -> warning, aunque no traiga status', () => {
    assert.equal(T(new Error('Hoja Grupos sin configurar: crea la hoja y rellena SHEET_GRUPOS_ID')), 'warning');
    assert.equal(T({ error: 'DRIVE_FOTOS_FOLDER_ID no configurado' }), 'warning');
  });

  it('rate limit -> warning (429 o por mensaje)', () => {
    assert.equal(T({ code: 429, message: 'demasiadas peticiones' }), 'warning');
    assert.equal(T({ message: 'Demasiadas peticiones: espera unos segundos y reintenta' }), 'warning');
  });

  it('un status desconocido no se cuela como verde', () => {
    assert.equal(T({ status: 'ok' }), 'error');
    assert.equal(T({ status: '' }), 'error');
  });

  it('mensaje de fallo normal no se confunde con aviso', () => {
    assert.equal(T(new Error('El backend no devolvio el registro (id sin sincronizar)')), 'error');
    assert.equal(T(new Error('Token invalido')), 'error');
    assert.equal(T(new Error('No se pudo subir la foto')), 'error');
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
    const lista = [{ id: 'x' }, { id: 'y', urgente: 'TRUE' }];
    assert.deepEqual(Dashboard._ordenaUrgentes(lista).map(x => x.id), ['y', 'x']);
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
