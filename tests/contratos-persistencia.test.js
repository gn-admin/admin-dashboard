/**
 * Persistencia de contratos en la hoja `contratos` (adopción y acogida).
 *
 * El PDF es solo una representación bajo demanda: la fuente de verdad son las
 * filas de la hoja. Este test carga el `Code.gs` real en un sandbox `vm` y
 * comprueba que el endpoint POST `contratos` escribe en la hoja de contratos,
 * tanto el contrato de adopción como la copia de acogida (`tipo: 'acogida'`).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const CODE_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const HOJA_CONTRATOS = { sheetId: 'SHEET_CONTRATOS', sheetName: 'Contratos' };

function cargarBackend() {
  const ctx = {
    CONFIG: {
      ROLES: { ADMIN: 'admin' },
      sheets: { contratos: HOJA_CONTRATOS }
    },
    readSheet: () => [],
    deleteSheetRow: () => false,
    DriveApp: { getFileById: () => ({ setTrashed: () => {} }) },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_GS, ctx, { filename: 'Code.gs' });
  // `jsonResponse` real usa ContentService; en Node devolvemos el objeto para
  // poder inspeccionarlo. `appendToSheet`/`deleteSheetRow` se sustituyen por
  // dobles para no depender de SpreadsheetApp.
  ctx.jsonResponse = (obj) => obj;
  return ctx;
}

function postContrato(ctx, body) {
  return ctx.handlePost(
    'contratos',
    { role: 'admin', email: 'admin@example.test' },
    { postData: { contents: JSON.stringify(body) } }
  );
}

describe('POST contratos: la fila va a la hoja Contratos', () => {
  it('el contrato de adopción se persiste en la hoja (no solo como PDF)', () => {
    const ctx = cargarBackend();
    let hoja = null;
    let fila = null;
    ctx.appendToSheet = (cfg, record) => { hoja = cfg; fila = record; return record; };
    const body = {
      id: 'ctr_adop_1',
      adopcion_id: 'adop1',
      animal: 'Luna',
      f1_nombre: 'Ana',
      estado: 'firmado',
      terminos_version: '2.1'
    };
    const res = postContrato(ctx, body);
    assert.equal(hoja, HOJA_CONTRATOS);
    assert.deepEqual(JSON.parse(JSON.stringify(fila)), body);
    assert.deepEqual(JSON.parse(JSON.stringify(res)), { data: body });
  });

  it('la copia de acogida se persiste con tipo y acogida_id en la misma hoja', () => {
    const ctx = cargarBackend();
    let hoja = null;
    let fila = null;
    ctx.appendToSheet = (cfg, record) => { hoja = cfg; fila = record; return record; };
    const datos = { animal: { nombre: 'Luna' }, familia: { nombre: 'Ana' } };
    const body = {
      id: 'ctr_acg_1',
      tipo: 'acogida',
      acogida_id: 'acg1',
      animal: 'Luna',
      datos_json: JSON.stringify(datos),
      estado: 'guardado'
    };
    const res = postContrato(ctx, body);
    assert.equal(hoja, HOJA_CONTRATOS);
    assert.deepEqual(JSON.parse(JSON.stringify(fila)), body);
    assert.deepEqual(JSON.parse(JSON.stringify(res)), { data: body });
  });
});

describe('deleteContratoCascade: fila y PDF firmado', () => {
  it('borra la fila y manda a la papelera el PDF privado', () => {
    const ctx = cargarBackend();
    const papelera = [];
    let borrado = null;
    ctx.readSheet = () => [{ id: 'ctr_1', pdf_file_id: 'FILE1' }];
    ctx.DriveApp = {
      getFileById: (id) => ({ setTrashed: (v) => papelera.push([id, v]) })
    };
    ctx.deleteSheetRow = (cfg, id) => { borrado = { cfg, id }; return true; };
    assert.equal(ctx.deleteContratoCascade('ctr_1'), true);
    assert.deepEqual(papelera, [['FILE1', true]]);
    assert.equal(borrado.cfg, HOJA_CONTRATOS);
    assert.equal(borrado.id, 'ctr_1');
  });

  it('si el contrato no tiene PDF firmado solo borra la fila', () => {
    const ctx = cargarBackend();
    let borrado = null;
    ctx.readSheet = () => [{ id: 'ctr_2' }];
    ctx.deleteSheetRow = (cfg, id) => { borrado = id; return true; };
    assert.equal(ctx.deleteContratoCascade('ctr_2'), true);
    assert.equal(borrado, 'ctr_2');
  });
});
