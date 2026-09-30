/**
 * Cobertura de logica pura del Dashboard que estaba sin testear:
 * escapeo XSS, blacklist, candidaturas, orden/fechas, widgets del panel,
 * consultas por animal, fichas y memoria anual. Sin DOM ni red.
 * Los fixtures se instalan en beforeEach: el objeto Dashboard es un single.
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Dashboard = require('../src/js/dashboard.js');
global.Icons = require('../src/js/icons.js');

// saveLocal toca localStorage (no existe en Node): lo neutralizamos y restauramos.
let saveLocalReal;
afterEach(() => { if (saveLocalReal) { Dashboard.saveLocal = saveLocalReal; saveLocalReal = null; } });
const sinPersistencia = () => { saveLocalReal = Dashboard.saveLocal; Dashboard.saveLocal = () => {}; };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nums = (html, re) => [...html.matchAll(re)].map(m => +m[1]);

describe('_esc: escapeo XSS', () => {
  it('escapa etiquetas y comillas', () => {
    assert.equal(Dashboard._esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(Dashboard._esc('a "b" \'c\''), 'a &quot;b&quot; &#39;c&#39;');
    assert.equal(Dashboard._esc('a & b'), 'a &amp; b');
  });

  it('null/undefined -> vacio y numeros se stringifican', () => {
    assert.equal(Dashboard._esc(null), '');
    assert.equal(Dashboard._esc(undefined), '');
    assert.equal(Dashboard._esc(42), '42');
  });

  it('escapa el ampersand antes que el resto (sin doble encoding)', () => {
    assert.equal(Dashboard._esc('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  });
});

describe('checkBlacklist: coincidencia por persona o email', () => {
  beforeEach(() => { Dashboard.blacklist = [{ nombre: 'Ana', apellidos: 'Garcia', email: ' ANA@X.ES ' }]; });

  it('email sin importar mayusculas ni espacios', () => {
    assert.equal(Dashboard.checkBlacklist('', 'ana@x.es'), true);
    assert.equal(Dashboard.checkBlacklist('Otro', '  Ana@X.es  '), true);
  });

  it('nombre, apellidos y nombre completo', () => {
    assert.equal(Dashboard.checkBlacklist('ana', ''), true);
    assert.equal(Dashboard.checkBlacklist('garcia', ''), true);
    assert.equal(Dashboard.checkBlacklist('ana garcia', ''), true);
  });

  it('sin datos de entrada nunca da positivo', () => {
    assert.equal(Dashboard.checkBlacklist('', ''), false);
    assert.equal(Dashboard.checkBlacklist(undefined, undefined), false);
  });

  it('sin coincidencia o lista vacia -> false', () => {
    assert.equal(Dashboard.checkBlacklist('Luis', 'l@x.es'), false);
    Dashboard.blacklist = [];
    assert.equal(Dashboard.checkBlacklist('ana', 'ana@x.es'), false);
  });
});

describe('_candidaturasDe: solo con solicitud aprobada', () => {
  beforeEach(() => {
    Dashboard.candidaturas = [
      { solicitud_id: 's1::r1', estado: 'en_lista' },
      { solicitud_id: 's1::r1', estado: 'elegido' },
      { solicitud_id: 's1::r2', estado: 'elegido' }
    ];
    Dashboard.states = { 's1::r1': 'aprobada', 's1::r2': 'pendiente' };
  });

  it('devuelve todas las de esa solicitud cuando esta aprobada', () => {
    assert.equal(Dashboard._candidaturasDe('s1', 'r1').length, 2);
  });

  it('nada si la solicitud no esta aprobada', () => {
    assert.deepEqual(Dashboard._candidaturasDe('s1', 'r2'), []);
  });

  it('nada si la solicitud no existe', () => {
    assert.deepEqual(Dashboard._candidaturasDe('s1', 'otra'), []);
  });
});

describe('_sortEncuestas: mas recientes primero', () => {
  const list = [
    { id: 'a', fecha_creacion: '2026-01-05 10:00:00' },
    { id: 'b', fecha_creacion: '2026-03-01T09:00:00' },
    { id: 'c', fecha_creacion: '' },
    { id: 'd', fecha_creacion: '2025-12-31' },
    { id: 'e', fecha_creacion: 'sin fecha' }
  ];

  it('ordena desc y deja las invalidas al final', () => {
    assert.deepEqual(Dashboard._sortEncuestas(list).map(x => x.id), ['b', 'a', 'd', 'c', 'e']);
  });

  it('no muta la lista original', () => {
    Dashboard._sortEncuestas(list);
    assert.deepEqual(list.map(x => x.id), ['a', 'b', 'c', 'd', 'e']);
  });
});

describe('_recentRows: ultimas respuestas del panel', () => {
  beforeEach(() => {
    Dashboard.surveys = [{ id: 'pre-adopcion-perros', name: 'Pre-adopcion perros' }];
    Dashboard.states = {};
    Dashboard.responses = {
      'pre-adopcion-perros': [
        { id: 'r1', nombre: '<b>ANA</b>', apellidos: 'G', fecha_creacion: '2026-09-01T10:00:00' },
        { id: 'r2', nombre: 'Zoila', apellidos: '', fecha_creacion: '2026-09-20T10:00:00' },
        { id: 'r3', nombre: 'C', apellidos: '', fecha_creacion: '2026-08-15T10:00:00' },
        { id: 'r4', nombre: 'D', apellidos: '', fecha_creacion: '2026-07-15T10:00:00' },
        { id: 'r5', nombre: 'E', apellidos: '', fecha_creacion: '2026-06-15T10:00:00' },
        { id: 'r6', nombre: 'Fermina', apellidos: '', fecha_creacion: '2026-05-15T10:00:00' }
      ]
    };
  });

  it('como mucho 5 filas', () => {
    assert.equal((Dashboard._recentRows().match(/<tr /g) || []).length, 5);
  });

  it('la mas reciente va la primera y la sexta se descarta', () => {
    const html = Dashboard._recentRows();
    assert.ok(html.indexOf('Zoila') < html.indexOf('ANA'), 'Zoila (mas reciente) debe ir antes');
    assert.doesNotMatch(html, /Fermina/);
  });

  it('escapa el nombre', () => {
    const html = Dashboard._recentRows();
    assert.match(html, /&lt;b&gt;ANA&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>ANA<\/b>/);
  });

  it('enlaza a la pagina de su encuesta', () => {
    assert.match(Dashboard._recentRows(), /location\.hash='encuestas-perros'/);
  });
});

describe('_buildBarChart: histograma de 12 meses', () => {
  const now = new Date();
  const dentro = iso(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const fuera = iso(new Date(now.getFullYear() - 2, 0, 15));

  beforeEach(() => {
    Dashboard.states = { 's1::r5': 'descartada' };
    Dashboard.responses = {
      s1: [
        { id: 'r1', fecha_creacion: dentro, _surveyId: 's1' },
        { id: 'r2', fecha_creacion: iso(now), _surveyId: 's1' },
        { id: 'r3', fecha_creacion: fuera, _surveyId: 's1' },
        { id: 'r4', fecha_creacion: '', _surveyId: 's1' },
        { id: 'r5', fecha_creacion: iso(now), _surveyId: 's1' }
      ]
    };
  });

  it('12 columnas con el total de respuestas activas del ultimo anio', () => {
    const counts = nums(Dashboard._buildBarChart(), /bar-chart-value">(\d+)</g);
    assert.equal(counts.length, 12);
    assert.equal(counts.reduce((a, b) => a + b, 0), 2);
  });

  it('descartadas y fuera de ventana no cuentan', () => {
    const counts = nums(Dashboard._buildBarChart(), /bar-chart-value">(\d+)</g);
    assert.ok(!counts.includes(3));
    assert.equal(counts.filter(c => c === 1).length, 2);
  });

  it('sin respuestas no divide por cero', () => {
    Dashboard.responses = {};
    const html = Dashboard._buildBarChart();
    assert.equal(nums(html, /bar-chart-value">(\d+)</g).reduce((a, b) => a + b, 0), 0);
    assert.match(html, /height:0px/);
  });
});

describe('_funnelAdopcion: embudo sin descartadas', () => {
  beforeEach(() => {
    Dashboard.states = {
      's1::r1': 'pendiente', 's1::r2': 'en_proceso',
      's1::r3': 'aprobada', 's1::r4': 'descartada'
    };
    Dashboard.responses = { s1: ['r1', 'r2', 'r3', 'r4'].map(id => ({ id, _surveyId: 's1' })) };
    Dashboard.animales = [
      { id: 'a1', estado: 'adoptado' }, { id: 'a2', estado: 'adoptado' }, { id: 'a3', estado: 'disponible' }
    ];
  });

  it('4 etapas: pendiente, en proceso, aprobada y adoptados', () => {
    assert.deepEqual(nums(Dashboard._funnelAdopcion(), /font-weight:800">(\d+)</g), [1, 1, 1, 2]);
  });
});

describe('_accionRows: caja de acciones', () => {
  it('sin nada pendiente muestra Todo al dia', () => {
    Dashboard.recordatorios = [];
    Dashboard.surveys = [];
    Dashboard.responses = {};
    assert.match(Dashboard._accionRows(), /Todo al d/);
  });

  it('lista solicitudes pendientes con su estado', () => {
    Dashboard.recordatorios = [];
    Dashboard.surveys = [{ id: 's1', name: 'Perros' }];
    Dashboard.responses = { s1: [{ id: 'r1', nombre: 'Ana', apellidos: 'G', fecha_creacion: iso(new Date()), _surveyId: 's1' }] };
    Dashboard.states = { 's1::r1': 'pendiente' };
    const html = Dashboard._accionRows();
    assert.match(html, /Ana G/);
    assert.match(html, /estado-badge /);
    assert.match(html, /openCuestionarioEnPagina\('s1','r1'\)/);
  });
});

describe('_renderResponseList: paginado', () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + i, nombre: 'N' + i, apellidos: '' }));
  beforeEach(() => { Dashboard._shown = {}; });

  it('mas de 20 respuestas anade boton de cargar mas', () => {
    const html = Dashboard._renderResponseList(mk(25), 's1', '');
    assert.match(html, /Cargar m.s \(5 restantes\)/);
    assert.equal((html.match(/class="response-card"/g) || []).length, 20);
  });

  it('hasta 20 no muestra boton', () => {
    assert.doesNotMatch(Dashboard._renderResponseList(mk(7), 's1', ''), /Cargar/);
  });

  it('lista vacia pinta el estado vacio', () => {
    assert.match(Dashboard._renderResponseList([], 's1', 'Nada por aqui'), /Nada por aqui/);
  });
});

describe('consultas por animal / grupo', () => {
  beforeEach(() => {
    Dashboard.animales = [{ id: 'a1', nombre: 'Luna', foto: 'luna.jpg' }];
    Dashboard.gastos = [{ animal_id: 'a1', importe: '10' }, { animal_id: 'a2', importe: '5' }, { animal_id: 1, importe: '1' }];
    Dashboard.documentos = [{ animal_id: 1, nombre: 'cartilla' }, { animal_id: 'x', nombre: 'otro' }];
    Dashboard.apadrinamientos = [{ animal_id: 'a1' }, { animal_id: 'otro' }];
    Dashboard.publicaciones = [{ animal_id: 1, id: 'p1' }, { animal_id: 'a1', id: 'p2' }];
    Dashboard.grupos = [{ id: 7, nombre: 'Camada A', foto: 'luna.jpg' }, { id: 8, nombre: 'B', foto_drive_id: 'ABC' }];
  });

  it('_animalName busca por id y avisa si no existe', () => {
    assert.equal(Dashboard._animalName('a1'), 'Luna');
    assert.equal(Dashboard._animalName('nope'), '(sin animal)');
  });

  it('los filtros comparan id como texto (1 vs "1")', () => {
    assert.equal(Dashboard._gastosDe('a1').length, 1);
    assert.equal(Dashboard._gastosDe('1').length, 1);
    assert.equal(Dashboard._gastosDe('99').length, 0);
    assert.equal(Dashboard._documentosDe('1').length, 1);
    assert.equal(Dashboard._publicacionesDe('1').length, 1);
    assert.equal(Dashboard._publicacionesDe('a1').length, 1);
    assert.equal(Dashboard._apadrinamientosDe('a1').length, 1);
  });

  it('listas sin datos no rompen', () => {
    Dashboard.gastos = null;
    assert.deepEqual(Dashboard._gastosDe('a1'), []);
  });

  it('_grupoInfo y _grupoFoto', () => {
    assert.equal(Dashboard._grupoInfo(7).nombre, 'Camada A');
    assert.equal(Dashboard._grupoInfo('inexistente'), null);
    assert.equal(Dashboard._grupoFoto(7), 'luna.jpg');
    assert.equal(Dashboard._grupoFoto(8), 'https://drive.google.com/thumbnail?id=ABC&sz=w800');
    assert.equal(Dashboard._grupoFoto('nope'), '');
  });

  it('_newGrupoId tiene prefijo y es unico', () => {
    const id = Dashboard._newGrupoId();
    assert.match(id, /^gpo_[a-z0-9]+$/);
    assert.notEqual(id, Dashboard._newGrupoId());
  });

  it('_grupoMiembros filtra por grupo', () => {
    Dashboard.animales = [{ id: 'a1', grupo_id: 'gpo_1' }, { id: 'a2', grupo_id: 'gpo_2' }, { id: 'a3' }];
    assert.equal(Dashboard._grupoMiembros('gpo_1').length, 1);
    assert.equal(Dashboard._grupoMiembros('gpo_2').length, 1);
    assert.equal(Dashboard._grupoMiembros('otro').length, 0);
  });
});

describe('_grupoCollage: retrato del grupo', () => {
  beforeEach(() => { Dashboard.grupos = []; Dashboard.animales = []; });

  it('si el grupo tiene foto propia la usa y no monta collage', () => {
    Dashboard.grupos = [{ id: 'gpo_x', nombre: 'G', foto: 'g.jpg' }];
    Dashboard.animales = [{ id: 'a1', grupo_id: 'gpo_x', especie: 'Perro' }];
    const html = Dashboard._grupoCollage('gpo_x');
    assert.match(html, /animal-collage-foto/);
    assert.match(html, /src="g\.jpg"/);
    assert.doesNotMatch(html, /animal-collage"/);
  });

  it('sin foto propia: 4 celdas como maximo (foto, especie y demas)', () => {
    Dashboard.animales = [
      { id: 'a1', grupo_id: 'gpo_x', especie: 'Perro', foto_drive_id: 'F1' },
      { id: 'a2', grupo_id: 'gpo_x', especie: 'Gato' },
      { id: 'a3', grupo_id: 'gpo_x', especie: 'Conejo' },
      { id: 'a4', grupo_id: 'gpo_x', especie: 'Perro' },
      { id: 'a5', grupo_id: 'gpo_x', especie: 'Gato' }
    ];
    const html = Dashboard._grupoCollage('gpo_x');
    assert.match(html, /class="animal-collage"/);
    assert.equal((html.match(/<img /g) || []).length, 1, 'solo la primera tiene foto');
    assert.equal((html.match(/collage-ph/g) || []).length, 3);
    assert.match(html, /collage-ph perro/);
    assert.doesNotMatch(html, /collage-ph empty/);
    assert.doesNotMatch(html, /undefined/);
  });

  it('rellena con huecos si faltan miembros', () => {
    Dashboard.animales = [{ id: 'a1', grupo_id: 'gpo_x', especie: 'Gato' }];
    const html = Dashboard._grupoCollage('gpo_x');
    assert.equal((html.match(/collage-ph/g) || []).length, 4);
    assert.equal((html.match(/collage-ph empty/g) || []).length, 3);
  });

  it('grupo sin miembros ni foto no rompe', () => {
    const html = Dashboard._grupoCollage('gpo_y');
    assert.equal((html.match(/collage-ph empty/g) || []).length, 4);
    assert.doesNotMatch(html, /undefined/);
  });
});

describe('guias y tutoriales: HTML sin huecos', () => {
  const builders = [
    '_tutorialMenu', '_tutorialGeneral', '_tutorialAdopcion', '_tutorialAcogida', '_tutorialAnimales',
    '_tutorialRedes', '_tutorialApadrinamiento', '_tutorialGestion', '_tutorialEstados', '_tutorialIndex'
  ];

  builders.forEach(n => {
    it(n + ' genera contenido sin undefined ni NaN', () => {
      const html = Dashboard[n]();
      assert.ok(String(html).length > 500, n + ' devuelve poco contenido');
      assert.match(String(html), /<div/);
      assert.doesNotMatch(String(html), /undefined/);
      assert.doesNotMatch(String(html), /NaN/);
    });
  });

  it('el indice enlaza a las pantallas principales', () => {
    const html = Dashboard._tutorialIndex();
    ['encuestas-perros', 'encuestas-gatos', 'encuestas-acogida', 'animales', 'acogidas', 'adopciones',
      'socios', 'blacklist', 'redes', 'donaciones', 'almacen']
      .forEach(p => assert.match(html, new RegExp("_jumpTo\\('" + p + "'\\)"), 'falta el salto a ' + p));
  });
});

describe('publicaciones: alta y borrado local', () => {
  it('_pushPublicacion anade, persiste y devuelve', () => {
    sinPersistencia();
    Dashboard.publicaciones = [];
    const pub = { id: 'p1', animal_id: 'a1' };
    assert.equal(Dashboard._pushPublicacion(pub), pub);
    assert.deepEqual(Dashboard.publicaciones, [pub]);
  });

  it('_removePublicacion borra solo la indicada', () => {
    sinPersistencia();
    Dashboard.publicaciones = [{ id: 'p1' }, { id: 'p2' }];
    Dashboard._removePublicacion('p2');
    assert.deepEqual(Dashboard.publicaciones, [{ id: 'p1' }]);
    Dashboard._removePublicacion('desconocido');
    assert.equal(Dashboard.publicaciones.length, 1);
  });
});

describe('fechas: ISO, dd/mm/aaaa y dd-mm-aaaa', () => {
  it('_anioFecha normaliza ISO, con hora y dd/mm/aaaa', () => {
    assert.equal(Dashboard._anioFecha('2025-04-13'), 2025);
    assert.equal(Dashboard._anioFecha('2025-04-13T10:30:00'), 2025);
    assert.equal(Dashboard._anioFecha('13/04/2025'), 2025);
  });

  it('_anioFecha admite dd-mm-aaaa aunque el dia pase de 12', () => {
    assert.equal(Dashboard._anioFecha('13-04-2025'), 2025);
    assert.equal(Dashboard._anioFecha('04-03-2025'), 2025);
  });

  it('_anioFecha vacio o basura -> null', () => {
    assert.equal(Dashboard._anioFecha(''), null);
    assert.equal(Dashboard._anioFecha(null), null);
    assert.equal(Dashboard._anioFecha('hola'), null);
  });

  it('_tsFecha devuelve timestamp UTC estable', () => {
    assert.equal(Dashboard._tsFecha('2025-04-13'), Date.UTC(2025, 3, 13));
    assert.equal(Dashboard._tsFecha('13/04/2025'), Date.UTC(2025, 3, 13));
    assert.equal(Dashboard._tsFecha(''), 0);
    assert.equal(Dashboard._tsFecha('nada'), 0);
  });

  it('_tsFecha lee dd-mm-aaaa como dia-mes y no lo descarta', () => {
    assert.equal(Dashboard._tsFecha('13-04-2025'), Date.UTC(2025, 3, 13));
    assert.equal(Dashboard._tsFecha('04-03-2025'), Date.UTC(2025, 2, 4));
  });

  it('_fmtFecha formatea ISO con y sin hora', () => {
    assert.equal(Dashboard._fmtFecha('2025-04-13'), '13 abr 2025');
    assert.equal(Dashboard._fmtFecha('2025-04-13T10:30:00'), '13 abr 2025 10:30');
    assert.equal(Dashboard._fmtFecha('13/04/2025'), '13 abr 2025');
  });

  it('_fmtFecha formatea dd-mm-aaaa en vez de devolverlo crudo', () => {
    assert.equal(Dashboard._fmtFecha('13-04-2025'), '13 abr 2025');
  });

  it('_fmtFecha vacio -> raya y basura se respeta tal cual', () => {
    assert.equal(Dashboard._fmtFecha(''), '—');
    assert.equal(Dashboard._fmtFecha(null), '—');
    assert.equal(Dashboard._fmtFecha('nada'), 'nada');
  });

  it('_fechaCorta con y sin hora', () => {
    const d = new Date(2025, 3, 13, 9, 5);
    assert.equal(Dashboard._fechaCorta(d), '13 abr 2025');
    assert.equal(Dashboard._fechaCorta(d, true), '13 abr 2025 09:05');
  });

  it('_partesFecha reconoce ISO, con guiones, con barras y texto es-ES', () => {
    assert.deepEqual(Dashboard._partesFecha('2025-04-13'), { y: 2025, m: 3, d: 13 });
    assert.deepEqual(Dashboard._partesFecha('13-04-2025'), { y: 2025, m: 3, d: 13 });
    assert.deepEqual(Dashboard._partesFecha('13/04/2025'), { y: 2025, m: 3, d: 13 });
    assert.deepEqual(Dashboard._partesFecha('13 abr 2025'), { y: 2025, m: 3, d: 13 });
    assert.equal(Dashboard._partesFecha('Mestizo'), null);
    assert.equal(Dashboard._partesFecha(''), null);
    assert.equal(Dashboard._partesFecha(null), null);
  });

  it('_tsFecha lee texto es-ES (el formato con el que se guardan las acogidas)', () => {
    assert.equal(Dashboard._tsFecha('01 abr 2025'), Date.UTC(2025, 3, 1));
    assert.equal(Dashboard._tsFecha('15 sept 2025'), Date.UTC(2025, 8, 15));
    assert.equal(Dashboard._tsFecha('13 dic 2025'), Date.UTC(2025, 11, 13));
  });

  it('_anioFecha lee texto es-ES', () => {
    assert.equal(Dashboard._anioFecha('13 sept 2025'), 2025);
    assert.equal(Dashboard._anioFecha('31 dic 2025'), 2025);
  });
});

describe('_cardAnalitica: analitica de reportes', () => {
  beforeEach(() => {
    Dashboard.surveys = [];
    Dashboard.responses = {};
    Dashboard.socios = [
      { nombre: 'Maria', tipo: 'Voluntario', horas_mes: '12', activo: true },
      { nombre: 'Pepe', tipo: 'Ambos', horas_mes: '8.5', activo: false },
      { nombre: 'Ana', tipo: 'Socio', horas_mes: '40', activo: true }
    ];
    Dashboard.acogidas = [
      { id: 'c1', fase: 'finalizada', estado: 'finalizada', inicio: '01 abr 2025', fin: '11 abr 2025' },
      { id: 'c2', fase: 'en_casa', estado: 'activa', inicio: '01 may 2025' },
      { id: 'c3', fase: 'finalizada', estado: 'finalizada', inicio: '01 jun 2025', fin: '06 jun 2025' }
    ];
  });

  it('duracion media de acogidas con fechas en texto es-ES', () => {
    const html = Dashboard._cardAnalitica();
    assert.match(html, /<b>8 dias<\/b> \(min 5 · max 10\) en 2 casos cerrados/);
    assert.doesNotMatch(html, /Todavia sin casos finalizados/);
  });

  it('recuento de casos por fase', () => {
    assert.match(Dashboard._cardAnalitica(), /3 en total · 1 en curso · 2 cerrados/);
  });

  it('computa horas solo de voluntarios y arma el top', () => {
    const html = Dashboard._cardAnalitica();
    assert.match(html, /<b>20\.5 h<\/b> de 2 voluntarios \(1 activos\)/);
    assert.match(html, /Maria · 12 h/);
    assert.doesNotMatch(html, /Ana · 40 h/);
  });

  it('con datos vacios no rompe', () => {
    Dashboard.acogidas = [];
    Dashboard.socios = [];
    const html = Dashboard._cardAnalitica();
    assert.match(html, /Todavia sin casos finalizados/);
    assert.match(html, /0 en total/);
    assert.match(html, /Sin horas registradas aun/);
  });
});

describe('memoria anual', () => {
  beforeEach(() => {
    Dashboard.gastos = [{ fecha: '2025-05-01', importe: '12,5' }, { fecha: '2026-01-02', importe: '7' }, { fecha: 'basura', importe: '3' }];
    Dashboard.donaciones = [{ fecha: '13/06/2025', importe: '100' }];
    Dashboard.adopciones = [{ fecha: '2025-07-01' }];
    Dashboard.animales = [{ fecha_ingreso: '2025-08-01' }, { fecha_ingreso: '2024-12-31' }];
    Dashboard.socios = [{ fecha_registro: '2025-09-01', activo: true }, { fecha_registro: '2025-10-01', activo: false }];
    Dashboard.apadrinamientos = [
      { estado: 'activo', aporte_mensual: '10' },
      { estado: 'Inactivo', aporte_mensual: '99' },
      { estado: 'finalizado', aporte_mensual: '5' }
    ];
  });

  it('_importeDe admite decimales con coma y texto', () => {
    assert.equal(Dashboard._importeDe({ importe: '12,5' }), 12.5);
    assert.equal(Dashboard._importeDe({ importe: '12.5' }), 12.5);
    assert.equal(Dashboard._importeDe({ importe: '' }), 0);
    assert.equal(Dashboard._importeDe(null), 0);
  });

  it('_memoriaAnios cubre el anio actual y ordena desc', () => {
    const anios = Dashboard._memoriaAnios();
    assert.ok(anios.includes(new Date().getFullYear()));
    assert.ok(anios.includes(2025));
    assert.ok(anios.includes(2024));
    assert.deepEqual(anios, [...anios].sort((a, b) => b - a));
  });

  it('_memoriaData agrupa por anio y suma importes', () => {
    const m = Dashboard._memoriaData(2025);
    assert.equal(m.gastosN, 1);
    assert.equal(m.gasTotal, 12.5);
    assert.equal(m.donacionesN, 1);
    assert.equal(m.donTotal, 100);
    assert.equal(m.balance, 87.5);
    assert.equal(m.adopcionesN, 1);
    assert.equal(m.altasN, 1);
    assert.equal(m.sociosNuevos, 2);
    assert.equal(m.sociosTotal, 2);
    assert.equal(m.sociosActivos, 1);
    assert.equal(m.apadrinamientosN, 2);
    assert.equal(m.apadrinaTotal, 15);
  });

  it('_memoriaData de un anio sin datos no rompe', () => {
    const m = Dashboard._memoriaData(1999);
    assert.equal(m.gastosN, 0);
    assert.equal(m.balance, 0);
    assert.equal(m.altasN, 0);
  });
});

describe('listas de detalle: blacklist y actividad', () => {
  beforeEach(() => {
    Dashboard.blacklist = [
      { id: 'bl1', nombre: 'Ana', apellidos: 'Garcia', email: 'a@x.es', motivo: 'Maltrato', origen: 'manual', fecha: '2025-01-02' },
      { id: 'bl2', nombre: 'Luis', apellidos: 'Perez', email: 'l@x.es', motivo: 'Estafa' }
    ];
  });

  it('pinta una tarjeta por persona', () => {
    const html = Dashboard._renderBlacklistCards('');
    assert.equal((html.match(/class="bl-card"/g) || []).length, 2);
    assert.match(html, /Maltrato/);
    assert.doesNotMatch(html, /undefined/);
  });

  it('el filtro busca en nombre, email y motivo', () => {
    assert.equal((Dashboard._renderBlacklistCards('ana').match(/class="bl-card"/g) || []).length, 1);
    assert.equal((Dashboard._renderBlacklistCards('estafa').match(/class="bl-card"/g) || []).length, 1);
    assert.match(Dashboard._renderBlacklistCards('zzz'), /No hay personas en la lista negra/);
  });

  it('escapa el motivo', () => {
    Dashboard.blacklist = [{ id: 'b', nombre: 'X', apellidos: '', motivo: '<script>1</script>' }];
    assert.match(Dashboard._renderBlacklistCards(''), /&lt;script&gt;1&lt;\/script&gt;/);
  });

  it('_fmtLogFecha formatea o devuelve la raya', () => {
    assert.equal(Dashboard._fmtLogFecha(''), '—');
    assert.equal(Dashboard._fmtLogFecha(null), '—');
    assert.match(Dashboard._fmtLogFecha('2025-04-13 10:30:00'), /13 abr 2025/);
    assert.equal(Dashboard._fmtLogFecha('otracosa'), 'otracosa');
  });

  it('_renderActividadTabla: tabla con 4 columnas y detalle escapado', () => {
    const html = Dashboard._renderActividadTabla([
      { fecha: '2025-04-13 10:30:00', usuario: 'x@y.es', tipo: 'gasto', detalle: 'Alta <b>Luna</b>' }
    ]);
    assert.match(html, /<th>Fecha<\/th>/);
    assert.match(html, /Alta &lt;b&gt;Luna&lt;\/b&gt;/);
    assert.match(html, /estado-badge en_proceso/);
    assert.match(html, /Gasto/);
  });

  it('_renderActividadTabla sin registros', () => {
    assert.match(Dashboard._renderActividadTabla([]), /Sin actividad registrada/);
  });
});

describe('fichas de animal y socio', () => {
  beforeEach(() => {
    Dashboard.publicaciones = [{ id: 'p1', animal_id: 'a1', fecha: '2025-04-13', estado: 'publicada', permalink: 'https://ig/p1' }];
    Dashboard.gastos = [{ id: 'g1', animal_id: 'a1', fecha: '2025-04-13', concepto: 'Vacuna', importe: '25,5' }];
    Dashboard.documentos = [{ id: 'd1', animal_id: 'a1', tipo: 'Cartilla', nombre: 'cartilla.pdf', url: 'https://x/f', fecha: '2025-04-13' }];
    Dashboard.seguimientos = [{ id: 's1', adopcion_id: 'ad1', fecha: '2025-04-13', tipo: 'Llamada', nota: 'Bien' }];
    Dashboard.animales = [{ id: 'a1', nombre: 'Luna' }];
    Dashboard.apadrinamientos = [
      { padrino_id: 'so1', animal_id: 'a1', animal: 'Luna', estado: 'activo', aporte_mensual: '15' },
      { padrino_id: 'otro', animal_id: 'a2', animal: 'Toby', estado: 'activo', aporte_mensual: '99' }
    ];
    Dashboard.contratos = [{ id: 'c1', adopcion_id: 'ad1' }];
  });

  it('_publicacionesFicha: badge con recuento y enlace', () => {
    const html = Dashboard._publicacionesFicha('a1');
    assert.match(html, /Publicaciones · 1/);
    assert.match(html, /https:\/\/ig\/p1/);
    assert.match(html, /publicarAnimal\('a1'\)/);
    assert.match(Dashboard._publicacionesFicha('sin-pub'), /Sin publicaciones todavia/);
  });

  it('_gastosFicha: total en el badge y precio formateado', () => {
    const html = Dashboard._gastosFicha('a1');
    assert.match(html, /Gastos veterinarios · 25\.50 €/);
    assert.match(html, /deleteGasto\('g1'\)/);
    assert.match(Dashboard._gastosFicha('otro'), /Sin gastos registrados/);
  });

  it('_documentosFicha enlaza solo si hay url', () => {
    const html = Dashboard._documentosFicha('a1');
    assert.match(html, /Documentos · 1/);
    assert.match(html, /href="https:\/\/x\/f"/);
    assert.match(Dashboard._documentosFicha('otro'), /Sin documentos/);
  });

  it('_seguimientosFicha filtra por adopcion', () => {
    const html = Dashboard._seguimientosFicha('ad1');
    assert.match(html, /Seguimiento post-adopcion/);
    assert.match(html, /Llamada/);
    assert.match(Dashboard._seguimientosFicha('otra'), /Sin seguimientos todavia/);
  });

  it('_apadrinaFicha suma solo los apadrinamientos de ese socio', () => {
    const html = Dashboard._apadrinaFicha('so1');
    assert.match(html, /15 €\/mes/);
    assert.match(html, /Total<\/div>/);
    assert.match(Dashboard._apadrinaFicha('nadie'), /No apadrina ningun animal/);
  });

  it('_contratoDeAdopcion encuentra por adopcion_id', () => {
    assert.equal(Dashboard._contratoDeAdopcion('ad1').id, 'c1');
    assert.equal(Dashboard._contratoDeAdopcion('ad2'), undefined);
  });
});

describe('utilidades de la guia y del panel', () => {
  it('_guideStep con y sin localizacion', () => {
    const con = Dashboard._guideStep('ICO', 'Titulo', 'Texto', 'Gestion > Animales', true);
    assert.match(con, /guide-step-loc/);
    assert.match(con, /#e8faf0/);
    const sin = Dashboard._guideStep('ICO', 'T', 'x');
    assert.doesNotMatch(sin, /guide-step-loc/);
    assert.match(sin, /#ebf5fb/);
  });

  it('_flowDiagram dibuja un rectangulo por nodo y cierra el svg', () => {
    const svg = Dashboard._flowDiagram([['a', 'b'], ['c', 'd'], ['e']], '#1FC95B');
    assert.equal((svg.match(/<rect/g) || []).length, 3);
    assert.match(svg, /<\/svg>$/);
    assert.doesNotMatch(svg, /undefined/);
  });

  it('_errMsg nunca devuelve undefined', () => {
    assert.equal(Dashboard._errMsg(null), 'Error desconocido');
    assert.equal(Dashboard._errMsg({}), 'Error desconocido');
    assert.equal(Dashboard._errMsg(new Error('Error')), 'Error desconocido');
    assert.equal(Dashboard._errMsg(new Error('Fallo real')), 'Fallo real');
    assert.equal(Dashboard._errMsg({ error: 'del backend' }), 'del backend');
  });
});
