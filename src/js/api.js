/**
 * Capa de API - Peticiones reales a Apps Script con JWT.
 */

const API = {
  async _fetch(url, opts) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      await new Promise(r => setTimeout(r, 800));
      return fetch(url, opts);
    }
  },

  // El backend responde siempre HTTP 200 y marca `status`: 'success' | 'warning'
  // | 'error'. Aqui se respeta: warning y error se lanzan con `err.status` para
  // que la UI pinte el snackbar gris neutro o rojo; success devuelve el dato.
  async _resultado(res) {
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}: ${res.statusText}`);
      e.status = 'error';
      throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (data == null) {
      const e = new Error('Respuesta no valida del servidor');
      e.status = 'error';
      throw e;
    }
    const st = data.status || (data.error ? 'error' : 'success');
    if (st === 'error' || st === 'warning') {
      const e = new Error(data.error || data.message || (st === 'warning' ? 'Aviso del servidor' : 'Error del servidor'));
      e.status = st;
      e.detail = data.detail || '';
      e.code = data.code;
      throw e;
    }
    return data;
  },

  _authHeaders(token) {
    // S2 (preparado): opt-in para Authorization header cuando el backend/GAS soporte preflight CORS.
    // Por defecto desactivado para evitar romper producción (preflight con headers no simples).
    if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.useAuthorizationHeader) {
      return { 'Authorization': 'Bearer ' + token };
    }
    return {};
  },

  // Compatibilidad: token en query (`?token=`). Si CONFIG.useAuthorizationHeader=true,
  // se añade también Authorization (requiere backend con preflight CORS correcto).
  async _get(endpoint, params = {}) {
    const token = await Auth.getIdToken();
    const qs = new URLSearchParams({ endpoint, ...params, token }).toString();
    const auth = this._authHeaders(token);
    const opts = Object.keys(auth).length ? { headers: auth } : undefined;
    const res = await this._fetch(`${CONFIG.apiUrl}?${qs}`, opts);
    return this._resultado(res);
  },

  async _post(endpoint, body = {}) {
    const token = await Auth.getIdToken();
    const auth = this._authHeaders(token);
    const res = await this._fetch(`${CONFIG.apiUrl}?endpoint=${endpoint}&token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', ...auth },
      body: JSON.stringify(body)
    });
    return this._resultado(res);
  },

  // Encuestas (RU)
  async getSurveys() { return this._get('surveys'); },
  async getResponses(surveyId) { return this._get('responses', { id: surveyId }); },
  async getUserProfile() { return this._get('user-profile'); },

  // Animales (CRUD)
  async getAnimales() { return this._get('animales'); },
  async createAnimal(data) { return this._post('animales', data); },
  async updateAnimal(id, data) { const r = await this._post('update-animal', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteAnimal(id) { return this._post('delete-animal', { id }); },

  // Familias acogedoras (CRUD)
  async getFamilias() { return this._get('familias'); },
  async createFamilia(data) { return this._post('familias', data); },
  async updateFamilia(id, data) { const r = await this._post('update-familia', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteFamilia(id) { return this._post('delete-familia', { id }); },

  // Adopciones (CRUD)
  async getAdopciones() { return this._get('adopciones'); },
  async createAdopcion(data) { return this._post('adopciones', data); },
  async updateAdopcion(id, data) { const r = await this._post('update-adopcion', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteAdopcion(id) { return this._post('delete-adopcion', { id }); },

  // Candidaturas (CRUD)
  async getCandidaturas() { return this._get('candidaturas'); },
  async createCandidatura(data) { return this._post('candidaturas', data); },
  async updateCandidatura(id, data) { const r = await this._post('update-candidatura', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteCandidatura(id) { return this._post('delete-candidatura', { id }); },

  // Acogidas activas (CRUD)
  async getAcogidas() { return this._get('acogidas'); },
  async createAcogida(data) { return this._post('acogidas', data); },
  async updateAcogida(id, data) { const r = await this._post('update-acogida', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteAcogida(id) { return this._post('delete-acogida', { id }); },

  // Apadrinamientos (CRUD)
  async getApadrinamientos() { return this._get('apadrinamientos'); },
  async createApadrinamiento(data) { return this._post('apadrinamientos', data); },
  async updateApadrinamiento(id, data) { const r = await this._post('update-apadrinamiento', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteApadrinamiento(id) { return this._post('delete-apadrinamiento', { id }); },

  // Contratos (CRUD)
  async getContratos() { return this._get('contratos'); },
  async createContrato(data) { return this._post('contratos', data); },
  async updateContrato(id, data) { const r = await this._post('update-contrato', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteContrato(id) { return this._post('delete-contrato', { id }); },
  async sendContratoEmail(data) { return this._post('send-contrato-email', data); },
  // PDF escaneado del contrato firmado: el backend lo guarda privado en Drive.
  async uploadContratoPdf(base64, nombre, mimeType) {
    // 10 MB de PDF ~ 14.000.000 caracteres en base64 (se valida tambien atras).
    if (base64 && base64.length > 14000000) {
      throw new Error('El PDF supera el tamano maximo permitido (10MB)');
    }
    return this._post('upload-contrato-pdf', { archivo_base64: base64, nombre, mime_type: mimeType || 'application/pdf' });
  },

  // Gastos veterinarios (CRUD)
  async getGastos() { return this._get('gastos'); },
  async createGasto(data) { return this._post('gastos', data); },
  async updateGasto(id, data) { const r = await this._post('update-gasto', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteGasto(id) { return this._post('delete-gasto', { id }); },

  // Recordatorios (CRUD)
  async getRecordatorios() { return this._get('recordatorios'); },
  async createRecordatorio(data) { return this._post('recordatorios', data); },
  async updateRecordatorio(id, data) { const r = await this._post('update-recordatorio', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteRecordatorio(id) { return this._post('delete-recordatorio', { id }); },

  // Donaciones (CRUD)
  async getDonaciones() { return this._get('donaciones'); },
  async createDonacion(data) { return this._post('donaciones', data); },
  async updateDonacion(id, data) { const r = await this._post('update-donacion', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteDonacion(id) { return this._post('delete-donacion', { id }); },

  // Seguimientos post-adopcion (CRUD)
  async getSeguimientos() { return this._get('seguimientos'); },
  async createSeguimiento(data) { return this._post('seguimientos', data); },
  async updateSeguimiento(id, data) { const r = await this._post('update-seguimiento', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteSeguimiento(id) { return this._post('delete-seguimiento', { id }); },

  // Historial por fases de adopciones (append-only, trazabilidad)
  async getHistorialFasesAdopcion() { return this._get('historial-fases-adopcion'); },
  async createHistorialFaseAdopcion(data) { return this._post('historial-fases-adopcion', data); },
  async updateHistorialFaseAdopcion(id, data) { const r = await this._post('update-historial-fase-adopcion', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteHistorialFaseAdopcion(id) { return this._post('delete-historial-fase-adopcion', { id }); },

  // Socios (CRUD)
  async getSocios() { return this._get('socios'); },
  async createSocio(data) { return this._post('socios', data); },
  async updateSocio(id, data) { const r = await this._post('update-socio', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteSocio(id) { return this._post('delete-socio', { id }); },

  // Blacklist (CRUD)
  async getBlacklist() { return this._get('blacklist'); },
  async createBlacklist(data) { return this._post('blacklist', data); },
  async updateBlacklist(id, data) { const r = await this._post('update-blacklist', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteBlacklist(id) { return this._post('delete-blacklist', { id }); },

  // Foto animal a Drive
  async uploadFotoAnimal(base64, nombre, mimeType) {
    // Validacion de tamano en frontend (max 5MB aprox. -> ~6.800.000 chars base64)
    if (base64 && base64.length > 6800000) {
      throw new Error('La foto supera el tamano maximo permitido (5MB)');
    }
    return this._post('upload-foto-animal', { foto_base64: base64, nombre, mime_type: mimeType });
  },

  // Documentos a Drive
  async getDocumentos() { return this._get('documentos'); },
  async createDocumento(data) { return this._post('documentos', data); },
  async uploadDocumento(base64, nombre, mimeType, tipo) {
    // Validacion de tamano en frontend (max 5MB aprox. -> ~6.800.000 chars base64)
    if (base64 && base64.length > 6800000) {
      throw new Error('El archivo supera el tamano maximo permitido (5MB)');
    }
    return this._post('upload-documento', { archivo_base64: base64, nombre, mime_type: mimeType, tipo: tipo || 'documento' });
  },
  // Media de una publicación web: una carpeta de Drive por ficha.
  async subirMediaWeb(publicacionId, tipo, base64, nombre, mimeType) {
    const limite = tipo === 'video' ? 15 * 1024 * 1024 : (tipo === 'documento' ? 10 * 1024 * 1024 : 5 * 1024 * 1024);
    if (base64 && base64.length > limite * 1.4) {
      throw new Error('El archivo supera el máximo permitido (' + Math.round(limite / 1024 / 1024) + ' MB)');
    }
    return this._post('web-media-subir', { publicacion_id: publicacionId, tipo, archivo_base64: base64, nombre, mime_type: mimeType });
  },
  // Borra de Drive un archivo de la media. Sin publicación solo se acepta si
  // está dentro de la carpeta raíz de media (útil para huérfanos).
  async eliminarMediaWeb(fileId, publicacionId) {
    if (!fileId) throw new Error('Falta el identificador del archivo');
    return this._post('web-media-eliminar', { file_id: fileId, publicacion_id: publicacionId || '' });
  },
  // Deploy de la web: estado de la configuración y disparo manual. El disparo
  // devuelve `{ok:false}` en vez de lanzar para poder enseñar el motivo.
  async estadoDeployWeb() {
    try { return await this._post('web-deploy-estado', {}); }
    catch (err) { return { status: 'error', data: null, error: (err && err.message) || 'No disponible' }; }
  },
  async dispararDeployWeb() {
    try { return await this._post('web-deploy', {}); }
    catch (err) { return { status: 'error', ok: false, codigo: (err && err.code) || null, error: (err && err.message) || 'No se pudo lanzar el deploy' }; }
  },
  async updateDocumento(id, data) { const r = await this._post('update-documento', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteDocumento(id) { return this._post('delete-documento', { id }); },

  // Inventario (CRUD)
  async getInventario() { return this._get('inventario'); },
  async createInventario(data) { return this._post('inventario', data); },
  async updateInventario(id, data) { const r = await this._post('update-inventario', { id, ...data }); if (!r.data) throw new Error('El backend no devolvió el registro (id sin sincronizar)'); return r; },
  async deleteInventario(id) { return this._post('delete-inventario', { id }); },

  // Grupos de animales (foto, descripcion y notas comunes)
  async getGrupos() { return this._get('grupos'); },
  async createGrupo(data) { return this._post('grupos', data); },
  async updateGrupo(id, data) { const r = await this._post('update-grupo', { id, ...data }); if (!r.data) throw new Error('El backend no devolvio el registro (id sin sincronizar)'); return r; },
  async deleteGrupo(id) { return this._post('delete-grupo', { id }); },

  // Gestor web: capa publica y metadatos SEO de las publicaciones
  async getWebAnimales(params = {}) { return this._get('web-animales', params); },
  async getWebAnimal(id) { return this._get('web-animales', { id }); },
  async saveWebAnimal(data) { return this._post('web-animales', data); },
  async setWebAnimalEstado(animalId, estado) { return this._post('web-animales-estado', { animal_id: animalId, estado_publicacion: estado }); },
  async deleteWebAnimal(animalId) { return this._post('web-animales', { animal_id: animalId, accion: 'eliminar' }); },
  async retirarWebAnimal(animalId) { return this._post('web-animales', { animal_id: animalId, accion: 'retirar' }); },
  async restaurarWebAnimal(animalId) { return this._post('web-animales', { animal_id: animalId, accion: 'restaurar' }); },
  async previewWebAnimal(id) { return this._get('web-animales-preview', { id }); },
  async getWebGrupos(params = {}) { return this._get('web-grupos', params); },
  async getWebGrupo(id) { return this._get('web-grupos', { id }); },
  async saveWebGrupo(data) { return this._post('web-grupos', data); },
  async setWebGrupoEstado(grupoId, estado) { return this._post('web-grupos-estado', { grupo_id: grupoId, estado_publicacion: estado }); },
  async deleteWebGrupo(grupoId) { return this._post('web-grupos', { grupo_id: grupoId, accion: 'eliminar' }); },
  async retirarWebGrupo(grupoId) { return this._post('web-grupos', { grupo_id: grupoId, accion: 'retirar' }); },
  async restaurarWebGrupo(grupoId) { return this._post('web-grupos', { grupo_id: grupoId, accion: 'restaurar' }); },
  async previewWebGrupo(id) { return this._get('web-grupos-preview', { id }); },
  async getWebEventos(params = {}) { return this._get('web-eventos', params); },
  async getWebEvento(id) { return this._get('web-eventos', { id }); },
  async saveWebEvento(data) { return this._post('web-eventos', data); },
  async setWebEventoEstado(id, estado) { return this._post('web-eventos-estado', { id, estado_publicacion: estado }); },
  async previewWebEvento(id) { return this._get('web-eventos-preview', { id }); },
  async deleteWebEvento(id) { return this._post('web-eventos', { id, accion: 'archivar' }); },
  async restaurarWebEvento(id) { return this._post('web-eventos', { id, accion: 'restaurar' }); },
  async checkWebSlug(tipo, slug, id) { return this._get('web-slug-check', { tipo, slug, id: id || '' }); },
  async getWebResumen() { return this._get('web-resumen'); },

  // Actividad
  async getActividad() { return this._get('actividad'); },
  async createActividad(data) { return this._post('actividad', data); },

  // Estados y notas encuestas
  async getEstados() { return this._get('estados'); },
  async setEstado(responseId, surveyId, estado) { return this._post('estados', { response_id: responseId, survey_id: surveyId, estado }); },
  async getNotas() { return this._get('notas'); },
  async setNota(responseId, surveyId, nota) { return this._post('notas', { response_id: responseId, survey_id: surveyId, nota }); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;