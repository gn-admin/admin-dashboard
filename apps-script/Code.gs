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
    // D5: verificación reCAPTCHA previa al login (público, sin token Firebase).
    if (method === 'POST' && endpoint === 'login-recaptcha') {
      return handleLoginRecaptcha(e);
    }


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
    var allow = { 'donaciones':1, 'gastos':1, 'apadrinamientos':1, 'inventario':1, 'actividad':1, 'user-profile':1, 'surveys':1, 'responses':1, 'animales':1, 'adopciones':1, 'socios':1, 'documento-archivo':1 };
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

function handleLoginRecaptcha(e) {
  try {
    var body = {};
    try {
      if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    } catch (parseErr) { body = {}; }
    var token = (e && e.parameter && (e.parameter.recaptcha_token || e.parameter.token)) || body.recaptcha_token || body.token || '';
    var action = (e && e.parameter && (e.parameter.recaptcha_action || e.parameter.action)) || body.recaptcha_action || body.action || 'login';
    var v = verificarRecaptchaV3(token, action || 'login');
    if (!v.ok) {
      try { Logger.log('login-recaptcha rechazado: ' + (v.motivo || 'unknown')); } catch (logErr) {}
      return jsonResponse({ status: 'error', error: 'No se pudo verificar la solicitud. Inténtalo de nuevo.' }, 403);
    }
    return jsonResponse({ status: 'success', ok: true });
  } catch (err) {
    return jsonResponse({ status: 'error', error: 'No se pudo verificar la solicitud. Inténtalo de nuevo.' }, 500);
  }
}

function _audit(endpoint, user, body, result) {
  try {
    var r = result;
    if (r && typeof r.getContent === 'function') {
      try { r = JSON.parse(r.getContent()); } catch (e) { r = null; }
    }
    var ok = r && r.status !== 'error' && !r.error;
    if (!ok) return;
    var sensitive = {
      'delete-animal':1,'delete-familia':1,'delete-adopcion':1,'delete-socio':1,'delete-blacklist':1,'delete-contrato':1,
      'delete-documento':1,'delete-acogida':1,'delete-candidatura':1,'delete-apadrinamiento':1,'delete-gasto':1,'delete-donacion':1,
      'delete-seguimiento':1,'delete-recordatorio':1,'delete-inventario':1,'delete-grupo':1,'delete-historial-fase-adopcion':1,
      'upload-foto-animal':1,'upload-documento':1,'upload-contrato-pdf':1,'send-contrato-email':1,'blacklist':1,'update-blacklist':1,
      'contratos':1,'update-contrato':1,'adopciones':1,'update-adopcion':1,'acogidas':1,'update-acogida':1,
      'socios':1,'update-socio':1,'web-media-subir':1,'web-media-eliminar':1,'web-deploy':1
    };
    if (!sensitive[endpoint]) return;
    var id = (body && (body.id || body.contrato_id || body.response_id)) || '';
    registrarAuditoria(endpoint.indexOf('delete') === 0 ? 'delete' : (endpoint.indexOf('update') === 0 ? 'update' : 'write'), endpoint, String(id), user, null);
  } catch (e) {}
}

function handleGet(endpoint, user, e) {
  if (!_canReadEndpoint(endpoint, user)) return _deny('No autorizado para consultar este recurso');
  switch (endpoint) {
    case 'email-status':
      // Diagnóstico sin enviar nada: estado OAuth de la cuenta que ejecuta el
      // despliegue y modo de pruebas activo.
      if (!_isAdmin(user)) return _deny('Solo administración puede comprobar el correo');
      return jsonResponse({ data: _estadoCorreoServidor_() });
    case 'contrato-pdf-preview': {
      // Solo administración: genera el PDF sin enviarlo, para revisar su texto.
      if (!_isAdmin(user)) return _deny('Solo administración puede generar el PDF');
      var idCtr = e && e.parameter ? e.parameter.id : '';
      if (!idCtr) return jsonResponse({ error: 'Falta id' }, 400);
      var filasCtr = readSheet(CONFIG.sheets.contratos);
      var ctr = null;
      for (var ic = 0; ic < filasCtr.length; ic++) {
        if (String(filasCtr[ic].id) === String(idCtr)) { ctr = filasCtr[ic]; break; }
      }
      if (!ctr) return jsonResponse({ error: 'Contrato no encontrado' }, 404);
      var pdfPreview = generarPdfContrato(ctr);
      if (!pdfPreview) return jsonResponse({ error: 'No se pudo generar el PDF' }, 500);
      var bytesPreview = pdfPreview.getBytes();
      return jsonResponse({ data: {
        pdf_base64: Utilities.base64Encode(bytesPreview),
        pdf_bytes: bytesPreview.length,
        nombre: pdfPreview.getName()
      } });
    }
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
    case 'documento-archivo': return handleDocumentoArchivo(e, user);
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
    case 'web-grupos':
      if (e.parameter.id) return jsonResponse(webGetGrupo(e.parameter.id));
      return jsonResponse(webListarGrupos({
        q: e.parameter.q,
        estado_publicacion: e.parameter.estado_publicacion,
        todos: e.parameter.todos
      }));
    case 'web-grupos-preview':
      return jsonResponse(webPreviewGrupo(e.parameter.id));
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
    case 'upload-contrato-pdf': {
      var _r = jsonResponse({ data: uploadContratoPdf(body, user) }); _audit(endpoint,user,body,_r); return _r; }
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
      var _r = jsonResponse({ success: deleteContratoCascade(body.id) }); _audit(endpoint,user,body,_r); return _r; }
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
      if (body && body.accion === 'retirar') return jsonResponse(_webAnotarDeploy(webArchivarAnimal(body, user)));
      if (body && body.accion === 'restaurar') return jsonResponse(_webAnotarDeploy(webRestaurarAnimal(body, user), true));
      return jsonResponse(_webAnotarDeploy(webUpsertAnimal(body, user)));
    case 'web-animales-estado':
      return jsonResponse(_webAnotarDeploy(webEstadoAnimal(body, user)));
    case 'web-grupos':
      if (body && body.accion === 'eliminar') return jsonResponse(webEliminarGrupo(body, user));
      if (body && body.accion === 'retirar') return jsonResponse(_webAnotarDeploy(webArchivarGrupo(body, user)));
      if (body && body.accion === 'restaurar') return jsonResponse(_webAnotarDeploy(webRestaurarGrupo(body, user), true));
      return jsonResponse(_webAnotarDeploy(webUpsertGrupo(body, user)));
    case 'web-grupos-estado':
      return jsonResponse(_webAnotarDeploy(webEstadoGrupoPub(body, user)));
    case 'web-eventos':
      if (body && body.accion === 'archivar')       return jsonResponse(_webAnotarDeploy(webArchivarEvento(body, user)));
      if (body && body.accion === 'restaurar')       return jsonResponse(_webAnotarDeploy(webRestaurarEvento(body, user), true));
      return jsonResponse(_webAnotarDeploy(webUpsertEvento(body, user)));
    case 'web-eventos-estado':
      return jsonResponse(_webAnotarDeploy(webEstadoEvento(body, user)));
    case 'web-media-subir': {
      var _rm = jsonResponse(webSubirMedia(body)); _audit(endpoint, user, body, _rm); return _rm;
    }
    case 'web-media-eliminar': {
      var _rx = jsonResponse(webEliminarMedia(body)); _audit(endpoint, user, body, _rx); return _rx;
    }
    case 'web-deploy': {
      var _rd = jsonResponse(webDispararDeploy('manual', { forzar: true })); _audit(endpoint, user, body, _rd); return _rd;
    }
    case 'web-deploy-estado':
      return jsonResponse(webDeployEstado());
    case 'web-deploy-cuerpo': {
      // Diagnóstico: qué cuerpo responde de verdad (no lo que creemos tener).
      // Vive en el router porque este archivo sí es el que atiende el panel.
      var _src = '';
      try { _src = String(webEstadoEvento); } catch (err) { _src = ''; }
      return jsonResponse({ status: 'success', data: {
        version: typeof WEB_DEPLOY_VERSION === 'undefined' ? null : WEB_DEPLOY_VERSION,
        estado_evento_cola: _src.slice(-200),
        construir_con_saneado: String(webConstruirPublicacion).indexOf('webSanearHtml') !== -1
      } });
    }
    default:
      return jsonResponse({ error: 'Endpoint no encontrado' }, 404);
  }
}

