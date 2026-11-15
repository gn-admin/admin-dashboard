function doGet(e) { return handleRequest(e, 'GET'); }
function doPost(e) { return handleRequest(e, 'POST'); }
function doPut(e) { return handleRequest(e, 'PUT'); }
function doDelete(e) { return handleRequest(e, 'DELETE'); }
// Best-effort: Apps Script Web Apps no exponen control completo de preflight/CORS,
// pero se añade handler para compatibilidad si el entorno lo invoca.
function doOptions(e) { return jsonResponse({ status: 'success', ok: true }); }

function handleRequest(e, method) {
  try {
    var origin = _requestOrigin(e);
    if (!isOriginAllowed(origin)) return jsonResponse({ error: 'Origen no permitido' }, 403);

    // Canal público de contenido: solo lectura y solo publicaciones publicadas.
    // Se resuelve antes de exigir token (la web no tiene sesión del panel).
    var endpoint = _webNormalizarEndpoint(e.parameter.endpoint || '', e);
    if (method === 'GET' && _esEndpointPublico(endpoint)) return handleGetPublico(endpoint, e);

    var rl = checkRateLimit(e);
    if (rl && rl.blocked) return jsonResponse({ status: 'warning', error: 'Demasiadas peticiones: espera unos segundos y reintenta' }, 429);

    var token = extractToken(e);
    if (!token) return jsonResponse({ error: 'Token no proporcionado' }, 401);
    var auth = verifyFirebaseToken(token);
    if (!auth || !auth.ok) {
      Logger.log('Token invalido: ' + ((auth && auth.reason) || 'sin detalle'));
      return jsonResponse({ error: 'Token invalido', detail: (auth && auth.reason) || 'sin detalle' }, 401);
    }
    var user = auth.user;

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

function _dataForUser(data, user) {
  try {
    // D1: sin usuario autenticado no se devuelven datos (denegación por defecto).
    if (!user) return [];
    if (_role(user) === CONFIG.ROLES.ADMIN) return data || [];
    return filterDataByRole(data || [], user);
  } catch (e) { return []; }
}


function _role(user) { return String((user && user.role) || 'sin_acceso').toLowerCase().trim(); }
function _isAdmin(user) { return _role(user) === 'admin'; }

function _canReadEndpoint(endpoint, user) {
  var role = _role(user);
  if (_isAdmin(user) || role === 'coordinador') return true;
  // D1: sin_acceso solo puede leer su perfil (para que el frontend muestre el estado).
  if (role === 'sin_acceso') return endpoint === 'user-profile';
  // Gestor web: contenido público y metadatos SEO de las publicaciones.
  if (String(endpoint).indexOf('web-') === 0) return false;
  // consulta: lectura general (acotada por DataFilter donde aplique)
  if (role === 'consulta') return true;
  if (role === 'voluntario') {
    // Sin datos sensibles/finanzas globales/blacklist/contratos según política; lectura operativa básica
    var deny = { 'blacklist':1, 'donaciones':1, 'gastos':1, 'inventario':1, 'contratos':1 };
    return !deny[endpoint];
  }
  if (role === 'tesoreria') {
    var allow = { 'donaciones':1, 'gastos':1, 'apadrinamientos':1, 'inventario':1, 'actividad':1, 'user-profile':1, 'surveys':1, 'responses':1, 'animales':1, 'adopciones':1, 'socios':1 };
    return !!allow[endpoint];
  }
  return false;
}

function _canWriteEndpoint(endpoint, user) {
  var role = _role(user);
  if (_isAdmin(user)) return true;
  // D1: sin_acceso y consulta no escriben.
  if (role === 'sin_acceso' || role === 'consulta') return false;
  // Gestor web: solo admin y coordinación publican contenido.
  if (String(endpoint).indexOf('web-') === 0) return role === 'coordinador';

  // Escrituras sensibles solo admin
  var adminOnly = { 'delete-socio':1, 'delete-blacklist':1, 'blacklist':1, 'update-blacklist':1, 'send-contrato-email':1 };
  if (adminOnly[endpoint]) return false;

  if (role === 'coordinador') {
    // Operativa amplia, sin config/sistema (no hay endpoints de config aquA-)
    return true;
  }
  if (role === 'voluntario') {
    var allow = {
      'animales':1,'update-animal':1,'documentos':1,'update-documento':1,'delete-documento':1,'upload-foto-animal':1,'upload-documento':1,
      'grupos':1,'update-grupo':1,'actividad':1,'notas':1,'seguimientos':1,'update-seguimiento':1,'delete-seguimiento':1,
      'candidaturas':1,'update-candidatura':1,'recordatorios':1,'update-recordatorio':1
    };
    return !!allow[endpoint];
  }
  if (role === 'tesoreria') {
    var allowT = { 'donaciones':1,'update-donacion':1,'delete-donacion':1,'gastos':1,'update-gasto':1,'delete-gasto':1,
      'apadrinamientos':1,'update-apadrinamiento':1,'delete-apadrinamiento':1,'inventario':1,'update-inventario':1,'delete-inventario':1,'actividad':1 };
    return !!allowT[endpoint];
  }
  return false;
}

function _deny(msg) {
  return jsonResponse({ status: 'error', error: msg || 'No autorizado para esta acción' }, 403);
}

function _audit(endpoint, user, body, result) {
  try {
    var ok = result && result.status !== 'error' && !result.error;
    if (!ok) return;
    var sensitive = {
      'delete-animal':1,'delete-familia':1,'delete-adopcion':1,'delete-socio':1,'delete-blacklist':1,'delete-contrato':1,
      'delete-documento':1,'delete-acogida':1,'delete-candidatura':1,'delete-apadrinamiento':1,'delete-gasto':1,'delete-donacion':1,
      'delete-seguimiento':1,'delete-recordatorio':1,'delete-inventario':1,'delete-grupo':1,'delete-historial-fase-adopcion':1,
      'upload-foto-animal':1,'upload-documento':1,'send-contrato-email':1,'blacklist':1,'update-blacklist':1,
      'contratos':1,'update-contrato':1,'adopciones':1,'update-adopcion':1,'acogidas':1,'update-acogida':1,
      'socios':1,'update-socio':1
    };
    if (!sensitive[endpoint]) return;
    var id = (body && (body.id || body.contrato_id || body.response_id)) || '';
    registrarAuditoria(endpoint.indexOf('delete') === 0 ? 'delete' : (endpoint.indexOf('update') === 0 ? 'update' : 'write'), endpoint, String(id), user, null);
  } catch (e) {}
}

function handleGet(endpoint, user, e) {
  if (!_canReadEndpoint(endpoint, user)) return _deny('No autorizado para consultar este recurso');
  switch (endpoint) {
    case 'surveys':
      return jsonResponse({ data: getAvailableSurveys(user) });
    case 'responses':
      return handleGetResponses(e, user);
    case 'user-profile':
      // D1: para sin_acceso se minimizan datos (solo estado de acceso).
      if (_role(user) === 'sin_acceso') {
        return jsonResponse({ role: 'sin_acceso', email: user.email || '' });
      }
      return jsonResponse({ uid: user.uid, email: user.email, role: user.role, name: user.name || user.email });

    case 'animales': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.animales), user) });
    case 'familias': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.familias), user) });
    case 'adopciones': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.adopciones), user) });
    case 'socios': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.socios), user) });
    case 'blacklist': return jsonResponse({ data: _dataForUser(getBlacklistData(), user) });
    case 'candidaturas': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.candidaturas), user) });
    case 'acogidas': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.acogidas), user) });
    case 'apadrinamientos': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.apadrinamientos), user) });
    case 'contratos': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.contratos), user) });
    case 'gastos': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.gastos), user) });
    case 'recordatorios': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.recordatorios), user) });
    case 'donaciones': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.donaciones), user) });
    case 'seguimientos': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.seguimientos), user) });
    case 'historial-fases-adopcion': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.historialFasesAdopcion), user) });
    case 'documentos': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.documentos), user) });
    case 'inventario': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.inventario), user) });
    case 'grupos':
      if (!CONFIG.sheets.grupos || !CONFIG.sheets.grupos.sheetId) return jsonResponse({ data: [] });
      return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.grupos), user) });
    case 'actividad': return jsonResponse({ data: _dataForUser(readSheet(CONFIG.sheets.actividad), user) });

    case 'estados':
      return handleGetEstados();
    case 'notas':
      return handleGetNotas();

    // ==================== GESTOR WEB (admin) ====================
    case 'web-animales':
      if (e.parameter.id) return jsonResponse(webGetAnimal(e.parameter.id));
      return jsonResponse(webListarAnimales({
        q: e.parameter.q,
        estado_publicacion: e.parameter.estado_publicacion,
        publicado: e.parameter.publicado,
        page: e.parameter.page,
        pageSize: e.parameter.pageSize
      }));
    case 'web-animales-preview':
      return jsonResponse(webPreviewAnimal(e.parameter.id));
    case 'web-eventos-preview':
      return jsonResponse(webPreviewEvento(e.parameter.id));
    case 'web-slug-check':
      return jsonResponse(webSlugCheck({ tipo: e.parameter.tipo, slug: e.parameter.slug, id: e.parameter.id }));
    case 'web-resumen':
      return jsonResponse(webResumen());
    case 'web-eventos':
      if (e.parameter.id) return jsonResponse(webGetEvento(e.parameter.id));
      return jsonResponse(webListarEventos({
        q: e.parameter.q,
        estado_publicacion: e.parameter.estado_publicacion,
        tipo: e.parameter.tipo
      }));
    default:
      return jsonResponse({ error: 'Endpoint no encontrado' }, 404);
  }
}

