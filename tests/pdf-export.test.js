/**
 * Tests del diseno de PDFs (builders puros, sin DOM ni red).
 * Ejecutar: npm test  (node --test tests/*.test.js)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.Dashboard = {
  getEstado: (id) => (id === 'r2' ? 'aprobada' : 'pendiente'),
  _buildSections: (row) => [{ title: 'Cuestionario', fields: [{ label: 'P1', value: row.p1 || '' }] }],
  _terminosAdopcionCuerpo: () => '<div class="contrato-doc-header">Términos y condiciones de adopción responsable</div><div class="contrato-doc-sub">Anexo del contrato</div><h3>1. Objeto</h3><p>Texto de prueba.</p>'
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
    assert.match(html, /Contrato de adopción/);
    assert.match(html, /break-inside:avoid/);
  });
});

describe('_buildContracto: 20 estipulaciones y datos del contrato', () => {
  const c = {
    adopcion_id: 'adp4', ciudad: 'Irun', fecha: '2026-11-18',
    animal: 'Luna', nombre_definitivo: 'Nala',
    animal_capa: 'Atigrada', animal_color: 'Gris', animal_tamano: 'Mediano',
    especie: 'Gato', raza: 'Comun europeo', animal_sexo: 'Hembra', animal_microchip: 'CHIP-9',
    animal_esterilizada: true, animal_descripcion: 'Muy sociable', animal_fecha_nacimiento: '2022-01-02',
    donacion_adoptante: 120, indemnizacion_importe: 750,
    f1_nombre: 'Ana', f1_dni: '1', f1_firma: 'data:image/png;base64,AAA'
  };
  const html = PdfExport._buildContracto(c, LOGO);

  it('pinta las 20 estipulaciones con los importes del contrato', () => {
    assert.equal((html.match(/class="clausula"/g) || []).length, 20);
    assert.match(html, /1ª\./);
    assert.match(html, /20ª\./);
    assert.match(html, /tres folios a doble cara/);
    assert.match(html, /120 €/);
    assert.match(html, /750 €/);
  });

  it('incluye nombre definitivo, capa, color y tamaño', () => {
    assert.match(html, /Nombre definitivo/);
    assert.match(html, /Nala/);
    assert.match(html, /Atigrada/);
    assert.match(html, /Gris/);
    assert.match(html, /Mediano/);
    assert.match(html, /Datos de adopción/);
    assert.doesNotMatch(html, /Peso/);
  });

  it('mantiene las prohibiciones de la estipulación 3', () => {
    assert.match(html, /Caza de cualquier tipo/);
    assert.match(html, /Perro policía o fines militares/);
  });

  it('sin importes guardados usa los del documento (100 y 900)', () => {
    const sin = PdfExport._buildContracto({ animal: 'Luna', f1_nombre: 'Ana' }, LOGO);
    assert.match(sin, /100 €/);
    assert.match(sin, /900 €/);
  });
});

describe('_buildContracto: foto, ficha del animal, adoptante y tutor', () => {
  const c = {
    adopcion_id: 'adp2', ciudad: 'Irun', fecha: '2026-11-10',
    animal: 'Luna', animal_foto: 'data:image/jpeg;base64,FOTO',
    especie: 'Perro', raza: 'Mestiza', animal_sexo: 'Hembra', animal_microchip: 'CHIP-123',
    animal_fecha_nacimiento: '2022-01-02', animal_peso: '12', animal_esterilizada: true,
    animal_descripcion: 'Negra con una mancha blanca',
    f1_nombre: 'Ana & Luis', f1_dni: '111', f1_direccion: 'Calle Mayor 1', f1_email: 'ana@example.com', f1_telefono: '600111111',
    f2_nombre: 'Luis', f2_rol: 'Tutor legal', f2_relacion: 'Padre', f2_dni: '222', f2_direccion: 'Calle Menor 2', f2_email: 'luis@example.com', f2_telefono: '600222222',
    f2_firma: 'data:image/png;base64,TUTOR'
  };
  const html = PdfExport._buildContracto(c, LOGO);

  it('incluye foto, ficha completa, adoptante, tutor y firma de la entidad', () => {
    assert.match(html, /data:image\/jpeg;base64,FOTO/);
    assert.match(html, /CHIP-123/);
    assert.match(html, /Negra con una mancha blanca/);
    assert.match(html, /Calle Mayor 1/);
    assert.match(html, /Ana &amp; Luis/);
    assert.doesNotMatch(html, /Ana &amp;amp; Luis/);
    assert.match(html, /Tutor \/ persona de apoyo/);
    assert.match(html, /Anexo I\. Datos del tutor/);
    assert.match(html, /page-break/);
    assert.match(html, /Calle Menor 2/);
    assert.match(html, /data:image\/png;base64,TUTOR/);
    // Sello real de la asociación en lugar del sello generado con CSS.
    assert.match(html, /sello--img/);
    assert.match(html, /assets\/contratos\/sello-nebak\.jpg/);
    assert.doesNotMatch(html, /SELLO DE LA ENTIDAD/);
    assert.doesNotMatch(html, /<div class="label">Rol<\/div>/);
    assert.match(html, /2026\/11\/10/);
    assert.match(html, /2022\/01\/02/);
  });
});

describe('_buildTerminosAdopcion: anexo independiente', () => {
  const c = { adopcion_id: 'adp3', animal: 'Luna', f1_nombre: 'Ana', f1_dni: '123' };
  const html = PdfExport._buildTerminosAdopcion(c, LOGO);

  it('genera un documento propio con los terminos y sin rol', () => {
    assert.match(html, /<title>Hoja de estipulaciones<\/title>/);
    assert.match(html, /Términos y condiciones de adopción responsable/);
    assert.match(html, /Anexo del contrato/);
    assert.match(html, /Documento 2 de 2|Anexo del contrato/);
    assert.doesNotMatch(html, /<div class="label">Rol<\/div>/);
    assert.match(html, /\.contrato-doc-estipulacion/);
  });
});

describe('_buildContratoAcogida: documento real de la asociación', () => {
  const c = {
    id: 'acg1', ciudad: 'Irun', fecha: '2026-11-10', inicio: '2026-10-01', fase: 'en_casa',
    animal: {
      nombre: 'Luna', foto: 'data:image/jpeg;base64,FOTO', especie: 'Perro', raza: 'Mestiza',
      sexo: 'Hembra', edad: '2 años', microchip: 'CHIP-123', pasaporte: 'PAS-9',
      capa: 'Atigrada', marcas: 'Mancha blanca en el pecho',
      esterilizada: true, descripcion: 'Muy sociable'
    },
    familia: {
      nombre: 'Ana <b>X</b>', dni: '12345678A', nif: '12345678A', direccion: 'Calle Mayor 1',
      email: 'ana@x.es', telefono: '600123123', ubicacion: 'Irun', provincia: 'Gipuzkoa', codigo_postal: '20300'
    }
  };
  const html = PdfExport._buildContratoAcogida(c, LOGO);

  it('reproduce la maqueta: título, foto, partes y parrilla del animal', () => {
    assert.match(html, /Contrato de acogida temporal de un animal de compañía/);
    assert.match(html, /data:image\/jpeg;base64,FOTO/);
    assert.match(html, /Calle Mayor 1/);
    assert.match(html, /20300/);
    assert.match(html, /2026\/11\/10/);
    assert.match(html, /CHIP-123/);
    assert.match(html, /PAS-9/);
    assert.match(html, /Atigrada/);
    assert.match(html, /Mancha blanca en el pecho/);
  });

  it('lleva las ocho condiciones literales del documento', () => {
    assert.equal((html.match(/class="acogida-cond"/g) || []).length, 8);
    assert.match(html, /responsable de cualquier accidente/);
    assert.match(html, /nunca utilizaré este animal con ánimo de lucro/);
    assert.match(html, /con dos días de antelación/);
  });

  it('incluye el material con casillas, la renuncia y las firmas', () => {
    assert.match(html, /Jaula varikennel/);
    assert.match(html, /Cartilla de identificación y vacunación/);
    assert.match(html, /renuncio al derecho de denunciar/);
    assert.match(html, /Firma o sello Asociación Grupo Nebak/);
    assert.match(html, /Firma Casa de Acogida/);
    assert.ok((html.match(/☐/g) || []).length >= 8);
  });

  it('marca el material que ya está prestado', () => {
    const con = PdfExport._buildContratoAcogida({ ...c, material: ['Collar', 'Correa'] }, LOGO);
    assert.match(con, /☒ Collar/);
    assert.match(con, /☒ Correa/);
    assert.match(con, /☐ Bozal/);
  });

  it('detalla el material extra y marca «Otros» solo si hay texto', () => {
    const con = PdfExport._buildContratoAcogida({ ...c, material: ['Collar'], material_otros: 'Cama y arnés' }, LOGO);
    assert.match(con, /☒ Otros/);
    assert.match(con, /Otros \(detallar\): Cama y arnés/);
    const sin = PdfExport._buildContratoAcogida({ ...c, material: ['Collar'] }, LOGO);
    assert.match(sin, /☐ Otros/);
    assert.match(sin, /Otros \(detallar\): _+/);
  });

  it('firma al pie con los datos reales de la asociación', () => {
    assert.match(html, /C\/ Santiago 27/);
    assert.match(html, /625 14 05 88/);
    assert.match(html, /Modelo v1\.0/);
  });

  // La hoja real es de una sola cara: A4 con márgenes y sin saltos forzados,
  // y los bloques que se firman no se pueden partir entre páginas.
  // Un texto de ficha largo (la descripcion del animal puede traer cientos de
  // caracteres) no puede empujar la hoja a una segunda cara: el recuadro de
  // «otros rasgos» se queda en las tres lineas del formulario de papel.
  it('acota el texto libre para que los datos largos no rompan la cara única', () => {
    // Ocho campos de la parrilla del animal; «Esterilizado» lleva casillas propias.
    assert.equal((html.match(/class="acogida-val"/g) || []).length, 8);
    assert.match(html, /\.acogida-full \.acogida-val\{[^}]*-webkit-line-clamp:3/);
  });

  it('avisa cuando el recuadro de otros rasgos se recorta', () => {
    assert.match(html, /acogida-truncado/);
    assert.match(html, /texto completo en la ficha del animal/);
    assert.match(html, /beforeprint/);
  });

  it('se imprime en una cara A4 sin partir firmas ni material', () => {
    assert.match(html, /@page\{size:A4;margin:1\.8cm 2cm\}/);
    assert.doesNotMatch(html, /page-break-before:always/);
    ['acogida-animal', 'acogida-material', 'acogida-firmas', 'acogida-pie'].forEach(cl => {
      assert.match(html, new RegExp('\\.' + cl + '\\{[^}]*break-inside:avoid'), cl + ' debe evitar partirse entre páginas');
    });
  });

  it('escapa los datos personales', () => {
    assert.match(html, /Ana &lt;b&gt;X&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>X<\/b>/);
  });
});

describe('_buildContracto: cláusula de mayores de 65', () => {
  const base = { adopcion_id: 'adp65', ciudad: 'Irun', fecha: '2026-11-18', animal: 'Luna', f1_nombre: 'Ana', f1_dni: '1' };
  const con = PdfExport._buildContracto({
    ...base, adoptante_mayor_65: '1', responsable_nombre: 'Luis', responsable_dni: '2',
    responsable_telefono: '600000000', responsable_email: 'luis@x.es', responsable_direccion: 'Calle 1'
  }, LOGO);
  const sin = PdfExport._buildContracto(base, LOGO);

  it('solo sale cuando se marca o hay persona responsable', () => {
    assert.match(con, /adoptantes mayores de 65 años/);
    assert.doesNotMatch(sin, /adoptantes mayores de 65 años/);
    assert.doesNotMatch(sin, /Firma de la persona responsable/);
  });

  it('lleva el texto literal, los datos y las dos firmas', () => {
    assert.match(con, /48 horas/);
    assert.match(con, /recuperar al animal para asegurar su protección y reubicación/);
    assert.match(con, /Luis/);
    assert.match(con, /DNI\/NIE 2/);
    assert.match(con, /Firma de la persona responsable/);
    assert.match(con, /page-break/);
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
