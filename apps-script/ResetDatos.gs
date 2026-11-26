/**
 * Reset operativo del panel.
 *
 * Se ejecuta desde el repositorio con `scripts/reset-datos.mjs` a través del
 * endpoint admin `reset-datos` (POST), o a mano desde el editor de Apps Script:
 *
 *   resetDatosOperativos()                       // dry-run: solo cuenta
 *   resetDatosOperativos({ aplicar: true })      // copia y limpia
 *
 * Qué hace:
 *   1. Excluye SIEMPRE las tres hojas de respuestas de encuestas
 *      (`CONFIG.surveys[*].sheetId`). No borra formularios ni respuestas, y
 *      devuelve el conteo de cada encuesta antes y después para que el
 *      llamador pueda comprobar que no han cambiado.
 *   2. Antes de tocar nada crea una hoja de cálculo de copia en
 *      `CONFIG.BACKUP_DRIVE_FOLDER_ID` con una pestaña por hoja afectada.
 *      Si la copia falla, aborta sin borrar.
 *   3. Vacía el contenido de todas las filas de datos (conserva cabeceras).
 *   4. Invalida la caché del canal público y pide el deploy de las páginas
 *      estáticas, porque las fichas publicadas dejan de existir.
 *
 * Qué NO hace:
 *   - No borra archivos de Drive (fotos, contratos escaneados, documentos).
 *     Quedan huérfanos y deben limpiarse a mano si se quiere.
 *   - No borra la hoja de auditoría salvo `incluirAuditoria: true`.
 *   - No borra las encuestas.
 *
 * Opciones:
 *   aplicar          (bool) false por defecto; true ejecuta el borrado.
 *   incluirAuditoria (bool) false por defecto.
 *   incluirActividad (bool) true por defecto; actividad es historial operativo.
 *   desplegarWeb     (bool) true por defecto; pide el deploy del canal público.
 */