// Único punto de disparo del deploy: todo endpoint web que cambia lo que se
// publica pasa por aquí. El estado que decide es el de la respuesta (el que
// ha quedado guardado), no el que manda el cliente.
// Con `borrador` no hay nada público que regenerar y no se llama a GitHub,
// salvo que la acción lo pida (`forzar`, p. ej. restaurar quita la lápida).
function _webAnotarDeploy(respuesta, forzar) {
  if (!respuesta || respuesta.status !== 'success') return respuesta;
  var estado = String((respuesta.data && respuesta.data.estado_publicacion) || '').toLowerCase();
  // Solo publicar, ocultar y retirar cambian las páginas estáticas. Se lista
  // aquí (y no en WebPublicaciones.gs) para no depender de un cuerpo antiguo.
  if (!forzar && ['publicado', 'oculto', 'retirado'].indexOf(estado) === -1) return respuesta;
  respuesta.data = respuesta.data || {};
  try {
    respuesta.data.deploy = webDispararDeploy('estado');
  } catch (err) {
    respuesta.data.deploy = { ok: false, disparado: false, error: 'No se pudo disparar el deploy: ' + ((err && err.message) || err) };
  }
  return respuesta;
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

// Normaliza una direccion de correo recibida del cliente o de la hoja.
// Devuelve '' si no es una direccion con forma valida (evita inyeccion de
// cabeceras: nunca se permiten saltos de linea ni comas dentro de un email).
function _emailLimpio(v) {
  var e = String(v == null ? '' : v).trim().replace(/[\r\n]/g, '');
  if (!e || e.indexOf(',') !== -1 || e.indexOf(';') !== -1) return '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return '';
  return e;
}

// Envio del contrato firmado por email.
//
// Regla de destinatarios (por seguridad y para clasificar los contratos):
//   To: adoptante (firmante 1 del contrato)
//   CC: tutor / persona de apoyo (firmante 2, si existe) y el buzon fijo de
//       contratos (CONFIG.CONTRATOS_CC_EMAIL o, si no esta definido,
//       CONFIG.CONTACT_EMAIL).
//   From: la cuenta propietaria del despliegue de Apps Script. Si se
//       configura CONFIG.CONTRATO_FROM_EMAIL con un alias verificado en
//       Gmail ("Enviar como"), se usa ese remitente; si Google lo rechaza,
//       se reenvia sin `from` para no perder el correo.
//
// Nunca se aceptan direcciones arbitrarias: solo emails del propio contrato,
// el buzon de la entidad y el usuario autenticado.
/**
 * Modo pruebas de correo. Con la propiedad de script `EMAIL_MODO_PRUEBAS=1`
 * todos los envíos salen solo a `EMAIL_PRUEBAS_TO`; sin ella, a sus
 * destinatarios reales. Si el modo está activo pero falta la dirección de
 * pruebas, se falla en cerrado (nunca se manda a un adoptante real por error).
 */
function _modoPruebasCorreo() {
  if (typeof PropertiesService === 'undefined') return null;
  var props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('EMAIL_MODO_PRUEBAS') || '').trim() !== '1') return null;
  var destino = _emailLimpio(props.getProperty('EMAIL_PRUEBAS_TO'));
  if (!destino) throw new Error('EMAIL_MODO_PRUEBAS=1 pero EMAIL_PRUEBAS_TO no es una dirección válida: no se envía nada');
  return destino;
}

/**
 * Estado del permiso de correo para el panel, sin enviar ningún mensaje.
 * `ScriptApp.getAuthorizationInfo` refleja la cuenta efectiva del despliegue:
 * si la web se ejecuta como el usuario que accede y este no autorizó
 * script.send_mail, aquí sale REQUIRED y el panel avisa antes de intentar nada.
 */
function _estadoCorreoServidor_() {
  var out = { autorizado: false, estado: 'DESCONOCIDO', detalle: '', modo_pruebas: false, pruebas_a: '', modo_pruebas_error: '', pdf_soporte: true };
  try {
    var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    var estado = info.getAuthorizationStatus();
    out.estado = String(estado || 'DESCONOCIDO');
    var noRequerida = (ScriptApp.AuthorizationStatus && ScriptApp.AuthorizationStatus.NOT_REQUIRED);
    out.autorizado = estado === noRequerida || out.estado === 'NOT_REQUIRED';
    if (!out.autorizado) {
      out.detalle = 'La cuenta que ejecuta el script no tiene todos los permisos necesarios (envío de correo y/o generación de PDF).';
      try {
        var url = info.getAuthorizationUrl();
        if (url) out.detalle += ' Autoriza aquí: ' + url;
      } catch (eUrl) {}
    }
  } catch (e) {
    out.estado = 'ERROR';
    out.detalle = 'No se pudo comprobar la autorización: ' + (e && e.message ? e.message : e);
  }
  try {
    var prueba = _modoPruebasCorreo();
    out.modo_pruebas = !!prueba;
    out.pruebas_a = prueba || '';
  } catch (ePrueba) {
    out.modo_pruebas_error = String(ePrueba && ePrueba.message ? ePrueba.message : ePrueba);
  }
  return out;
}

