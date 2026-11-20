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
