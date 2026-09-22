function doGet(e) { return handleRequest(e, 'GET'); }
function doPost(e) { return handleRequest(e, 'POST'); }
function doPut(e) { return handleRequest(e, 'PUT'); }
function doDelete(e) { return handleRequest(e, 'DELETE'); }

function handleRequest(e, method) {
  try {
    var origin = e.parameter.origin || getHeader(e, 'Origin') || getHeader(e, 'Referer') || '';
    if (!isOriginAllowed(origin)) return jsonResponse({ error: 'Origen no permitido' }, 403);

    var token = extractToken(e);
    if (!token) return jsonResponse({ error: 'Token no proporcionado' }, 401);
    var auth = verifyFirebaseToken(token);
    if (!auth || !auth.ok) {
      Logger.log('Token invalido: ' + ((auth && auth.reason) || 'sin detalle'));
      return jsonResponse({ error: 'Token invalido', detail: (auth && auth.reason) || 'sin detalle' }, 401);
    }
    var user = auth.user;

    var endpoint = e.parameter.endpoint || '';

    if (method === 'GET') return handleGet(endpoint, user, e);
    if (method === 'POST') return handlePost(endpoint, user, e);
    if (method === 'DELETE') return handleDelete(endpoint, user, e);

    return jsonResponse({ error: 'Metodo no soportado' }, 405);
  } catch (err) {
    Logger.log('Error: ' + err.message);
    return jsonResponse({ error: 'Error interno del servidor', detail: err.message }, 500);
  }
}

function getHeader(e, name) {
  try {
    if (e && e.headers && e.headers[name]) return e.headers[name];
  } catch (err) {}
  return '';
}

function handleGet(endpoint, user, e) {
  switch (endpoint) {
    case 'surveys':
      return jsonResponse({ data: getAvailableSurveys(user) });
    case 'responses':
      return handleGetResponses(e, user);
    case 'stats':
      return handleGetStats(e, user);
    case 'user-profile':
      return jsonResponse({ uid: user.uid, email: user.email, role: user.role, name: user.name || user.email });
    case 'animales':
      return jsonResponse({ data: readSheet(CONFIG.sheets.animales) });
    case 'familias':
      return jsonResponse({ data: readSheet(CONFIG.sheets.familias) });
    case 'adopciones':
      return jsonResponse({ data: readSheet(CONFIG.sheets.adopciones) });
    case 'socios':
      return jsonResponse({ data: readSheet(CONFIG.sheets.socios) });
    case 'blacklist':
      return jsonResponse({ data: readSheet(CONFIG.sheets.blacklist) });
    case 'actividad':
      return jsonResponse({ data: readSheet(CONFIG.sheets.actividad) });
    case 'estados':
      return handleGetEstados();
    case 'notas':
      return handleGetNotas();
    default:
      return jsonResponse({ error: 'Endpoint no encontrado' }, 404);
  }
}

function handlePost(endpoint, user, e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch(ex) {}

  switch (endpoint) {
    case 'generate-pdf':
      return jsonResponse({ pdf: generatePdf(body, user) });
    case 'animales':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.animales, body) });
    case 'familias':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.familias, body) });
    case 'adopciones':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.adopciones, body) });
    case 'socios':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.socios, body) });
    case 'blacklist':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.blacklist, body) });
    case 'update-animal':
      return jsonResponse({ data: updateSheetRow(CONFIG.sheets.animales, body.id, body) });
    case 'update-familia':
      return jsonResponse({ data: updateSheetRow(CONFIG.sheets.familias, body.id, body) });
    case 'update-adopcion':
      return jsonResponse({ data: updateSheetRow(CONFIG.sheets.adopciones, body.id, body) });
    case 'update-socio':
      return jsonResponse({ data: updateSheetRow(CONFIG.sheets.socios, body.id, body) });
    case 'delete-animal':
      return jsonResponse({ success: deleteSheetRow(CONFIG.sheets.animales, body.id) });
    case 'delete-familia':
      return jsonResponse({ success: deleteSheetRow(CONFIG.sheets.familias, body.id) });
    case 'delete-adopcion':
      return jsonResponse({ success: deleteSheetRow(CONFIG.sheets.adopciones, body.id) });
    case 'delete-socio':
      return jsonResponse({ success: deleteSheetRow(CONFIG.sheets.socios, body.id) });
    case 'delete-blacklist':
      return jsonResponse({ success: deleteSheetRow(CONFIG.sheets.blacklist, body.id) });
    case 'estados':
      return handleSetEstado(body);
    case 'notas':
      return handleSetNota(body);
    default:
      return jsonResponse({ error: 'Endpoint no encontrado' }, 404);
  }
}