/** Devuelve las opciones de envío ya redirigidas al buzón de pruebas. */
function _conModoPruebasCorreo(opciones) {
  var prueba = _modoPruebasCorreo();
  if (!prueba) return { opciones: opciones, prueba: false };
  var originales = [];
  ['to', 'cc', 'bcc'].forEach(function (campo) {
    String(opciones[campo] || '').split(',').forEach(function (v) {
      var limpio = String(v || '').trim();
      if (limpio && originales.indexOf(limpio) === -1) originales.push(limpio);
    });
  });
  var copia = {};
  for (var k in opciones) if (Object.prototype.hasOwnProperty.call(opciones, k)) copia[k] = opciones[k];
  var nota = 'MODO PRUEBAS: este correo iba dirigido a ' + (originales.join(', ') || '(sin destinatarios)') +
    '. El envío real se hará cuando se quite EMAIL_MODO_PRUEBAS.';
  copia.to = prueba;
  delete copia.cc;
  delete copia.bcc;
  copia.subject = '[PRUEBA] ' + String(opciones.subject || '');
  if (opciones.htmlBody) {
    copia.htmlBody = '<div style="font:600 13px/1.4 Arial,sans-serif;background:#FFF4D6;color:#5C3B00;padding:10px 14px;border-radius:8px;margin:0 0 14px">' +
      _escEmail(nota) + '</div>' + String(opciones.htmlBody);
  }
  var texto = opciones.body ? String(opciones.body) : '';
  copia.body = nota + (texto ? '\n\n' + texto : '');
  if (!copia.htmlBody) delete copia.htmlBody;
  return { opciones: copia, prueba: true, originales: originales };
}

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
    var v = _emailLimpio(e);
    if (v && permitidos.indexOf(v) === -1) permitidos.push(v);
  };
  addPerm(c.f1_email);
  addPerm(c.f2_email);
  addPerm(CONFIG.CONTACT_EMAIL);
  addPerm(CONFIG.CONTRATOS_CC_EMAIL);
  if (user && user.email) addPerm(user.email);

  var adoptante = _emailLimpio(c.f1_email);
  var ccFijo = _emailLimpio(CONFIG.CONTRATOS_CC_EMAIL || CONFIG.CONTACT_EMAIL);

  // Destinatarios elegidos en el modal del panel (checkbox). Se validan
  // contra la lista permitida; lo que no pertenezca al contrato se ignora.
  var pedidos = (body && body.to) || [];
  if (!Array.isArray(pedidos)) pedidos = [pedidos];
  var elegidos = [];
  for (var j = 0; j < pedidos.length; j++) {
    var e = _emailLimpio(pedidos[j]);
    if (!e || elegidos.indexOf(e) !== -1) continue;
    if (permitidos.indexOf(e) === -1) continue;
    elegidos.push(e);
  }
  // Si el cliente no manda destinatarios, se envia al adoptante (si lo hay).
  if (!elegidos.length && adoptante && permitidos.indexOf(adoptante) !== -1) elegidos.push(adoptante);
  if (!elegidos.length) return { status: 'warning', error: 'No hay destinatarios validos para este contrato' };

  // To: el adoptante cuando este entre los elegidos; si no, el primero pedido.
  var to = [];
  if (adoptante && elegidos.indexOf(adoptante) !== -1) to.push(adoptante);
  else to.push(elegidos[0]);

  // CC: el resto de elegidos (normalmente el tutor) + el buzon de contratos,
  // que va siempre en copia para poder clasificar los contratos en la entidad.
  var cc = [];
  var addCc = function (email) {
    var v = _emailLimpio(email);
    if (!v) return;
    if (to.indexOf(v) !== -1 || cc.indexOf(v) !== -1) return;
    if (permitidos.indexOf(v) === -1) return;
    cc.push(v);
  };
  for (var k = 0; k < elegidos.length; k++) addCc(elegidos[k]);
  addCc(ccFijo);

  var asunto = 'Contrato de adopcion y terminos · ' + (c.animal || 'Grupo Nebak');
  // El contrato viaja como PDF adjunto (contrato + estipulaciones). Así el
  // correo no depende de imágenes remotas ni de que el cliente renderice CSS.
  var pdfContrato = null;
  var pdfError = '';
  try {
    if (typeof generarPdfContrato === 'function') pdfContrato = generarPdfContrato(c);
  } catch (errPdf) {
    pdfError = errPdf && errPdf.message ? errPdf.message : String(errPdf);
    Logger.log('Contrato ' + c.id + ': no se pudo generar el PDF (' + pdfError + '); se envía el HTML.');
  }
  var opciones = {
    to: to.join(','),
    subject: asunto,
    htmlBody: pdfContrato ? construirPortadaContrato(c) : construirEmailContrato(c),
    name: 'Grupo Nebak',
    replyTo: _emailLimpio(CONFIG.CONTACT_EMAIL) || (user && user.email) || undefined
  };
  if (pdfContrato) opciones.attachments = [pdfContrato];
  if (cc.length) opciones.cc = cc.join(',');
  var from = _emailLimpio(CONFIG.CONTRATO_FROM_EMAIL);
  if (from) opciones.from = from;

  // En modo pruebas solo sale al buzón de pruebas; el destinatario real queda
  // escrito dentro del correo y en la respuesta.
  var envio = _conModoPruebasCorreo(opciones);
  try {
    MailApp.sendEmail(envio.opciones);
  } catch (err) {
    if (!envio.opciones.from) throw err;
    // El alias no esta verificado en la cuenta: se envia igualmente desde la
    // cuenta del despliegue (sin `from`) y se deja constancia en el log.
    Logger.log('Contrato: remitente ' + envio.opciones.from + ' rechazado (' + err.message + '); se envia sin alias.');
    delete envio.opciones.from;
    MailApp.sendEmail(envio.opciones);
  }
  return {
    status: 'success',
    data: {
      to: to, cc: cc,
      modo_pruebas: envio.prueba,
      enviado_a: envio.prueba ? [envio.opciones.to] : to,
      destinatarios_reales: envio.prueba ? envio.originales : undefined,
      pdf_adjunto: !!pdfContrato,
      pdf_bytes: pdfContrato ? pdfContrato.getBytes().length : 0,
      pdf_error: pdfError || undefined
    }
  };
}

