/**
 * Diagnóstico de columnas aditivas del canal web. SOLO LECTURA.
 *
 * Cómo usarlo (una vez, antes del gate):
 *   1. Abre el proyecto de Apps Script del despliegue.
 *   2. Archivo > Nuevo > Secuencia de comandos, pega este archivo y guarda.
 *   3. Ejecuta `diagnosticoColumnasWeb` y copia el JSON de Executions > Logs
 *      a `test-results/columnas.json` (o pásalo como --columns-report).
 *
 * No escribe en hojas, no publica y no incluye IDs de hojas ni secretos.
 * Devuelve las cabeceras presentes y las que faltan para que
 * `npm run smoke:contract -- --columns-report ...` pueda fallar con datos
 * reales, no con una suposición.
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
    sheets: {}
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
      var ss = SpreadsheetApp.openById(cfg.sheetId);
      var hoja = ss.getSheetByName(cfg.sheetName);
      if (!hoja) {
        item.error = 'No existe la pestaña ' + cfg.sheetName;
        item.missing = def.columnas.slice();
        salida.ok = false;
        salida.sheets[nombre] = item;
        return;
      }
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

  Logger.log(JSON.stringify(salida, null, 2));
  return salida;
}