function handlePost(endpoint, user, e) {
  if (!_canWriteEndpoint(endpoint, user)) return _deny('No autorizado para esta acción');
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch(ex) {}

  switch (endpoint) {
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
    case 'candidaturas':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.candidaturas, body) });
    case 'acogidas':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.acogidas, body) });
    case 'apadrinamientos':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.apadrinamientos, body) });
    case 'contratos':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.contratos, body) });
    case 'gastos':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.gastos, body) });
    case 'recordatorios':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.recordatorios, body) });
    case 'donaciones':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.donaciones, body) });
    case 'seguimientos':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.seguimientos, body) });
    case 'historial-fases-adopcion':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.historialFasesAdopcion, body) });
    case 'documentos':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.documentos, body) });
    case 'inventario':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.inventario, body) });
    case 'grupos':
      if (!CONFIG.sheets.grupos || !CONFIG.sheets.grupos.sheetId) {
        return jsonResponse({ status: 'warning', error: 'Hoja Grupos sin configurar: crea la hoja y rellena SHEET_GRUPOS_ID en .env (luego node scripts/gen-config.js)' });
      }
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.grupos, body) });
    case 'actividad':
      return jsonResponse({ data: appendToSheet(CONFIG.sheets.actividad, body) });
    case 'update-animal':
      return jsonResponse(actualizar(CONFIG.sheets.animales, body.id, body));
    case 'update-familia':
      return jsonResponse(actualizar(CONFIG.sheets.familias, body.id, body));
    case 'update-adopcion':
      return jsonResponse(actualizar(CONFIG.sheets.adopciones, body.id, body));
    case 'update-socio':
      return jsonResponse(actualizar(CONFIG.sheets.socios, body.id, body));
    case 'update-candidatura':
      return jsonResponse(actualizar(CONFIG.sheets.candidaturas, body.id, body));
    case 'update-acogida':
      return jsonResponse(actualizar(CONFIG.sheets.acogidas, body.id, body));
    case 'update-apadrinamiento':
      return jsonResponse(actualizar(CONFIG.sheets.apadrinamientos, body.id, body));
    case 'update-contrato':
      return jsonResponse(actualizar(CONFIG.sheets.contratos, body.id, body));
    case 'update-gasto':
      return jsonResponse(actualizar(CONFIG.sheets.gastos, body.id, body));
    case 'update-recordatorio':
      return jsonResponse(actualizar(CONFIG.sheets.recordatorios, body.id, body));
    case 'update-donacion':
      return jsonResponse(actualizar(CONFIG.sheets.donaciones, body.id, body));
    case 'update-seguimiento':
      return jsonResponse(actualizar(CONFIG.sheets.seguimientos, body.id, body));
    case 'update-historial-fase-adopcion':
      return jsonResponse(actualizar(CONFIG.sheets.historialFasesAdopcion, body.id, body));
    case 'update-documento':
      return jsonResponse(actualizar(CONFIG.sheets.documentos, body.id, body));
    case 'update-inventario':
      return jsonResponse(actualizar(CONFIG.sheets.inventario, body.id, body));
    case 'update-grupo':
      if (!CONFIG.sheets.grupos || !CONFIG.sheets.grupos.sheetId) {
        return jsonResponse({ status: 'warning', error: 'Hoja Grupos sin configurar: crea la hoja y rellena SHEET_GRUPOS_ID en .env (luego node scripts/gen-config.js)' });
      }
      return jsonResponse(actualizar(CONFIG.sheets.grupos, body.id, body));
    case 'update-blacklist':
      return jsonResponse({ data: updateBlacklistRow(body.id, body) });
    case 'upload-foto-animal': {
      var _r = jsonResponse({ data: uploadFotoAnimal(body, user) }); _audit(endpoint,user,body,_r); return _r; }
    case 'upload-documento': {
      var _r = jsonResponse({ data: uploadDocumento(body, user) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-animal': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.animales, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-familia': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.familias, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-adopcion': {
      var _r = jsonResponse(deleteAdopcionCascade(body.id)); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-socio': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.socios, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-blacklist': {
      var _r = jsonResponse({ success: deleteBlacklistRow(body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-candidatura': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.candidaturas, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-grupo':
      if (!CONFIG.sheets.grupos || !CONFIG.sheets.grupos.sheetId) return jsonResponse({ success: true });
      return jsonResponse({ success: deleteSheetRow(CONFIG.sheets.grupos, body.id) });
    case 'delete-acogida': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.acogidas, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-apadrinamiento': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.apadrinamientos, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-contrato': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.contratos, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'send-contrato-email': {
      var _r = jsonResponse(sendContratoEmail(body, user)); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-gasto': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.gastos, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-recordatorio': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.recordatorios, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-donacion': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.donaciones, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-seguimiento': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.seguimientos, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-historial-fase-adopcion': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.historialFasesAdopcion, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-documento': {
      var _r = jsonResponse({ success: deleteDocumentoCaso(body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'delete-inventario': {
      var _r = jsonResponse({ success: deleteSheetRow(CONFIG.sheets.inventario, body.id) }); _audit(endpoint,user,body,_r); return _r; }
    case 'estados':
      return handleSetEstado(body, user);
    case 'notas':
      return handleSetNota(body, user);

    // ==================== GESTOR WEB (admin) ====================
    case 'web-animales':
      if (body && body.accion === 'eliminar') return jsonResponse(webEliminarAnimal(body, user));
      return jsonResponse(webUpsertAnimal(body, user));
    case 'web-animales-estado':
      return jsonResponse(webEstadoAnimal(body, user));
    case 'web-eventos':
      if (body && body.accion === 'archivar') return jsonResponse(webArchivarEvento(body, user));
      if (body && body.accion === 'restaurar') return jsonResponse(webRestaurarEvento(body, user));
      return jsonResponse(webUpsertEvento(body, user));
    case 'web-eventos-estado':
      return jsonResponse(webEstadoEvento(body, user));
    case 'web-media-subir': {
      var _rm = jsonResponse(webSubirMedia(body)); _audit(endpoint, user, body, _rm); return _rm;
    }
    default:
      return jsonResponse({ error: 'Endpoint no encontrado' }, 404);
  }
}

function handleDelete(endpoint, user, e) {
  return jsonResponse({ error: 'DELETE no soportado, usar POST con endpoint delete-*' }, 405);
}

// ==================== CANAL PÚBLICO DE CONTENIDO ====================

/**
 * Normaliza `endpoint` y mantiene los alias del contrato público:
 *   /api/publicaciones  -> publicaciones
 *   /api/publicaciones/:slug -> publicacion (slug en e.parameter.slug)
 *   /v1/publicaciones, /v1/animales, /v1/eventos, /v1/blog|historias,
 *   /v1/config, /v1/taxonomias, /v1/sitemap, /v1/redirects.
 */
function _webNormalizarEndpoint(raw, e) {
  var ep = String(raw || '').trim().toLowerCase().replace(/^\/+/, '').replace(/\/+$/, '');
  var detalle = ep.match(/^(?:api|v1)\/publicaciones\/(.+)$/);
  if (detalle) {
    var slug = detalle[1];
    try { slug = decodeURIComponent(slug); } catch (err) {}
    if (e && e.parameter) e.parameter.slug = slug;
    return 'publicacion';
  }
  var alias = {
    'api/publicaciones': 'publicaciones',
    'v1/publicaciones': 'publicaciones',
    'v1/animales': 'animales-publicos',
    'v1/eventos': 'eventos-publicos',
    'v1/historias': 'historias-publicas',
    'v1/blog': 'historias-publicas',
    'v1/config': 'config-publica',
    'v1/taxonomias': 'taxonomias',
    'v1/sitemap': 'sitemap',
    'api/redirects': 'redirects',
    'v1/redirects': 'redirects',
    'sitemap.xml': 'sitemap'
  };
  return alias[ep] || ep;
}

function _esEndpointPublico(endpoint) {
  var publicos = {
    'publicaciones': 1, 'publicacion': 1, 'animales-publicos': 1, 'eventos-publicos': 1,
    'historias-publicas': 1, 'config-publica': 1, 'taxonomias': 1, 'sitemap': 1, 'redirects': 1,
    'retiradas': 1
  };
  return publicos[endpoint] === 1;
}

function _webParamsConTipo(params, tipo) {
  var out = {};
  for (var k in (params || {})) out[k] = params[k];
  out.type = tipo;
  return out;
}

function handleGetPublico(endpoint, e) {
  var p = (e && e.parameter) || {};
  var res;
  switch (endpoint) {
    case 'publicaciones':
      res = _webConCache('pub_list_' + _webKeyParams(p), function () { return webListarPublicas(p); }, p.nocache === '1');
      break;
    case 'publicacion':
      res = webPublicacionPublica(p.slug);
      break;
    case 'animales-publicos':
      res = _webConCache('pub_animal_' + _webKeyParams(p), function () { return webListarPublicas(_webParamsConTipo(p, 'animal')); }, p.nocache === '1');
      break;
    case 'eventos-publicos':
      res = _webConCache('pub_evento_' + _webKeyParams(p), function () { return webListarPublicas(_webParamsConTipo(p, 'evento')); }, p.nocache === '1');
      break;
    case 'historias-publicas':
      res = _webConCache('pub_historia_' + _webKeyParams(p), function () { return webListarPublicas(_webParamsConTipo(p, 'historia')); }, p.nocache === '1');
      break;
    case 'config-publica':
      res = webConfigPublica();
      break;
    case 'taxonomias':
      res = _webConCache('pub_tax', function () { return webTaxonomias(); }, p.nocache === '1');
      break;
    case 'sitemap':
      res = _webConCache('pub_sitemap', function () { return webSitemap(); }, p.nocache === '1');
      break;
    case 'redirects':
      res = _webConCache('pub_redirects', function () { return webRedirects(); }, p.nocache === '1');
      break;
    case 'retiradas':
      res = _webConCache('pub_retiradas', function () { return webRetiradas(); }, p.nocache === '1');
      break;
    default:
      res = { status: 'error', error: 'Endpoint público no encontrado' };
  }
  return _webSalida(res, p.callback);
}

function _webKeyParams(p) {
  var claves = ['type', 'category', 'status', 'species', 'q', 'page', 'pageSize', 'sort', 'fields'];
  var partes = [];
  for (var i = 0; i < claves.length; i++) {
    if (p && p[claves[i]] !== undefined && p[claves[i]] !== '') partes.push(claves[i] + '=' + p[claves[i]]);
  }
  return partes.join('&');
}

/**
 * Cache interno de 60 s (GAS/ContentService no permite cabeceras HTTP como
 * Cache-Control o ETag). `nocache=1` fuerza lectura fresca.
 */
function _webConCache(clave, fn, sinCache) {
  if (sinCache) return fn();
  var cache;
  try { cache = CacheService.getScriptCache(); } catch (err) { return fn(); }
  try {
    var guardado = cache.get(clave);
    if (guardado) return JSON.parse(guardado);
  } catch (errLeer) {}
  var res = fn();
  try {
    var json = JSON.stringify(res);
    if (json && json.length < 90000) cache.put(clave, json, 60);
  } catch (errEscribir) {}
  return res;
}

/** JSON normal o JSONP (`callback=`) para poder consumir el canal desde la web estática. */
function _webSalida(data, callback) {
  var cb = String(callback || '').trim();
  if (!cb) return jsonResponse(data);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cb)) return jsonResponse({ status: 'error', error: 'callback no válido' }, 400);
  var out = ContentService.createTextOutput(cb + '(' + JSON.stringify(data || {}) + ');');
  out.setMimeType(ContentService.MimeType.JAVASCRIPT);
  return out;
}

// ==================== AUDITORÍA (best-effort) ====================

function registrarAuditoria(accion, entidad, registroId, usuario, detalle) {
  try {
    var cfg = CONFIG.sheets && CONFIG.sheets.auditoria;
    if (!cfg || !cfg.sheetId || String(cfg.sheetId).indexOf('REEMPLAZAR_') === 0) return;
    var sheet = getSheet(cfg);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['id', 'fecha', 'usuario', 'uid', 'accion', 'entidad', 'registro_id', 'detalle']);
    }
    sheet.appendRow([
      Utilities.getUuid(),
      new Date().toISOString(),
      (usuario && (usuario.email || usuario.name)) || '',
      (usuario && usuario.uid) || '',
      accion || '',
      entidad || '',
      registroId || '',
      detalle ? (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)) : ''
    ]);
  } catch (e) {
    Logger.log('Auditoria no registrada: ' + e.message);
  }
}

// ==================== SHEETS CRUD ====================

function getSheet(cfg) {
  var ss = SpreadsheetApp.openById(cfg.sheetId);
  if (cfg.sheetName) {
    var sheet = ss.getSheetByName(cfg.sheetName);
    if (sheet) return sheet;
    var hojas = ss.getSheets();
    // Varias pestañas y ninguna con el nombre configurado: fallar en vez de
    // leer/escribir en la primera (sería corrupción de datos silenciosa).
    if (hojas.length > 1) {
      Logger.log('getSheet: no existe la pestaña "' + cfg.sheetName + '" en ' + cfg.sheetId +
        '; pestañas: ' + hojas.map(function (h) { return h.getName(); }).join(', '));
      throw new Error('No existe la pestaña "' + cfg.sheetName + '" y el documento tiene ' + hojas.length +
        ' pestañas: no se usa la primera para no leer ni escribir en la hoja equivocada');
    }
    // Una sola pestaña (habitual en documentos de gestión y en los Sheets de
    // respuestas de Forms): no hay ambigüedad posible.
    return hojas[0];
  }
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
  // El id debe existir ANTES de escribir: si no, la celda queda vacia en la
  // hoja pero se devuelve un uuid al front -> fila fantasma (irrecuperable).
  if (record.id === undefined || record.id === null || record.id === '') {
    record.id = Utilities.getUuid();
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(Object.keys(record));
  }
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0].slice();

  // Upsert por id: si ya existe fila con este id (p. ej. reintento de la cola
  // offline tras un fallo de red), se actualiza en su sitio en vez de duplicar.
  if (record.id !== undefined && record.id !== null && record.id !== '') {
    var idCol = headers.indexOf('id');
    if (idCol !== -1) {
      for (var u = 1; u < values.length; u++) {
        if (String(values[u][idCol]) === String(record.id)) {
          return updateSheetRow(cfg, record.id, record);
        }
      }
    }
  }

  // Columnas nuevas (campos del registro que no existen en la cabecera): se añaden al final.
  var extra = Object.keys(record).filter(function (k) { return headers.indexOf(k) === -1; });
  if (extra.length) {
    sheet.getRange(1, headers.length + 1, 1, extra.length).setValues([extra]);
    headers = headers.concat(extra);
  }

  // Fila alineada por cabecera (evita desalineación si el orden de campos varía).
  var newRow = headers.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
  sheet.appendRow(newRow);
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
    if (String(values[i][idCol]) === String(recordId)) {
      var extra = Object.keys(updates).filter(function (k) { return k !== 'id' && k !== '_row' && headers.indexOf(k) === -1; });
      if (extra.length) {
        sheet.getRange(1, headers.length + 1, 1, extra.length).setValues([extra]);
        headers = headers.concat(extra);
      }
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

function getBlacklistData() {
  return readSheet(CONFIG.sheets.blacklist).map(function (row) {
    if (!row.id) row.id = 'bl_' + row._row;
    return row;
  });
}

function findBlacklistRow(recordId) {
  var sheet = getSheet(CONFIG.sheets.blacklist);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  for (var i = 1; i < values.length; i++) {
    var matchId = idCol !== -1 && String(values[i][idCol]) === String(recordId);
    var matchRow = recordId === ('bl_' + (i + 1));
    if (matchId || matchRow) return i;
  }
  return -1;
}

function updateBlacklistRow(recordId, updates) {
  var sheet = getSheet(CONFIG.sheets.blacklist);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var targetRow = findBlacklistRow(recordId);
  if (targetRow === -1) return null;
  var extra = Object.keys(updates).filter(function (k) { return k !== 'id' && k !== '_row' && headers.indexOf(k) === -1; });
  if (extra.length) {
    sheet.getRange(1, headers.length + 1, 1, extra.length).setValues([extra]);
    headers = headers.concat(extra);
  }
  for (var key in updates) {
    if (key === 'id' || key === '_row') continue;
    var col = headers.indexOf(key);
    if (col !== -1) sheet.getRange(targetRow + 1, col + 1).setValue(updates[key]);
  }
  return { id: updates.id || recordId, ...updates };
}

function deleteBlacklistRow(recordId) {
  var sheet = getSheet(CONFIG.sheets.blacklist);
  var targetRow = findBlacklistRow(recordId);
  if (targetRow === -1) return false;
  sheet.deleteRow(targetRow + 1);
  return true;
}

function deleteSheetRow(cfg, recordId) {
  var sheet = getSheet(cfg);
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return false;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(recordId)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// Borrado de adopcion con rollback: elimina el caso y devuelve el animal
// a Disponible + la solicitud Aprobada a En proceso + libera la candidatura.
// Solo revierte estados que este caso dejo (no toca casos ajenos).
function deleteAdopcionCascade(adopcionId) {
  var rolled = { animal: false, solicitud: false, candidatura: false };
  var target = null;
  var rows = readSheet(CONFIG.sheets.adopciones);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(adopcionId)) { target = rows[i]; break; }
  }
  if (target) {
    if (target.animal_id) {
      var animales = readSheet(CONFIG.sheets.animales);
      for (var j = 0; j < animales.length; j++) {
        var an = animales[j];
        if (String(an.id) === String(target.animal_id) &&
            (an.estado === 'en_adopcion' || an.estado === 'adoptado') &&
            (!an.adopcion_id || String(an.adopcion_id) === String(adopcionId))) {
          updateSheetRow(CONFIG.sheets.animales, an.id, { estado: 'disponible', adopcion_id: '' });
          rolled.animal = true;
          break;
        }
      }
    }
    if (target.solicitud_id && String(target.solicitud_id).indexOf('::') !== -1) {
      var parts = String(target.solicitud_id).split('::');
      var sid = parts[0], rid = parts.slice(1).join('::');
      var estados = {};
      readSheet(CONFIG.sheets.estados).forEach(function (r) {
        if (r.response_id && r.survey_id) estados[r.survey_id + '::' + r.response_id] = r.estado;
      });
      if (estados[String(target.solicitud_id)] === 'aprobada') {
        handleSetEstado({ response_id: rid, survey_id: sid, estado: 'en_proceso' });
        rolled.solicitud = true;
      }
      var cands = readSheet(CONFIG.sheets.candidaturas);
      for (var k = 0; k < cands.length; k++) {
        if (String(cands[k].solicitud_id) === String(target.solicitud_id) && cands[k].animal_id) {
          updateSheetRow(CONFIG.sheets.candidaturas, cands[k].id, { estado: 'en_lista', animal_id: '' });
          rolled.candidatura = true;
        }
      }
    }
  }
  var ok = deleteSheetRow(CONFIG.sheets.adopciones, adopcionId);
  return { success: ok, rollback: rolled };
}

// Envio del contrato firmado por email. Solo admite destinatarios que ya
// figuren en el propio contrato (firmantes) o el email de la entidad/usuario
// autenticado; nunca acepta direcciones arbitrarias del cliente.
function sendContratoEmail(body, user) {
  var contratoId = body && body.contrato_id;
  if (!contratoId) return { status: 'error', error: 'Falta contrato_id' };
  var rows = readSheet(CONFIG.sheets.contratos);
  var c = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(contratoId)) { c = rows[i]; break; }
  }
  if (!c) return { status: 'error', error: 'Contrato no encontrado' };

  var permitidos = [];
  var addPerm = function (e) {
    var v = String(e || '').trim().replace(/[\r\n]/g, '');
    if (v && permitidos.indexOf(v) === -1) permitidos.push(v);
  };
  addPerm(c.f1_email);
  addPerm(c.f2_email);
  addPerm(CONFIG.CONTACT_EMAIL);
  if (user && user.email) addPerm(user.email);

  var pedidos = (body && body.to) || [];
  if (!Array.isArray(pedidos)) pedidos = [pedidos];
  var destinos = [];
  for (var j = 0; j < pedidos.length; j++) {
    var e = String(pedidos[j] || '').trim().replace(/[\r\n]/g, '');
    if (!e || destinos.indexOf(e) !== -1) continue;
    if (permitidos.indexOf(e) === -1) continue;
    destinos.push(e);
  }
  if (!destinos.length) return { status: 'warning', error: 'No hay destinatarios validos para este contrato' };

  var asunto = 'Contrato de adopcion y terminos · ' + (c.animal || 'Grupo Nebak');
  MailApp.sendEmail({
    to: destinos.join(','),
    subject: asunto,
    htmlBody: construirEmailContrato(c),
    name: 'Grupo Nebak',
    replyTo: CONFIG.CONTACT_EMAIL || (user && user.email) || undefined
  });
  return { status: 'success', data: { to: destinos } };
}

function _escEmail(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function construirEmailContrato(c) {
  var e = _escEmail;
  var firma1 = (c.f1_firma && String(c.f1_firma).indexOf('data:') === 0)
    ? '<div style="margin-top:8px"><img src="' + e(c.f1_firma) + '" alt="Firma" style="height:60px"></div>'
    : '<div style="margin-top:8px;color:#999;font-style:italic">[Firma registrada en el documento]</div>';
  var ent = {
    nombre: c.entidad_nombre || 'Asociación Grupo Nebak',
    cif: c.entidad_cif || '',
    domicilio: c.entidad_domicilio || '',
    email: c.entidad_email || CONFIG.CONTACT_EMAIL || '',
    telefono: c.entidad_telefono || '',
    registro: c.entidad_registro || ''
  };
  var entLinea = function(label, value) {
    return value ? '<div style="font-size:12px;color:#6b7280"><b>' + e(label) + ':</b> ' + e(value) + '</div>' : '';
  };
  var seccion = function(titulo) {
    return '<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#15863D;margin:22px 0 8px;border-bottom:1px solid #e8eaed;padding-bottom:4px">' + e(titulo) + '</h2>';
  };
  var clausula = function(n, texto) {
    return '<p style="margin:0 0 8px;font-size:13px;line-height:1.6;text-align:justify"><b>' + n + '.</b> ' + texto + '</p>';
  };
  var sello = '<div style="width:96px;height:96px;border:2px solid #15863D;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:#15863D;font-size:9px;font-weight:800;line-height:1.15;text-transform:uppercase;transform:rotate(-8deg)">' + e(ent.nombre) + '<br><span style="font-size:7px;font-weight:700">SELLO DE LA ENTIDAD</span></div>';
  var tutor = c.f2_nombre ? '<tr><td style="padding:6px 0;color:#757575">Tutor / persona de apoyo</td><td style="padding:6px 0">' + e(c.f2_nombre) + (c.f2_dni ? ' · DNI ' + e(c.f2_dni) : '') + '</td></tr>' : '';
  var terminos = [
    ['Objeto', 'Estos términos regulan la adopción responsable del animal identificado en el contrato y forman parte inseparable de él.'],
    ['Capacidad y veracidad', 'El adoptante declara ser mayor de edad, tener capacidad legal para asumir esta responsabilidad y que los datos facilitados son veraces y están actualizados.'],
    ['Cuidados y bienestar', 'El adoptante se compromete a proporcionar alimentación, agua, refugio, higiene, ejercicio, compañía y un trato respetuoso durante toda la vida del animal.'],
    ['Salud veterinaria', 'El adoptante mantendrá el microchip actualizado, las vacunas y desparasitaciones al día, acudirá al veterinario ante cualquier problema de salud y, cuando proceda, esterilizará al animal y aportará el informe acreditativo.'],
    ['Prohibiciones', 'El animal no se utilizará para cría, venta, caza, peleas, experimentación, guarda de propiedades, circos, espectáculos ni fines lucrativos. No permanecerá atado ni encerrado en jaulas, terrazas, patios o garajes.'],
    ['Seguimiento', 'El adoptante acepta el periodo de prueba de 15-30 días y el seguimiento posterior a 1, 3, 6 y 12 meses, y facilitará las visitas, fotografías y comprobaciones necesarias.'],
    ['Gastos', 'Todos los gastos derivados del cuidado del animal (alimentación, veterinario, seguro, identificaciones y otros) corren a cargo del adoptante.'],
    ['Devolución', 'Si el adoptante no puede continuar cuidando al animal, deberá informar a la entidad y devolverlo. Nunca lo abandonará ni lo entregará a terceros sin autorización expresa.'],
    ['Datos personales', 'Los datos del adoptante y del tutor se tratarán para gestionar la adopción, el seguimiento y las obligaciones legales de la entidad. El interesado puede ejercer sus derechos de acceso, rectificación, supresión y oposición.'],
    ['Incumplimiento y aceptación', 'El incumplimiento de estas obligaciones facultará a la entidad para recuperar el animal y ejercer las acciones legales que correspondan. El adoptante declara haber leído, comprendido y aceptado estos términos.']
  ];
  var terminosHtml = terminos.map(function(t, i) {
    return seccion((i + 1) + '. ' + t[0]) + '<p style="margin:0 0 8px;font-size:13px;line-height:1.6;text-align:justify">' + e(t[1]) + '</p>';
  }).join('');
  return '<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#191919">' +
    '<div style="max-width:680px;margin:0 auto;padding:24px">' +
    '<div style="padding:18px 20px;border-radius:12px 12px 0 0;background:linear-gradient(135deg,#0A431E,#15863D);color:#fff">' +
    '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85">Grupo Nebak · Documento 1 de 2</div>' +
    '<h1 style="margin:6px 0 0;font-size:20px">Contrato de adopción responsable</h1>' +
    '</div>' +
    '<div style="padding:22px 20px;background:#fff;border:1px solid #e8eaed;border-top:0;border-radius:0 0 12px 12px">' +
    '<div style="display:flex;justify-content:space-between;gap:16px;padding:12px;border:1px solid #e8eaed;border-radius:8px;background:#f9fafb;margin-bottom:16px">' +
    '<div style="font-size:12px;color:#6b7280;line-height:1.5"><b style="display:block;color:#191919;font-size:14px">' + e(ent.nombre) + '</b>Entidad de protección animal' + entLinea('CIF', ent.cif) + entLinea('Domicilio', ent.domicilio) + entLinea('Registro', ent.registro) + entLinea('Email', ent.email) + entLinea('Teléfono', ent.telefono) + '</div>' + sello + '</div>' +
    '<p style="margin:0 0 12px;font-size:14px">Documento de adopción del animal <b>' + e(c.animal || '—') + '</b>' + (c.especie ? ' (' + e(c.especie) + ')' : '') + '.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    '<tr><td style="padding:6px 0;color:#757575">Adoptante</td><td style="padding:6px 0;font-weight:600">' + e(c.f1_nombre || '—') + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#757575">DNI</td><td style="padding:6px 0">' + e(c.f1_dni || '—') + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#757575">Domicilio</td><td style="padding:6px 0">' + e(c.f1_direccion || '—') + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#757575">Fecha</td><td style="padding:6px 0">' + e(c.fecha || '—') + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#757575">Ciudad</td><td style="padding:6px 0">' + e(c.ciudad || '—') + '</td></tr>' + tutor +
    '</table>' +
    seccion('Cláusulas del contrato') +
    clausula(1, 'El adoptante se compromete a adoptar al animal como animal de compañía y a proporcionarle durante toda su vida alimentación, agua, higiene, atención veterinaria, ejercicio y un entorno seguro.') +
    clausula(2, 'El animal no se utilizará para cría, caza, peleas, experimentación, guarda de propiedades, circos, espectáculos ni fines lucrativos.') +
    clausula(3, 'El adoptante mantendrá al animal identificado con microchip y al día en vacunaciones y desparasitaciones.') +
    clausula(4, 'No se podrá vender, regalar ni ceder el animal sin autorización expresa de la entidad. Si no puede continuar con su cuidado, deberá devolverlo.') +
    clausula(5, 'El adoptante acepta el periodo de prueba de 15-30 días, el seguimiento a 1, 3, 6 y 12 meses y las visitas de comprobación.') +
    clausula(6, 'El incumplimiento de estas obligaciones facultará a la entidad para recuperar el animal y ejercer las acciones legales que correspondan.') +
    '<div style="margin-top:16px;padding:12px;border-left:3px solid #15863D;background:#f8faf9;font-size:14px">' +
    '<b>Firma del adoptante</b>' + firma1 +
    '</div>' +
    '<div style="margin:24px 0 0;padding:12px;border-left:3px solid #15863D;background:#f8faf9;font-size:14px"><b>Por la entidad</b><div style="margin-top:8px">' + sello + '</div><div style="margin-top:6px">' + e(ent.nombre) + '</div></div>' +
    '<hr style="border:0;border-top:1px solid #e8eaed;margin:24px 0">' +
    '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#15863D;font-weight:800">Documento 2 de 2</div>' +
    '<h1 style="margin:4px 0 12px;font-size:19px;color:#191919">Términos y condiciones de adopción responsable</h1>' +
    '<p style="margin:0 0 14px;font-size:13px;color:#4b5563">Anexo del contrato · ' + e(ent.nombre) + ' · Versión 1.0 · 2026/11/10</p>' +
    '<p style="margin:0 0 12px;font-size:13px;line-height:1.6">El adoptante declara haber leído y aceptado los siguientes términos, que forman parte del expediente de adopción del animal <b>' + e(c.animal || '—') + '</b>.</p>' +
    terminosHtml +
    '<div style="margin-top:18px;padding:12px;border-left:3px solid #15863D;background:#f8faf9;font-size:13px"><b>Aceptado por el adoptante:</b> ' + e(c.f1_nombre || '—') + (c.f1_dni ? ' · DNI ' + e(c.f1_dni) : '') + '<br><span style="color:#6b7280">Fecha: ' + e(c.fecha || '—') + '</span></div>' +
    '<p style="margin:18px 0 0;font-size:12px;color:#9aa0a6">Este correo contiene el contrato y el anexo de términos y condiciones. Los PDF se pueden descargar desde el panel de Grupo Nebak. Correo generado automáticamente.</p>' +
    '</div></div></body></html>';
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

// ==================== HELPERS ====================

function extractToken(e) {
  // Acepta token en cabecera Authorization (Bearer) o en query (?token=) para compatibilidad.
  var authHeader = getHeader(e, 'Authorization') || getHeader(e, 'authorization') || '';
  if (authHeader && String(authHeader).indexOf('Bearer ') === 0) return String(authHeader).substring(7);
  if (e && e.parameter && e.parameter.token) return e.parameter.token;
  // Algunos despliegues exponen cabeceras en e.parameters o postData; fallback defensivo.
  try {
    if (e && e.postData && e.postData.contents) {
      var b = JSON.parse(e.postData.contents);
      if (b && b.token) return b.token;
    }
  } catch (err) {}
  return null;
}

function _requestOrigin(e) {
  try {
    var raw = (e && e.parameter && e.parameter.origin) || getHeader(e, 'Origin') || getHeader(e, 'origin') || getHeader(e, 'Referer') || getHeader(e, 'referer') || '';
    raw = String(raw || '').trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) {
      var m = raw.match(/^(https?:\/\/[^\/?#]+)/i);
      if (m) return m[1];
    }
    return raw;
  } catch (err) { return ''; }
}

function isOriginAllowed(origin) {
  origin = String(origin || '').trim();
  var allowed = (typeof CONFIG !== 'undefined' && CONFIG.ALLOWED_ORIGINS) ? CONFIG.ALLOWED_ORIGINS : [];
  var isLocal = origin.indexOf('http://localhost') === 0 || origin.indexOf('http://127.0.0.1') === 0;

  if (!origin || origin === 'null' || origin === 'undefined') {
    if (typeof CONFIG !== 'undefined' && CONFIG.ALLOW_ORIGIN_EMPTY === false) {
      Logger.log('Origen vacío recibido con ALLOW_ORIGIN_EMPTY=false; permitido por compatibilidad GAS.');
    }
    return true;
  }

  for (var i = 0; i < allowed.length; i++) {
    var a = String(allowed[i] || '').trim();
    if (!a) continue;
    if (a === origin) return true;
    if (isLocal && (a.indexOf('http://localhost') === 0 || a.indexOf('http://127.0.0.1') === 0)) return true;
  }
  return false;
}
// Rate limit sencillo y fail-open: si CacheService falla, se permite.
// Ventana deslizante de 60 s por token (CONFIG.RATE_LIMIT peticiones).
function checkRateLimit(e) {
  try {
    var limit = parseInt(CONFIG.RATE_LIMIT, 10);
    if (!limit || limit <= 0) return null;
    // En el canal público no hay token: se limita por origen para no compartir
    // un único contador anónimo entre todos los lectores.
    var key = 'rl_' + ((e && e.parameter && (e.parameter.token || e.parameter.origin)) || 'anon');
    var cache = CacheService.getScriptCache();
    var count = parseInt(cache.get(key) || '0', 10) + 1;
    cache.put(key, String(count), 60);
    if (count > limit) return { blocked: true };
    return null;
  } catch (err) { return null; }
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

function handleSetEstado(body, user) {
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
      if (String(values[i][idCol]) === String(body.response_id) && (sidCol === -1 || String(values[i][sidCol]) === String(body.survey_id || ''))) {
        var estadoCol = headers.indexOf('estado');
        if (estadoCol !== -1) sheet.getRange(i + 1, estadoCol + 1).setValue(body.estado);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    if (sheet.getLastRow() === 0) sheet.appendRow(['response_id', 'survey_id', 'estado', 'fecha']);
    sheet.appendRow([body.response_id, body.survey_id || '', body.estado, new Date().toISOString()]);
  }

  registrarAuditoria('set_estado', 'estados', String(body.survey_id || '') + '::' + String(body.response_id || ''), user, { estado: body.estado || '' });
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

function handleSetNota(body, user) {
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
      if (String(values[i][idCol]) === String(body.response_id) && (sidCol === -1 || String(values[i][sidCol]) === String(body.survey_id || ''))) {
        var notaCol = headers.indexOf('nota');
        if (notaCol !== -1) sheet.getRange(i + 1, notaCol + 1).setValue(body.nota || '');
        found = true;
        break;
      }
    }
  }

  if (!found) {
    if (sheet.getLastRow() === 0) sheet.appendRow(['response_id', 'survey_id', 'nota', 'fecha']);
    sheet.appendRow([body.response_id, body.survey_id || '', body.nota || '', new Date().toISOString()]);
  }

  registrarAuditoria('set_nota', 'notas', String(body.survey_id || '') + '::' + String(body.response_id || ''), user, { longitud: String(body.nota || '').length });
  return jsonResponse({ success: true, response_id: body.response_id });
}

// Keep-warm opcional: crear trigger cada 15 min (Triggers -> keepWarm,
// basada en tiempo) para reducir cold starts del dashboard.
function keepWarm() { return true; }

// Toda respuesta lleva `status`: 'success' | 'warning' | 'error'.
//  - `error`  -> algo ha fallado (se lanza en api.js y se muestra rojo).
//  - `warning`-> ha ido pero con reserva (se lanza y se muestra ambar).
//  - `success`-> todo correcto (verde).
// Si el llamante no lo indica se deduce: hay campo `error` -> error, si no -> success.
// `code` expone el codigo HTTP que se paso (401/403/429/...); seguimos respondiendo
// HTTP 200 porque asi lo exige el contrato con api.js.
function jsonResponse(data, statusCode) {
  var out = data || {};
  if (!out.status) out.status = out.error ? 'error' : 'success';
  if (statusCode) out.code = statusCode;
  var output = ContentService.createTextOutput(JSON.stringify(out));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// Actualizacion de fila con respuesta normalizada: si no existe la fila no se
// devuelve {data:null} (que el front interpretaria como exito), sino un error.
function actualizar(cfg, recordId, updates) {
  var row = updateSheetRow(cfg, recordId, updates);
  if (!row) return { error: 'No se encontro el registro a actualizar' };
  return { data: row };
}

function _uploadBytesApprox(base64) {
  if (!base64) return 0;
  var len = String(base64).length;
  return Math.floor((len * 3) / 4);
}

function _safeUploadName(original, fallbackExt) {
  var ext = '';
  var m = String(original || '').match(/\.([a-zA-Z0-9]{1,8})$/);
  if (m) ext = '.' + m[1].toLowerCase();
  else if (fallbackExt) ext = fallbackExt[0] === '.' ? fallbackExt : ('.' + fallbackExt);
  return Utilities.getUuid() + ext;
}

function uploadFotoAnimal(body, user) {
  var folderId = CONFIG.DRIVE_FOTOS_FOLDER_ID;
  if (!folderId || folderId === 'TU_CARPETA_DRIVE_ID_AQUI') {
    return { error: 'DRIVE_FOTOS_FOLDER_ID no configurado en Config.gs' };
  }
  try {
    var base64 = String(body.foto_base64 || '');
    var comma = base64.indexOf(',');
    if (base64.indexOf('data:') === 0 && comma !== -1) base64 = base64.substring(comma + 1);
    base64 = base64.replace(/\s+/g, '');
    if (!base64) return { error: 'Falta foto_base64' };

    var maxBytes = Number(CONFIG.MAX_UPLOAD_BYTES || (5 * 1024 * 1024));
    if (_uploadBytesApprox(base64) > maxBytes) return { error: 'Archivo demasiado grande (máx. ' + Math.round(maxBytes / 1024 / 1024) + ' MB)' };

    var mimeType = String(body.mime_type || 'image/jpeg').toLowerCase();
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.indexOf(mimeType) === -1) return { error: 'Tipo de imagen no permitido' };

    var ext = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : (mimeType === 'image/gif' ? '.gif' : '.jpg'));
    var nombre = _safeUploadName(body.nombre, ext);

    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nombre);
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      fileId: file.getId(),
      nombre: nombre,
      webViewLink: file.getUrl(),
      webContentLink: 'https://drive.google.com/uc?id=' + file.getId() + '&export=download'
    };
  } catch (err) {
    Logger.log('uploadFotoAnimal error: ' + err.message);
    return { error: 'Error subiendo a Drive: ' + err.message };
  }
}

// Carpeta donde aterriza cada subida. `tipo` llega del front:
//  - 'factura' -> carpeta propia (DRIVE_FACTURAS_FOLDER_ID) o, si no esta
//    configurada, una subcarpeta «Facturas» dentro de la de documentos.
//  - cualquier otro -> carpeta de documentos de animales.
function carpetaDestino(tipo) {
  var docsId = CONFIG.DRIVE_DOCS_FOLDER_ID;
  if (!docsId && !CONFIG.DRIVE_FACTURAS_FOLDER_ID) return null;
  if (String(tipo || '') === 'factura') {
    if (CONFIG.DRIVE_FACTURAS_FOLDER_ID) return DriveApp.getFolderById(CONFIG.DRIVE_FACTURAS_FOLDER_ID);
    var raiz = DriveApp.getFolderById(docsId);
    var propia = raiz.getFoldersByName('Facturas');
    return propia.hasNext() ? propia.next() : raiz.createFolder('Facturas');
  }
  return DriveApp.getFolderById(docsId);
}

function uploadDocumento(body, user) {
  var folder = carpetaDestino(body.tipo);
  if (!folder) {
    return { error: 'DRIVE_DOCS_FOLDER_ID no configurado en Config.gs' };
  }
  try {
    var base64 = String(body.archivo_base64 || body.foto_base64 || '');
    var comma = base64.indexOf(',');
    if (base64.indexOf('data:') === 0 && comma !== -1) base64 = base64.substring(comma + 1);
    base64 = base64.replace(/\s+/g, '');
    if (!base64) return { error: 'Falta archivo_base64' };

    var maxBytes = Number(CONFIG.MAX_UPLOAD_BYTES || (5 * 1024 * 1024));
    if (_uploadBytesApprox(base64) > maxBytes) return { error: 'Archivo demasiado grande (máx. ' + Math.round(maxBytes / 1024 / 1024) + ' MB)' };

    var mimeType = String(body.mime_type || 'application/pdf').toLowerCase();
    var isPdf = mimeType.indexOf('application/pdf') === 0;
    var isImg = mimeType.indexOf('image/') === 0;
    var isVideo = mimeType.indexOf('video/') === 0;
    if (!isPdf && !isImg && !isVideo) {
      return { error: 'Tipo no permitido (solo PDF, imagen o video)' };
    }

    var ext = '.bin';
    if (isPdf) ext = '.pdf';
    else if (isImg) ext = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : (mimeType === 'image/gif' ? '.gif' : '.jpg'));
    else if (isVideo) ext = mimeType.indexOf('webm') !== -1 ? '.webm' : '.mp4';

    var nombre = _safeUploadName(body.nombre, ext);
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nombre);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      fileId: file.getId(),
      nombre: nombre,
      webViewLink: file.getUrl(),
      webContentLink: 'https://drive.google.com/uc?id=' + file.getId() + '&export=download'
    };
  } catch (err) {
    Logger.log('uploadDocumento error: ' + err.message);
    return { error: 'Error subiendo a Drive: ' + err.message };
  }
}

function deleteDocumentoCaso(recordId) {
  var rows = readSheet(CONFIG.sheets.documentos);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(recordId)) { target = rows[i]; break; }
  }
  if (target && target.file_id) {
    try { DriveApp.getFileById(target.file_id).setTrashed(true); } catch (err) {}
  }
  return deleteSheetRow(CONFIG.sheets.documentos, recordId);
}