// === CONTRATO_TEXTOS_PDF:INICIO ===
var CONTRATO_TEXTOS_PDF = {
  "version": "2.1",
  "fecha": "2026/11/18",
  "titulo": "Contrato de adopción",
  "notaEstipulaciones": "Se adjunta hoja de estipulaciones revisada y firmada por el adoptante.",
  "estipulaciones": [
    {
      "n": 1,
      "parrafos": [
        "El Adoptante se compromete a adoptar al animal de la Asociación con los datos que se reseñan a continuación, hasta que dicho animal muera."
      ]
    },
    {
      "n": 2,
      "parrafos": [
        "El Adoptante declara adoptar al animal única y exclusivamente como animal de compañía."
      ]
    },
    {
      "n": 3,
      "parrafos": [
        "El animal entregado en adopción no podrá ser utilizado para:"
      ],
      "lista": [
        "Caza de cualquier tipo y circunstancia.",
        "Experimentación de cualquier tipo.",
        "La participación en peleas o enfrentamientos con otros animales.",
        "La cría.",
        "Guarda de propiedades.",
        "Estancia en fincas o chalets de fin de semana.",
        "Circos u otro tipo de espectáculos.",
        "Participación en películas o series de televisión.",
        "Perro policía o fines militares."
      ]
    },
    {
      "n": 4,
      "parrafos": [
        "En ningún caso podrá el animal permanecer atado ni encerrado en jaulas, habitaciones, terrazas, patios o garajes."
      ]
    },
    {
      "n": 5,
      "parrafos": [
        "En caso de que el animal tenga la consideración de Perro Potencialmente Peligroso, el Adoptante, que acredita hallarse en posesión de la licencia correspondiente mediante exhibición de la misma, incorporando a este contrato fotocopia de dicha licencia, póliza del contrato de seguro de responsabilidad civil exigido por la normativa vigente, y el justificante de su inscripción en el Registro Municipal competente, se compromete a cumplir todas las medidas de seguridad exigidas por dicha normativa, tales como pasear al animal con bozal y correa no extensible en los sitios públicos."
      ]
    },
    {
      "n": 6,
      "parrafos": [
        "En ningún caso podrá permanecer en lugar donde no pueda resguardarse de la lluvia, del frío o del sol, o sin espacio suficiente para el normal desarrollo de su especie."
      ]
    },
    {
      "n": 7,
      "parrafos": [
        "En ningún caso se podrá someter al animal a cualquier tratamiento indebido y contrario a las disposiciones de la Ley de Protección Animal, su normativa de desarrollo y Código Penal."
      ]
    },
    {
      "n": 8,
      "parrafos": [
        "El Adoptante se compromete por el presente contrato a proporcionar al animal alimentación y bebida suficiente y adecuada, los cuidados de higiene necesarios, la debida asistencia veterinaria, cuidarlo y respetarlo."
      ]
    },
    {
      "n": 9,
      "parrafos": [
        "(Solamente en el caso de que el animal adoptado sea un gato). El Adoptante se compromete por el presente contrato a esterilizarlo en la fecha adecuada. El Adoptante deberá aportar a la Asociación un informe veterinario que acredite haberse realizado dicha esterilización, informe que ha de estar debidamente sellado, firmado, con n.º de colegiado y con identificación del animal."
      ]
    },
    {
      "n": 10,
      "parrafos": [
        "El Adoptante se compromete por el presente contrato a proporcionar al animal compañía, a tenerle consigo, proporcionarle afecto y atenciones, y permitirle hacer el ejercicio necesario (en su caso sacándolo a pasear a la calle todos los días)."
      ]
    },
    {
      "n": 11,
      "parrafos": [
        "Asimismo se compromete a no regalar, vender o ceder por cualquier título, inter vivos o mortis causa, al animal; igualmente se compromete a no abandonar al animal.",
        "En caso de fallecimiento del Adoptante, se deberá notificar a la Asociación. Si un familiar o pareja quisiera quedarse con el animal, deberá notificarlo a la Asociación y así asumiría de nuevo la adopción del animal con un nuevo contrato de adopción.",
        "Si las personas señaladas en el párrafo anterior no desean quedarse con el animal, se notificará a la Asociación para que esta le encuentre un nuevo hogar."
      ]
    },
    {
      "n": 12,
      "parrafos": [
        "La desaparición del animal, por robo, pérdida, extravío o por cualquier otra causa, debe ser notificada a la Asociación lo antes posible."
      ]
    },
    {
      "n": 13,
      "parrafos": [
        "El Adoptante se compromete a informar de inmediato a la Asociación si se produjese un cambio de teléfono, domicilio o cualquier otra circunstancia que impidiese o dificultase su localización y posterior seguimiento."
      ]
    },
    {
      "n": 14,
      "parrafos": [
        "Ante cualquier circunstancia que produjese imposibilidad de mantener o tener consigo al animal, imposibilidad de cumplir los términos del presente contrato, o deseo de rescindir el mismo, el Adoptante debe devolver el animal adoptado a la Asociación sin posibilidad de reclamar los gastos que este le haya ocasionado."
      ]
    },
    {
      "n": 15,
      "parrafos": [
        "El Adoptante declara en este acto que asume la obligación de permitir en cualquier momento a la persona designada por la Asociación que revise el estado físico y psíquico del animal, así como el cumplimiento de las condiciones del presente contrato y de la adopción en general. Dicho representante llamará por teléfono o se personará en el domicilio sin previo aviso."
      ]
    },
    {
      "n": 16,
      "parrafos": [
        "El incumplimiento notorio y fehaciente de cualquiera de las obligaciones anteriormente descritas y asumidas por el Adoptante en virtud del presente contrato supondrá la resolución de pleno derecho del mismo. Al darse a dicho incumplimiento el carácter de condición resolutoria expresamente aceptada por las partes, la Asociación queda legitimada para decidir unilateralmente retirar al Adoptante, de inmediato, la custodia del animal, recobrando automáticamente la Asociación la posesión del mismo. Asimismo, la Asociación se reserva el ejercicio de las acciones legales que le asistan en cada caso.",
        "Cualquier sospecha que tenga la Asociación de incumplimiento por el Adoptante de cualquiera de las obligaciones dimanantes del presente contrato facultará a la primera para decidir unilateralmente requisarlo de modo temporal mientras se comprueba, por el procedimiento previsto para cada caso, el cumplimiento o incumplimiento de las obligaciones asumidas, todo ello sin más trámite que la previa inspección ocular y personación en el domicilio del Adoptante para la retirada inmediata de la posesión del animal.",
        "Si existiesen indicios de que el animal ha sido víctima de malos tratos o tortura, se procederá a la inmediata interposición de la correspondiente denuncia por parte de la Asociación.",
        "Si se produjese la defunción del animal, esta debe ser notificada inmediatamente por burofax o cualquier otro medio que garantice fehacientemente la recepción de dicha comunicación a la Asociación en el plazo máximo de 12 horas desde el fallecimiento, decidiendo, en todo caso, la Asociación el destino del cuerpo del animal, así como la eventualidad de practicar autopsia para esclarecer las causas de la muerte. Si existiesen indicios de que ha existido dolo o negligencia por parte del Adoptante en relación con dicha desaparición, se procederá a la inmediata interposición de la correspondiente denuncia por parte de la Asociación, organización que dispone de asesoramiento jurídico por parte de abogados especializados en legislación animal."
      ]
    },
    {
      "n": 17,
      "parrafos": [
        "El Adoptante abona voluntariamente, en concepto de donación, la cantidad de {donacion} €. Esta cantidad va destinada a costear parte de los gastos veterinarios de los animales que recogemos.",
        "El importe de la cuota de adopción será destinado íntegramente a costear actividades dirigidas a la consecución del objeto social y finalidad de la Asociación."
      ]
    },
    {
      "n": 18,
      "parrafos": [
        "La cantidad que deberá abonar el Adoptante cuando el animal desaparezca o muera mediante dolo o negligencia por parte de dicho Adoptante asciende a {indemnizacion} €. Dicha cantidad será exigible judicialmente en los citados casos. Todo ello sin perjuicio del resto de acciones administrativas, civiles y/o penales que pudieren ser ejercidas por parte de la Asociación en relación con la desaparición o muerte del animal."
      ]
    },
    {
      "n": 19,
      "parrafos": [
        "Esterilización de perros, excepciones:"
      ],
      "lista": [
        "Justificación veterinaria: cuando la esterilización suponga un riesgo para la salud del animal (por ejemplo, patologías graves o contraindicación quirúrgica).",
        "Edad insuficiente: si el cachorro no ha alcanzado la edad mínima para la intervención."
      ]
    },
    {
      "n": 20,
      "parrafos": [
        "Ambas partes, tras manifestar su plena capacidad de obrar, prestan libre y voluntariamente su consentimiento al presente contrato, formado por tres folios a doble cara, aceptando expresamente todas y cada una de las condiciones y obligaciones dimanantes del mismo."
      ]
    }
  ],
  "anexo": {
    "titulo": "Anexo. Condiciones complementarias",
    "intro": "Estas condiciones completan las estipulaciones anteriores y forman parte del contrato que el Adoptante firma junto a la hoja de estipulaciones.",
    "clausulas": [
      {
        "titulo": "Periodo de prueba y devolución",
        "parrafos": [
          "Durante los quince días siguientes a la entrega, y como máximo hasta los treinta días, el Adoptante y la Asociación podrán resolver este contrato si la convivencia no resulta adecuada para el animal o para la familia.",
          "La devolución se comunicará a la Asociación con al menos 48 horas de antelación y el animal se entregará en las condiciones sanitarias en que se recibió. La donación no se devuelve: no es el precio del animal."
        ]
      },
      {
        "titulo": "Seguimiento de la adopción",
        "parrafos": [
          "La Asociación realizará un seguimiento al mes, a los tres, a los seis y a los doce meses de la entrega, por teléfono, mensajería o visita acordada. El Adoptante se compromete a responder y a facilitar una fotografía actual del animal."
        ]
      },
      {
        "titulo": "Microchip y registro",
        "parrafos": [
          "Mientras dure el periodo de prueba, el microchip del animal permanecerá a nombre de la Asociación. Confirmada la adopción, el Adoptante tramitará el cambio de titularidad en el registro autonómico y remitirá a la Asociación el justificante en el plazo de un mes."
        ]
      },
      {
        "titulo": "Protección de datos personales",
        "parrafos": [
          "Los datos personales del Adoptante y, en su caso, del tutor o de la persona responsable se tratan para formalizar y ejecutar este contrato, cumplir las obligaciones legales de la Asociación y realizar el seguimiento de la adopción. Se conservan mientras dure la relación y durante los plazos legales de conservación.",
          "El Adoptante puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a la dirección de contacto de la Asociación, y reclamar ante la Agencia Española de Protección de Datos. Los datos no se ceden a terceros salvo obligación legal."
        ]
      }
    ]
  },
  "clausula65": {
    "titulo": "Cláusula especial · adoptantes mayores de 65 años",
    "parrafos": [
      "En caso de fallecimiento del titular de la adopción, la persona designada como responsable en el presente contrato se compromete a asumir la custodia, cuidado y bienestar del animal adoptado, garantizando que se mantengan las condiciones adecuadas de alimentación, salud y alojamiento.",
      "El adoptante deberá indicar previamente, por escrito, el nombre completo, documento de identidad y datos de contacto de la persona que asumirá dicha responsabilidad. Asimismo, dicha persona estará obligada a informar a la entidad protectora en un plazo máximo de 48 horas desde el fallecimiento del adoptante y la asunción de la custodia, para coordinar cualquier seguimiento o apoyo necesario.",
      "En ausencia de designación expresa, la entidad protectora se reserva el derecho de recuperar al animal para asegurar su protección y reubicación."
    ],
    "campos": [
      "Nombre completo",
      "DNI/NIE",
      "Teléfono de contacto",
      "Correo electrónico",
      "Dirección"
    ],
    "nota": "Cláusula aplicable solo si el adoptante es mayor de 65 años. La firma de la persona responsable se recoge en el contrato."
  }
};
// === CONTRATO_TEXTOS_PDF:FIN ===

