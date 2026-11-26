/**
 * Reset operativo desde el endpoint admin (`reset-datos`).
 *
 * Se cargan `Code.gs` y `ResetDatos.gs` reales sobre hojas simuladas y se
 * ejercita el camino completo: permisos, confirmación, copia de seguridad
 * antes de borrar y encuestas intactas después. No sustituye a la ejecución
 * contra el despliegue, pero fija el contrato de lo que se borra y lo que no.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const CODE_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const RESET_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'ResetDatos.gs'), 'utf8');

const CABECERA = ['id', 'nombre'];

function crearHoja(nombre, filas) {
  const hoja = {
    nombre,
    filas: filas.map((f) => f.slice()),
    getName: () => hoja.nombre,
    setName(n) { hoja.nombre = n; return hoja; },
    getLastRow: () => hoja.filas.length,
    getLastColumn: () => hoja.filas.reduce((max, f) => Math.max(max, f.length), 1),
    getDataRange: () => ({ getValues: () => hoja.filas.map((f) => f.slice()) }),
    appendRow: (fila) => { hoja.filas.push(fila.slice()); },
    getRange(filaIni, colIni, numFilas, numCols) {
      return {
        clearContent() {
          for (let i = 0; i < numFilas; i += 1) {
            const r = filaIni - 1 + i;
            if (!hoja.filas[r]) continue;
            for (let j = 0; j < numCols; j += 1) hoja.filas[r][colIni - 1 + j] = '';
          }
        },
        setValues(vals) {
          for (let i = 0; i < numFilas; i += 1) {
            const r = filaIni - 1 + i;
            while (hoja.filas.length <= r) hoja.filas.push([]);
            for (let j = 0; j < numCols; j += 1) hoja.filas[r][colIni - 1 + j] = vals[i][j];
          }
        }
      };
    },
    copyTo(destino) {
      const copia = crearHoja(hoja.nombre, hoja.filas);
      destino.sheets.push(copia);
      return copia;
    }
  };
  return hoja;
}

function crearDoc(id, hojas) {
  const doc = {
    id,
    url: 'https://docs.google.com/spreadsheets/d/' + id,
    sheets: hojas,
    getId: () => doc.id,
    getUrl: () => doc.url,
    getSheets: () => doc.sheets,
    getSheetByName: (n) => doc.sheets.find((h) => h.nombre === n) || null,
    deleteSheet: (h) => { doc.sheets = doc.sheets.filter((x) => x !== h); }
  };
  return doc;
}

function crearEntorno(opciones) {
  opciones = opciones || {};
  const docs = {};
  const carpetaBackup = { id: 'CARPETA_BACKUP', archivos: [] };

  docs['SHEET_ANIMALES'] = crearDoc('SHEET_ANIMALES', [
    crearHoja('Animales', [CABECERA, ['ani_1', 'Luna'], ['ani_2', 'Nube'], ['ani_3', 'Coco']])
  ]);
  docs['SHEET_ACTIVIDAD'] = crearDoc('SHEET_ACTIVIDAD', [
    crearHoja('Actividad', [CABECERA, ['act_1', 'alta'], ['act_2', 'baja']])
  ]);
  docs['SHEET_AUDITORIA'] = crearDoc('SHEET_AUDITORIA', [
    crearHoja('Auditoria', [CABECERA, ['aud_1', 'cambio']])
  ]);
  docs['SHEET_PERROS'] = crearDoc('SHEET_PERROS', [
    crearHoja('Respuestas de formulario 1', [
      ['Marca temporal', 'Nombre'],
      ['2026-11-01 10:00:00', 'Ana'],
      ['2026-11-02 10:00:00', 'Bea']
    ])
  ]);
  docs['SHEET_GATOS'] = crearDoc('SHEET_GATOS', [
    crearHoja('Respuestas de formulario 1', [
      ['Marca temporal', 'Nombre'],
      ['2026-11-03 10:00:00', 'Carla']
    ])
  ]);

  const creados = [];
  const ctx = {
    CONFIG: {
      ROLES: { ADMIN: 'admin', COORDINADOR: 'coordinador', VOLUNTARIO: 'voluntario', TESORERIA: 'tesoreria', CONSULTA: 'consulta' },
      ADMIN_EMAILS: [],
      BACKUP_DRIVE_FOLDER_ID: 'CARPETA_BACKUP',
      sheets: {
        animales: { sheetId: 'SHEET_ANIMALES', sheetName: 'Animales' },
        actividad: { sheetId: 'SHEET_ACTIVIDAD', sheetName: 'Actividad' },
        auditoria: { sheetId: 'SHEET_AUDITORIA', sheetName: 'Auditoria' }
      },
      surveys: {
        'pre-adopcion-perros': { name: 'Perros', sheetId: 'SHEET_PERROS', sheetName: 'Respuestas de formulario 1' },
        'pre-adopcion-gatos': { name: 'Gatos', sheetId: 'SHEET_GATOS', sheetName: 'Respuestas de formulario 1' }
      }
    },
    SpreadsheetApp: {
      openById: (id) => docs[id] || null,
      create(nombre) {
        if (opciones.fallarCopia) throw new Error('cuota agotada');
        const doc = crearDoc('NUEVO_' + (creados.length + 1), [crearHoja('Hoja 1', [])]);
        doc.nombre = nombre;
        creados.push(doc);
        return doc;
      }
    },
    DriveApp: {
      getFolderById: (id) => {
        if (opciones.fallarCarpeta) throw new Error('sin permiso');
        if (id !== carpetaBackup.id) throw new Error('carpeta desconocida');
        return { id, addFile: () => {}, archivos: carpetaBackup.archivos };
      },
      getFileById: (id) => ({ id, moveTo: (carpeta) => { carpeta.archivos.push(id); } })
    },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
      formatDate: () => '20261125-120000'
    },
    Session: { getScriptTimeZone: () => 'Europe/Madrid' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: () => {} },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(texto) {
        return { texto, setMimeType() { return this; }, getContent() { return this.texto; } };
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_GS, ctx);
  vm.runInContext(RESET_GS, ctx);
  return { ctx, docs, creados, carpetaBackup };
}

const admin = { uid: 'uid-admin', email: 'admin@example.test', role: 'admin' };
const peticion = (body) => ({ parameter: {}, postData: { contents: JSON.stringify(body || {}) } });
const respuesta = (res) => JSON.parse(res.getContent());
const filasDe = (env, id) => env.docs[id].getSheets()[0].filas;

describe('reset-datos: solo administración', () => {
  it('un rol no admin no puede escribir en el endpoint', () => {
    const env = crearEntorno();
    assert.equal(env.ctx._canWriteEndpoint('reset-datos', { role: 'voluntario' }), false);
    assert.equal(env.ctx._canWriteEndpoint('reset-datos', { role: 'coordinador' }), false);
    assert.equal(env.ctx._canWriteEndpoint('reset-datos', admin), true);

    const res = respuesta(env.ctx.handlePost('reset-datos', { role: 'voluntario' }, peticion({ aplicar: true, confirmar: 'BORRAR' })));
    assert.equal(res.status, 'error');
    assert.equal(filasDe(env, 'SHEET_ANIMALES').length, 4);
  });
});

describe('reset-datos: dry-run y confirmación', () => {
  it('el dry-run cuenta sin borrar y sin crear copia', () => {
    const env = crearEntorno();
    const res = respuesta(env.ctx.handlePost('reset-datos', admin, peticion()));

    assert.equal(res.status, 'success');
    assert.equal(res.data.aplicar, false);
    assert.equal(res.data.totalFilas, 5); // 3 animales + 2 actividad
    assert.equal(res.data.encuestas.intactas, true);
    assert.deepEqual(res.data.encuestas.antes.map((e) => e.filas), [2, 1]);
    assert.equal(env.creados.length, 0);
    assert.equal(filasDe(env, 'SHEET_ANIMALES').length, 4);
  });

  it('sin `confirmar: BORRAR` no borra nada ni crea copia', () => {
    const env = crearEntorno();
    const res = respuesta(env.ctx.handlePost('reset-datos', admin, peticion({ aplicar: true })));

    assert.equal(res.status, 'error');
    assert.match(res.error, /BORRAR/);
    assert.equal(env.creados.length, 0);
    assert.equal(filasDe(env, 'SHEET_ANIMALES').length, 4);
    assert.equal(filasDe(env, 'SHEET_PERROS').length, 3);
  });
});

describe('reset-datos: copia antes de borrar y encuestas intactas', () => {
  it('crea la copia, vacía solo la operativa y deja las encuestas iguales', () => {
    const env = crearEntorno();
    const antesPerros = filasDe(env, 'SHEET_PERROS').map((f) => f.slice());
    const antesGatos = filasDe(env, 'SHEET_GATOS').map((f) => f.slice());

    const res = respuesta(env.ctx.handlePost('reset-datos', admin, peticion({ aplicar: true, confirmar: 'BORRAR' })));

    assert.equal(res.status, 'success');
    assert.equal(res.data.ok, true);
    assert.equal(res.data.filasBorradas, 5);
    assert.equal(res.data.copia, 'https://docs.google.com/spreadsheets/d/NUEVO_1');
    assert.equal(res.data.encuestas.intactas, true);
    assert.deepEqual(res.data.encuestas.despues.map((e) => e.filas), [2, 1]);

    // La copia se creó antes de borrar y conserva las filas originales.
    assert.equal(env.creados.length, 1);
    const copia = env.creados[0];
    const copiaAnimales = copia.getSheets().find((h) => h.nombre === 'animales');
    assert.deepEqual(copiaAnimales.filas[1], ['ani_1', 'Luna']);
    assert.deepEqual(copiaAnimales.filas[3], ['ani_3', 'Coco']);
    assert.deepEqual(env.carpetaBackup.archivos, ['NUEVO_1']);

    // Datos: cabecera intacta, filas vacías.
    assert.deepEqual(filasDe(env, 'SHEET_ANIMALES'), [CABECERA, ['', ''], ['', ''], ['', '']]);
    assert.deepEqual(filasDe(env, 'SHEET_ACTIVIDAD'), [CABECERA, ['', ''], ['', '']]);

    // Auditoría protegida por defecto.
    assert.deepEqual(filasDe(env, 'SHEET_AUDITORIA')[0], CABECERA);
    assert.deepEqual(env.docs['SHEET_AUDITORIA'].getSheets()[0].filas[1], ['aud_1', 'cambio']);

    // Encuestas: byte a byte igual, ni una fila tocada.
    assert.deepEqual(filasDe(env, 'SHEET_PERROS'), antesPerros);
    assert.deepEqual(filasDe(env, 'SHEET_GATOS'), antesGatos);
  });

  it('si no se puede crear la copia, aborta sin borrar', () => {
    const env = crearEntorno({ fallarCopia: true });
    const perrosAntes = filasDe(env, 'SHEET_PERROS').map((f) => f.slice());

    const res = respuesta(env.ctx.handlePost('reset-datos', admin, peticion({ aplicar: true, confirmar: 'BORRAR' })));

    assert.equal(res.status, 'error');
    assert.match(res.error, /copia de seguridad/);
    assert.equal(filasDe(env, 'SHEET_ANIMALES').length, 4);
    assert.deepEqual(filasDe(env, 'SHEET_PERROS'), perrosAntes);
  });

  it('si no se puede mover la copia a la carpeta, se borra solo con la copia creada', () => {
    const env = crearEntorno({ fallarCarpeta: true });
    const res = respuesta(env.ctx.handlePost('reset-datos', admin, peticion({ aplicar: true, confirmar: 'BORRAR' })));

    // La copia existe y se devuelve su URL; el fallo de la carpeta solo se registra.
    assert.equal(res.status, 'success');
    assert.equal(res.data.copia, 'https://docs.google.com/spreadsheets/d/NUEVO_1');
    assert.equal(env.creados.length, 1);
    assert.equal(res.data.encuestas.intactas, true);
  });
});