function handleDelete(endpoint, user, e) {
  return jsonResponse({ error: 'DELETE no soportado, usar POST con endpoint delete-*' }, 405);
}

// ==================== SHEETS CRUD ====================

function getSheet(cfg) {
  var ss = SpreadsheetApp.openById(cfg.sheetId);
  if (cfg.sheetName) {
    var sheet = ss.getSheetByName(cfg.sheetName);
    if (sheet) return sheet;
  }
  // Fallback: primera hoja del documento (la hoja de respuestas en Sheets vinculados a Forms)
  return ss.getSheets()[0];
}

function readSheet(cfg) {
  var sheet = getSheet(cfg);
  var range = sheet.getDataRange();
  var values = range.getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var data = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    row._row = i + 1;
    data.push(row);
  }
  return data;
}

function appendToSheet(cfg, record) {
  var sheet = getSheet(cfg);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(Object.keys(record));
  }
  sheet.appendRow(Object.values(record));
  return { id: record.id || Utilities.getUuid(), ...record };
}

function updateSheetRow(cfg, recordId, updates) {
  var sheet = getSheet(cfg);
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return null;

  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === recordId) {
      for (var key in updates) {
        if (key === 'id' || key === '_row') continue;
        var col = headers.indexOf(key);
        if (col !== -1) {
          sheet.getRange(i + 1, col + 1).setValue(updates[key]);
        }
      }
      return { id: recordId, ...updates };
    }
  }
  return null;
}

function deleteSheetRow(cfg, recordId) {
  var sheet = getSheet(cfg);
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return false;

  for (var i = 1; i < values.length; i++) {
    if (values[i][idCol] === recordId) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ==================== ENCUESTAS ====================

function getAvailableSurveys(user) {
  var surveys = CONFIG.surveys || {};
  var result = [];
  for (var id in surveys) {
    if (surveys.hasOwnProperty(id)) {
      var s = surveys[id];
      if (s.visible === false) continue;
      result.push({ id: id, name: s.name, formId: s.formId || null });
    }
  }
  return result;
}

function handleGetResponses(e, user) {
  var surveyId = e.parameter.id;
  if (!surveyId) return jsonResponse({ error: 'Falta id' }, 400);
  var config = CONFIG.surveys[surveyId];
  if (!config) return jsonResponse({ error: 'Encuesta no encontrada' }, 404);
  var data = readSheet({ sheetId: config.sheetId, sheetName: config.sheetName });
  var normalized = data.map(function(row) { return normalizeResponseRow(row); });
  return jsonResponse({ data: normalized, total: normalized.length, survey: { id: surveyId, name: config.name } });
}

/**
 * Normaliza una fila de Google Forms a un conjunto de claves canonicas
 * que las vistas del frontend esperan (nombre, apellidos, email, telefono,
 * domicilio, fecha_creacion, id estable para estados). Conserva tambien
 * las columnas originales de la encuesta.
 */
function normalizeResponseRow(row) {
  function pick(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] in row) return row[candidates[i]];
    }
    return undefined;
  }
  function str(v) { return v === undefined || v === null ? '' : String(v); }

  var out = {};
  for (var k in row) out[k] = row[k];

  out.id = 'resp_' + String(row._row || '0');
  out.nombre = str(pick(['Nombre', 'nombre'])).trim();
  out.apellidos = str(pick(['Apellido(s)', 'Apellidos', 'apellidos'])).trim();
  out.email = str(pick(['Direcci\u00f3n de correo electr\u00f3nico', 'Direccion de correo electronico', 'Correo', 'email']));
  out.telefono = str(pick(['Telefono principal', 'Tel\u00e9fono', 'Telefono', 'telefono']));
  out.domicilio = str(pick(['Domicilio']));
  out.dni = str(pick(['DNI']));
  out.ciudad = str(pick(['Pueblo o Ciudad', 'Ciudad']));
  out.codigo_postal = str(pick(['C\u00f3digo Postal', 'Codigo Postal'])).replace(/\.0+$/, '');
  out.fecha_nacimiento = str(pick(['Fecha de Nacimiento']));
  out.fecha_creacion = normalizeFecha(pick(['Marca temporal', 'Marca de tiempo', 'Timestamp']));
  return out;
}