/**
 * PDF del contrato de adopción + hoja de estipulaciones, listo para adjuntar
 * a MailApp. No usa imágenes remotas: solo incrusta las firmas que ya viajan
 * en base64, para que el correo no tenga imágenes rotas.
 */
function generarPdfContrato(c) {
  if (typeof DocumentApp === 'undefined' || typeof DriveApp === 'undefined') return null;
  var T = (typeof CONTRATO_TEXTOS_PDF !== 'undefined' && CONTRATO_TEXTOS_PDF) ? CONTRATO_TEXTOS_PDF : { estipulaciones: [] };
  var doc = DocumentApp.create('Contrato-' + (c.animal || 'adopcion') + '-' + Date.now());
  var archivo = null;
  try {
    var body = doc.getBody();
    body.setMarginTop(38).setMarginBottom(38).setMarginLeft(50).setMarginRight(50);
    var estilo = {};
    estilo[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
    estilo[DocumentApp.Attribute.FONT_SIZE] = 10;
    body.setAttributes(estilo);

    var ent = _entidadContratoPdf_(c);
    var animal = _datosAnimalContratoPdf_(c);
    var importes = {
      donacion: _importeContratoPdf_(c.donacion_adoptante, 100),
      indemnizacion: _importeContratoPdf_(c.indemnizacion_importe, 900)
    };
    var tutor = _tutorContratoPdf_(c);
    var r65 = _responsable65ContratoPdf_(c);
    var fecha = _fechaContratoPdf_(c.fecha);
    var ciudad = c.ciudad || 'Irún';
    var baseWeb = String((CONFIG && CONFIG.PUBLIC_WEB_BASE_URL) || '').replace(/\/$/, '');

    var logo = _blobImagenPdf_(baseWeb + '/assets/icons/logo-nebak.jpg');
    if (logo) {
      try {
        var imgLogo = body.appendImage(logo);
        imgLogo.setWidth(56).setHeight(56);
      } catch (eLogo) {}
    }

    var titulo = body.appendParagraph('Contrato de adopción');
    titulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titulo.setForegroundColor('#0A431E');
    body.appendParagraph(ent.nombre + ' · Expediente ' + (c.adopcion_id || c.id || '')).setFontSize(9).setForegroundColor('#757575');
    body.appendHorizontalRule();

    body.appendParagraph('En ' + ciudad + ', a ' + fecha + '.').setSpacingAfter(6);
    body.appendParagraph('De una parte, ' + ent.nombre +
      (ent.cif ? ', con CIF ' + ent.cif : '') +
      (ent.domicilio ? ', con domicilio en ' + ent.domicilio : '') +
      (ent.telefono ? ', con teléfonos de contacto ' + ent.telefono : '') +
      ', en adelante, la Asociación.').setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
    body.appendParagraph('De otra parte, ' + (c.f1_nombre || c.adoptante || '[adoptante]') +
      ', mayor de edad, que actúa en su propio nombre y derecho, con DNI ' + (c.f1_dni || '—') +
      (c.f1_direccion ? ', con domicilio en ' + c.f1_direccion : '') +
      (c.f1_telefono ? ', teléfono ' + c.f1_telefono : '') +
      (c.f1_email ? ', y correo electrónico ' + c.f1_email : '') +
      ', en adelante, el Adoptante.').setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
    body.appendParagraph('Ambas partes acuerdan celebrar el presente contrato, de acuerdo con los siguientes datos de adopción.').setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);

    body.appendParagraph('Datos de adopción').setHeading(DocumentApp.ParagraphHeading.HEADING2).setForegroundColor('#15863D');
    var foto = _imagenAnimalContratoPdf_(animal.foto);
    if (foto) {
      try {
        var imgFoto = body.appendImage(foto);
        imgFoto.setWidth(100);
      } catch (eFoto) {}
    }
    _tablaDatosContratoPdf_(body, [
      ['Nombre', animal.nombre],
      ['Nombre definitivo', animal.nombre_definitivo],
      ['Especie', animal.especie],
      ['N.º microchip', animal.microchip],
      ['Raza', animal.raza],
      ['Sexo', animal.sexo],
      ['Fecha de nacimiento', _fechaContratoPdf_(animal.fecha_nacimiento)],
      ['Capa', animal.capa],
      ['Color', animal.color],
      ['Tamaño', animal.tamano],
      ['Esterilización', _siNoContratoPdf_(animal.esterilizada)],
      ['Otras reseñas', animal.descripcion]
    ]);
    if (T.notaEstipulaciones) body.appendParagraph(T.notaEstipulaciones).setFontSize(9).setForegroundColor('#4b5563');

    body.appendParagraph('Estipulaciones').setHeading(DocumentApp.ParagraphHeading.HEADING2).setForegroundColor('#15863D');
    (T.estipulaciones || []).forEach(function(est) {
      var x = _textoContratoPdf_(est, importes);
      (x.parrafos || []).forEach(function(texto, idx) {
        var p = body.appendParagraph('');
        var t = p.editAsText();
        if (idx === 0) {
          var num = String(est.n) + 'ª. ';
          t.appendText(num);
          t.setBold(0, num.length - 1, true);
        }
        t.appendText(String(texto));
        p.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
        p.setSpacingAfter(4);
      });
      (x.lista || []).forEach(function(item) {
        var li = body.appendListItem(String(item));
        li.setGlyphType(DocumentApp.GlyphType.BULLET);
        li.setSpacingAfter(1);
      });
    });

    if (tutor) {
      body.appendPageBreak();
      body.appendParagraph('Anexo I. Datos del tutor o persona de apoyo').setHeading(DocumentApp.ParagraphHeading.HEADING2).setForegroundColor('#15863D');
      _tablaDatosContratoPdf_(body, [
        ['Nombre', tutor.nombre],
        ['DNI', tutor.dni],
        ['Relación con el adoptante', tutor.relacion],
        ['Domicilio', tutor.direccion],
        ['Email', tutor.email],
        ['Teléfono', tutor.telefono]
      ]);
      body.appendParagraph('La persona tutora se compromete a asumir el cuidado del animal si el adoptante no pudiera hacerlo. Su firma es obligatoria y firma este contrato junto al adoptante.').setFontSize(9).setForegroundColor('#4b5563');
    }

    body.appendParagraph('').setSpacingBefore(10);
    _firmaContratoPdf_(body, 'Adoptante', c.f1_nombre || c.adoptante || '[adoptante]', c.f1_dni, c.f1_firma);
    if (tutor) _firmaContratoPdf_(body, 'Tutor / persona de apoyo', tutor.nombre, tutor.dni, tutor.firma);
    _firmaEntidadContratoPdf_(body, ent, c, baseWeb);

    if (r65) {
      var k65 = T.clausula65 || {};
      body.appendPageBreak();
      body.appendParagraph(k65.titulo || 'Cláusula especial · adoptantes mayores de 65 años').setHeading(DocumentApp.ParagraphHeading.HEADING2).setForegroundColor('#15863D');
      (k65.parrafos || []).forEach(function(texto) {
        body.appendParagraph(texto).setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
      });
      body.appendParagraph('Datos de la persona responsable designada').setHeading(DocumentApp.ParagraphHeading.HEADING2).setForegroundColor('#15863D');
      _tablaDatosContratoPdf_(body, [
        ['Nombre completo', r65.nombre],
        ['DNI/NIE', r65.dni],
        ['Teléfono de contacto', r65.telefono],
        ['Correo electrónico', r65.email],
        ['Dirección', r65.direccion]
      ]);
      body.appendParagraph('En ' + ciudad + ', a ' + fecha + '.');
      _firmaContratoPdf_(body, 'Adoptante', c.f1_nombre || c.adoptante || '[adoptante]', c.f1_dni, c.f1_firma);
      _firmaContratoPdf_(body, 'Firma de la persona responsable', r65.nombre, r65.dni, '');
    }

    body.appendParagraph('Generado por ' + ent.nombre + ' · ' + _fechaContratoPdf_(new Date())).setFontSize(8).setForegroundColor('#999999').setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    doc.saveAndClose();
    archivo = DriveApp.getFileById(doc.getId());
    var pdf = archivo.getAs('application/pdf');
    pdf.setName(nombrePdfContrato_(c));
    return pdf;
  } finally {
    try {
      if (!archivo) archivo = DriveApp.getFileById(doc.getId());
      if (archivo) archivo.setTrashed(true);
    } catch (eLimpieza) {}
  }
}

