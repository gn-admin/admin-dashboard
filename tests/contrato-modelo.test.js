/**
 * Pruebas locales del modelo compartido del contrato.
 *
 * El contrato impreso (`PdfExport._buildContracto`) y el PDF del servidor
 * (`contrato_modelo`) salen del mismo modelo de bloques; la prueba de
 * divergencia comprueba que el HTML no se queda contenido ni lo añade por su
 * cuenta.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Modelo = require('../src/js/contrato-modelo.js');

function fixture(extra = {}) {
  return Modelo.construir(Object.assign({
    c: {
      id: 'ctr_1', adopcion_id: 'ad_1', animal: 'Luna (Mestiza)',
      f1_nombre: 'Ana', f1_dni: '12345678Z', f1_email: 'ana@example.test',
      f1_direccion: 'Calle Mayor 1', f1_telefono: '600000000',
      fecha: '2026-01-15', ciudad: 'Irún',
      donacion_adoptante: '150', indemnizacion_importe: '900'
    },
    animal: {
      nombre: 'Luna (Mestiza)', nombre_definitivo: 'Luna', especie: 'Perra',
      raza: 'Mestiza', sexo: 'Hembra', microchip: '941000000000001',
      fecha_nacimiento: '2023-04-02', capa: 'Canela', color: 'Canela',
      tamano: 'Mediana', esterilizada: 'Sí', descripcion: 'Muy sociable.'
    },
    entidad: { nombre: 'Asociación Grupo Nebak', cif: 'G00000000', domicilio: 'Irún', telefono: '600111222' },
    entidadFirma: 'assets/contratos/firma-nebak.jpg',
    entidadLogo: 'assets/contratos/logo-nebak-horizontal.jpg',
    tutor: { nombre: 'Luis', dni: '87654321X', relacion: 'Padre', direccion: 'Calle 2', email: 'luis@example.test', telefono: '600222333', firma: '' },
    importes: { donacion: 150, indemnizacion: 900 },
    fecha: '15/01/2026',
    fechaNacimiento: '02/04/2023',
    ciudad: 'Irún',
    nombreArchivo: 'Contrato-Adopcion-Luna.pdf'
  }, extra));
}

const escapar = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

describe('ContratoModelo: contenido completo del contrato', () => {
  it('incluye las 20 estipulaciones canónicas', () => {
    const est = fixture().bloques.filter(b => b.tipo === 'estipulacion');
    assert.equal(est.length, 20);
    assert.deepEqual(est.map(e => e.n), Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('sustituye los importes de donación e indemnización', () => {
    const est = fixture().bloques.filter(b => b.tipo === 'estipulacion');
    const t17 = est.find(e => e.n === 17).parrafos.join(' ');
    const t18 = est.find(e => e.n === 18).parrafos.join(' ');
    assert.match(t17, /150/);
    assert.match(t18, /900/);
    assert.doesNotMatch(t17 + t18, /\{donacion\}|\{indemnizacion\}/);
  });

  it('incluye los datos del animal y el anexo del tutor', () => {
    const bloques = fixture().bloques;
    const tablas = bloques.filter(b => b.tipo === 'tabla');
    const texto = JSON.stringify(tablas);
    assert.match(texto, /Mestiza/);
    assert.match(texto, /941000000000001/);
    assert.ok(bloques.some(b => b.tipo === 'seccion' && /Anexo I\. Datos del tutor/.test(b.texto)));
    assert.match(texto, /Luis/);
    assert.match(texto, /Padre/);
    assert.ok(bloques.some(b => b.tipo === 'firmas' && (b.items || []).some(it => it.etiqueta === 'Tutor / persona de apoyo:')));
  });

  // D-C5: el anexo de condiciones se firma en la hoja de estipulaciones, no en
  // el contrato. Si alguien lo devuelve al modelo, el papel duplica cláusulas.
  it('no imprime el anexo de condiciones: vive solo en la hoja', () => {
    const texto = JSON.stringify(fixture().bloques);
    assert.doesNotMatch(texto, /Periodo de prueba y devolución/);
    assert.doesNotMatch(texto, /Protección de datos personales/);
    assert.doesNotMatch(texto, /Condiciones complementarias/);
  });

  // El .gs desplegado puede no conocer todavía los grupos de firma: el modelo
  // lleva además la forma antigua (`firma`/`firmaEntidad`) para que el PDF no
  // pueda salir sin firmas mientras no se suba Code.gs.
  it('acompaña cada firma con su copia en la forma antigua', () => {
    const bloques = fixture({ selloUrl: 'https://example.test/sello.jpg' }).bloques;
    const grupos = bloques.filter(b => b.tipo === 'firmas');
    const items = grupos.reduce((n, b) => n + (b.items || []).length, 0);
    const legados = bloques.filter(b => b.legado && (b.tipo === 'firma' || b.tipo === 'firmaEntidad'));
    assert.equal(legados.length, items, 'una copia antigua por firma');
    legados.forEach(b => assert.ok(b.tipo === 'firma' || b.tipo === 'firmaEntidad'));
    const planos = grupos.reduce((a, g) => a.concat(g.items || []), []);
    planos.forEach((it, i) => {
      assert.equal(legados[i].etiqueta, it.etiqueta);
      assert.equal(legados[i].nombre, it.nombre);
      assert.equal(legados[i].firma || '', it.firma || '');
    });
    // La asociación conserva su firma y su logo en la forma que entiende el servidor viejo.
    const legadoEntidad = legados.find(b => b.logo);
    assert.ok(legadoEntidad, 'falta la firma de la asociación en la forma antigua');
    assert.match(legadoEntidad.firma, /firma-nebak\.jpg/);
    // La foto también viaja suelta: el servidor viejo no mira `tabla.foto`.
    const conFoto = fixture({ animal: { nombre: 'Luna', foto: 'https://example.test/luna.jpg' } }).bloques;
    const fotoLegada = conFoto.find(b => b.legado && b.tipo === 'imagen');
    assert.ok(fotoLegada, 'falta la foto en la forma antigua');
    assert.equal(fotoLegada.src, 'https://example.test/luna.jpg');
  });

  it('la foto de la ficha viaja en un marco cuadrado', () => {
    const tabla = fixture().bloques.find(b => b.tipo === 'tabla' && b.foto);
    assert.ok(tabla, 'falta la foto en la ficha');
    assert.equal(tabla.foto.etiqueta, 'FOTOGRAFÍA:');
    assert.equal(tabla.foto.ancho, 100);
    assert.equal(tabla.foto.alto, 100);
  });

  it('no duplica textos legales: la fuente es ContratoTextos', () => {
    const T = require('../src/js/contrato-textos.js');
    const est = fixture().bloques.filter(b => b.tipo === 'estipulacion');
    assert.equal(est[0].parrafos[0], T.texto(T.estipulaciones[0], { donacion: 150, indemnizacion: 900 }).parrafos[0]);
  });
});

describe('PdfExport: datos y modelo compartidos', () => {
  const LOGO = 'data:image/png;base64,AAA';
  const contrato = {
    id: 'ctr_9', adopcion_id: 'ad_9', animal: 'Luna (Mestiza)', animal_foto: 'assets/fotos/luna.jpg',
    especie: 'Perra', raza: 'Mestiza', animal_sexo: 'Hembra', animal_microchip: '941000000000009',
    animal_fecha_nacimiento: '2023-04-02', animal_capa: 'Canela', animal_color: 'Canela',
    animal_tamano: 'Mediana', animal_esterilizada: true, animal_descripcion: 'Muy sociable.',
    fecha: '2026-01-15', ciudad: 'Irún',
    f1_nombre: 'Ana & Luis', f1_dni: '12345678Z', f1_direccion: 'Calle Mayor 1',
    f1_telefono: '600000000', f1_email: 'ana@example.test', f1_firma: 'data:image/png;base64,FIRMA',
    f2_nombre: 'Luis', f2_dni: '87654321X', f2_relacion: 'Padre', f2_email: 'luis@example.test',
    donacion_adoptante: '150', indemnizacion_importe: '900'
  };

  function entorno() {
    const PdfExport = require('../src/js/pdf-export.js');
    global.document = { baseURI: 'https://gn-admin.github.io/admin-dashboard/' };
    global.Dashboard = {
      _byId: () => ({}),
      _contratoAnimalDatos: () => ({}),
      _contratoEntidadDatos: () => ({ nombre: 'Asociación Grupo Nebak', cif: 'G00000000', domicilio: 'Irún', telefono: '600111222' }),
      _contratoTutor: (c) => (String(c.f2_nombre || '').trim() ? c : null),
      _contratoResponsable65: () => null,
      _contratoImportesPorDefecto: () => ({ donacion: 100, indemnizacion: 900 }),
      _contratoImporte: (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v)),
      _selloUrl: () => 'assets/contratos/sello-nebak.jpg'
    };
    PdfExport._logoCache = LOGO;
    return PdfExport;
  }

  function textosDelModelo(modelo) {
    const out = [];
    (modelo.bloques || []).forEach(b => {
      if (b.tipo === 'estipulacion') {
        out.push(b.n + 'ª.');
        (b.parrafos || []).forEach(t => out.push(t));
        (b.lista || []).forEach(t => out.push(t));
      } else if (b.tipo === 'clausula') {
        (b.parrafos || []).forEach(t => out.push(t));
      } else if (b.tipo === 'tabla') {
        (b.filas || []).forEach(f => { out.push(f[0]); if (f[1]) out.push(f[1]); });
        if (b.foto && b.foto.etiqueta) out.push(b.foto.etiqueta);
      } else if (b.tipo === 'firmas') {
        (b.items || []).forEach(it => {
          if (it.etiqueta) out.push(it.etiqueta);
          if (it.nombre) out.push(it.nombre);
        });
      } else if (b.texto) {
        out.push(b.texto);
      }
    });
    return out;
  }

  it('construye el modelo completo desde el contrato del panel', async () => {
    const PdfExport = entorno();
    const modelo = await PdfExport.modeloContrato(contrato);
    const est = modelo.bloques.filter(b => b.tipo === 'estipulacion');
    assert.equal(est.length, 20);
    assert.match(est.find(e => e.n === 17).parrafos.join(' '), /150/);
    assert.match(est.find(e => e.n === 18).parrafos.join(' '), /900/);
    const texto = JSON.stringify(modelo.bloques);
    assert.match(texto, /Mestiza/);
    assert.match(texto, /Luis/);
    assert.ok(modelo.bloques.some(b => b.tipo === 'seccion' && /Anexo I\. Datos del tutor/.test(b.texto)));
    assert.equal(modelo.nombre, 'Contrato-Adopcion-Luna-Mestiza-2026-01-15.pdf');
  });

  it('la ruta del panel y la de impresión construyen el mismo modelo', async () => {
    const PdfExport = entorno();
    const delPanel = await PdfExport.modeloContrato(contrato);
    assert.deepEqual(delPanel, PdfExport._modeloContrato(contrato, LOGO));
  });
});

describe('divergencia: el contrato impreso y el modelo del PDF', () => {
  const LOGO = 'data:image/png;base64,AAA';
  const contrato = {
    id: 'ctr_9', adopcion_id: 'ad_9', animal: 'Luna (Mestiza)', animal_foto: 'assets/fotos/luna.jpg',
    especie: 'Perra', raza: 'Mestiza', animal_sexo: 'Hembra', animal_microchip: '941000000000009',
    animal_fecha_nacimiento: '2023-04-02', animal_capa: 'Canela', animal_color: 'Canela',
    animal_tamano: 'Mediana', animal_esterilizada: true, animal_descripcion: 'Muy sociable.',
    fecha: '2026-01-15', ciudad: 'Irún',
    f1_nombre: 'Ana & Luis', f1_dni: '12345678Z', f1_direccion: 'Calle Mayor 1',
    f1_telefono: '600000000', f1_email: 'ana@example.test', f1_firma: 'data:image/png;base64,FIRMA',
    f2_nombre: 'Luis', f2_dni: '87654321X', f2_relacion: 'Padre', f2_email: 'luis@example.test',
    donacion_adoptante: '150', indemnizacion_importe: '900'
  };

  function entorno() {
    const PdfExport = require('../src/js/pdf-export.js');
    global.document = { baseURI: 'https://gn-admin.github.io/admin-dashboard/' };
    global.Dashboard = {
      _byId: () => ({}),
      _contratoAnimalDatos: () => ({}),
      _contratoEntidadDatos: () => ({ nombre: 'Asociación Grupo Nebak', cif: 'G00000000', domicilio: 'Irún', telefono: '600111222' }),
      _contratoTutor: (c) => (String(c.f2_nombre || '').trim() ? c : null),
      _contratoResponsable65: () => null,
      _contratoImportesPorDefecto: () => ({ donacion: 100, indemnizacion: 900 }),
      _contratoImporte: (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v)),
      _selloUrl: () => 'assets/contratos/sello-nebak.jpg'
    };
    PdfExport._logoCache = LOGO;
    return PdfExport;
  }

  const textosDelModelo = (modelo) => {
    const out = [];
    (modelo.bloques || []).forEach(b => {
      if (b.tipo === 'estipulacion') {
        out.push(b.n + 'ª.');
        (b.parrafos || []).forEach(t => out.push(t));
        (b.lista || []).forEach(t => out.push(t));
      } else if (b.tipo === 'clausula') {
        out.push(b.titulo);
        (b.parrafos || []).forEach(t => out.push(t));
      } else if (b.tipo === 'tabla') {
        (b.filas || []).forEach(f => { out.push(f[0]); if (f[1]) out.push(f[1]); });
        if (b.foto && b.foto.etiqueta) out.push(b.foto.etiqueta);
      } else if (b.tipo === 'firmas') {
        (b.items || []).forEach(it => {
          if (it.etiqueta) out.push(it.etiqueta);
          if (it.nombre) out.push(it.nombre);
        });
      } else if (b.texto) {
        out.push(b.texto);
      }
    });
    return out;
  };

  // El énfasis de los párrafos añade <b> dentro del texto: se compara contra
  // el texto visible, sin etiquetas ni estilos.
  const visible = (html) => String(html)
    .replace(/<style>[\s\S]*?<\/style>/i, '')
    .replace(/<[^>]+>/g, '');

  it('el HTML imprime todos los bloques del modelo', () => {
    const PdfExport = entorno();
    const modelo = PdfExport._modeloContrato(contrato, LOGO);
    const texto = visible(PdfExport._buildContracto(contrato, LOGO));
    const faltan = textosDelModelo(modelo).filter(t => !texto.includes(escapar(t)));
    assert.deepEqual(faltan, []);
  });

  it('mantiene el orden de las 20 estipulaciones', () => {
    const PdfExport = entorno();
    const modelo = PdfExport._modeloContrato(contrato, LOGO);
    const texto = visible(PdfExport._buildContracto(contrato, LOGO));
    let ultimo = -1;
    modelo.bloques.filter(b => b.tipo === 'estipulacion').forEach(b => {
      const i = texto.indexOf(escapar(b.parrafos[0]));
      assert.ok(i > ultimo, 'estipulación ' + b.n + ' fuera de orden');
      ultimo = i;
    });
  });

  it('pinta una vez cada estipulación, firma y sección del modelo', () => {
    const PdfExport = entorno();
    const modelo = PdfExport._modeloContrato(contrato, LOGO);
    const html = PdfExport._buildContracto(contrato, LOGO);
    const est = modelo.bloques.filter(b => b.tipo === 'estipulacion').length;
    assert.equal((html.match(/class="clausula"/g) || []).length, est);
    const firmas = modelo.bloques
      .filter(b => b.tipo === 'firmas')
      .reduce((n, b) => n + (b.items || []).length, 0);
    assert.equal((html.match(/class="signature[ "]/g) || []).length, firmas);
    modelo.bloques.filter(b => b.tipo === 'seccion').forEach(b => {
      assert.ok(html.includes('<h2>' + escapar(b.texto) + '</h2>'), 'falta la sección ' + b.texto);
    });
    assert.doesNotMatch(html, /\{donacion\}|\{indemnizacion\}/);
  });
});
