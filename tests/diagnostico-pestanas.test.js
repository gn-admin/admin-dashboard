/**
 * Tests de `scripts/diagnostico-columnas.gs`: el informe de pestañas dice, para
 * cada hoja configurada y cada encuesta, la pestaña esperada según `Config.gs`
 * y la real del documento, y clasifica cómo la resuelve el backend.
 *
 * El `.gs` se ejecuta en un contexto `vm` con stubs de `SpreadsheetApp`: no se
 * abre ningún Sheet real ni hace falta Apps Script para correr el test.
 * Ejecutar: npm test
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const FUENTE = fs.readFileSync(path.join(RAIZ, 'scripts', 'diagnostico-columnas.gs'), 'utf8');
const COLUMNAS_WEB = ['id', 'titulo', 'ficha_json', 'documents_json', 'media_folder_id', 'origen_tipo'];
const COLUMNAS_ANIMALES = ['id', 'nombre', 'portada_url', 'portada_alt', 'galeria', 'videos', 'documentos_internos'];

/** Documentos simulados: pestañas y cabeceras de cada hoja. */
const DOCS = {
  p_animales: { tabs: ['Hoja 1'], headers: COLUMNAS_ANIMALES },
  p_web: { tabs: ['Hoja 1'], headers: COLUMNAS_WEB },
  p_familias: { tabs: ['Familias', 'Histórico'], headers: ['id'] },
  p_grupos: { tabs: ['Grupo A', 'Grupo B'], headers: ['id'] },
  p_encuesta: { tabs: ['Respuestas de formulario 1'], headers: ['Marca temporal'] }
};

const CONFIG = {
  sheets: {
    animales: { sheetId: 'p_animales', sheetName: 'Animales' },
    webPublicaciones: { sheetId: 'p_web', sheetName: 'Hoja 1' },
    familias: { sheetId: 'p_familias', sheetName: 'Familias' },
    grupos: { sheetId: 'p_grupos', sheetName: 'Grupos' },
    socios: { sheetId: 'p_rompe', sheetName: 'Socios' },
    notas: { sheetId: '', sheetName: 'Notas' }
  },
  surveys: {
    'pre-adopcion-perros': { sheetId: 'p_encuesta', sheetName: 'Respuestas de formulario 1' }
  }
};

function hoja(tab, headers) {
  return {
    getName: () => tab,
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers.slice()] })
  };
}

const SpreadsheetApp = {
  openById(id) {
    const doc = DOCS[id];
    if (!doc) throw new Error('no se pudo abrir el documento');
    return {
      getSheetByName: (nombre) => (doc.tabs.indexOf(nombre) !== -1 ? hoja(nombre, doc.headers) : null),
      getSheets: () => doc.tabs.map((tab) => hoja(tab, doc.headers))
    };
  }
};

/** Ejecuta el diagnóstico y devuelve { resultado, logs }. */
function ejecutar(funcion = 'diagnosticoColumnasWeb') {
  const logs = [];
  const ctx = vm.createContext({
    CONFIG,
    SpreadsheetApp,
    Logger: { log: (texto) => logs.push(texto) },
    Date,
    JSON,
    Math,
    String,
    Object,
    Array
  });
  vm.runInContext(FUENTE, ctx);
  return { resultado: vm.runInContext(funcion + '()', ctx), logs };
}

const porClave = (resultado) => Object.fromEntries(resultado.pestanas.map((p) => [p.clave, p]));

describe('diagnostico-columnas: pestaña real de cada hoja', () => {
  it('clasifica cada hoja y encuesta según cómo la resuelve getSheet()', () => {
    const { resultado } = ejecutar();
    const clave = porClave(resultado);

    assert.deepEqual(
      Object.keys(clave),
      ['animales', 'webPublicaciones', 'familias', 'grupos', 'socios', 'notas', 'encuesta:pre-adopcion-perros'],
      'debe informar de todas las hojas configuradas y de las encuestas'
    );

    assert.equal(clave.animales.resultado, 'unica_pestana');
    assert.equal(clave.animales.real, 'Hoja 1', 'Animales debe mostrar su pestaña real');
    assert.equal(clave.animales.esperada, 'Animales');

    assert.equal(clave.webPublicaciones.resultado, 'nombre');
    assert.equal(clave.familias.resultado, 'nombre');

    assert.equal(clave.grupos.resultado, 'ambigua');
    assert.equal(clave.grupos.real, 'Grupo A | Grupo B', 'con varias pestañas se listan todas');
    // Los arrays vienen del contexto `vm`: se copian al realm del test antes de comparar.
    assert.deepEqual(Array.from(clave.grupos.pestanas), ['Grupo A', 'Grupo B']);

    assert.equal(clave.socios.resultado, 'error');
    assert.equal(clave.notas.resultado, 'sin_configurar');
    assert.equal(clave['encuesta:pre-adopcion-perros'].resultado, 'nombre');
  });

  it('resume los desajustes sin contar como ajustada la pestaña única', () => {
    const { resultado } = ejecutar();
    assert.deepEqual({ ...resultado.resumen_pestanas }, {
      total: 7,
      con_nombre_exacto: 3,
      por_unica_pestana: 1,
      desajustadas: 4,
      no_resueltas: 3
    });
  });

  it('mantiene intacto el bloque de columnas que lee el gate', () => {
    const { resultado } = ejecutar();
    assert.equal(resultado.ok, true, 'ok es solo de columnas');
    assert.deepEqual(Array.from(resultado.sheets.WebPublicaciones.missing), []);
    assert.deepEqual(Array.from(resultado.sheets.Animales.missing), []);
    assert.equal(resultado.sheets.Animales.pestana, 'Hoja 1');
  });

  it('registra el JSON completo en el log', () => {
    const { logs } = ejecutar();
    assert.equal(logs.length, 1);
    const informe = JSON.parse(logs[0]);
    assert.ok(informe.sheets, 'debe incluir sheets');
    assert.ok(informe.pestanas && informe.resumen_pestanas, 'debe incluir el informe de pestañas');
  });

  it('diagnosticoPestanasWeb devuelve solo el informe de pestañas', () => {
    const { resultado } = ejecutar('diagnosticoPestanasWeb');
    assert.equal(resultado.diagnostico, 'pestanas-hojas');
    assert.equal(resultado.pestanas.length, 7);
    assert.equal(resultado.sheets, undefined, 'no debe arrastrar el bloque de columnas');
  });
});