function resetDatosOperativos(opciones) {
  opciones = opciones || {};
  var aplicar = opciones.aplicar === true;
  var incluirAuditoria = opciones.incluirAuditoria === true;
  var incluirActividad = opciones.incluirActividad !== false;
  var desplegarWeb = opciones.desplegarWeb !== false;

  var surveyIds = {};
  Object.keys(CONFIG.surveys || {}).forEach(function (k) {
    var id = String((CONFIG.surveys[k] || {}).sheetId || '').trim();
    if (id) surveyIds[id] = 'encuesta:' + k;
  });

  var hojas = [];
  Object.keys(CONFIG.sheets || {}).forEach(function (clave) {
    var cfg = CONFIG.sheets[clave] || {};
    var id = String(cfg.sheetId || '').trim();
    if (!id) return;
    if (surveyIds[id]) {
      hojas.push({ clave: clave, cfg: cfg, omitida: surveyIds[id] });
      return;
    }
    if (clave === 'auditoria' && !incluirAuditoria) {
      hojas.push({ clave: clave, cfg: cfg, omitida: 'auditoría protegida' });
      return;
    }
    if (clave === 'actividad' && !incluirActividad) {
      hojas.push({ clave: clave, cfg: cfg, omitida: 'actividad protegida' });
      return;
    }
    hojas.push({ clave: clave, cfg: cfg });
  });

  var plan = [];
  hojas.forEach(function (h) {
    if (h.omitida) {
      plan.push({ clave: h.clave, omitida: h.omitida, filas: 0 });
      return;
    }
    try {
      var sheet = getSheet(h.cfg);
      plan.push({
        clave: h.clave,
        sheet: sheet,
        filas: Math.max(0, sheet.getLastRow() - 1),
        columnas: Math.max(1, sheet.getLastColumn())
      });
    } catch (e) {
      plan.push({ clave: h.clave, error: e.message, filas: 0 });
    }
  });

  // Foto de las encuestas antes de cualquier cambio. Es la prueba que viaja en
  // la respuesta: si el reset tocara una respuesta, los conteos no cuadrarían.
  var encuestasAntes = _resetConteoEncuestas();

  var total = plan.reduce(function (n, p) { return n + (p.filas || 0); }, 0);
  Logger.log((aplicar ? 'RESET' : 'DRY-RUN') + ': ' + total + ' filas en ' + plan.length + ' hojas');
  plan.forEach(function (p) {
    Logger.log('  ' + p.clave + ': ' + (p.omitida ? 'OMITIDA (' + p.omitida + ')' : (p.error ? 'ERROR ' + p.error : p.filas + ' filas')));
  });
  encuestasAntes.forEach(function (e) {
    Logger.log('  encuesta ' + e.clave + ': ' + (e.error ? 'ERROR ' + e.error : e.filas + ' respuestas (intacta)'));
  });

  var resumenHojas = plan.map(function (p) {
    return { clave: p.clave, filas: p.filas || 0, omitida: p.omitida || '', error: p.error || '' };
  });

  if (!aplicar) {
    return {
      ok: true,
      aplicar: false,
      totalFilas: total,
      hojas: resumenHojas,
      encuestas: { antes: encuestasAntes, despues: encuestasAntes, intactas: true }
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'Otro proceso está usando el script; reintenta en unos segundos' };

  try {
    var backupUrl = '';
    try {
      backupUrl = _resetCrearCopia(plan);
    } catch (e) {
      return { ok: false, error: 'No se pudo crear la copia de seguridad; no se ha borrado nada: ' + (e.message || e) };
    }
    if (!backupUrl) return { ok: false, error: 'No se pudo crear la copia de seguridad; no se ha borrado nada' };

    var borradas = 0;
    plan.forEach(function (p) {
      if (p.omitida || p.error || !p.sheet) return;
      if (p.filas > 0) {
        p.sheet.getRange(2, 1, p.filas, p.columnas).clearContent();
        borradas += p.filas;
      }
      // Las hojas de datos se quedan con la cabecera; no se borran las pestañas.
    });

    var encuestasDespues = _resetConteoEncuestas();

    try { webInvalidarCachePublico(); } catch (eCache) {}
    var deploy = null;
    if (desplegarWeb) {
      try { deploy = webDispararDeploy('reset-datos', { forzar: true }); } catch (eDeploy) {
        deploy = { ok: false, error: eDeploy.message || String(eDeploy) };
      }
    }

    return {
      ok: true,
      aplicar: true,
      filasBorradas: borradas,
      copia: backupUrl,
      deploy: deploy,
      hojas: resumenHojas,
      encuestas: {
        antes: encuestasAntes,
        despues: encuestasDespues,
        intactas: _resetEncuestasIntactas(encuestasAntes, encuestasDespues)
      }
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cuenta las respuestas de cada encuesta configurada sin tocar nada. Una hoja
 * ilegible no aborta el reset (no se va a borrar), pero queda marcada con
 * `error` para que la comprobación posterior falle en vez de dar por bueno.
 */
function _resetConteoEncuestas() {
  var out = [];
  Object.keys(CONFIG.surveys || {}).forEach(function (clave) {
    var cfg = CONFIG.surveys[clave] || {};
    var item = { clave: clave, nombre: cfg.name || clave, sheetId: String(cfg.sheetId || ''), filas: 0 };
    if (!item.sheetId) {
      item.error = 'sin sheetId';
      out.push(item);
      return;
    }
    try {
      var sheet = getSheet({ sheetId: cfg.sheetId, sheetName: cfg.sheetName });
      item.filas = Math.max(0, sheet.getLastRow() - 1);
    } catch (e) {
      item.error = e.message || String(e);
    }
    out.push(item);
  });
  return out;
}

/** Compara las dos fotos: mismo número de encuestas y mismas filas en cada una. */
function _resetEncuestasIntactas(antes, despues) {
  if (!antes || !despues || antes.length !== despues.length) return false;
  for (var i = 0; i < antes.length; i++) {
    if (String(antes[i].clave) !== String(despues[i].clave)) return false;
    if (antes[i].error || despues[i].error) return false;
    if (Number(antes[i].filas) !== Number(despues[i].filas)) return false;
  }
  return true;
}

/**
 * Crea una hoja de cálculo nueva en la carpeta de backups y copia cada hoja
 * afectada. Devuelve la URL o lanza un error: el reset no sigue sin copia.
 */
function _resetCrearCopia(plan) {
  var ss = SpreadsheetApp.create('GN-reset-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'));
  var defecto = ss.getSheets()[0];
  var copiadas = 0;
  plan.forEach(function (p) {
    if (p.omitida || p.error || !p.sheet) return;
    p.sheet.copyTo(ss).setName(p.clave.slice(0, 90));
    copiadas++;
  });
  if (defecto && ss.getSheets().length > 1) ss.deleteSheet(defecto);
  if (!copiadas) throw new Error('No hay hojas que copiar');

  try {
    var destino = DriveApp.getFolderById(CONFIG.BACKUP_DRIVE_FOLDER_ID);
    DriveApp.getFileById(ss.getId()).moveTo(destino);
  } catch (e) {
    Logger.log('Copia creada, pero no se pudo mover a la carpeta de backups: ' + e.message);
  }
  return ss.getUrl();
}
