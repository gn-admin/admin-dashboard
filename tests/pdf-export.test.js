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
