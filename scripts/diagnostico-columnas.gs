/**
 * Diagnóstico del canal web: columnas aditivas + pestaña real de cada hoja.
 * SOLO LECTURA.
 *
 * Cómo usarlo (una vez, antes del gate):
 *   1. Abre el proyecto de Apps Script del despliegue.
 *   2. Archivo > Nuevo > Secuencia de comandos, pega este archivo y guarda.
 *   3. Ejecuta `diagnosticoColumnasWeb` y copia el JSON de Executions > Logs
 *      a `test-results/columnas.json` (o pásalo como --columns-report).
 *   4. Borra el archivo del proyecto cuando tengas el JSON.
 *
 * No escribe en hojas, no publica, no despliega y no incluye IDs de hojas ni
 * secretos. Devuelve:
 *   - `sheets`: cabeceras presentes y `missing` por hoja (lo que lee el gate
 *     `npm run smoke:contract -- --columns-report ...`); `ok` es solo de columnas.
 *   - `pestanas`: para cada hoja y encuesta configurada, la pestaña esperada
 *     según `Config.gs` y la(s) real(es) del documento, con cómo se resuelve.
 *     Es informativo: el gate no lo mira, pero aquí se ven los nombres
 *     desfasados sin abrir cada Sheet.
 */
function diagnosticoColumnasWeb() {
  var requeridas = {
    WebPublicaciones: {
      config: (typeof CONFIG !== 'undefined' && CONFIG.sheets) ? CONFIG.sheets.webPublicaciones : null,
      columnas: ['ficha_json', 'documents_json', 'media_folder_id', 'origen_tipo']
    },
    Animales: {
      config: (typeof CONFIG !== 'undefined' && CONFIG.sheets) ? CONFIG.sheets.animales : null,
      columnas: ['portada_url', 'portada_alt', 'galeria', 'videos', 'documentos_internos']
    }
  };

  var salida = {
    ok: true,
    generado_en: new Date().toISOString(),
    diagnostico: 'columnas-aditivas',
    sheets: {},
    pestanas: [],
    resumen_pestanas: {}
  };

  Object.keys(requeridas).forEach(function (nombre) {
    var def = requeridas[nombre];
    var cfg = def.config;
    var item = { requeridas: def.columnas.slice(), presentes: [], missing: [] };

    if (!cfg || !cfg.sheetId || !cfg.sheetName) {
      item.error = 'Hoja sin configurar';
      item.missing = def.columnas.slice();
      salida.ok = false;
      salida.sheets[nombre] = item;
      return;
    }

    try {
      var hoja = _diagHoja(cfg);
      if (!hoja) {
        item.error = 'No existe la pestaña "' + cfg.sheetName + '" y el documento tiene varias pestañas';
        item.missing = def.columnas.slice();
        salida.ok = false;
        salida.sheets[nombre] = item;
        return;
      }
      item.pestana = hoja.getName();
      var ultima = Math.max(1, hoja.getLastColumn());
      var cabecera = hoja.getRange(1, 1, 1, ultima).getValues()[0]
        .map(function (v) { return String(v || '').trim(); })
        .filter(function (v) { return !!v; });
      item.presentes = cabecera;
      item.missing = def.columnas.filter(function (col) { return cabecera.indexOf(col) === -1; });
      if (item.missing.length) salida.ok = false;
    } catch (err) {
      item.error = String((err && err.message) || err);
      item.missing = def.columnas.slice();
      salida.ok = false;
    }

    salida.sheets[nombre] = item;
  });

  var diag = _diagPestanas();
  salida.pestanas = diag.items;
  salida.resumen_pestanas = diag.resumen;

  Logger.log(JSON.stringify(salida, null, 2));
  return salida;
}

/** Solo las pestañas (mismo informe que `pestanas` dentro del diagnóstico). */
function diagnosticoPestanasWeb() {
  var diag = _diagPestanas();
  var salida = {
    generado_en: new Date().toISOString(),
    diagnostico: 'pestanas-hojas',
    pestanas: diag.items,
    resumen_pestanas: diag.resumen
  };
  Logger.log(JSON.stringify(salida, null, 2));
  return salida;
}

/**
 * Pestaña esperada (Config.gs) frente a la real de cada documento configurado.
 * No abre por nombre: lista todas las pestañas, para ver también el documento
 * que tiene varias. Solo lee; no incluye IDs.
 *
 * `resultado`:
 *   - `nombre`: existe una pestaña con el nombre configurado.
 *   - `unica_pestana`: el nombre no coincide, pero el documento tiene una sola
 *     pestaña, así que `getSheet()` la acepta (es el caso de «Hoja 1»).
 *   - `ambigua`: varias pestañas y ninguna con el nombre configurado: el
 *     backend falla a propósito en vez de leer la primera.
 *   - `sin_configurar` / `error`: falta el ID o no se pudo abrir el documento.
 */
function _diagPestanas() {
  var items = [];
  var resumen = { total: 0, con_nombre_exacto: 0, por_unica_pestana: 0, desajustadas: 0, no_resueltas: 0 };

  function add(clave, cfg) {
    var item = { clave: clave, esperada: (cfg && cfg.sheetName) || '', real: '', pestanas: [], resultado: '' };
    resumen.total += 1;

    if (!cfg || !cfg.sheetId || !cfg.sheetName) {
      item.resultado = 'sin_configurar';
      resumen.no_resueltas += 1;
      resumen.desajustadas += 1;
      items.push(item);
      return;
    }

    try {
      var ss = SpreadsheetApp.openById(cfg.sheetId);
      var nombres = ss.getSheets().map(function (h) { return h.getName(); });
      item.pestanas = nombres;

      if (nombres.indexOf(cfg.sheetName) !== -1) {
        item.real = cfg.sheetName;
        item.resultado = 'nombre';
        resumen.con_nombre_exacto += 1;
      } else if (nombres.length === 1) {
        item.real = nombres[0];
        item.resultado = 'unica_pestana';
        resumen.por_unica_pestana += 1;
        resumen.desajustadas += 1;
      } else {
        item.real = nombres.join(' | ');
        item.resultado = 'ambigua';
        resumen.no_resueltas += 1;
        resumen.desajustadas += 1;
      }
    } catch (err) {
      item.resultado = 'error';
      item.error = String((err && err.message) || err);
      resumen.no_resueltas += 1;
      resumen.desajustadas += 1;
    }

    items.push(item);
  }

  var hojas = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.sheets) ? CONFIG.sheets : {};
  Object.keys(hojas).forEach(function (k) { add(k, hojas[k]); });

  var encuestas = (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.surveys) ? CONFIG.surveys : {};
  Object.keys(encuestas).forEach(function (k) { add('encuesta:' + k, encuestas[k]); });

  return { items: items, resumen: resumen };
}

/**
 * Resuelve la hoja igual que el backend (`getSheet`): por nombre y, si el
 * documento tiene una sola pestaña, esa; los Sheets creados desde Forms o
 * desde el gestor suelen llamarse «Hoja 1» aunque `Config.gs` diga «Animales»
 * o «WebPublicaciones». Con dos o más pestañas y sin coincidencia devuelve
 * null en vez de leer la primera a ciegas.
 */
function _diagHoja(cfg) {
  if (typeof getSheet === 'function') return getSheet(cfg);
  var ss = SpreadsheetApp.openById(cfg.sheetId);
  var hoja = ss.getSheetByName(cfg.sheetName);
  if (hoja) return hoja;
  var hojas = ss.getSheets();
  return hojas.length === 1 ? hojas[0] : null;
}
