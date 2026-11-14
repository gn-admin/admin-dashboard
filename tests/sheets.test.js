/**
 * Cabeceras en hojas vacías: la primera escritura debe crearlas.
 *
 * Se carga el Code.gs real (appendToSheet/readSheet) sobre un SpreadsheetApp
 * simulado, para cubrir el caso de una pestaña recién creada, sin cabeceras.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const CODE_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const WEB_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'WebPublicaciones.gs'), 'utf8');

function crearHoja(nombre) {
  const hoja = {
    nombre,
    filas: [],
    getName: () => nombre,
    getLastRow: () => hoja.filas.length,
    getDataRange: () => ({ getValues: () => hoja.filas.map((f) => f.slice()) }),
    appendRow: (fila) => { hoja.filas.push(fila.slice()); },
    deleteRow: (n) => { hoja.filas.splice(n - 1, 1); },
    getRange(filaIni, colIni, numFilas, numCols) {
      return {
        setValues(vals) {
          for (let i = 0; i < numFilas; i += 1) {
            const r = filaIni - 1 + i;
            while (hoja.filas.length <= r) hoja.filas.push([]);
            for (let j = 0; j < numCols; j += 1) hoja.filas[r][colIni - 1 + j] = vals[i][j];
          }
        }
      };
    }
  };
  return hoja;
}

function crearDoc(hoja) {
  return {
    getSheetByName: (n) => (n === hoja.nombre ? hoja : null),
    getSheets: () => [hoja]
  };
}

function crearEntorno() {
  const hojaWeb = crearHoja('Hoja 1');
  const hojaAnimales = crearHoja('Animales');
  hojaAnimales.filas.push(['id', 'nombre', 'especie', 'raza', 'sexo', 'edad', 'estado', 'descripcion', 'foto_drive_id', 'vacunas', 'esterilizada', 'microchip']);
  hojaAnimales.filas.push(['ani_1', 'Luna', 'perro', 'mestiza', 'hembra', '2 años', 'en_adopcion', '', '', '', 'no', '']);
  hojaAnimales.filas.push(['ani_2', 'Nube', 'gato', 'común', 'macho', '1 año', 'en_adopcion', '', '', '', 'sí', '']);
  const hojaAuditoria = crearHoja('Auditoria');

  const docs = {
    SHEET_WEB: crearDoc(hojaWeb),
    SHEET_ANIMALES: crearDoc(hojaAnimales),
    SHEET_AUDITORIA: crearDoc(hojaAuditoria),
  };

  let nUuid = 0;
  const ctx = {
    CONFIG: {
      PUBLIC_WEB_BASE_URL: 'https://gn-admin.github.io/admin-dashboard',
      ADMIN_EMAILS: [],
      sheets: {
        webPublicaciones: { sheetId: 'SHEET_WEB', sheetName: 'Hoja 1' },
        animales: { sheetId: 'SHEET_ANIMALES', sheetName: 'Animales' },
        auditoria: { sheetId: 'SHEET_AUDITORIA', sheetName: 'Auditoria' },
      },
    },
    SpreadsheetApp: { openById: (id) => docs[id] || null },
    Logger: { log: () => {} },
    Utilities: { getUuid: () => 'uuid-' + (nUuid += 1) },
    Session: { getActiveUser: () => ({ getEmail: () => 'test@example.com' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_GS, ctx);
  vm.runInContext(WEB_GS, ctx);

  return { ctx, hojaWeb, hojaAnimales };
}

describe('cabeceras en hoja vacía', () => {
  it('appendToSheet escribe la cabecera y la fila en una hoja sin columnas', () => {
    const { ctx, hojaWeb } = crearEntorno();
    assert.equal(hojaWeb.filas.length, 0);

    ctx.appendToSheet(ctx.CONFIG.sheets.webPublicaciones, { id: 'web_1', tipo: 'animal', titulo: 'Luna' });

    assert.deepEqual([...hojaWeb.filas[0]], ['id', 'tipo', 'titulo']);
    assert.deepEqual([...hojaWeb.filas[1]], ['web_1', 'animal', 'Luna']);
  });

  it('la primera publicación del gestor crea todas las cabeceras y una sola fila', () => {
    const { ctx, hojaWeb } = crearEntorno();

    const res = ctx.webUpsertAnimal({
      animal_id: 'ani_1',
      titulo: 'Luna busca familia',
      slug: 'luna',
      estado_publicacion: 'borrador',
      contenido_html: '<p>Luna es una perra mestiza.</p>'
    });

    assert.equal(res.status, 'success');
    const cabecera = hojaWeb.filas[0];
    assert.equal(hojaWeb.filas.length, 2, 'cabecera + una publicación');
    ['id', 'tipo', 'origen_id', 'slug', 'estado_publicacion', 'titulo', 'contenido_html', 'slug_historial']
      .forEach((col) => assert.ok(cabecera.includes(col), 'falta la columna ' + col));

    const fila = hojaWeb.filas[1];
    const valor = (col) => fila[cabecera.indexOf(col)];
    assert.equal(valor('slug'), 'luna');
    assert.equal(valor('tipo'), 'animal');
    assert.equal(valor('origen_id'), 'ani_1');
    assert.equal(valor('estado_publicacion'), 'borrador');
    assert.equal(valor('titulo'), 'Luna busca familia');
  });

  it('la segunda publicación reutiliza la cabecera en vez de duplicarla', () => {
    const { ctx, hojaWeb } = crearEntorno();
    const base = { estado_publicacion: 'borrador', contenido_html: '<p>Texto</p>' };

    ctx.webUpsertAnimal(Object.assign({}, base, { animal_id: 'ani_1', titulo: 'Luna', slug: 'luna' }));
    const cabecera = [...hojaWeb.filas[0]];

    const res2 = ctx.webUpsertAnimal(Object.assign({}, base, { animal_id: 'ani_2', titulo: 'Nube', slug: 'nube' }));
    assert.equal(res2.status, 'success', JSON.stringify(res2));

    assert.deepEqual([...hojaWeb.filas[0]], [...cabecera]);
    assert.equal(hojaWeb.filas.length, 3);
    assert.equal(hojaWeb.filas[2][cabecera.indexOf('slug')], 'nube');
  });
});