function _entidadContratoPdf_(c) {
  return {
    nombre: c.entidad_nombre || 'Asociación Grupo Nebak',
    cif: c.entidad_cif || '',
    domicilio: c.entidad_domicilio || '',
    email: c.entidad_email || CONFIG.CONTACT_EMAIL || '',
    telefono: c.entidad_telefono || '',
    registro: c.entidad_registro || ''
  };
}

function _datosAnimalContratoPdf_(c) {
  var a = null;
  try {
    if (c.animal_id && CONFIG.sheets && CONFIG.sheets.animales) {
      var filas = readSheet(CONFIG.sheets.animales);
      for (var i = 0; i < filas.length; i++) {
        if (String(filas[i].id) === String(c.animal_id)) { a = filas[i]; break; }
      }
    }
  } catch (eAnimal) {}
  var val = function(saved, live) {
    if (saved !== undefined && saved !== null && saved !== '') return saved;
    if (live !== undefined && live !== null && live !== '') return live;
    return '';
  };
  return {
    nombre: val(c.animal, a && a.nombre),
    nombre_definitivo: val(c.nombre_definitivo, a && a.nombre_definitivo),
    foto: val(c.animal_foto, a && a.foto),
    especie: val(c.especie, a && a.especie),
    raza: val(c.raza, a && a.raza),
    edad: val(c.edad, a && a.edad),
    sexo: val(c.animal_sexo, a && a.sexo),
    microchip: val(c.animal_microchip, a && a.microchip),
    fecha_nacimiento: val(c.animal_fecha_nacimiento, a && a.fecha_nacimiento),
    capa: val(c.animal_capa, a && a.capa),
    color: val(c.animal_color, a && a.color),
    tamano: val(c.animal_tamano, a && a.tamano),
    esterilizada: val(c.animal_esterilizada, a && a.esterilizada),
    descripcion: val(c.animal_descripcion, a && a.descripcion)
  };
}

function _tutorContratoPdf_(c) {
  var nombre = String(c.f2_nombre || '').trim();
  if (!nombre) return null;
  if (/entidad|asociaci[oó]n|grupo\s*nebak/i.test(String(c.f2_rol || '') + ' ' + nombre)) return null;
  return {
    nombre: nombre,
    dni: c.f2_dni || '',
    relacion: c.f2_relacion || c.f2_rol || '',
    direccion: c.f2_direccion || '',
    email: c.f2_email || '',
    telefono: c.f2_telefono || '',
    firma: c.f2_firma || ''
  };
}

function _responsable65ContratoPdf_(c) {
  var activo = /^(1|si|sí|true|on|x)$/i.test(String(c.adoptante_mayor_65 || '').trim());
  if (!activo && !String(c.responsable_nombre || '').trim()) return null;
  return {
    nombre: c.responsable_nombre || '',
    dni: c.responsable_dni || '',
    telefono: c.responsable_telefono || '',
    email: c.responsable_email || '',
    direccion: c.responsable_direccion || ''
  };
}

function _importeContratoPdf_(v, porDefecto) {
  var s = String(v == null ? '' : v).replace(',', '.').trim();
  if (!s) return porDefecto;
  var n = Number(s);
  return (!isNaN(n) && n >= 0) ? n : porDefecto;
}

