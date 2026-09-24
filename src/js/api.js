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
  async generatePdf(data) { return this._post('generate-pdf', data); },

  // Animales (CRUD)
  async getAnimales() { return this._get('animales'); },
  async createAnimal(data) { return this._post('animales', data); },
  async updateAnimal(id, data) { return this._post('update-animal', { id, ...data }); },
  async deleteAnimal(id) { return this._post('delete-animal', { id }); },

  // Familias acogedoras (CRUD)
  async getFamilias() { return this._get('familias'); },
  async createFamilia(data) { return this._post('familias', data); },
  async updateFamilia(id, data) { return this._post('update-familia', { id, ...data }); },
  async deleteFamilia(id) { return this._post('delete-familia', { id }); },

  // Adopciones (CRUD)
  async getAdopciones() { return this._get('adopciones'); },
  async createAdopcion(data) { return this._post('adopciones', data); },
  async updateAdopcion(id, data) { return this._post('update-adopcion', { id, ...data }); },
  async deleteAdopcion(id) { return this._post('delete-adopcion', { id }); },

  // Candidaturas (CRUD)
  async getCandidaturas() { return this._get('candidaturas'); },
  async createCandidatura(data) { return this._post('candidaturas', data); },
  async updateCandidatura(id, data) { return this._post('update-candidatura', { id, ...data }); },
  async deleteCandidatura(id) { return this._post('delete-candidatura', { id }); },

  // Acogidas activas (CRUD)
  async getAcogidas() { return this._get('acogidas'); },
  async createAcogida(data) { return this._post('acogidas', data); },
  async updateAcogida(id, data) { return this._post('update-acogida', { id, ...data }); },
  async deleteAcogida(id) { return this._post('delete-acogida', { id }); },

  // Contratos (CRUD)
  async getContratos() { return this._get('contratos'); },
  async createContrato(data) { return this._post('contratos', data); },
  async updateContrato(id, data) { return this._post('update-contrato', { id, ...data }); },
  async deleteContrato(id) { return this._post('delete-contrato', { id }); },

  // Socios (CRUD)
  async getSocios() { return this._get('socios'); },
  async createSocio(data) { return this._post('socios', data); },
  async updateSocio(id, data) { return this._post('update-socio', { id, ...data }); },
  async deleteSocio(id) { return this._post('delete-socio', { id }); },

  // Blacklist (CRUD)
  async getBlacklist() { return this._get('blacklist'); },
  async createBlacklist(data) { return this._post('blacklist', data); },
  async updateBlacklist(id, data) { return this._post('update-blacklist', { id, ...data }); },
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