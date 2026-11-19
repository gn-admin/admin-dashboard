/**
 * Documentos del animal y facturas: privados de verdad.
 *
 * `upload-documento` compartía todo con `ANYONE_WITH_LINK`. Un documento del
 * animal puede ser un DNI escaneado y una factura lleva datos fiscales; el
 * enlace público no caduca. Ahora solo se comparten galería y foto de entrega,
 * y el panel pide el archivo con `GET documento-archivo`, que valida rol y
 * saca el `file_id` de la fila (nunca del cliente).
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const CODE_GS = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');
const HOJA_DOCS = { sheetId: 'SHEET_DOCS', sheetName: 'Documentos' };
const HOJA_GASTOS = { sheetId: 'SHEET_GASTOS', sheetName: 'Gastos' };

function crearBackend(opts = {}) {
  const permisos = [];
  const carpetas = [];
  const archivos = opts.archivos || {};
  const mkFolder = (nombre) => ({
    createFile(blob) {
      const id = 'file_' + (permisos.length + 1);
      const file = {
        id,
        blob,
        getId: () => id,
        getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
        setSharing(acceso, permiso) { permisos.push({ id, acceso, permiso }); }
      };
      carpetas.push({ nombre, file });
      return file;
    }
  });
  const ctx = {
    CONFIG: {
      ROLES: { ADMIN: 'admin' },
      MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
      DRIVE_DOCS_FOLDER_ID: 'CARPETA_DOCS',
      sheets: { documentos: HOJA_DOCS, gastos: HOJA_GASTOS }
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
      Permission: { VIEW: 'VIEW', NONE: 'NONE' },
      getFolderById(id) {
        const carpeta = mkFolder(id);
        carpeta.getFoldersByName = () => ({ hasNext: () => false, next: () => null });
        carpeta.createFolder = (nombre) => mkFolder(nombre);
        return carpeta;
      },
      getFileById(id) {
        const f = archivos[id];
        if (!f) throw new Error('File not found');
        return {
          getName: () => f.nombre,
          getBlob: () => ({ getContentType: () => f.mime, getBytes: () => [65, 66, 67] })
        };
      }
    },
    Utilities: {
      getUuid: () => '00000000-0000-4000-8000-000000000000',
      base64Decode: () => [65, 66, 67],
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre })
    },
    Logger: { log: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE_GS, ctx, { filename: 'Code.gs' });
  // El `Code.gs` define sus propias funciones; se sustituyen tras cargarlo.
  ctx.readSheet = (cfg) => {
    if (cfg && cfg.sheetId === HOJA_DOCS.sheetId) return opts.documentos || [];
    if (cfg && cfg.sheetId === HOJA_GASTOS.sheetId) return opts.gastos || [];
    return [];
  };
  ctx.jsonResponse = (obj, code) => Object.assign({ _code: code || 200 }, obj);
  return { ctx, permisos, carpetas };
}

function subir(ctx, tipo, nombre = 'archivo.pdf', mime = 'application/pdf') {
  return ctx.uploadDocumento({ archivo_base64: 'QUJD', nombre, mime_type: mime, tipo });
}

function pedir(ctx, user, origen, id) {
  return ctx.handleGet('documento-archivo', user, { parameter: { origen, id } });
}

describe('upload-documento: qué se comparte', () => {
  it('un documento del animal queda privado (sin setSharing y sin enlace)', () => {
    const { ctx, permisos } = crearBackend();
    const res = subir(ctx, 'documento', 'cartilla.pdf');
    assert.equal(res.error, undefined);
    assert.equal(res.compartido, false);
    assert.equal(res.webViewLink, '');
    assert.equal(res.webContentLink, '');
    assert.equal(permisos.length, 0);
  });

  it('una factura queda privada', () => {
    const { ctx, permisos } = crearBackend();
    const res = subir(ctx, 'factura', 'Factura_vacuna.pdf');
    assert.equal(res.compartido, false);
    assert.equal(permisos.length, 0);
  });

  it('galería y foto de entrega sí se comparten', () => {
    const { ctx, permisos } = crearBackend();
    const foto = subir(ctx, 'galeria-foto', 'foto.jpg', 'image/jpeg');
    const video = subir(ctx, 'galeria-video', 'clip.mp4', 'video/mp4');
    const entrega = subir(ctx, 'entrega', 'entrega.jpg', 'image/jpeg');
    assert.equal(foto.compartido, true);
    assert.match(foto.webViewLink, /drive\.google\.com/);
    assert.equal(video.compartido, true);
    assert.equal(entrega.compartido, true);
    assert.equal(permisos.length, 3);
    assert.deepEqual(permisos.map(p => p.acceso), ['ANYONE_WITH_LINK', 'ANYONE_WITH_LINK', 'ANYONE_WITH_LINK']);
  });

  it('sin tipo (subida antigua) no se comparte', () => {
    const { ctx, permisos } = crearBackend();
    const res = subir(ctx, undefined, 'otro.pdf');
    assert.equal(res.compartido, false);
    assert.equal(permisos.length, 0);
  });
});

describe('mantenimiento: revocar enlaces públicos ya existentes', () => {
  it('quita el permiso a documentos y facturas antiguos y cuenta los fallos', () => {
    const revocados = [];
    const { ctx } = crearBackend({
      documentos: [
        { id: 'doc_1', file_id: 'FILE_DOC' },
        { id: 'doc_2', file_id: '' },
        { id: 'doc_3', file_id: 'NO_EXISTE' }
      ],
      gastos: [{ id: 'gst_1', factura_file_id: 'FILE_FACTURA' }]
    });
    ctx.DriveApp.getFileById = (id) => {
      if (id === 'NO_EXISTE') throw new Error('File not found');
      return {
        getName: () => 'x.pdf',
        setSharing(acceso, permiso) { revocados.push({ id, acceso, permiso }); },
        getBlob: () => ({ getContentType: () => 'application/pdf', getBytes: () => [65] })
      };
    };
    const res = ctx.revocarPermisosDocumentosPrivados();
    assert.equal(res.documentos, 1);
    assert.equal(res.facturas, 1);
    assert.equal(res.errores.length, 1);
    assert.match(res.errores[0], /NO_EXISTE/);
    assert.deepEqual(revocados.map(r => r.id), ['FILE_DOC', 'FILE_FACTURA']);
    assert.ok(revocados.every(r => r.acceso === 'PRIVATE' && r.permiso === 'NONE'));
  });
});

describe('GET documento-archivo: archivo privado con sesión y rol', () => {
  const docs = [{ id: 'doc_1', animal_id: 'ani_1', file_id: 'FILE_DOC' }];
  const gastos = [{ id: 'gst_1', animal_id: 'ani_1', factura_file_id: 'FILE_FACTURA' }];
  const archivos = {
    FILE_DOC: { nombre: 'cartilla.pdf', mime: 'application/pdf' },
    FILE_FACTURA: { nombre: 'factura.pdf', mime: 'application/pdf' }
  };

  it('admin abre un documento del animal y recibe el archivo', () => {
    const { ctx } = crearBackend({ documentos: docs, gastos, archivos });
    const res = pedir(ctx, { role: 'admin' }, 'documento', 'doc_1');
    assert.equal(res.status, 'success');
    assert.equal(res.data.nombre, 'cartilla.pdf');
    assert.equal(res.data.mime, 'application/pdf');
    assert.equal(res.data.base64, Buffer.from([65, 66, 67]).toString('base64'));
  });

  it('consulta puede leer documentos y facturas', () => {
    const { ctx } = crearBackend({ documentos: docs, gastos, archivos });
    assert.equal(pedir(ctx, { role: 'consulta' }, 'documento', 'doc_1').status, 'success');
    assert.equal(pedir(ctx, { role: 'consulta' }, 'gasto', 'gst_1').status, 'success');
  });

  it('voluntario lee documentos pero no facturas', () => {
    const { ctx } = crearBackend({ documentos: docs, gastos, archivos });
    assert.equal(pedir(ctx, { role: 'voluntario' }, 'documento', 'doc_1').status, 'success');
    assert.match(pedir(ctx, { role: 'voluntario' }, 'gasto', 'gst_1').error, /No autorizado/);
  });

  it('tesorería ve facturas pero no documentos del animal', () => {
    const { ctx } = crearBackend({ documentos: docs, gastos, archivos });
    assert.equal(pedir(ctx, { role: 'tesoreria' }, 'gasto', 'gst_1').status, 'success');
    assert.match(pedir(ctx, { role: 'tesoreria' }, 'documento', 'doc_1').error, /No autorizado/);
  });

  it('sin_acceso no obtiene nada', () => {
    const { ctx } = crearBackend({ documentos: docs, gastos, archivos });
    assert.match(pedir(ctx, { role: 'sin_acceso' }, 'documento', 'doc_1').error, /No autorizado/);
    assert.match(pedir(ctx, { role: 'sin_acceso' }, 'gasto', 'gst_1').error, /No autorizado/);
  });

  it('rechaza ids inexistentes, orígenes raros y filas sin archivo', () => {
    const { ctx } = crearBackend({
      documentos: docs.concat([{ id: 'doc_sin', file_id: '' }]),
      gastos,
      archivos
    });
    assert.match(pedir(ctx, { role: 'admin' }, 'documento', 'doc_999').error, /no encontrado/i);
    assert.match(pedir(ctx, { role: 'admin' }, 'contrato', 'doc_1').error, /Origen no válido/);
    assert.match(pedir(ctx, { role: 'admin' }, 'documento', 'doc_sin').error, /no tiene archivo/);
    assert.match(pedir(ctx, { role: 'admin' }, 'documento', '').error, /Falta id/);
  });

  it('si Drive no encuentra el archivo devuelve error, no un enlace', () => {
    const { ctx } = crearBackend({ documentos: [{ id: 'doc_roto', file_id: 'NO_EXISTE' }], gastos, archivos });
    const res = pedir(ctx, { role: 'admin' }, 'documento', 'doc_roto');
    assert.match(res.error, /No se pudo abrir el archivo/);
    assert.equal(res.data, undefined);
  });
});

describe('contrato del frontend: el panel usa el endpoint', () => {
  const dashboard = fs.readFileSync(path.join(RAIZ, 'src', 'js', 'dashboard.js'), 'utf8');
  const api = fs.readFileSync(path.join(RAIZ, 'src', 'js', 'api.js'), 'utf8');

  it('documentos y facturas se abren con abrirDocumento, no con enlace de Drive', () => {
    assert.match(dashboard, /data-action="abrirDocumento" data-arg0="documento"/);
    assert.match(dashboard, /data-action="abrirDocumento" data-arg0="gasto"/);
    assert.doesNotMatch(dashboard, /<a href="\$\{this\._esc\(d\.url\)\}"/);
    assert.doesNotMatch(dashboard, /<a href="\$\{this\._esc\(g\.factura_url\)\}"/);
  });

  it('API expone getDocumentoArchivo con origen e id', () => {
    assert.match(api, /getDocumentoArchivo\(origen, id\)\s*\{\s*return this\._get\('documento-archivo'/);
  });
});
