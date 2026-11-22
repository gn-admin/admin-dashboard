/**
 * Envio de contratos por email · reglas del backend (`apps-script/Code.gs`).
 *
 * Se carga el `Code.gs` real en un sandbox `vm` con `MailApp` simulado para
 * verificar el esquema de destinatarios acordado:
 *   To: adoptante · CC: tutor (si hay) + buzon fijo de contratos.
 * Tambien cubre que no se aceptan direcciones arbitrarias y el control de
 * origen (ALLOWED_ORIGINS / ALLOW_ORIGIN_EMPTY).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const CODE_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const ContratoModelo = require('../src/js/contrato-modelo.js');

// DocumentApp mínimo para comprobar que el renderizador recorre el modelo y
// escribe el texto real (no solo que devuelve un Blob).
function documentAppFalso() {
  const salida = [];
  const parrafo = (inicial) => {
    let texto = String(inicial || '');
    const p = {
      setHeading() { return this; }, setForegroundColor() { return this; },
      setFontSize() { return this; }, setAlignment() { return this; },
      setSpacingAfter() { return this; }, setBold() { return this; },
      setAttributes() { return this; }, setWidth() { return this; }, setGlyphType() { return this; },
      setText(x) { texto = String(x); return this; },
      setPaddingTop() { return this; }, setPaddingBottom() { return this; },
      appendParagraph: (t) => parrafo(t),
      appendImage() { return { setWidth() { return this; }, setHeight() { return this; } }; },
      editAsText() { return { appendText(x) { texto += String(x); }, setBold() {}, setFontSize() {}, setForegroundColor() {} }; },
      getText() { return texto; }
    };
    salida.push(p);
    return p;
  };
  const body = {
    setMarginTop() { return this; }, setMarginBottom() { return this; },
    setMarginLeft() { return this; }, setMarginRight() { return this; },
    setAttributes() { return this; },
    appendParagraph: parrafo,
    appendListItem(t) { return parrafo(t); },
    appendImage() { return { setWidth() { return this; }, setHeight() { return this; } }; },
    appendPageBreak() { salida.push({ page: true }); },
    appendHorizontalRule() { salida.push({ hr: true }); },
    appendTable() {
      const filas = [];
      salida.push({ tabla: filas });
      return { appendTableRow() { const celdas = []; filas.push(celdas); return { appendTableCell(t) { const c = parrafo(t); celdas.push(c); return c; } }; } };
    }
  };
  return {
    salida,
    DocumentApp: {
      create: () => ({ getBody: () => body, saveAndClose() {}, getId: () => 'doc_1' }),
      Attribute: { FONT_FAMILY: 'FONT_FAMILY', FONT_SIZE: 'FONT_SIZE', BOLD: 'BOLD', BORDER_WIDTH: 'BORDER_WIDTH' },
      ParagraphHeading: { HEADING1: 'HEADING1', HEADING2: 'HEADING2' },
      HorizontalAlignment: { JUSTIFY: 'JUSTIFY', CENTER: 'CENTER' },
      GlyphType: { BULLET: 'BULLET' }
    },
    DriveApp: { getFileById: () => ({ getAs: () => ({ setName() {}, getBytes: () => Buffer.from('pdf') }), setTrashed() {} }) }
  };
}

function crearEntorno(opciones = {}) {
  const enviados = [];
  const contrato = Object.assign({
    id: 'ctr_1',
    animal: 'Luna',
    f1_nombre: 'Ana',
    f1_email: 'ana@example.test',
    f2_nombre: 'Luis',
    f2_email: 'luis@example.test'
  }, opciones.contrato || {});
  const props = Object.assign({}, opciones.props || {});
  const ctx = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null)
      })
    },
    CONFIG: Object.assign({
      ROLES: { ADMIN: 'admin' },
      sheets: { contratos: { sheetId: 'SHEET_CONTRATOS', sheetName: 'Contratos' } },
      CONTACT_EMAIL: 'nebakadopciones@gmail.com',
      ALLOWED_ORIGINS: ['https://gn-admin.github.io', 'http://localhost:8080'],
      ALLOW_ORIGIN_EMPTY: true
    }, opciones.config || {}),
    readSheet: () => [contrato],
    MailApp: {
      sendEmail(opciones) {
        if (opciones.from === 'alias@example.test' && ctx._rechazarAlias) {
          throw new Error('alias no verificado');
        }
        enviados.push(opciones);
      }
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_GS, ctx, { filename: 'Code.gs' });
  // `readSheet` vive en Code.gs: se sustituye despues de cargarlo para no
  // depender de SpreadsheetApp reales.
  ctx.readSheet = () => [contrato];
  return { ctx, enviados, contrato };
}

describe('generarPdfModelo: renderiza el contenido del modelo', () => {
  it('escribe las 20 estipulaciones, los importes y el anexo del tutor', () => {
    const { ctx } = crearEntorno();
    const fake = documentAppFalso();
    Object.assign(ctx, {
      DocumentApp: fake.DocumentApp,
      DriveApp: fake.DriveApp,
      Utilities: { newBlob: () => ({}), base64Decode: () => [] },
      UrlFetchApp: { fetch: () => { throw new Error('sin red'); } }
    });
    const modelo = ContratoModelo.construir({
      c: { id: 'ctr_1', f1_nombre: 'Ana', f1_dni: '12345678Z', fecha: '2026-01-15', ciudad: 'Irún' },
      animal: { nombre: 'Luna', raza: 'Mestiza', microchip: '941000000000001' },
      entidad: { nombre: 'Asociación Grupo Nebak' },
      tutor: { nombre: 'Luis', dni: '87654321X', relacion: 'Padre' },
      importes: { donacion: 150, indemnizacion: 900 },
      fecha: '15/01/2026'
    });
    assert.ok(ctx.generarPdfModelo(modelo));
    const texto = fake.salida.map(x => x.getText ? x.getText() : JSON.stringify(x)).join(' ');
    assert.equal((texto.match(/\d+ª\./g) || []).length, 20);
    assert.match(texto, /150/);
    assert.match(texto, /900/);
    assert.match(texto, /Anexo I\. Datos del tutor/);
    assert.match(texto, /Luis/);
    // El anexo de condiciones va en la hoja de estipulaciones, no en el contrato.
    assert.doesNotMatch(texto, /Periodo de prueba y devolución/);
  });

  // El modelo lleva cada firma dos veces: el grupo (`firmas`) y su copia en la
  // forma antigua (`legado`), para el .gs que aún no se ha subido. Este
  // renderizador ya pinta el grupo, así que la copia no puede repetirse.
  it('no duplica las firmas aunque el modelo traiga también la forma antigua', () => {
    const { ctx } = crearEntorno();
    const fake = documentAppFalso();
    Object.assign(ctx, {
      DocumentApp: fake.DocumentApp,
      DriveApp: fake.DriveApp,
      Utilities: { newBlob: () => ({}), base64Decode: () => [] },
      UrlFetchApp: { fetch: () => { throw new Error('sin red'); } }
    });
    const modelo = ContratoModelo.construir({
      c: { id: 'ctr_1', f1_nombre: 'Ana', f1_dni: '12345678Z', fecha: '2026-01-15', ciudad: 'Irún' },
      animal: { nombre: 'Luna' },
      entidad: { nombre: 'Asociación Grupo Nebak' },
      tutor: { nombre: 'Luis', dni: '87654321X' },
      fecha: '15/01/2026'
    });
    assert.ok(modelo.bloques.some(b => b.legado), 'faltan las copias para el servidor antiguo');
    assert.ok(ctx.generarPdfModelo(modelo));
    const texto = fake.salida.map(x => (x.getText ? x.getText() : '')).join(' ');
    // Datos y cierre: dos veces la adoptante, una el tutor (el fixture no tiene 65).
    assert.equal((texto.match(/Firma adoptante/g) || []).length, 2);
    assert.equal((texto.match(/Tutor \/ persona de apoyo/g) || []).length, 1);
  });
});

// Caso de produccion `ctr_mwovlotk` (el contrato firmado de Luna, con los datos
// personales sustituidos por otros de prueba). El modelo lo construye el panel
// con este mismo `ContratoModelo`, asi que el adjunto tiene que ser el MISMO
// documento: todos sus textos, una sola vez y con la entidad completa.
describe('adjunto del correo: el contrato de ctr_mwovlotk llega entero', () => {
  const FIRMA = 'data:image/png;base64,AAAA';
  const ENTIDAD = {
    nombre: 'Asociación Pro-Bienestar Animal, Grupo Nebak',
    cif: 'G75203562',
    domicilio: 'calle Santiago, n.º 27, 1º izquierda, Irun, código postal 20300',
    telefono: '625140588 y 600042594'
  };

  // Fila de la hoja `contratos` como la deja el panel al firmar.
  const fila = {
    id: 'ctr_mwovlotk',
    animal: 'Luna',
    animal_id: 'ani_luna',
    fecha: '2026-11-19T23:00:00.000Z',
    ciudad: 'Barakaldo',
    f1_nombre: 'Nombre Apellido',
    f1_dni: '00000000T',
    f1_direccion: 'Calle de Prueba 1',
    f1_email: 'adoptante@example.test',
    f1_telefono: '600000000',
    f1_firma: FIRMA,
    f2_nombre: '',
    f2_email: '',
    donacion_adoptante: '100',
    indemnizacion_importe: '900',
    adoptante_mayor_65: '1',
    responsable_nombre: 'Persona Responsable',
    responsable_dni: '11111111H',
    responsable_telefono: '611111111',
    responsable_email: 'responsable@example.test',
    responsable_direccion: 'Calle de Prueba 2',
    entidad_nombre: 'Asociación Grupo Nebak',
    entidad_cif: '',
    entidad_domicilio: '',
    entidad_telefono: ''
  };

  const modeloLuna = () => ContratoModelo.construir({
    c: fila,
    animal: {
      nombre: 'Luna', nombre_definitivo: 'Luna', especie: 'Gato', raza: 'Europeo',
      sexo: 'Hembra', microchip: '941000000000000', capa: 'Atigrada', color: 'Gris',
      tamano: 'Pequeña', esterilizada: 'Sí', descripcion: 'Muy sociable.', foto: FIRMA
    },
    entidad: ENTIDAD,
    tutor: null,
    responsable65: {
      nombre: 'Persona Responsable', dni: '11111111H', telefono: '611111111',
      email: 'responsable@example.test', direccion: 'Calle de Prueba 2'
    },
    importes: { donacion: 100, indemnizacion: 900 },
    fecha: '19/11/2026',
    ciudad: 'Barakaldo',
    selloUrl: 'assets/contratos/sello-nebak.jpg',
    nombreArchivo: 'Contrato-Adopcion-Luna.pdf'
  });

  const textosDelModelo = (modelo) => {
    const out = [];
    (modelo.bloques || []).forEach((b) => {
      if (b.tipo === 'estipulacion') {
        out.push(b.n + 'ª.');
        (b.parrafos || []).forEach(t => out.push(t));
        (b.lista || []).forEach(t => out.push(t));
      } else if (b.tipo === 'tabla') {
        (b.filas || []).forEach(f => { out.push(f[0]); if (f[1]) out.push(f[1]); });
        if (b.foto && b.foto.etiqueta) out.push(b.foto.etiqueta);
      } else if (b.tipo === 'firmas') {
        (b.items || []).forEach((it) => {
          if (it.etiqueta) out.push(it.etiqueta);
          if (it.nombre) out.push(it.nombre);
        });
      } else if (b.texto) {
        out.push(b.texto);
      }
    });
    return out;
  };

  it('el PDF adjunto lleva todos los textos del modelo, sin duplicar', () => {
    const { ctx, enviados } = crearEntorno({ contrato: fila });
    const fake = documentAppFalso();
    Object.assign(ctx, {
      DocumentApp: fake.DocumentApp,
      DriveApp: fake.DriveApp,
      Utilities: { newBlob: () => ({}), base64Decode: () => [] },
      UrlFetchApp: { fetch: () => { throw new Error('sin red'); } }
    });
    const modelo = modeloLuna();
    const r = ctx.sendContratoEmail(
      { contrato_id: 'ctr_mwovlotk', to: ['adoptante@example.test'], contrato_modelo: modelo },
      null
    );

    // Nada sale a la red: MailApp esta simulado y el adjunto se genera en seco.
    assert.equal(enviados.length, 1);
    assert.equal(r.status, 'success');
    assert.equal(r.data.pdf_adjunto, true);
    assert.equal(enviados[0].attachments.length, 1);

    const texto = fake.salida.map(x => (x.getText ? x.getText() : '')).join('\n');
    const faltan = textosDelModelo(modelo).filter(t => !texto.includes(t));
    assert.deepEqual(faltan, [], 'el adjunto no es el mismo documento');

    // Entidad tal y como la firma el documento, una sola vez.
    assert.equal((texto.match(/de la otra parte/g) || []).length, 1);
    assert.match(texto, /con CIF G75203562/);
    assert.match(texto, /con domicilio en calle Santiago/);
    assert.doesNotMatch(texto, /Sin foto/);
    assert.match(texto, /y con teléfonos de contacto 625140588 y 600042594/);

    // Firmas: las del modelo, sin las copias `legado` (adoptante x3: datos,
    // cierre y cláusula 65). El único hueco es la persona responsable.
    assert.equal((texto.match(/Firma adoptante/g) || []).length, 3);
    assert.equal((texto.match(/Firma Asociación/g) || []).length, 1);
    assert.equal((texto.match(/Firma de la persona responsable/g) || []).length, 1);
    assert.equal((texto.match(/\[Sin firma\]/g) || []).length, 1);
    assert.equal((texto.match(/Fotografía/g) || []).length, 1);
    assert.equal((texto.match(/\d+ª\./g) || []).length, 20);
  });
});

// El contrato de acogida NO se puede enviar por correo: el panel solo ofrece
// «Descargar PDF» (se imprime desde el HTML de `PdfExport._contratoAcogidaBody`)
// y `sendContratoEmail` solo conoce el contrato de adopcion. El backend lo
// rechaza con un aviso claro en vez de mandar la plantilla de adopcion; el dia
// que se conecte la acogida al correo saltara esta prueba.
describe('contrato de acogida: el correo lo rechaza con un aviso claro', () => {
  const fila = {
    id: 'ctr_acogida_1',
    tipo: 'acogida',
    acogida_id: 'aco_1',
    animal: 'Luna',
    familia_id: 'fam_1',
    fecha: '2026-11-20',
    ciudad: 'Barakaldo',
    f1_nombre: 'Casa de Acogida',
    f1_dni: '00000000T',
    f1_email: 'acogida@example.test',
    f1_telefono: '600000000',
    f1_direccion: 'Calle de Prueba 3'
  };

  it('responde error y no envía nada, en vez de usar la plantilla de adopción', () => {
    const { ctx, enviados } = crearEntorno({ contrato: fila });
    // El panel no puede construir `contrato_modelo` para una acogida: el PDF de
    // acogida se imprime en el navegador, no lo genera el servidor.
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_acogida_1', to: ['acogida@example.test'] }, null);

    assert.equal(r.status, 'error');
    assert.match(r.error, /acogida/i);
    assert.match(r.error, /Descarga su PDF/);
    // Nada sale: ni correo, ni plantilla de adopción, ni adjunto a medias.
    assert.equal(enviados.length, 0, 'el arnés no envía nada real: solo simula MailApp');
  });

  it('también lo rechaza si la fila solo trae acogida_id', () => {
    const { ctx, enviados } = crearEntorno({ contrato: Object.assign({}, fila, { tipo: '' }) });
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_acogida_1' }, null);
    assert.equal(r.status, 'error');
    assert.match(r.error, /acogida/i);
    assert.equal(enviados.length, 0);
  });
});

describe('sendContratoEmail: To adoptante y CC tutor + buzon de contratos', () => {
  it('pone al adoptante en To y al tutor y al buzon fijo en CC', () => {
    const { ctx, enviados } = crearEntorno();
    const r = ctx.sendContratoEmail(
      { contrato_id: 'ctr_1', to: ['ana@example.test', 'luis@example.test', 'nebakadopciones@gmail.com'] },
      { email: 'admin@example.test' }
    );
    assert.equal(r.status, 'success');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, 'ana@example.test');
    assert.equal(enviados[0].cc, 'luis@example.test,nebakadopciones@gmail.com');
    const d = JSON.parse(JSON.stringify(r.data));
    assert.deepEqual({ to: d.to, cc: d.cc }, {
      to: ['ana@example.test'],
      cc: ['luis@example.test', 'nebakadopciones@gmail.com']
    });
    assert.equal(d.modo_pruebas, false);
  });

  it('si el cliente no indica destinatarios, envia al adoptante y copia al buzon', () => {
    const { ctx, enviados } = crearEntorno();
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_1' }, null);
    assert.equal(r.status, 'success');
    assert.equal(enviados[0].to, 'ana@example.test');
    assert.equal(enviados[0].cc, 'nebakadopciones@gmail.com');
  });

  it('el buzon fijo va siempre en copia aunque no se marque en el modal', () => {
    const { ctx, enviados } = crearEntorno();
    ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['ana@example.test'] }, null);
    assert.equal(enviados[0].to, 'ana@example.test');
    assert.match(enviados[0].cc, /nebakadopciones@gmail\.com/);
  });

  it('descarta direcciones ajenas al contrato (no se puede usar como spam)', () => {
    const { ctx, enviados } = crearEntorno();
    const r = ctx.sendContratoEmail(
      { contrato_id: 'ctr_1', to: ['ana@example.test', 'intruso@example.test'] },
      null
    );
    assert.equal(r.status, 'success');
    assert.equal(enviados[0].to, 'ana@example.test');
    assert.ok(!String(enviados[0].cc || '').includes('intruso@example.test'));
  });

  it('rechaza emails con saltos de linea o comas (inyeccion de cabeceras)', () => {
    const { ctx, enviados } = crearEntorno();
    ctx.sendContratoEmail(
      { contrato_id: 'ctr_1', to: ['ana@example.test\r\nBcc: intruso@example.test', 'ana@example.test,intruso@example.test'] },
      null
    );
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, 'ana@example.test');
    assert.ok(!String(enviados[0].cc || '').includes('intruso@example.test'));
  });

  it('sin destinatarios validos responde warning y no envia', () => {
    const { ctx, enviados } = crearEntorno({
      contrato: { f1_email: '', f2_email: '' },
      config: { CONTACT_EMAIL: '', CONTRATOS_CC_EMAIL: '' }
    });
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['intruso@example.test'] }, null);
    assert.equal(r.status, 'warning');
    assert.equal(enviados.length, 0);
  });

  it('CONTRATOS_CC_EMAIL tiene prioridad sobre CONTACT_EMAIL en la copia', () => {
    const { ctx, enviados } = crearEntorno({ config: { CONTRATOS_CC_EMAIL: 'contratos@example.test' } });
    ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['ana@example.test'] }, null);
    assert.equal(enviados[0].cc, 'contratos@example.test');
    assert.equal(enviados[0].replyTo, 'nebakadopciones@gmail.com');
  });

  it('adjunta el PDF del contrato cuando el generador está disponible', () => {
    const { ctx, enviados } = crearEntorno();
    ctx.generarPdfModelo = () => ({ getBytes: () => ({ length: 1234 }), name: 'Contrato.pdf' });
    const modelo = { bloques: [{ tipo: 'parrafo', texto: 'Contrato' }] };
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['ana@example.test'], contrato_modelo: modelo }, null);
    assert.equal(r.status, 'success');
    assert.equal(Array.isArray(enviados[0].attachments), true);
    assert.equal(enviados[0].attachments.length, 1);
    assert.match(enviados[0].htmlBody, /PDF adjunto/);
    assert.match(enviados[0].htmlBody, /Adjuntamos en PDF/);
    assert.doesNotMatch(enviados[0].htmlBody, /Términos y condiciones de adopción responsable/);
    assert.equal(r.data.pdf_adjunto, true);
    assert.equal(r.data.pdf_bytes, 1234);
  });

  it('si el PDF falla, envía el HTML sin adjunto y lo indica', () => {
    const { ctx, enviados } = crearEntorno();
    ctx.generarPdfModelo = () => { throw new Error('DocumentApp sin permiso'); };
    const modelo = { bloques: [{ tipo: 'parrafo', texto: 'Contrato' }] };
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['ana@example.test'], contrato_modelo: modelo }, null);
    assert.equal(r.status, 'success');
    assert.equal(enviados[0].attachments, undefined);
    assert.equal(r.data.pdf_adjunto, false);
    assert.match(r.data.pdf_error, /DocumentApp sin permiso/);
    assert.match(enviados[0].htmlBody, /Términos y condiciones de adopción responsable/);
  });

  it('usa CONTRATO_FROM_EMAIL como remitente y reintenta sin alias si falla', () => {
    const { ctx, enviados } = crearEntorno({ config: { CONTRATO_FROM_EMAIL: 'alias@example.test' } });
    ctx._rechazarAlias = true;
    const r = ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['ana@example.test'] }, null);
    assert.equal(r.status, 'success');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].from, undefined);
  });

  it('con alias valido envia con ese From', () => {
    const { ctx, enviados } = crearEntorno({ config: { CONTRATO_FROM_EMAIL: 'alias@example.test' } });
    ctx.sendContratoEmail({ contrato_id: 'ctr_1', to: ['ana@example.test'] }, null);
    assert.equal(enviados[0].from, 'alias@example.test');
  });
});

describe('isOriginAllowed: coincidencia exacta y origen vacio', () => {
  it('acepta el origen declarado y rechaza cualquier otro', () => {
    const { ctx } = crearEntorno();
    assert.equal(ctx.isOriginAllowed('https://gn-admin.github.io'), true);
    assert.equal(ctx.isOriginAllowed('https://gn-admin.github.io.evil.test'), false);
    assert.equal(ctx.isOriginAllowed('http://gn-admin.github.io'), false);
  });

  it('permite localhost con cualquier puerto para desarrollo', () => {
    const { ctx } = crearEntorno();
    assert.equal(ctx.isOriginAllowed('http://localhost:4321'), true);
    assert.equal(ctx.isOriginAllowed('http://127.0.0.1:9000'), true);
  });

  it('con ALLOW_ORIGIN_EMPTY=true acepta peticiones sin origen', () => {
    const { ctx } = crearEntorno();
    assert.equal(ctx.isOriginAllowed(''), true);
    assert.equal(ctx.isOriginAllowed('null'), true);
  });

  it('con ALLOW_ORIGIN_EMPTY=false rechaza peticiones sin origen', () => {
    const { ctx } = crearEntorno({ config: { ALLOW_ORIGIN_EMPTY: false } });
    assert.equal(ctx.isOriginAllowed(''), false);
    assert.equal(ctx.isOriginAllowed('null'), false);
    assert.equal(ctx.isOriginAllowed('https://gn-admin.github.io'), true);
  });
});

// El PDF firmado lleva DNI y firmas: se guarda en Drive SIN enlace publico
// (a diferencia de `uploadDocumento`) y solo acepta PDF dentro de tamano.
describe('uploadContratoPdf: PDF firmado privado en Drive', () => {
  function entornoDrive(opciones = {}) {
    const archivos = [];
    const compartidos = [];
    const carpetas = {};
    const carpeta = (clave) => ({
      getId: () => clave,
      getName: () => clave.split('/').pop(),
      getFoldersByName(nombre) {
        const items = carpetas[clave + '/' + nombre] || [];
        let i = 0;
        return { hasNext: () => i < items.length, next: () => items[i++] };
      },
      createFolder(nombre) {
        const nueva = carpeta(clave + '/' + nombre);
        (carpetas[clave + '/' + nombre] = carpetas[clave + '/' + nombre] || []).push(nueva);
        return nueva;
      },
      createFile(blob) {
        const f = {
          id: 'FILE_' + (archivos.length + 1),
          nombre: blob.getName(),
          blob,
          getId() { return this.id; },
          getUrl() { return 'https://drive.example/' + this.id; },
          setSharing() { compartidos.push(this.id); }
        };
        archivos.push(f);
        return f;
      }
    });
    const ctx = {
      CONFIG: Object.assign({
        ROLES: { ADMIN: 'admin' },
        sheets: {},
        DRIVE_DOCS_FOLDER_ID: 'DOCS',
        ALLOWED_ORIGINS: ['https://gn-admin.github.io'],
        ALLOW_ORIGIN_EMPTY: true
      }, opciones.config || {}),
      DriveApp: { getFolderById: (id) => carpeta(id) },
      Utilities: {
        base64Decode: (b64) => ({ bytes: String(b64).length }),
        newBlob: (bytes, mime, nombre) => ({ bytes, mime, getName: () => nombre }),
        getUuid: () => 'uuid-de-prueba'
      },
      Logger: { log: () => {} },
      readSheet: () => []
    };
    vm.createContext(ctx);
    vm.runInContext(CODE_GS, ctx, { filename: 'Code.gs' });
    return { ctx, archivos, compartidos };
  }

  const PDF = 'JVBERi0xLjQKJcOkw7zDtsOfCg=='; // cabecera %PDF

  it('guarda el PDF en la subcarpeta Contratos sin compartirlo', () => {
    const { ctx, archivos, compartidos } = entornoDrive();
    const r = ctx.uploadContratoPdf({ archivo_base64: PDF, nombre: 'contrato-luna.pdf', mime_type: 'application/pdf' }, null);
    assert.equal(archivos.length, 1);
    assert.equal(r.fileId, 'FILE_1');
    // El nombre en Drive es un uuid con la extension del original (no se
    // conserva el nombre del cliente para no arrastrar datos personales).
    assert.equal(r.nombre, 'uuid-de-prueba.pdf');
    assert.equal(r.webViewLink, 'https://drive.example/FILE_1');
    assert.equal(archivos[0].blob.mime, 'application/pdf');
    assert.deepEqual(compartidos, []);
  });

  it('acepta el data URL completo y normaliza el nombre', () => {
    const { ctx, archivos } = entornoDrive();
    ctx.uploadContratoPdf({ archivo_base64: 'data:application/pdf;base64,' + PDF, nombre: 'escaneado' }, null);
    assert.equal(archivos.length, 1);
    assert.match(archivos[0].nombre, /\.pdf$/);
  });

  it('rechaza lo que no es PDF y no toca Drive', () => {
    const { ctx, archivos } = entornoDrive();
    const r = ctx.uploadContratoPdf({ archivo_base64: PDF, nombre: 'foto.jpg', mime_type: 'image/jpeg' }, null);
    assert.match(r.error, /PDF/);
    assert.equal(archivos.length, 0);
  });

  it('rechaza un PDF por encima del limite', () => {
    const { ctx, archivos } = entornoDrive({ config: { MAX_CONTRATO_PDF_BYTES: 16 } });
    const r = ctx.uploadContratoPdf({ archivo_base64: PDF, nombre: 'grande.pdf' }, null);
    assert.match(r.error, /demasiado grande/);
    assert.equal(archivos.length, 0);
  });

  it('falla claro si falta la carpeta de documentos en Config.gs', () => {
    const { ctx, archivos } = entornoDrive({ config: { DRIVE_DOCS_FOLDER_ID: '' } });
    const r = ctx.uploadContratoPdf({ archivo_base64: PDF, nombre: 'x.pdf' }, null);
    assert.match(r.error, /DRIVE_DOCS_FOLDER_ID/);
    assert.equal(archivos.length, 0);
  });
});

describe('modo pruebas de correo: todo sale a un buzón fijo', () => {
  const props = { EMAIL_MODO_PRUEBAS: '1', EMAIL_PRUEBAS_TO: 'pruebas@example.test' };

  it('redirige To, quita CC/BCC y deja el destinatario real escrito en el cuerpo', () => {
    const { ctx, enviados } = crearEntorno({ props });
    const r = ctx.sendContratoEmail(
      { contrato_id: 'ctr_1', to: ['ana@example.test', 'luis@example.test', 'nebakadopciones@gmail.com'] },
      { email: 'admin@example.test' }
    );
    assert.equal(r.status, 'success');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, 'pruebas@example.test');
    assert.equal(enviados[0].cc, undefined);
    assert.equal(enviados[0].bcc, undefined);
    assert.match(enviados[0].subject, /^\[PRUEBA\] Contrato de adopcion/);
    assert.match(enviados[0].htmlBody, /MODO PRUEBAS/);
    assert.match(enviados[0].htmlBody, /ana@example\.test/);
    assert.equal(r.data.modo_pruebas, true);
    assert.deepEqual(Array.from(r.data.enviado_a), ['pruebas@example.test']);
    assert.ok(r.data.destinatarios_reales.includes('ana@example.test'));
  });

  it('con la propiedad apagada o distinta de 1 se envía a los destinatarios reales', () => {
    for (const p of [{}, { EMAIL_MODO_PRUEBAS: '0', EMAIL_PRUEBAS_TO: 'pruebas@example.test' }]) {
      const { ctx, enviados } = crearEntorno({ props: p });
      const r = ctx.sendContratoEmail({ contrato_id: 'ctr_1' }, null);
      assert.equal(enviados[0].to, 'ana@example.test');
      assert.equal(r.data.modo_pruebas, false);
    }
  });

  it('modo activo sin EMAIL_PRUEBAS_TO falla en cerrado y no envía nada', () => {
    const { ctx, enviados } = crearEntorno({ props: { EMAIL_MODO_PRUEBAS: '1' } });
    assert.throws(() => ctx.sendContratoEmail({ contrato_id: 'ctr_1' }, null), /EMAIL_PRUEBAS_TO/);
    assert.equal(enviados.length, 0);
  });

  it('una dirección de pruebas con espacios o inválida no se usa', () => {
    const { ctx, enviados } = crearEntorno({ props: { EMAIL_MODO_PRUEBAS: '1', EMAIL_PRUEBAS_TO: '   ' } });
    assert.throws(() => ctx.sendContratoEmail({ contrato_id: 'ctr_1' }, null), /EMAIL_PRUEBAS_TO/);
    assert.equal(enviados.length, 0);
  });
});
