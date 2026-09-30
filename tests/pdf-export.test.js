/**
 * Tests del diseno de PDFs (builders puros, sin DOM ni red).
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.Dashboard = {
  getEstado: (id) => (id === 'r2' ? 'aprobada' : 'pendiente'),
  _buildSections: (row) => [{ title: 'Cuestionario', fields: [{ label: 'P1', value: row.p1 || '' }] }]
};

const PdfExport = require('../src/js/pdf-export.js');
const LOGO = 'data:image/png;base64,AAA';

describe('_buildSingleReport: ficha profesional', () => {
  const row = { id: 'r2', nombre: 'Ana', apellidos: 'Luz', email: 'a@x.es', p1: 'Si' };
  const html = PdfExport._buildSingleReport(row, { id: 's1', name: 'Perros' }, LOGO, 'Muy maja');

  it('logo local, badge de estado y nota', () => {
    assert.match(html, /data:image\/png;base64,AAA/);
    assert.match(html, /badge-aprobada/);
    assert.match(html, /Notas del evaluador/);
    assert.match(html, /Muy maja/);
  });

  it('sin nota no pinta seccion', () => {
    assert.doesNotMatch(PdfExport._buildSingleReport(row, null, LOGO, ''), /Notas del evaluador/);
  });
});

describe('_buildFullReport: portada + fichas', () => {
  const rows = [
    { id: 'r1', nombre: 'A', apellidos: 'B', email: 'a@x.es', p1: 'x' },
    { id: 'r2', nombre: 'C', apellidos: 'D', email: 'c@x.es', p1: 'y' }
  ];
  const html = PdfExport._buildFullReport(rows, { id: 's1', name: 'Perros' }, LOGO);

  it('portada con conteos', () => {
    assert.match(html, /2 solicitudes/);
    assert.match(html, /kpi-n/);
  });

  it('una ficha por solicitud con salto de pagina', () => {
    assert.equal((html.match(/class="sheet"/g) || []).length, 2);
    assert.match(html, /page-break-before:always/);
  });

  it('sin solicitudes no rompe', () => {
    assert.match(PdfExport._buildFullReport([], null, LOGO), /0 solicitudes/);
  });
});

describe('_buildContracto: logo y firmas', () => {
  const c = { adopcion_id: 'adp1', ciudad: 'Irun', f1_nombre: 'Ana', f1_dni: '1', f1_firma: 'data:image/png;base64,AAA' };
  const html = PdfExport._buildContracto(c, LOGO);

  it('usa logo inyectado y muestra firma', () => {
    assert.match(html, /data:image\/png;base64,AAA/);
    assert.match(html, /Contrato de Adopcion/);
    assert.match(html, /break-inside:avoid/);
  });
});

describe('_buildMemoria: memoria anual', () => {
  const m = {
    year: 2025, altasN: 12, adopcionesN: 5, donacionesN: 3, gastosN: 2,
    donTotal: 1234.5, gasTotal: 500, balance: 734.5,
    altas: [{ nombre: 'Luna', especie: 'Perro', raza: 'Mestiza', fecha_ingreso: '2025-04-13', estado: 'adoptado' }],
    adopciones: [{ animal: 'Luna', adoptante: 'Ana <b>X</b>', fecha: '2025-05-01', fase: 'Cerrado' }],
    donaciones: [{ fecha: '2025-06-01', donante: 'Anon', importe: '100,5' }],
    gastos: [{ fecha: '2025-07-01', concepto: 'Vacuna', animal: 'Luna', importe: '50' }],
    sociosTotal: 30, sociosActivos: 20, sociosNuevos: 4, apadrinamientosN: 2, apadrinaTotal: 45
  };
  const html = PdfExport._buildMemoria(m, LOGO);

  it('portada con logo, ejercicio y KPIs', () => {
    assert.match(html, /data:image\/png;base64,AAA/);
    assert.match(html, /Memoria anual 2025/);
    assert.match(html, /Ejercicio 2025/);
    assert.match(html, /1234,50 €/);
    assert.match(html, /500,00 €/);
    assert.match(html, /734,50 €/);
  });

  it('resumen del ejercicio con totales y apadrinamientos', () => {
    assert.match(html, /Balance del ejercicio/);
    assert.match(html, /Apadrinamientos activos/);
    assert.match(html, /2 · 45,00 €/);
    assert.match(html, /30 \/ 20/);
  });

  it('escapa los datos personales', () => {
    assert.match(html, /Ana &lt;b&gt;X&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>X<\/b>/);
  });

  it('pinta las tablas de detalle', () => {
    assert.match(html, /Adopciones cerradas en el ejercicio/);
    assert.match(html, /Altas de animales/);
    assert.match(html, /Mestiza/);
    assert.match(html, /Vacuna/);
  });

  it('sin registros pinta los huecos en vez de tablas vacias', () => {
    const vacio = PdfExport._buildMemoria({ ...m, adopciones: [], altas: [], donaciones: [], gastos: [] }, LOGO);
    assert.match(vacio, /Sin adopciones registradas en el ejercicio/);
    assert.match(vacio, /Sin altas de animales en el ejercicio/);
    assert.match(vacio, /Sin donaciones en el ejercicio/);
    assert.match(vacio, /Sin gastos en el ejercicio/);
  });
});

describe('_label: snake_case a Titulo', () => {
  it('convierte guiones bajos y capitaliza', () => {
    assert.equal(PdfExport._label('fecha_creacion'), 'Fecha Creacion');
    assert.equal(PdfExport._label('nombre'), 'Nombre');
    assert.equal(PdfExport._label('horas_mes'), 'Horas Mes');
  });
});
