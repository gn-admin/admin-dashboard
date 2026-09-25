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

  async _get(endpoint, params = {}) {
    const token = await Auth.getIdToken();
    const qs = new URLSearchParams({ endpoint, ...params, token }).toString();
    const res = await this._fetch(`${CONFIG.apiUrl}?${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  async _post(endpoint, body = {}) {
    const token = await Auth.getIdToken();
    const res = await this._fetch(`${CONFIG.apiUrl}?endpoint=${endpoint}&token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
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
    return this._post('upload-foto-animal', { foto_base64: base64, nombre, mime_type: mimeType });
  },

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