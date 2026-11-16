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
  const ctx = {
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
    assert.deepEqual(JSON.parse(JSON.stringify(r.data)), {
      to: ['ana@example.test'],
      cc: ['luis@example.test', 'nebakadopciones@gmail.com']
    });
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