function _fechaContratoPdf_(v) {
  if (v instanceof Date) {
    var d = v;
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  if (s) return s;
  var hoy = new Date();
  return ('0' + hoy.getDate()).slice(-2) + '/' + ('0' + (hoy.getMonth() + 1)).slice(-2) + '/' + hoy.getFullYear();
}

function _siNoContratoPdf_(v) {
  if (v === true || /^(si|sí|true|1)$/i.test(String(v))) return 'Sí';
  if (v === false || /^(no|false|0)$/i.test(String(v))) return 'No';
  return '—';
}

function _textoContratoPdf_(est, importes) {
  var rep = function(t) {
    return String(t == null ? '' : t)
      .replace(/\{donacion\}/g, importes.donacion)
      .replace(/\{indemnizacion\}/g, importes.indemnizacion);
  };
  var e = est || {};
  return {
    parrafos: (e.parrafos || []).map(rep),
    lista: (e.lista || []).map(rep)
  };
}

function _tablaDatosContratoPdf_(body, filas) {
  var tabla = body.appendTable();
  var negrita = {};
  negrita[DocumentApp.Attribute.BOLD] = true;
  (filas || []).forEach(function(fila) {
    var tr = tabla.appendTableRow();
    var celda = tr.appendTableCell(String(fila[0]));
    celda.setAttributes(negrita);
    celda.setWidth(135);
    tr.appendTableCell(String(fila[1] == null || fila[1] === '' ? '—' : fila[1]));
  });
  body.appendParagraph('');
}

function _firmaContratoPdf_(body, etiqueta, nombre, dni, firma) {
  body.appendParagraph(etiqueta).setFontSize(9).setForegroundColor('#757575');
  var blob = _firmaBlobPdf_(firma);
  if (blob) {
    try {
      var img = body.appendImage(blob);
      img.setWidth(150);
    } catch (eFirma) {
      body.appendParagraph('[Sin firma]').setFontSize(9).setForegroundColor('#999999');
    }
  } else {
    body.appendParagraph('[Sin firma]').setFontSize(9).setForegroundColor('#999999');
  }
  body.appendHorizontalRule();
  body.appendParagraph(String(nombre || '—') + (dni ? ' · DNI ' + dni : '')).setBold(true);
  body.appendParagraph('');
}

function _firmaEntidadContratoPdf_(body, ent, c, baseWeb) {
  body.appendParagraph('Firma Asociación').setFontSize(9).setForegroundColor('#757575');
  var firma = c.entidad_firma || (!_tutorContratoPdf_(c) ? c.f2_firma : '');
  var blob = _firmaBlobPdf_(firma);
  if (blob) {
    try {
      var img = body.appendImage(blob);
      img.setWidth(140);
    } catch (eFirmaEntidad) {}
  }
  var sello = _blobImagenPdf_(baseWeb + '/assets/contratos/sello-nebak.jpg');
  if (sello) {
    try {
      var imgSello = body.appendImage(sello);
      imgSello.setWidth(80).setHeight(80);
    } catch (eSello) {}
  }
  body.appendHorizontalRule();
  body.appendParagraph(ent.nombre).setBold(true);
  body.appendParagraph('');
}

function _imagenAnimalContratoPdf_(foto) {
  var s = String(foto || '');
  if (!s) return null;
  if (/^data:/i.test(s)) return _firmaBlobPdf_(s);
  if (/^https?:\/\//i.test(s)) return _blobImagenPdf_(s);
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return _blobImagenPdf_('https://drive.google.com/thumbnail?id=' + encodeURIComponent(s) + '&sz=w800');
  return null;
}


function nombrePdfContrato_(c) {
  var base = 'Contrato-Adopcion-' + (c.animal || 'Grupo-Nebak') + '-' + (c.fecha || Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'));
  return String(base).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') + '.pdf';
}

function _blobImagenPdf_(url) {
  var u = String(url || '');
  if (!/^https?:\/\//i.test(u) || typeof UrlFetchApp === 'undefined') return null;
  try {
    var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true });
    if (!r || r.getResponseCode() !== 200) return null;
    var b = r.getBlob();
    if (!b || b.getBytes().length > 2 * 1024 * 1024) return null;
    return b;
  } catch (e) {
    return null;
  }
}

function _firmaBlobPdf_(firma) {
  var s = String(firma || '');
  var m = /^data:([^;]+);base64,([\s\S]+)$/.exec(s);
  if (!m) return null;
  try {
    return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'firma');
  } catch (e) {
    return null;
  }
}

function _escEmail(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Portada breve del correo cuando el contrato va adjunto en PDF. Sin tablas
 * largas, sin términos duplicados y sin imágenes: el documento completo está
 * en el adjunto.
 */
function construirPortadaContrato(c) {
  var e = _escEmail;
  var ent = {
    nombre: c.entidad_nombre || 'Asociación Grupo Nebak',
    email: c.entidad_email || CONFIG.CONTACT_EMAIL || ''
  };
  var fila = function(label, value) {
    return '<tr><td style="padding:6px 0;color:#757575;width:110px">' + e(label) + '</td><td style="padding:6px 0;font-weight:600">' + e(value || '—') + '</td></tr>';
  };
  return '<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#191919">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px">' +
    '<div style="padding:20px;border-radius:12px 12px 0 0;background:linear-gradient(135deg,#0A431E,#15863D);color:#fff">' +
    '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85">' + e(ent.nombre) + '</div>' +
    '<h1 style="margin:6px 0 0;font-size:21px">Contrato de adopción de ' + e(c.animal || 'un animal') + '</h1>' +
    '</div>' +
    '<div style="padding:22px 20px;background:#fff;border:1px solid #e8eaed;border-top:0;border-radius:0 0 12px 12px">' +
    '<p style="margin:0 0 12px;font-size:15px">Hola' + (c.f1_nombre ? ' ' + e(c.f1_nombre) : '') + ',</p>' +
    '<p style="margin:0 0 14px;font-size:14px;line-height:1.6">Adjuntamos en PDF el contrato de adopción y la hoja de estipulaciones. El documento incluye las firmas y no necesita descargar nada más.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">' +
    fila('Animal', c.animal) + fila('Adoptante', c.f1_nombre) + fila('Fecha', c.fecha) + fila('Entidad', ent.nombre) +
    '</table>' +
    '<div style="padding:10px 12px;background:#eef7f1;border:1px solid #cfe8d8;border-radius:8px;font-size:13px;color:#0A431E"><b>PDF adjunto:</b> contrato de adopción y términos y condiciones.</div>' +
    '<p style="margin:16px 0 0;font-size:13px;color:#4b5563;line-height:1.6">Si no puedes abrir el adjunto, responde a este correo o escríbenos a ' + e(ent.email || 'Grupo Nebak') + '.</p>' +
    '<p style="margin:16px 0 0;font-size:13px">Un saludo,<br><b>' + e(ent.nombre) + '</b></p>' +
    '<p style="margin:18px 0 0;font-size:12px;color:#9aa0a6">Correo generado automáticamente. No compartas este documento con terceros.</p>' +
    '</div></div></body></html>';
}

function construirEmailContrato(c) {
  var e = _escEmail;
  // Sin imágenes remotas ni data: URI en el cuerpo (Gmail y otros clientes las
  // bloquean). Este HTML solo se usa si el PDF no se pudo generar.
  var firma1 = '<div style="margin-top:8px;color:#999;font-style:italic">[Firma registrada en el documento]</div>';
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

  // Apps Script no siempre expone la cabecera Origin (p. ej. llamadas desde
  // algunos clientes), por lo que el vacio se permite o no segun
  // ALLOW_ORIGIN_EMPTY. Con ALLOW_ORIGIN_EMPTY=false solo pasan origenes
  // exactos de ALLOWED_ORIGINS.
  if (!origin || origin === 'null' || origin === 'undefined') {
    var vacioPermitido = !(typeof CONFIG !== 'undefined' && CONFIG.ALLOW_ORIGIN_EMPTY === false);
    if (!vacioPermitido) Logger.log('Origen vacio rechazado (ALLOW_ORIGIN_EMPTY=false)');
    return vacioPermitido;
  }

  for (var i = 0; i < allowed.length; i++) {
    var a = String(allowed[i] || '').trim();
    if (!a) continue;
    if (a === origin) return true;
    // En desarrollo se acepta cualquier puerto local si hay alguno declarado.
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

/**
 * Galería y foto de entrega se comparten (se pintan en el panel y en la web);
 * documentos y facturas no: pueden llevar DNI, datos fiscales o justificantes
 * y un enlace `ANYONE_WITH_LINK` no caduca nunca.
 */
function _documentoCompartible(tipo) {
  var t = String(tipo || '').toLowerCase();
  return t.indexOf('galeria') === 0 || t === 'entrega';
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
    // El panel abre documentos y facturas con `GET documento-archivo`, que
    // valida token y rol; aquí no se comparten. Solo galería y entrega.
    var compartible = _documentoCompartible(body.tipo);
    if (compartible) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      fileId: file.getId(),
      nombre: nombre,
      compartido: compartible,
      webViewLink: compartible ? file.getUrl() : '',
      webContentLink: compartible ? ('https://drive.google.com/uc?id=' + file.getId() + '&export=download') : ''
    };
  } catch (err) {
    Logger.log('uploadDocumento error: ' + err.message);
    return { error: 'Error subiendo a Drive: ' + err.message };
  }
}

/**
 * Mantenimiento: ejecutar a mano UNA vez desde el editor de Apps Script tras
 * desplegar este `Code.gs`. Los documentos y facturas subidos antes de `v304`
 * se compartieron con `ANYONE_WITH_LINK`; esto les quita el enlace público.
 * No toca galería ni fotos de entrega (esas deben seguir compartidas).
 */
function revocarPermisosDocumentosPrivados() {
  var res = { documentos: 0, facturas: 0, errores: [] };
  var tareas = [
    { cfg: CONFIG.sheets.documentos, campo: 'file_id', clave: 'documentos' },
    { cfg: CONFIG.sheets.gastos, campo: 'factura_file_id', clave: 'facturas' }
  ];
  for (var t = 0; t < tareas.length; t++) {
    var filas = readSheet(tareas[t].cfg) || [];
    for (var i = 0; i < filas.length; i++) {
      var fileId = String(filas[i][tareas[t].campo] || '');
      if (!fileId) continue;
      try {
        DriveApp.getFileById(fileId).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        res[tareas[t].clave]++;
      } catch (e) {
        res.errores.push(fileId + ': ' + e.message);
      }
    }
  }
  Logger.log('revocarPermisosDocumentosPrivados: ' + JSON.stringify(res));
  return res;
}

/**
 * Sirve un archivo privado del panel: `documentos.file_id` (documento del
 * animal) o `gastos.factura_file_id` (factura). Exige sesión y el permiso de
 * lectura de la hoja de origen; el `file_id` nunca llega del cliente, se saca
 * de la fila, así que no se puede pedir un archivo arbitrario de Drive.
 */
function handleDocumentoArchivo(e, user) {
  var p = (e && e.parameter) || {};
  var origen = String(p.origen || '').toLowerCase();
  var id = String(p.id || '');
  if (!id) return jsonResponse({ status: 'error', error: 'Falta id' }, 400);
  var hoja, campo, permiso;
  if (origen === 'documento') { hoja = CONFIG.sheets.documentos; campo = 'file_id'; permiso = 'documentos'; }
  else if (origen === 'gasto') { hoja = CONFIG.sheets.gastos; campo = 'factura_file_id'; permiso = 'gastos'; }
  else return jsonResponse({ status: 'error', error: 'Origen no válido (documento o gasto)' }, 400);
  if (!_canReadEndpoint(permiso, user)) return _deny('No autorizado para este documento');
  var filas = readSheet(hoja) || [];
  var fila = null;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === id) { fila = filas[i]; break; }
  }
  if (!fila) return jsonResponse({ status: 'error', error: 'Registro no encontrado' }, 404);
  var fileId = String(fila[campo] || '');
  if (!fileId) return jsonResponse({ status: 'error', error: 'El registro no tiene archivo' }, 404);
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    return jsonResponse({ status: 'success', data: {
      nombre: file.getName(),
      mime: blob.getContentType() || 'application/octet-stream',
      base64: Utilities.base64Encode(blob.getBytes())
    } });
  } catch (err) {
    return jsonResponse({ status: 'error', error: 'No se pudo abrir el archivo: ' + err.message }, 500);
  }
}