function normalizeFecha(v) {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) {
    try { return v.toISOString(); } catch (ex) { return String(v); }
  }
  var s = String(v);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]) + 'T' + pad2(m[4] || '00') + ':' + (m[5] || '00') + ':' + (m[6] || '00');
  }
  return s;
}

function pad2(n) { return ('00' + n).slice(-2); }

function handleGetStats(e, user) {
  var surveyId = e.parameter.id;
  if (!surveyId) return jsonResponse({ error: 'Falta id' }, 400);
  var config = CONFIG.surveys[surveyId];
  if (!config) return jsonResponse({ error: 'Encuesta no encontrada' }, 404);
  var data = readSheet({ sheetId: config.sheetId, sheetName: config.sheetName });
  var stats = calculateAnimalStats(data);
  return jsonResponse({ data: stats, survey: { id: surveyId, name: config.name } });
}

function calculateAnimalStats(data) {
  if (!data || !data.length) return { total: 0, por_sexo: {}, por_tamanio: {}, por_edad: {} };
  var stats = { total: data.length, por_sexo: {}, por_tamanio: {}, por_edad: {} };
  data.forEach(function(row) {
    var s = row['Sexo'] || row['sexo'] || 'N/D';
    stats.por_sexo[s] = (stats.por_sexo[s] || 0) + 1;
    var t = row['Tamanio'] || row['tamanio'] || row['Tamano'] || 'N/D';
    stats.por_tamanio[t] = (stats.por_tamanio[t] || 0) + 1;
    var e = row['Edad'] || row['edad'] || 'N/D';
    stats.por_edad[e] = (stats.por_edad[e] || 0) + 1;
  });
  return stats;
}

// ==================== HELPERS ====================

function extractToken(e) {
  var authHeader = getHeader(e, 'Authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  return e.parameter.token || null;
}

function isOriginAllowed(origin) {
  if (!origin || origin === 'null' || origin === 'undefined') return true;
  return CONFIG.ALLOWED_ORIGINS.some(function(a) { return origin.indexOf(a) !== -1; });
}

function handleGetEstados() {
  var data = readSheet(CONFIG.sheets.estados);
  var estados = {};
  data.forEach(function(row) {
    if (row.response_id && row.survey_id) {
      estados[row.survey_id + '::' + row.response_id] = row.estado || 'pendiente';
    }
  });
  return jsonResponse({ data: estados });
}

function handleSetEstado(body) {
  var cfg = CONFIG.sheets.estados;
  var sheet = getSheet(cfg);
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0];
  var idCol = headers.indexOf('response_id');
  var sidCol = headers.indexOf('survey_id');
  var found = false;

  if (values.length >= 2 && idCol !== -1) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === body.response_id && (sidCol === -1 || values[i][sidCol] === body.survey_id)) {
        var estadoCol = headers.indexOf('estado');
        if (estadoCol !== -1) {
          sheet.getRange(i + 1, estadoCol + 1).setValue(body.estado);
        }
        found = true;
        break;
      }
    }
  }

  if (!found) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['response_id', 'survey_id', 'estado', 'fecha']);
    }
    sheet.appendRow([body.response_id, body.survey_id || '', body.estado, new Date().toISOString()]);
  }

  return jsonResponse({ success: true, response_id: body.response_id, estado: body.estado });
}

function handleGetNotas() {
  var data = readSheet(CONFIG.sheets.notas);
  var notas = {};
  data.forEach(function(row) {
    if (row.response_id && row.survey_id && row.nota) {
      notas[row.survey_id + '::' + row.response_id] = row.nota;
    }
  });
  return jsonResponse({ data: notas });
}

function handleSetNota(body) {
  var cfg = CONFIG.sheets.notas;
  var sheet = getSheet(cfg);
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0];
  var idCol = headers.indexOf('response_id');
  var sidCol = headers.indexOf('survey_id');
  var found = false;

  if (values.length >= 2 && idCol !== -1) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === body.response_id && (sidCol === -1 || values[i][sidCol] === body.survey_id)) {
        var notaCol = headers.indexOf('nota');
        if (notaCol !== -1) {
          sheet.getRange(i + 1, notaCol + 1).setValue(body.nota || '');
        }
        found = true;
        break;
      }
    }
  }

  if (!found) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['response_id', 'survey_id', 'nota', 'fecha']);
    }
    sheet.appendRow([body.response_id, body.survey_id || '', body.nota || '', new Date().toISOString()]);
  }

  return jsonResponse({ success: true, response_id: body.response_id });
}

function jsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