// PDF escaneado del contrato firmado (D-C10). Va a una subcarpeta «Contratos»
// de los documentos y NO se comparte: lleva DNI y firmas, y `uploadDocumento`
// publica el fichero con enlace de cualquiera. Solo lo abre la cuenta titular.
function uploadContratoPdf(body, user) {
  var folderId = CONFIG.DRIVE_DOCS_FOLDER_ID;
  if (!folderId || folderId === 'TU_CARPETA_DRIVE_ID_AQUI') {
    return { error: 'DRIVE_DOCS_FOLDER_ID no configurado en Config.gs' };
  }
  try {
    var base64 = String((body && (body.archivo_base64 || body.pdf_base64)) || '');
    var comma = base64.indexOf(',');
    if (base64.indexOf('data:') === 0 && comma !== -1) base64 = base64.substring(comma + 1);
    base64 = base64.replace(/\s+/g, '');
    if (!base64) return { error: 'Falta archivo_base64' };

    var maxBytes = Number(CONFIG.MAX_CONTRATO_PDF_BYTES || (10 * 1024 * 1024));
    if (_uploadBytesApprox(base64) > maxBytes) {
      return { error: 'PDF demasiado grande (máx. ' + Math.round(maxBytes / 1024 / 1024) + ' MB)' };
    }

    var mimeType = String((body && body.mime_type) || 'application/pdf').toLowerCase();
    if (mimeType.indexOf('application/pdf') !== 0) return { error: 'El contrato firmado debe ser un PDF' };

    var nombre = _safeUploadName(body.nombre, '.pdf');
    var raiz = DriveApp.getFolderById(folderId);
    var sub = raiz.getFoldersByName('Contratos');
    var destino = sub.hasNext() ? sub.next() : raiz.createFolder('Contratos');
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nombre);
    var file = destino.createFile(blob);

    // Sin setSharing a proposito: el archivo queda privado.
    return {
      fileId: file.getId(),
      nombre: nombre,
      webViewLink: file.getUrl(),
      contrato_id: (body && body.contrato_id) || ''
    };
  } catch (err) {
    Logger.log('uploadContratoPdf error: ' + err.message);
    return { error: 'Error subiendo a Drive: ' + err.message };
  }
}

// Borrado de un contrato: la fila y, si existe, el PDF firmado privado de
// Drive. El PDF lleva DNI y firmas; si se borra el contrato no debe quedar
// accesible para siempre en la carpeta «Contratos».

/**
 * Manda un archivo de Drive a la papelera quitando antes el permiso público.
 * La papelera no revoca un enlace ANYONE_WITH_LINK, así que sin esto
 * «eliminar» deja el archivo descargable desde su URL. Nunca lanza: si el
 * archivo ya no existe o el permiso no se puede cambiar, el borrado de la
 * fila sigue adelante.
 */
function _driveArchivarPrivado(fileId) {
  if (!fileId) return false;
  try {
    var file = DriveApp.getFileById(String(fileId));
    try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (errPermiso) {}
    file.setTrashed(true);
    return true;
  } catch (err) {
    return false;
  }
}

function deleteContratoCascade(recordId) {
  var rows = readSheet(CONFIG.sheets.contratos);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(recordId)) { target = rows[i]; break; }
  }
  if (target && target.pdf_file_id) _driveArchivarPrivado(target.pdf_file_id);
  return deleteSheetRow(CONFIG.sheets.contratos, recordId);
}

function deleteDocumentoCaso(recordId) {
  var rows = readSheet(CONFIG.sheets.documentos);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(recordId)) { target = rows[i]; break; }
  }
  if (target && target.file_id) _driveArchivarPrivado(target.file_id);
  return deleteSheetRow(CONFIG.sheets.documentos, recordId);
}

// ==================== reCAPTCHA v3 (C4 forms/submit) ====================
// Secreto en Script Properties: RECAPTCHA_SECRET (nunca en repo/código).
function verificarRecaptchaV3(token, actionEsperada, remoteIp) {
  var secret = PropertiesService.getScriptProperties().getProperty('RECAPTCHA_SECRET');
  if (!secret) return { ok: false, motivo: 'config_missing_secret' };
  if (!token) return { ok: false, motivo: 'missing_token' };

  var payload = { secret: secret, response: String(token) };
  if (remoteIp) payload.remoteip = String(remoteIp);

  var resp;
  try {
    resp = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, motivo: 'verify_request_failed' };
  }

  var body = {};
  try { body = JSON.parse(resp.getContentText() || '{}'); } catch (e) {
    return { ok: false, motivo: 'verify_parse_failed' };
  }

  if (!body.success) return { ok: false, motivo: 'invalid', codes: body['error-codes'] || [] };
  if (actionEsperada && body.action !== actionEsperada) {
    return { ok: false, motivo: 'action_mismatch', action: body.action || '' };
  }

  var hostname = String(body.hostname || '');
  var hostOk = /(^|\.)github\.io$/i.test(hostname) || hostname === 'localhost';
  if (!hostOk) return { ok: false, motivo: 'hostname_mismatch', hostname: hostname };

  var score = typeof body.score === 'number' ? body.score : 0;
  var UMBRAL = 0.5; // inicial: ajustar con datos reales
  if (score < UMBRAL) return { ok: false, motivo: 'low_score', score: score };

  return { ok: true, score: score, action: body.action || '', hostname: hostname };
}
