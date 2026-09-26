const Dashboard = {
  surveys: [], responses: {}, states: {}, blacklist: [], notes: {}, userProfile: null,
  animales: [], familias: [], adopciones: [], socios: [], actividad: [], publicaciones: [], apadrinamientos: [],
  gastos: [], recordatorios: [], donaciones: [], seguimientos: [], documentos: [],
  // Apadrinamientos contra el backend real (endpoints apadrinamientos/*).
  APADRINAMIENTOS_REMOTE: true,
  _currentAnimalFilter: 'all', _currentFosterFilter: 'all', _currentEspecieFilter: 'all', _currentSocioTipoFilter: 'all',
  _loaded: {}, _loading: {}, _pageToken: 0, _snackbarTimer: null, _shown: {},

  async init() {
    this.loadLocal();
    this._hydrateCache();
    this.injectIcons();
    this.showLoading();
    try {
      const [user] = await Promise.all([
        API.getUserProfile(),
        this._loadSurveys().catch(() => []),
        this.loadEstados().catch(() => ({})),
        this.loadNotas().catch(() => ({}))
      ]);
      this.userProfile = user;
      this.updateUserUI();
      // Preloads no bloqueantes; cada pantalla/ficha asegura lo suyo al abrirse.
      this._ensureListas(['candidaturas', 'acogidas', 'contratos', 'apadrinamientos', 'gastos', 'recordatorios', 'donaciones', 'seguimientos']);
      this._renderPendingBadge();
      this.flushPendingOps();
      if (!this._onlineHook) {
        this._onlineHook = true;
        window.addEventListener('online', () => { this.flushPendingOps(); });
      }
    } catch (err) {
      console.error('Error init:', err);
      this.showSnackbar('No se pudieron cargar los datos iniciales', 'error');
    } finally {
      this.hideLoading();
    }
  },

  // Asegura listas en memoria (best-effort: nunca lanza; usa caché si ya están).
  async _ensureListas(keys) {
    const fns = {
      candidaturas: () => API.getCandidaturas(),
      acogidas: () => API.getAcogidas(),
      contratos: () => API.getContratos(),
      apadrinamientos: () => API.getApadrinamientos(),
      gastos: () => API.getGastos(),
      recordatorios: () => API.getRecordatorios(),
      donaciones: () => API.getDonaciones(),
      seguimientos: () => API.getSeguimientos(),
      animales: () => API.getAnimales(),
      familias: () => API.getFamilias(),
      adopciones: () => API.getAdopciones(),
      socios: () => API.getSocios(),
      blacklist: () => API.getBlacklist(),
      actividad: () => API.getActividad()
    };
    await Promise.all((keys || []).map(k => (fns[k] ? this._loadListBestEffort(k, fns[k]) : null)));
  },

  async loadPage(page) {
    const el = document.getElementById('page-' + page);
    if (!el) return;
    const token = ++this._pageToken;
    const pages = {
      dashboard: () => this.renderDashboardHome(el),
      encuestas: () => this.renderEncuestasHub(el),
      'encuestas-perros': () => this.renderEncuesta(el, 'pre-adopcion-perros'),
      'encuestas-gatos': () => this.renderEncuesta(el, 'pre-adopcion-gatos'),
      'encuestas-acogida': () => this.renderEncuesta(el, 'pre-acogida'),
      animales: () => this.renderAnimales(el),
      acogidas: () => this.renderAcogidas(el),
      'acogidas-activas': () => this.renderAcogidasActivas(el),
      adopciones: () => this.renderAdopciones(el),
      socios: () => this.renderSocios(el),
      blacklist: () => this.renderBlacklist(el),
      reportes: () => this.renderReportes(el),
      redes: () => this.renderRedes(el),
      donaciones: () => this.renderDonaciones(el),
    };
    el.innerHTML = `<div class="page-loader"><div class="spinner"></div><p>Cargando...</p></div>`;
    try {
      const renderFn = pages[page] || (async () => {});
      await renderFn(el);
      if (token !== this._pageToken) return;
    } catch (err) {
      console.error('Error cargando ' + page + ':', err);
      if (token !== this._pageToken) return;
      this.showSnackbar('No se pudo cargar esta pantalla', 'error');
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icons.alertTriangle}</div><h3>Error al cargar</h3><p>${this._esc(err.message || 'Error desconocido')}</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="Dashboard.loadPage('${page}')">Reintentar</button></div>`;
      return;
    }
    this.injectIcons();
  },

  injectIcons() {
    const set = (id, svg) => { const el = document.getElementById(id); if (el) el.innerHTML = svg; };
    set('sidebar-toggle', Icons.menu);
    set('sidebar-collapse-btn', Icons.sidebarCollapse);
    set('mas-menu-icon', Icons.menu);
    set('mas-icon-acogidas', Icons.home);
    set('mas-icon-acogidas-activas', Icons.home);
    set('tutorial-btn', Icons.helpCircle);
    set('profile-btn', Icons.user);
    set('mas-icon-adopciones', Icons.heart);
    set('mas-icon-socios', Icons.users);
    set('mas-icon-reportes', Icons.barChart);
    set('mas-icon-redes', Icons.heart);
    set('mas-icon-donaciones', Icons.heart);
    set('mas-icon-blacklist', Icons.ban);
    document.querySelectorAll('.sidebar-link-icon').forEach(el => {
      const p = el.closest('.sidebar-link')?.dataset.page;
      const m = { dashboard: Icons.dashboard, 'encuestas-perros': Icons.dog, 'encuestas-gatos': Icons.cat, 'encuestas-acogida': Icons.home, animales: Icons.heart, acogidas: Icons.home, 'acogidas-activas': Icons.home, adopciones: Icons.heart, socios: Icons.users, blacklist: Icons.ban, reportes: Icons.barChart, redes: Icons.heart, donaciones: Icons.heart };
      el.innerHTML = m[p] || Icons.clipboard;
    });
    document.querySelectorAll('.bottom-nav-icon').forEach(el => {
      const p = el.closest('.bottom-nav-item')?.dataset.page;
      if (!p) return;
      const m = { dashboard: Icons.dashboard, encuestas: Icons.clipboard, animales: Icons.heart, blacklist: Icons.ban };
      el.innerHTML = m[p] || Icons.clipboard;
    });
    document.querySelectorAll('.input-icon').forEach((el, i) => { el.innerHTML = i === 0 ? Icons.mail : Icons.lock; });
    document.querySelectorAll('.search-icon').forEach(el => { el.innerHTML = Icons.search; });
  },

  updateUserUI() {
    const n = document.getElementById('sidebar-user-name');
    const r = document.getElementById('sidebar-user-role');
    const a = document.getElementById('sidebar-avatar');
    const tn = document.getElementById('topbar-user-name');
    const name = this.userProfile?.name || this.userProfile?.email || 'User';
    if (n) n.textContent = name;
    if (r) r.textContent = this.userProfile?.role || 'admin';
    if (a) a.textContent = name.charAt(0).toUpperCase();
    if (tn) tn.textContent = name;
  },

  loadLocal() {
    const norm = (arr) => (arr || []).map(x => (x && x.id !== undefined && x.id !== null) ? { ...x, id: String(x.id) } : x);
    try { this.blacklist = norm(JSON.parse(localStorage.getItem('gn_blacklist') || '[]')); } catch { this.blacklist = []; }
    try { this.candidaturas = norm(JSON.parse(localStorage.getItem('gn_candidaturas') || '[]')); } catch { this.candidaturas = []; }
    try { this.contratos = norm(JSON.parse(localStorage.getItem('gn_contratos') || '[]')); } catch { this.contratos = []; }
    try { this.acogidas = norm(JSON.parse(localStorage.getItem('gn_acogidas') || '[]')); } catch { this.acogidas = []; }
    try { this.publicaciones = norm(JSON.parse(localStorage.getItem('gn_publicaciones') || '[]')); } catch { this.publicaciones = []; }
    try { this.apadrinamientos = norm(JSON.parse(localStorage.getItem('gn_apadrinamientos') || '[]')); } catch { this.apadrinamientos = []; }
    try { this.gastos = norm(JSON.parse(localStorage.getItem('gn_gastos') || '[]')); } catch { this.gastos = []; }
    try { this.recordatorios = norm(JSON.parse(localStorage.getItem('gn_recordatorios') || '[]')); } catch { this.recordatorios = []; }
    try { this.donaciones = norm(JSON.parse(localStorage.getItem('gn_donaciones') || '[]')); } catch { this.donaciones = []; }
    try { this.seguimientos = norm(JSON.parse(localStorage.getItem('gn_seguimientos') || '[]')); } catch { this.seguimientos = []; }
    try { this.documentos = JSON.parse(localStorage.getItem('gn_documentos') || '[]'); } catch { this.documentos = []; }
  },

  saveLocal() {
    localStorage.setItem('gn_blacklist', JSON.stringify(this.blacklist));
    localStorage.setItem('gn_candidaturas', JSON.stringify(this.candidaturas || []));
    localStorage.setItem('gn_contratos', JSON.stringify(this.contratos || []));
    localStorage.setItem('gn_acogidas', JSON.stringify(this.acogidas || []));
    localStorage.setItem('gn_publicaciones', JSON.stringify(this.publicaciones || []));
    localStorage.setItem('gn_apadrinamientos', JSON.stringify(this.apadrinamientos || []));
    localStorage.setItem('gn_gastos', JSON.stringify(this.gastos || []));
    localStorage.setItem('gn_recordatorios', JSON.stringify(this.recordatorios || []));
    localStorage.setItem('gn_donaciones', JSON.stringify(this.donaciones || []));
    localStorage.setItem('gn_seguimientos', JSON.stringify(this.seguimientos || []));
    localStorage.setItem('gn_documentos', JSON.stringify(this.documentos || []));
  },

  // Busqueda por id tolerante a tipos (la hoja puede devolver numeros y el
  // DOM siempre strings). Las filas SIN id nunca coinciden: asi un registro
  // fantasma no abre un form vacio haciendose pasar por edicion.
  _byId(list, id) {
    if (id === undefined || id === null || id === '') return null;
    const want = String(id);
    return (list || []).find(x => x && x.id !== undefined && x.id !== null && x.id !== '' && String(x.id) === want) || null;
  },

  _cacheGet(key) {
    try {
      const v = localStorage.getItem('gn_cache_' + key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },

  _cacheSet(key, val) {
    try { localStorage.setItem('gn_cache_' + key, JSON.stringify(val)); } catch {}
  },

  // Hidratacion instantanea al arrancar (sin marcar _loaded: luego refresca red).
  _hydrateCache() {
    const h = (k, v) => { if (v !== null && v !== undefined) this[k] = v; };
    h('surveys', this._cacheGet('surveys'));
    h('responses', this._cacheGet('responses'));
    h('states', this._cacheGet('estados'));
    h('notes', this._cacheGet('notas'));
    h('animales', this._cacheGet('animales'));
    h('familias', this._cacheGet('familias'));
    h('actividad', this._cacheGet('actividad'));
    h('candidaturas', this._cacheGet('candidaturas'));
    h('acogidas', this._cacheGet('acogidas'));
    h('contratos', this._cacheGet('contratos'));
    h('blacklist', this._cacheGet('blacklist'));
    h('socios', this._cacheGet('socios'));
    h('adopciones', this._cacheGet('adopciones'));
  },

  async loadEstados(force) {
    if (this._loaded.estados && !force) return this.states;
    if (this._loading.estados) return this._loading.estados;
    this._loading.estados = (async () => {
      const res = await API.getEstados();
      this.states = res.data || {};
      this._cacheSet('estados', this.states);
      this._loaded.estados = true;
      return this.states;
    })();
    try { return await this._loading.estados; } finally { this._loading.estados = null; }
  },

  async loadNotas(force) {
    if (this._loaded.notas && !force) return this.notes;
    if (this._loading.notas) return this._loading.notas;
    this._loading.notas = (async () => {
      const res = await API.getNotas();
      this.notes = res.data || {};
      this._cacheSet('notas', this.notes);
      this._loaded.notas = true;
      return this.notes;
    })();
    try { return await this._loading.notas; } finally { this._loading.notas = null; }
  },

  async _loadSurveys(force) {
    if (this._loaded.surveys && !force) return this.surveys;
    if (this._loading.surveys) return this._loading.surveys;
    this._loading.surveys = (async () => {
      const res = await API.getSurveys();
      this.surveys = res.data || [];
      this._cacheSet('surveys', this.surveys);
      this._loaded.surveys = true;
      return this.surveys;
    })();
    try { return await this._loading.surveys; } finally { this._loading.surveys = null; }
  },

  async _loadResponses(surveyId, force) {
    const key = 'responses_' + surveyId;
    if (this._loaded[key] && !force) return this.responses[surveyId] || [];
    if (this._loading[key]) return this._loading[key];
    this._loading[key] = (async () => {
      const res = await API.getResponses(surveyId);
      this.responses[surveyId] = (res.data || []).map(r => ({ ...r, _surveyId: surveyId }));
      this._cacheSet('responses', this.responses);
      this._loaded[key] = true;
      return this.responses[surveyId];
    })();
    try { return await this._loading[key]; } finally { this._loading[key] = null; }
  },

  async _loadList(key, apiFn, force) {
    if (this._loaded[key] && !force) return this[key];
    if (this._loading[key]) return this._loading[key];
    this._loading[key] = (async () => {
      const res = await apiFn();
      const remote = res.data || [];
      const ids = new Set(remote.map(r => r.id));
      const localOnly = (this[key] || []).filter(l => l && l.id && !ids.has(l.id));
      this[key] = remote.concat(localOnly);
      this._cacheSet(key, this[key]);
      const sinId = (this[key] || []).filter(r => !r || r.id === undefined || r.id === null || r.id === '');
      if (sinId.length) console.warn('Registros sin id en ' + key + ': ' + sinId.length + ' (no se pueden editar; revisa la cabecera id en la hoja)');
      this._loaded[key] = true;
      return this[key];
    })();
    try { return await this._loading[key]; } finally { this._loading[key] = null; }
  },

  async _loadListBestEffort(key, apiFn) {
    try { await this._loadList(key, apiFn); } catch (err) { console.warn('Load local-only:', key, err); }
  },

  getEstado(id, surveyId) { return this.states[(surveyId || '') + '::' + id] || 'pendiente'; },

  estadoMap: {
    pendiente: { label: 'Pendiente', cls: '' },
    en_proceso: { label: 'En proceso', cls: 'en_proceso' },
    aprobada: { label: 'Aprobada', cls: 'aprobada' },
    finalizada: { label: 'Finalizada', cls: 'finalizada' },
    descartada: { label: 'Descartada', cls: 'descartada' }
  },

  _estadoLabel(e) { return (this.estadoMap[e] || { label: e }).label; },

  _estadoCls(e) { return (this.estadoMap[e] || { cls: '' }).cls || e; },

  _syncCard(surveyId, id) {
    const card = document.querySelector(`.response-card[data-card="${surveyId}::${id}"]`);
    if (!card) return;
    const badge = card.querySelector('.estado-badge');
    if (!badge) return;
    const e = this.getEstado(id, surveyId);
    badge.className = 'estado-badge ' + this._estadoCls(e);
    badge.textContent = this._estadoLabel(e);
  },

  async setEstado(id, estado, surveyId) {
    const key = (surveyId || '') + '::' + id;
    const anterior = this.states[key];
    this.states[key] = estado;
    this._syncCard(surveyId, id);
    this.showLoading();
    try {
      await API.setEstado(id, surveyId || '', estado);
    } catch (err) {
      console.error('Error setEstado:', err);
      this.states[key] = anterior;
      this._syncCard(surveyId, id);
      this.showSnackbar('No se pudo guardar el estado', 'error');
    } finally {
      this.hideLoading();
    }
  },

  // ==================== CANDIDATURAS / FLUJO COMPLETO ====================

  _candidaturasDe(surveyId, id) {
    const key = surveyId + '::' + id;
    return (this.candidaturas || []).filter(c => c.solicitud_id === key && this.getEstado(id, surveyId) === 'aprobada');
  },

  _crearCandidatura(surveyId, id, tipo) {
    const r = (this.responses[surveyId] || []).find(x => x.id === id);
    const cand = {
      id: 'cand_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      solicitud_id: surveyId + '::' + id,
      survey_id: surveyId,
      response_id: id,
      tipo: tipo,
      nombre: (r?.nombre || '') + (r?.apellidos ? ' ' + r.apellidos : ''),
      email: r?.email || '',
      animal_id: null,
      familia_id: null,
      estado: 'en_lista',
      fecha: new Date().toISOString()
    };
    this.candidaturas.push(cand);
    this.saveLocal();
    this._apiCreateRow(() => API.createCandidatura(cand), { m: 'createCandidatura', a: [cand] });
    return cand;
  },

  async aprobarEncuesta(surveyId, id) {
    const tipo = surveyId === 'pre-acogida' ? 'acogida' : 'adopcion';
    await this.setEstado(id, 'aprobada', surveyId);
    if (!this._candidaturasDe(surveyId, id).length) this._crearCandidatura(surveyId, id, tipo);
    if (surveyId === 'pre-acogida') await this._autoFamiliaDeEncuesta(surveyId, id);
    this.viewDetail(surveyId, id);
    this.showSnackbar('Solicitud aprobada. Candidatura en espera.', 'success');
  },

  async _autoFamiliaDeEncuesta(surveyId, id) {
    if (!this._loaded.familias) await this._loadList('familias', () => API.getFamilias());
    const r = (this.responses[surveyId] || []).find(x => x.id === id);
    if (!r) return null;
    const email = (r.email || '').toLowerCase().trim();
    const nombre = ((r.nombre || '') + ' ' + (r.apellidos || '')).trim();
    const exists = this.familias.find(f => (f.email || '').toLowerCase().trim() && f.email.toLowerCase().trim() === email) || this.familias.find(f => (f.nombre || '').toLowerCase().trim() === nombre.toLowerCase().trim());
    if (exists) return exists;
    const data = {
      nombre: nombre || (r.nombre || 'Persona'),
      email: r.email || '',
      telefono: r.telefono || '',
      ubicacion: r.ciudad || r.domicilio || '',
      especialidad: '',
      max_capacity: 1,
      notas: 'Auto-registrada desde encuesta pre-acogida ' + r.id,
      capacidad: 'Libre',
      animales_actuales: 0,
      origen: 'encuesta'
    };
    try {
      const res = await API.createFamilia(data);
      if (res && res.data) this.familias.push(res.data);
      return res && res.data;
    } catch (err) {
      const fallback = { ...data, id: 'fam_' + Date.now().toString(36), fecha_registro: new Date().toISOString().slice(0, 10) };
      this.familias.push(fallback);
      this.showSnackbar('Familia registrada localmente (backend sin hoja)', 'warning');
      return fallback;
    }
  },

  checkBlacklist(nombre, email) {
    const n = (nombre || '').toLowerCase().trim();
    const e = (email || '').toLowerCase().trim();
    return this.blacklist.some(bl => {
      const blN = (bl.nombre || '').toLowerCase().trim();
      const blA = (bl.apellidos || '').toLowerCase().trim();
      const blE = (bl.email || '').toLowerCase().trim();
      return (n && (n === blN || n === blA || n === (blN + ' ' + blA).trim())) || (e && blE && e === blE);
    });
  },

  _esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  },

  _confirm(msg, title) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      if (!modal) { resolve(window.confirm(msg)); return; }
      const titleEl = document.getElementById('confirm-title');
      const msgEl = document.getElementById('confirm-message');
      const ok = document.getElementById('confirm-ok');
      const cancel = document.getElementById('confirm-cancel');
      if (titleEl) titleEl.textContent = title || 'Confirmar';
      if (msgEl) msgEl.textContent = msg;
      modal._resolve = resolve;
      if (ok) ok.onclick = () => this._closeConfirm(true);
      if (cancel) cancel.onclick = () => this._closeConfirm(false);
      modal.onclick = (e) => { if (e.target === modal) this._closeConfirm(false); };
      modal.style.display = 'flex';
      this._focusModal(modal);
    });
  },

  _closeConfirm(val) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;
    modal.style.display = 'none';
    const r = modal._resolve; modal._resolve = null;
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    if (ok) ok.onclick = null;
    if (cancel) cancel.onclick = null;
    modal.onclick = null;
    if (r) r(val === true);
  },

  cancelConfirm(val) { this._closeConfirm(val === true); },

  _focusModal(modal) {
    if (!modal) return;
    const btn = modal.querySelector('.modal-box button:not([disabled])');
    if (!btn) return;
    try { btn.focus({ preventScroll: true }); } catch (err) { try { btn.focus(); } catch (e2) {} }
  },

  cancelForm(pageId) {
    const page = document.getElementById('page-' + pageId);
    if (!page) return;
    const listContainer = page.querySelector('.page-list-container');
    const detailContainer = page.querySelector('.page-detail-container');
    if (detailContainer && detailContainer.classList.contains('active')) {
      const formCard = detailContainer.querySelector('.form-card');
      if (formCard && listContainer && listContainer.classList.contains('hidden')) {
        detailContainer.classList.remove('active');
        detailContainer.innerHTML = '';
        listContainer.classList.remove('hidden');
        return;
      }
      if (formCard) formCard.remove();
    }
    const fc = page.querySelector('[id$="-form-container"]');
    if (fc) fc.innerHTML = '';
  },

  _renderForm(pageId, html) {
    const page = document.getElementById('page-' + pageId);
    if (!page) return;
    // Higiene central (todas las entidades CRUD): nunca puede haber dos
    // forms visibles a la vez. Purga restos de forms/containers previos.
    page.querySelectorAll('.form-card').forEach(f => f.remove());
    page.querySelectorAll('[id$="-form-container"]').forEach(fc => { fc.innerHTML = ''; });
    const listContainer = page.querySelector('.page-list-container');
    const detailContainer = page.querySelector('.page-detail-container');
    if (listContainer && !listContainer.classList.contains('hidden')) {
      listContainer.classList.add('hidden');
      if (detailContainer) {
        detailContainer.classList.add('active');
        detailContainer.innerHTML = `<div class="detail-actions"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.cancelForm('${pageId}')">${Icons.arrowLeft} Volver</button></div>${html}`;
        detailContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (detailContainer && detailContainer.classList.contains('active')) {
      const prevForm = detailContainer.querySelector('.form-card');
      if (prevForm) prevForm.remove();
      const backBtn = detailContainer.querySelector('.detail-actions');
      if (backBtn) backBtn.insertAdjacentHTML('afterend', html);
      else detailContainer.insertAdjacentHTML('afterbegin', html);
      const formCard = detailContainer.querySelector('.form-card');
      if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  // ==================== INLINE DETAIL SYSTEM ====================
  _showDetail(pageId, title, contentHTML) {
    const page = document.getElementById('page-' + pageId);
    if (!page) return;
    const listEl = page.querySelector('.page-list-container');
    const detailEl = page.querySelector('.page-detail-container');
    if (!listEl || !detailEl) return;
    listEl.classList.add('hidden');
    detailEl.classList.add('active');
    detailEl.innerHTML = `
      <div class="detail-actions" style="margin-bottom:20px">
        <button class="btn btn-outline-green btn-sm" onclick="Dashboard._hideDetail('${pageId}')">${Icons.arrowLeft} Volver</button>
        <span style="font-weight:700;font-size:1rem;color:var(--gray-900)">${title}</span>
      </div>
      ${contentHTML}`;
    this.injectIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  _hideDetail(pageId) {
    const page = document.getElementById('page-' + pageId);
    if (!page) return;
    const listEl = page.querySelector('.page-list-container');
    const detailEl = page.querySelector('.page-detail-container');
    if (listEl) listEl.classList.remove('hidden');
    if (detailEl) { detailEl.classList.remove('active'); detailEl.innerHTML = ''; }
  },

  // ==================== DASHBOARD HOME ====================
  async renderDashboardHome(el) {
    if (!this._hasHomeCache()) {
      el.innerHTML = `<div class="page-loader"><div class="spinner"></div><p>Cargando...</p></div>`;
      await this._refreshHome();
      this._paintHome(el);
      return;
    }
    this._paintHome(el);
    this._refreshHome().then(() => {
      if (document.getElementById('page-dashboard')?.classList.contains('active')) this._paintHome(el);
    }).catch(() => {});
  },

  _hasHomeCache() {
    return !!(this.surveys && this.surveys.length);
  },

  async _refreshHome() {
    await this._loadSurveys();
    await Promise.all([
      this.loadEstados(),
      this._loadList('animales', () => API.getAnimales()),
      this._loadList('familias', () => API.getFamilias()),
      this._loadListBestEffort('recordatorios', () => API.getRecordatorios()),
      this._loadListBestEffort('apadrinamientos', () => API.getApadrinamientos()),
      this._loadListBestEffort('donaciones', () => API.getDonaciones()),
      this._loadListBestEffort('gastos', () => API.getGastos()),
      this._loadListBestEffort('socios', () => API.getSocios()),
      this._loadListBestEffort('contratos', () => API.getContratos()),
      ...this.surveys.map(s => this._loadResponses(s.id)),
    ]);
  },

  _paintHome(el) {
    const all = Object.values(this.responses).flat();
    const activas = all.filter(r => this.getEstado(r.id, r._surveyId) !== 'descartada');
    const pendientes = activas.filter(r => this.getEstado(r.id, r._surveyId) === 'pendiente').length;
    const enProceso = activas.filter(r => this.getEstado(r.id, r._surveyId) === 'en_proceso').length;
    const enAcogida = this.animales.filter(a => a.estado === 'en_acogida').length;
    const familiasLibres = this.familias.filter(f => f.capacidad === 'Libre').length;
    const apadActivos = (this.apadrinamientos || []).filter(p => p.estado === 'activo');
    const apadEuros = this._totalAportes(this.apadrinamientos);
    const solNuevas = this._cuentaMes(activas, r => r.fecha_creacion);
    const adopMes = this._cuentaMes(this.contratos, c => c.fecha);
    const donMes = this._sumaMes(this.donaciones, d => d.fecha, d => d.importe);
    const gastoMes = this._sumaMes(this.gastos, g => g.fecha, g => g.importe);
    const balance = donMes.cur - gastoMes.cur;
    const cuotasPend = (this.socios || []).filter(s => (this._cuotaEstado(s) || {}).label === 'Pendiente').length;
    const vencidos = (this.recordatorios || []).filter(r => !r.hecho && (this._diasHasta(r.fecha) ?? 99) < 0).length;
    const hoyN = pendientes + vencidos + enProceso;

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px"><div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:2rem;font-weight:800;color:${vencidos ? 'var(--danger)' : 'var(--primary-hover)'}">${hoyN}</div>
        <div style="flex:1;min-width:180px"><div style="font-weight:700">Hoy</div><div style="color:var(--gray-500);font-size:.85rem">${hoyN ? `${pendientes} pendientes · ${vencidos} vencidos · ${enProceso} en proceso` : 'Todo al día, sin pendientes'}</div></div>
        ${hoyN ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('accion-card')?.scrollIntoView({behavior:'smooth'})">Ver</button>` : ''}
      </div></div>
      <div class="stats-grid">
        <div class="stat-card" style="cursor:pointer" onclick="location.hash='encuestas'"><div class="stat-card-icon green">${Icons.clipboard}</div><div class="stat-card-info"><div class="stat-card-label">Solicitudes (mes)</div><div class="stat-card-value">${solNuevas.cur}</div><div class="stat-card-change">${this._deltaTexto(solNuevas.cur, solNuevas.prev)}</div></div></div>
        <div class="stat-card" style="cursor:pointer" onclick="Dashboard._currentAnimalFilter='en_acogida';location.hash='animales'"><div class="stat-card-icon blue">${Icons.heart}</div><div class="stat-card-info"><div class="stat-card-label">En Acogida</div><div class="stat-card-value">${enAcogida}</div><div class="stat-card-change">${familiasLibres} familias libres</div></div></div>
        <div class="stat-card" style="cursor:pointer" onclick="location.hash='adopciones'"><div class="stat-card-icon green">${Icons.checkCircle}</div><div class="stat-card-info"><div class="stat-card-label">Adopciones (mes)</div><div class="stat-card-value">${adopMes.cur}</div><div class="stat-card-change">${this._deltaTexto(adopMes.cur, adopMes.prev)}</div></div></div>
        <div class="stat-card" style="cursor:pointer" onclick="location.hash='animales'"><div class="stat-card-icon blue">${Icons.paw}</div><div class="stat-card-info"><div class="stat-card-label">Apadrinados</div><div class="stat-card-value">${apadActivos.length}</div><div class="stat-card-change">${apadEuros.toFixed(2)} €/mes</div></div></div>
      </div>
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-card-icon green">${Icons.heart}</div><div class="stat-card-info"><div class="stat-card-label">Donaciones (mes)</div><div class="stat-card-value">${donMes.cur.toFixed(2)} €</div><div class="stat-card-change">tesorería</div></div></div>
        <div class="stat-card"><div class="stat-card-icon orange">${Icons.activity}</div><div class="stat-card-info"><div class="stat-card-label">Gastos (mes)</div><div class="stat-card-value">${gastoMes.cur.toFixed(2)} €</div><div class="stat-card-change">veterinarios</div></div></div>
        <div class="stat-card"><div class="stat-card-icon ${balance >= 0 ? 'green' : 'orange'}">${Icons.trendingUp}</div><div class="stat-card-info"><div class="stat-card-label">Balance (mes)</div><div class="stat-card-value">${balance.toFixed(2)} €</div><div class="stat-card-change">donaciones − gastos</div></div></div>
        <div class="stat-card" style="cursor:pointer" onclick="location.hash='socios'"><div class="stat-card-icon blue">${Icons.users}</div><div class="stat-card-info"><div class="stat-card-label">Cuotas pendientes</div><div class="stat-card-value">${cuotasPend}</div><div class="stat-card-change">revisar en Socios</div></div></div>
      </div>
      <div class="card" id="accion-card" style="margin-bottom:16px"><div class="card-header"><h3>Accion requerida</h3><button class="btn btn-primary btn-sm" onclick="Dashboard.showRecordatorioForm()">${Icons.plus} Nuevo</button></div><div class="card-body-flush"><table class="data-table"><thead><tr><th>Solicitante</th><th>Estado</th><th></th></tr></thead><tbody>${this._accionRows()}</tbody></table></div></div>
      <div class="dashboard-grid" style="display:grid;gap:16px;margin-bottom:24px;">
        <div class="card"><div class="card-header"><h3>Solicitudes por Mes</h3></div><div class="chart-container">${this._buildBarChart()}</div></div>
        <div class="card"><div class="card-header"><h3>Embudo de adopcion</h3></div><div class="card-body">${this._funnelAdopcion()}</div></div>
      </div>
      <div class="card" style="margin-bottom:24px"><div class="card-header"><h3>Solicitudes Recientes</h3></div><div class="card-body-flush"><table class="data-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${this._recentRows()}</tbody></table></div></div>`;
  },

  _buildBarChart() {
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const buckets = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      buckets.push({ key, label: months[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), count: 0 });
    }
    const idx = {};
    buckets.forEach((b, i) => idx[b.key] = i);
    Object.values(this.responses).flat().forEach(r => {
      if (!r.fecha_creacion) return;
      if (this.getEstado(r.id, r._surveyId) === 'descartada') return;
      const dt = new Date(String(r.fecha_creacion).replace(' ', 'T'));
      if (isNaN(dt.getTime())) return;
      const k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      if (k in idx) buckets[idx[k]].count++;
    });
    const curKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const max = Math.max(...buckets.map(b => b.count), 1);
    return `<div class="bar-chart">${buckets.map(b=>{const h=(b.count/max*120);return`<div class="bar-chart-col"><div class="bar-chart-value">${b.count}</div><div class="bar-chart-bar" style="height:${h}px${b.key===curKey?';background:var(--primary-hover)':''}"><span class="bar-tooltip">${b.label}: ${b.count}</span></div><span class="bar-chart-label">${b.label}</span></div>`;}).join('')}</div>`;
  },

  _recentRows() {
    const all = [];
    this.surveys.forEach(s => (this.responses[s.id]||[]).forEach(r => all.push({...r,_survey:s.name,_surveyId:s.id})));
    all.sort((a,b)=>(b.fecha_creacion||'').localeCompare(a.fecha_creacion||''));
    return all.slice(0,5).map(r=>{const e=this.getEstado(r.id, r._surveyId);const d=r.fecha_creacion?new Date(r.fecha_creacion).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'';const pageMap={'pre-adopcion-perros':'encuestas-perros','pre-adopcion-gatos':'encuestas-gatos','pre-acogida':'encuestas-acogida'};const page=pageMap[r._surveyId]||'dashboard';return`<tr style="cursor:pointer" onclick="location.hash='${page}'"><td>${this._esc(r.nombre||'')} ${this._esc(r.apellidos||'')}</td><td>${this._esc(r._survey)}</td><td><span class="estado-badge ${e}">${e}</span></td><td>${d}</td></tr>`;}).join('');
  },

  // Conteo/suma por mes natural (actual vs anterior) para KPIs.
  _cuentaMes(items, getFecha) {
    const now = new Date();
    const cur = { y: now.getFullYear(), m: now.getMonth() };
    const pv = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = { y: pv.getFullYear(), m: pv.getMonth() };
    let c = 0, p = 0;
    (items || []).forEach(it => {
      const f = getFecha(it);
      if (!f) return;
      const d = new Date(String(f).replace(' ', 'T'));
      if (isNaN(d.getTime())) return;
      if (d.getFullYear() === cur.y && d.getMonth() === cur.m) c++;
      else if (d.getFullYear() === prev.y && d.getMonth() === prev.m) p++;
    });
    return { cur: c, prev: p };
  },

  _sumaMes(items, getFecha, getEuros) {
    const now = new Date();
    const cur = { y: now.getFullYear(), m: now.getMonth() };
    const pv = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = { y: pv.getFullYear(), m: pv.getMonth() };
    let c = 0, p = 0;
    (items || []).forEach(it => {
      const f = getFecha(it);
      if (!f) return;
      const d = new Date(String(f).replace(' ', 'T'));
      if (isNaN(d.getTime())) return;
      const v = parseFloat(String(getEuros(it)).replace(',', '.')) || 0;
      if (d.getFullYear() === cur.y && d.getMonth() === cur.m) c += v;
      else if (d.getFullYear() === prev.y && d.getMonth() === prev.m) p += v;
    });
    return { cur: c, prev: p };
  },

  _deltaTexto(cur, prev) {
    if (cur === prev) return 'igual que el mes pasado';
    const d = cur - prev;
    return (d > 0 ? '+' : '') + d + ' vs mes pasado';
  },

  // Cola unica de accion: vencidos primero, luego por antiguedad.
  _accionItems(max) {
    const items = [];
    (this.recordatorios || []).forEach(r => {
      if (r.hecho) return;
      items.push({ kind: 'vencimiento', fecha: r.fecha || '', titulo: r.titulo || 'Recordatorio', ref: r });
    });
    (this.surveys || []).forEach(s => (this.responses[s.id] || []).forEach(r => {
      const e = this.getEstado(r.id, s.id);
      if (e !== 'pendiente' && e !== 'en_proceso') return;
      items.push({ kind: 'solicitud', fecha: r.fecha_creacion || '', nombre: (((r.nombre || '') + ' ' + (r.apellidos || '')).trim()), survey: s.name, surveyId: s.id, id: r.id, estado: e });
    }));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const t0 = hoy.getTime();
    const t = (x) => { const d = new Date(String(x.fecha || '').replace(' ', 'T')).getTime(); return isNaN(d) ? Infinity : d; };
    items.sort((a, b) => {
      const ao = a.kind === 'vencimiento' && t(a) < t0, bo = b.kind === 'vencimiento' && t(b) < t0;
      if (ao !== bo) return ao ? -1 : 1;
      return t(a) - t(b);
    });
    return items.slice(0, max || 8);
  },

  _accionRows() {
    const items = this._accionItems(8);
    if (!items.length) return `<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:16px">Todo al día</td></tr>`;
    return items.map(it => {
      if (it.kind === 'vencimiento') {
        const e = this._estadoRecordatorio({ fecha: it.fecha, hecho: false });
        return `<tr><td>${this._esc(it.titulo)}<div style="font-size:.72rem;color:var(--gray-500)">Vencimiento</div></td><td><span class="estado-badge ${e.cls}">${e.label}</span></td><td style="white-space:nowrap"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.toggleRecordatorio('${this._esc(it.ref.id)}')">Hecho</button></td></tr>`;
      }
      return `<tr style="cursor:pointer" onclick="Dashboard.openCuestionarioEnPagina('${it.surveyId}','${it.id}')"><td>${this._esc(it.nombre)}<div style="font-size:.72rem;color:var(--gray-500)">${this._esc(it.survey)}</div></td><td><span class="estado-badge ${this._estadoCls(it.estado)}">${this._estadoLabel(it.estado)}</span></td><td>${this._diasEspera(it.fecha)}</td></tr>`;
    }).join('');
  },

  _funnelAdopcion() {
    const acts = Object.values(this.responses).flat().filter(r => this.getEstado(r.id, r._surveyId) !== 'descartada');
    const st = (e) => acts.filter(r => this.getEstado(r.id, r._surveyId) === e).length;
    const stages = [
      ['Pendientes', st('pendiente'), '#9aa0a6'],
      ['En proceso', st('en_proceso'), '#3498db'],
      ['Aprobadas', st('aprobada'), '#1FC95B'],
      ['Adoptados', (this.animales || []).filter(a => a.estado === 'adoptado').length, '#0A431E']
    ];
    const max = Math.max(...stages.map(s => s[1]), 1);
    return stages.map(([label, n, color]) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:92px;font-size:.78rem;color:var(--gray-600)">${label}</div><div style="flex:1;background:var(--gray-100);border-radius:6px;height:22px"><div style="width:${Math.round(n / max * 100)}%;background:${color};height:100%;border-radius:6px"></div></div><div style="width:34px;text-align:right;font-weight:800">${n}</div></div>`).join('');
  },

  _diasEspera(fecha) {
    if (!fecha) return '—';
    const t = new Date(String(fecha).replace(' ', 'T')).getTime();
    if (isNaN(t)) return '—';
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'hoy' : (d === 1 ? '1 día' : d + ' días');
  },

  // ==================== RECORDATORIOS ====================
  _diasHasta(fecha) {
    if (!fecha) return null;
    const m = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const t = new Date(+m[1], +m[2] - 1, +m[3]);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((t - hoy) / 86400000);
  },

  _estadoRecordatorio(r) {
    if (!r) return { label: '—', cls: '' };
    if (r.hecho) return { label: 'Hecho', cls: 'aprobada' };
    const d = this._diasHasta(r.fecha);
    if (d === null) return { label: 'Sin fecha', cls: '' };
    if (d < 0) return { label: 'Vencido', cls: 'descartada' };
    if (d === 0) return { label: 'Hoy', cls: 'en_proceso' };
    return { label: 'En ' + d + (d === 1 ? ' día' : ' días'), cls: '' };
  },

  showRecordatorioForm() {
    this.showFormModal('Nuevo recordatorio', `
      <form onsubmit="Dashboard.saveRecordatorio(event)">
      <div class="form-group"><label>Título *</label><input type="text" id="rc-titulo" required placeholder="Ej: Vacuna anual Luna"></div>
      <div class="form-row"><div class="form-group"><label>Fecha *</label><input type="date" id="rc-fecha" required value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="form-group"><label>Nota</label><input type="text" id="rc-nota" placeholder="Opcional"></div></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`);
  },

  async saveRecordatorio(e) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const titulo = document.getElementById('rc-titulo').value.trim();
    const fecha = document.getElementById('rc-fecha').value;
    if (!titulo || !fecha) { this.showSnackbar('Completa título y fecha', 'warning'); finGuardar(); return; }
    const row = {
      id: 'rec_' + Date.now().toString(36),
      titulo,
      fecha,
      notas: document.getElementById('rc-nota').value.trim(),
      hecho: false,
      creado: new Date().toISOString()
    };
    this.recordatorios.push(row);
    this.saveLocal();
    this._apiCreateRow(() => API.createRecordatorio(row), { m: 'createRecordatorio', a: [row] });
    finGuardar();
    this.closeFormModal();
    this.renderDashboardHome(document.getElementById('page-dashboard'));
    this.showSnackbar('Recordatorio guardado', 'success');
  },

  async toggleRecordatorio(id) {
    const r = this._byId(this.recordatorios, id);
    if (!r) return;
    r.hecho = !r.hecho;
    this.saveLocal();
    await this._updateLocalYApi('recordatorios', r);
    this.renderDashboardHome(document.getElementById('page-dashboard'));
  },

  async deleteRecordatorio(id) {
    if (!(await this._confirm('Eliminar este recordatorio?', 'Eliminar'))) return;
    try {
      const res = await API.deleteRecordatorio(id);
      this._assertDeleted(res, 'El recordatorio');
    } catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.recordatorios = (this.recordatorios || []).filter(x => x.id !== id);
    this.saveLocal();
    this.renderDashboardHome(document.getElementById('page-dashboard'));
    this.showSnackbar('Recordatorio eliminado', 'success');
  },

  // ==================== ENCUESTAS ====================
  async renderEncuestasHub(el) {
    await this._loadSurveys();
    await Promise.all([
      this._loadResponses('pre-adopcion-perros'),
      this._loadResponses('pre-adopcion-gatos'),
      this._loadResponses('pre-acogida'),
      this.loadEstados()
    ]);
    const defs = [
      { surveyId: 'pre-adopcion-perros', page: 'encuestas-perros', icon: Icons.dog, title: 'Pre-adopción Perros' },
      { surveyId: 'pre-adopcion-gatos', page: 'encuestas-gatos', icon: Icons.cat, title: 'Pre-adopción Gatos' },
      { surveyId: 'pre-acogida', page: 'encuestas-acogida', icon: Icons.home, title: 'Solicitudes de Acogida' }
    ];
    const cards = defs.map(d => {
      const list = this.responses[d.surveyId] || [];
      const activas = list.filter(r => this.getEstado(r.id, d.surveyId) !== 'descartada');
      const pendientes = activas.filter(r => this.getEstado(r.id, d.surveyId) === 'pendiente').length;
      const enProceso = activas.filter(r => this.getEstado(r.id, d.surveyId) === 'en_proceso').length;
      const ultima = list.reduce((max, r) => ((r.fecha_creacion||'') > (max||'') ? r.fecha_creacion : max), '');
      const fecha = ultima ? new Date(ultima).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      return `<a class="hub-card" onclick="location.hash='${d.page}'">
        <div class="hub-card-icon">${d.icon}</div>
        <div class="hub-card-body">
          <div class="hub-card-title">${d.title}</div>
          <div class="hub-card-meta">${pendientes} pendientes · ${enProceso} en proceso</div>
          ${fecha ? `<div class="hub-card-date">Última: ${fecha}</div>` : ''}
        </div>
        <span class="hub-card-chevron">${Icons.chevronRight}</span>
      </a>`;
    }).join('');
    el.innerHTML = `<div class="page-list-container"><div class="hub-grid">${cards}</div></div>`;
  },

  async renderEncuesta(el, surveyId) {
    await this._loadSurveys();
    await Promise.all([this._loadResponses(surveyId), this.loadEstados()]);
    const responses = this._sortEncuestas((this.responses[surveyId]||[]).filter(r=>!this.checkBlacklist(r.nombre,r.email)));
    this._shown[surveyId] = 20;
    el.innerHTML = `
      <div class="page-list-container">
        <div class="filters-bar"><div class="search-box"><span class="search-icon"></span><input type="text" placeholder="Buscar nombre o email..." oninput="Dashboard.filterEncuesta(this.closest('.page'),'${surveyId}')"></div><div class="filter-row"><select onchange="Dashboard.filterEncuesta(this.closest('.page'),'${surveyId}')"><option value="">Todos</option><option value="pendiente">Pendientes</option><option value="en_proceso">En proceso</option><option value="aprobada">Aprobadas</option><option value="descartada">Descartadas</option></select></div></div>
        <div class="list-header"><span class="response-count">${responses.length} solicitudes</span><button class="btn btn-primary btn-sm" onclick="Dashboard.exportSurvey('${surveyId}')">${Icons.download} Exportar</button></div>
        <div class="response-list" id="response-list-${surveyId}">${this._renderResponseList(responses,surveyId)}</div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  filterEncuesta(container, surveyId) {
    const s = container?.querySelector('.search-box input')?.value?.toLowerCase() || '';
    const st = container?.querySelector('.filter-row select')?.value || '';
    const c = document.getElementById('response-list-'+surveyId);
    if (!c) return;
    let r = this._sortEncuestas((this.responses[surveyId]||[]).filter(x=>!this.checkBlacklist(x.nombre,x.email)));
    if (s) r = r.filter(x=>((x.nombre||'')+' '+(x.apellidos||'')+' '+(x.email||'')).toLowerCase().includes(s));
    if (st) r = r.filter(x=>this.getEstado(x.id, surveyId)===st);
    c.innerHTML = this._renderResponseList(r,surveyId, (s||st) ? 'Sin resultados' : undefined);
  },

  loadMore(surveyId) {
    this._shown[surveyId] = (this._shown[surveyId] || 20) + 20;
    const container = document.getElementById('response-list-' + surveyId)?.closest('.page');
    if (container) this.filterEncuesta(container, surveyId);
  },

  _sortEncuestas(list) {
    const tv = (f) => { const d = Date.parse(String(f||'').replace(' ', 'T')); return isNaN(d) ? 0 : d; };
    return [...list].sort((a,b)=>{
      const ta = tv(a.fecha_creacion);
      const tb = tv(b.fecha_creacion);
      if (ta === tb) return 0;
      if (ta === 0) return 1;
      if (tb === 0) return -1;
      return tb - ta;
    });
  },

  _renderResponseList(responses, surveyId, emptyMsg) {
    const shown = this._shown[surveyId] || 20;
    let html = this._renderResponseCards(responses.slice(0, shown), surveyId, emptyMsg);
    const rest = responses.length - shown;
    if (rest > 0) html += `<div class="load-more-wrap"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.loadMore('${surveyId}')">+ Cargar más (${rest} restantes)</button></div>`;
    return html;
  },

  _renderResponseCards(responses, surveyId, emptyMsg) {
    if(!responses.length) return '<div class="empty-state"><div class="empty-state-icon">'+Icons.clipboard+'</div><h3>'+(emptyMsg||'No hay solicitudes')+'</h3></div>';
    return responses.map(r=>{const i=this._esc((r.nombre?.[0]||'')+(r.apellidos?.[0]||''));const d=r.fecha_creacion?new Date(r.fecha_creacion).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}):'';const e=this.getEstado(r.id, surveyId);const l=this._estadoLabel(e);const cls=this._estadoCls(e);return`<div class="response-card" data-card="${surveyId}::${r.id}" onclick="Dashboard.viewDetail('${surveyId}','${r.id}')"><div class="response-card-header"><div class="response-avatar">${i}</div><div class="response-info"><div class="response-name">${this._esc(r.nombre||'')} ${this._esc(r.apellidos||'')} <span class="estado-badge ${cls}">${l}</span></div><div class="response-email">${this._esc(r.email||'')}</div></div><div class="response-date">${d}</div></div></div>`;}).join('');
  },

  async viewDetail(surveyId, responseId) {
    await this._ensureListas(['candidaturas', 'animales', 'blacklist']);
    const r=(this.responses[surveyId]||[]).find(x=>x.id===responseId);
    if(!r) return;
    const blMatch = this.blacklist.find(b => {
      const n=(r.nombre||'').toLowerCase().trim();
      const e=(r.email||'').toLowerCase().trim();
      const bn=(b.nombre||'').toLowerCase().trim();
      const ba=(b.apellidos||'').toLowerCase().trim();
      const be=(b.email||'').toLowerCase().trim();
      return (n && (n===bn || n===ba || n===(bn+' '+ba).trim())) || (e && be && e===be);
    });
    const blBanner = blMatch ? `<div class="alert-item danger" style="margin-bottom:16px">${Icons.ban} <span>Esta persona esta en la <b>lista negra</b>${blMatch.motivo?': '+this._esc(blMatch.motivo):''}.</span></div>` : '';
    const sections=this._buildSections(r,surveyId);
    const e=this.getEstado(r.id, surveyId);
    const note=this.notes[surveyId+'::'+r.id]||'';
    const pageMap={'pre-adopcion-perros':'encuestas-perros','pre-adopcion-gatos':'encuestas-gatos','pre-acogida':'encuestas-acogida'};
    const pageId=pageMap[surveyId]||surveyId;
    const cands=this._candidaturasDe(surveyId, responseId);
    const candCls={en_lista:'',elegido:'aprobada',descartado:'descartada'};
    const actionButtons = e==='descartada'
      ? `<button class="btn btn-primary btn-sm" onclick="Dashboard.setEstado('${r.id}','en_proceso','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.check} Restaurar</button>`
      : e==='aprobada'
        ? `<button class="btn btn-sm btn-outline-green" onclick="Dashboard.setEstado('${r.id}','en_proceso','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.arrowRight} Reabrir</button>
           <button class="btn btn-danger btn-sm" onclick="Dashboard.setEstado('${r.id}','descartada','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.xCircle} Descartar</button>`
        : e==='en_proceso'
          ? `<button class="btn btn-primary btn-sm" onclick="Dashboard.aprobarEncuesta('${surveyId}','${r.id}')">${Icons.checkCircle} Aprobar</button>
             <button class="btn btn-sm" onclick="Dashboard.setEstado('${r.id}','pendiente','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.arrowRight} Pendiente</button>
             <button class="btn btn-danger btn-sm" onclick="Dashboard.setEstado('${r.id}','descartada','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.xCircle} Descartar</button>`
          : `<button class="btn btn-primary btn-sm" onclick="Dashboard.setEstado('${r.id}','en_proceso','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.arrowRight} En proceso</button>
             <button class="btn btn-danger btn-sm" onclick="Dashboard.setEstado('${r.id}','descartada','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.xCircle} Descartar</button>`;
    const candHtml = cands.length ? `<div class="detail-section"><div class="detail-section-title">${Icons.users} Candidaturas</div>${cands.map(c=>`<div class="detail-field"><div class="detail-question">${c.tipo==='acogida'?'Acogida':'Adopción'}</div><div class="detail-answer">${c.animal_id?`${this._esc(this._animalName(c.animal_id))} · `:''}<span class="estado-badge ${candCls[c.estado]||''}">${c.estado==='en_lista'?'En lista':c.estado}</span> · desde ${new Date(c.fecha).toLocaleDateString('es-ES')}</div></div>`).join('')}</div>` : '';
    const asig = cands.length ? !!cands[0].animal_id : false;
    const assignBox = e==='aprobada' && !asig ? `<div class="detail-section"><div class="detail-section-title">${Icons.arrowRight} Asignar animal${cands[0]&&cands[0].tipo==='acogida'?' y familia':''}</div><div id="assign-box-${responseId}" style="min-height:70px"><div class="page-loader"><div class="spinner"></div><p>Cargando animales...</p></div></div></div>` : '';
    this._showDetail(pageId, this._esc((r.nombre||'')+' '+(r.apellidos||'')), `
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.exportSingle('${surveyId}','${r.id}')">${Icons.download} PDF</button>
        ${actionButtons}
      </div>
      ${blBanner}
      ${e==='aprobada'?`<div class="alert-item info" style="margin-bottom:16px">${Icons.checkCircle} <span>${asig?'Solicitud aprobada · Animal asignado: '+this._esc(this._animalName(cands[0].animal_id))+'.':'Solicitud aprobada: asigna un animal para continuar.'}</span></div>`:''}
      ${assignBox}
      ${sections.map(s=>`<div class="detail-section"><div class="detail-section-title">${s.title}</div>${s.fields.map(f=>`<div class="detail-field"><div class="detail-question">${f.label}</div><div class="detail-answer">${f.value??'—'}</div></div>`).join('')}</div>`).join('')}
      ${candHtml}
      <div class="notes-section"><div class="detail-section-title"><span>${Icons.pencil} Notas</span><button class="btn btn-primary btn-sm" onclick="Dashboard.saveNote('${r.id}','${surveyId}')">Guardar</button></div><textarea id="note-${r.id}" placeholder="Escribe una nota...">${note}</textarea></div>`);
    if (e==='aprobada' && !asig) this._renderAssignForm(surveyId, responseId);
  },

  _animalName(id) { const a=this.animales.find(x=>x.id===id); return a?a.nombre:'(sin animal)'; },

  _animalEstadoLabel(e) { const m={disponible:'Disponible',en_acogida:'En acogida',en_adopcion:'En adopcion',adoptado:'Adoptado'}; return m[e]||e||'Sin estado'; },

  // ==================== GUIA DE PROCESOS / PERFIL / ASIGNACION ====================

  showTutorial(tab) {
    const el = document.getElementById('tutorial-modal');
    const body = document.getElementById('tutorial-content');
    if (!el || !body) return;
    if (!tab) {
      body.innerHTML = this._tutorialMenu();
    } else {
      const titles = { general: 'Flujo general', adopcion: 'Adopcion (perros/gatos)', acogida: 'Acogida', redes: 'Redes sociales', apadrinamiento: 'Apadrinamiento', gestion: 'Gestion diaria', estados: 'Estados y consejos' };
      const panels = {
        general: this._tutorialGeneral(),
        adopcion: this._tutorialAdopcion(),
        acogida: this._tutorialAcogida(),
      redes: this._tutorialRedes(),
      apadrinamiento: this._tutorialApadrinamiento(),
      gestion: this._tutorialGestion(),
      estados: this._tutorialEstados()
      };
      body.innerHTML = `<button class="btn btn-outline-green btn-sm tutorial-back" onclick="Dashboard.showTutorial()">${Icons.arrowLeft} Todas las guías</button><h3 class="tutorial-guide-title">${titles[tab] || ''}</h3><div class="tutorial-panel">${panels[tab] || ''}</div>`;
    }
    el.style.display = 'flex';
    body.scrollTop = 0;
    this.injectIcons();
  },

  _tutorialMenu() {
    const guides = [
      ['general', 'Flujo general', 'Vision global del proceso.', Icons.dashboard, '#e8faf0', '#16a34a'],
      ['adopcion', 'Adopcion (perros/gatos)', 'De la solicitud al contrato firmado.', Icons.heart, '#e8faf0', '#16a34a'],
      ['acogida', 'Acogida', 'Familias, casos y cierre.', Icons.home, '#ebf5fb', '#2563eb'],
      ['redes', 'Redes sociales', 'Plantillas y publicaciones.', Icons.clipboard, '#fce4ec', '#e91e63'],
      ['apadrinamiento', 'Apadrinamiento', 'Padrinos, aportes e historial.', Icons.paw, '#f3e8ff', '#7c3aed'],
      ['gestion', 'Gestion diaria', 'Gastos, vencimientos, donaciones y socios.', Icons.calendar, '#ebf5fb', '#2563eb'],
      ['estados', 'Estados y consejos', 'Que significa cada estado.', Icons.checkCircle, '#e8faf0', '#16a34a']
    ];
    return `<div class="guide-menu">${guides.map(([k, t, d, ic, bg, fg]) => `<button class="guide-menu-item" onclick="Dashboard.showTutorial('${k}')"><span class="guide-menu-icon" style="background:${bg};color:${fg}">${ic}</span><span class="guide-menu-text"><b>${t}</b><small>${d}</small></span><span class="guide-menu-chevron">${Icons.chevronRight}</span></button>`).join('')}</div>
    <div class="guide-note">${Icons.info} <span>Los estados se pueden mover hacia delante y hacia atras en cualquier momento desde la ficha de cada solicitud.</span></div>
    <h4 class="tutorial-section-title">Accesos directos</h4>
    ${this._tutorialIndex()}`;
  },

  _flowDiagram(nodes, accent) {
    const X = 16, W = 312, H = 54, GAP = 24, NUM = 13, TOP = 14;
    const h = TOP + nodes.length * (H + GAP) + 4;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${X + W + X} ${h}" role="img" aria-label="Diagrama del flujo de procesos">`;
    nodes.forEach((n, i) => {
      const y = TOP + i * (H + GAP);
      const cy = y + H / 2;
      const cxNum = X + NUM + 4;
      const cx = cxNum + NUM + 12;
      const branch = i >= 3;
      s += `<rect x="${X}" y="${y}" width="${W}" height="${H}" rx="12" fill="#ffffff" stroke="${branch ? accent : '#d1d5db'}" stroke-width="1.5"/>`;
      s += `<circle cx="${cxNum}" cy="${cy}" r="${NUM}" fill="${branch ? accent : '#9ca3af'}"/><text x="${cxNum}" y="${cy + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#ffffff">${i + 1}</text>`;
      s += `<text x="${cx}" y="${cy - 1}" font-size="13.5" font-weight="700" fill="#1f2937">${n[0]}</text>`;
      if (n[1]) s += `<text x="${cx}" y="${cy + 15}" font-size="10.5" fill="#6b7280">${n[1]}</text>`;
      if (i < nodes.length - 1) {
        const y1 = y + H, y2 = y1 + GAP;
        s += `<line x1="${X + W / 2}" y1="${y1}" x2="${X + W / 2}" y2="${y2}" stroke="#cbd5e1" stroke-width="2"/>`;
        s += `<path d="M ${X + W / 2 - 5} ${y2 - 5} L ${X + W / 2} ${y2} L ${X + W / 2 + 5} ${y2 - 5}" fill="none" stroke="#cbd5e1" stroke-width="2"/>`;
      }
    });
    return s + '</svg>';
  },

  _guideStep(icon, title, text, loc, green) {
    const bg = green ? '#e8faf0' : '#ebf5fb';
    const fg = green ? '#16a34a' : '#2563eb';
    return `<div class="guide-step"><div class="guide-step-icon" style="background:${bg};color:${fg}">${icon}</div><div class="guide-step-body"><h4>${title}</h4><p>${text}</p>${loc ? `<span class="guide-step-loc">${Icons.mapPin} ${loc}</span>` : ''}</div></div>`;
  },

  _jumpTo(page) {
    this.closeTutorial();
    this.closeProfile();
    location.hash = '#' + page;
  },

  _tutorialGeneral() {
    return `
      <div class="guide-diagram">${this._flowDiagram([
        ['Solicitud llega', 'pre-adopcion perros / gatos / acogida'],
        ['Revisa y toma notas', 'Pendiente → En proceso'],
        ['Aprueba o descarta', 'Aprobar crea la candidatura'],
        ['Asigna animal (y familia)', 'desde la ficha de la solicitud'],
        ['Proceso activo', 'acogida en curso o contrato de adopcion'],
        ['Cierre', 'adoptado / familia libre']
      ], '#1FC95B')}</div>
      <div class="guide-note">${Icons.info} <span>La barra de estado del detalle te deja mover la solicitud hacia delante y hacia atras en cualquier momento: <b>Pendiente</b>, <b>En proceso</b>, <b>Aprobar</b> y <b>Descartar</b>.</span></div>
      <div class="guide-cols">
        <div class="guide-card"><div class="guide-card-icon" style="background:#ebf5fb;color:#2563eb">${Icons.home}</div><h4>Ruta de acogida</h4><p>La encuesta de <b>pre-acogida</b> aprobada crea la familia acogedora (maximo 1 animal). Se asigna animal y familia, y el caso se sigue en <b>Acogidas activas</b>: Entrega → En casa → Finalizada.</p><button class="btn btn-sm btn-outline-green" onclick="Dashboard.showTutorial('acogida')">Ver guia de acogida</button></div>
        <div class="guide-card"><div class="guide-card-icon" style="background:#e8faf0;color:#16a34a">${Icons.heart}</div><h4>Ruta de adopcion</h4><p>La encuesta <b>pre-adopcion</b> (perros/gatos) aprobada permite asignar un animal disponible y formalizarlo con el <b>Contrato de adopcion</b> (firma + PDF) desde Adopciones.</p><button class="btn btn-sm btn-outline-green" onclick="Dashboard.showTutorial('adopcion')">Ver guia de adopcion</button></div>
      </div>`;
  },

  _tutorialAdopcion() {
    return `
      <div class="guide-diagram">${this._flowDiagram([
        ['Solicitud llega', 'encuesta pre-adopcion'],
        ['Revisa y toma notas', 'Pendiente → En proceso'],
        ['Aprueba o descarta', 'Aprobar crea la candidatura'],
        ['Asigna un animal', 'estado → Elegida'],
        ['Contrato de adopcion', 'firma + PDF'],
        ['Adoptado', 'animal fuera de disponibles'],
        ['Caso eliminado', 'animal Disponible · solicitud En proceso']
      ], '#16a34a')}</div>
      ${this._guideStep(Icons.dog, '1. La solicitud llega', 'Cada persona que completa la encuesta de pre-adopcion (perros o gatos) aparece en su listado con estado <b>Pendiente</b>. Todo se gestiona desde el detalle de la persona (pulsando sobre ella).', 'Encuestas > Perros / Gatos', true)}
      ${this._guideStep(Icons.clipboard, '2. Revisa la solicitud', 'En el detalle puedes leer sus respuestas, dejar una <b>nota</b> y pasarla a <b>En proceso</b> mientras la valoras. Usa el buscador y los filtros para ordenar la lista (pendientes, aprobadas, etc.).', 'Detalle: botones Nota y En proceso', true)}
      ${this._guideStep(Icons.checkCircle, '3. Aprueba o descarta', 'Cuando termines pulsa <b>Aprobar</b>: se crea su candidatura automaticamente y pasa a la lista de aprobados. Con <b>Descartar</b> se aparta. <br><b>Importante:</b> si la solicitud vuelve a Pendiente (o se descarta), deja de ser candidata y ya no podra asignarsele animal.', 'Detalle: botones Aprobar / Descartar', true)}
      ${this._guideStep(Icons.paw, '4. Asigna el animal', 'Reabre el detalle de la persona ya aprobada: veras el bloque <b>Asignar animal</b>. Elige un animal disponible y guarda. El estado pasa a <b>Elegida</b> y se crea el caso en Adopciones.', 'Ficha de la solicitud aprobada', true)}
      ${this._guideStep(Icons.fileText, '5. Contrato de adopcion', 'Entra en <b>Adopciones</b>, abre el caso y pulsa <b>Nuevo contrato</b>: firmante 1 obligatorio (firma dibujada en pantalla), firmante 2 opcional (por defecto Grupo Nebak), fecha y ciudad. Descarga el <b>PDF</b> y guarda.', 'Adopciones > caso', true)}
      ${this._guideStep(Icons.checkCircle, '6. Cierre', 'Al guardar el contrato el animal queda <b>Adoptado</b> y deja de estar disponible, evitando que se asigne dos veces.', 'Adopciones', true)}
      ${this._guideStep(Icons.eye, '7. Ver el cuestionario desde el caso', 'En el detalle del caso, el bloque <b>Solicitud de origen</b> tiene el boton <b>Ver cuestionario</b>: abre las respuestas tal cual se ven en Encuestas, con opcion a PDF o a saltar a su ficha.', 'Adopciones > caso', true)}
      ${this._guideStep(Icons.trash, '8. Anular un caso', 'Con <b>Eliminar</b> se borra el caso (y su contrato si lo hay) con rollback automatico: el animal vuelve a <b>Disponible</b>, la solicitud pasa de Aprobada a <b>En proceso</b> y la candidatura se libera. Puedes reasignar desde cero.', 'Adopciones > caso > Eliminar', false)}`;
  },

  _tutorialAcogida() {
    return `
      <div class="guide-diagram">${this._flowDiagram([
        ['Solicitud llega', 'encuesta pre-acogida'],
        ['Revisa y toma notas', 'Pendiente → En proceso'],
        ['Aprueba: crea la familia', 'maximo 1 animal'],
        ['Asigna animal y familia', 'estado → Elegida'],
        ['Seguimiento del caso', 'Entrega → En casa → Finalizada'],
        ['Cierre', 'animal Disponible, familia Libre'],
        ['Caso eliminado', 'animal Disponible · solicitud En proceso']
      ], '#2563eb')}</div>
      ${this._guideStep(Icons.home, '1. La solicitud llega', 'Cada persona que completa la encuesta de <b>pre-acogida</b> aparece en el listado con estado <b>Pendiente</b>.', 'Encuestas > Acogida', false)}
      ${this._guideStep(Icons.clipboard, '2. Revisa la solicitud', 'Abre el detalle, lee sus respuestas, deja <b>notas</b> y marca <b>En proceso</b> mientras la valoras.', 'Detalle: botones Nota y En proceso', false)}
      ${this._guideStep(Icons.checkCircle, '3. Aprueba (crea la familia)', 'Al aprobar se crea la <b>familia acogedora</b> a partir de los datos de la encuesta (<b>maximo 1 animal por familia</b>) y la candidatura de la persona. Si ya existe coincidira automaticamente.', 'Detalle: boton Aprobar', false)}
      ${this._guideStep(Icons.paw, '4. Asigna animal y familia', 'En el detalle de la persona aprobada usa el bloque <b>Asignar animal</b>: elige el animal disponible y confirma la familia acogedora (verde = libre). El estado pasa a <b>Elegida</b> y se crea el caso.', 'Ficha de la solicitud aprobada', false)}
      ${this._guideStep(Icons.clock, '5. Seguimiento del caso', 'El caso se controla en <b>Acogidas activas</b> con los botones de fase: <b>Entrega → En casa → Finalizada</b>.', 'Acogidas activas', false)}
      ${this._guideStep(Icons.checkCircle, '6. Cierre', 'Al marcar <b>Finalizada</b> (pide confirmacion) el animal vuelve a <b>Disponible</b> y la familia a <b>Libre</b> si no tiene mas animales, lista para otra acogida.', 'Acogidas activas', false)}
      ${this._guideStep(Icons.trash, '7. Eliminar un caso', 'La papelera de cada tarjeta borra el caso con rollback automatico: el animal vuelve a <b>Disponible</b>, la solicitud pasa a <b>En proceso</b> y la candidatura se libera. Lo mismo ocurre al eliminar la familia (cierra sus casos activos).', 'Acogidas activas', false)}`;
  },

  _tutorialRedes() {
    return `
      <div class="guide-diagram">${this._flowDiagram([
        ['Elige animal', 'foto + datos'],
        ['Revisa plantilla', 'caption editable'],
        ['Publica (simulado)', 'historial local'],
        ['Conecta Instagram', 'Meta: cuenta + App'],
        ['Historial real', 'enlaces en la ficha']
      ], '#e91e63')}</div>
      ${this._guideStep(Icons.heart, '1. Elige animal y tipo', 'En <b>Redes</b> selecciona el animal y el tipo (<b>Adopcion</b> con contrato o <b>Acogida</b> temporal): veras su foto y el texto <b>plantilla</b> ya rellenado (datos, iconos, telefonos de contacto y hashtags). Tambien se llega con el boton <b>Publicar</b> de su ficha.', 'Redes', true)}
      ${this._guideStep(Icons.pencil, '2. Ajusta y previsualiza', 'Edita el caption (contador hasta 2200) o usa <b>Copiar texto</b>. La <b>vista previa</b> muestra como quedaria el post.', 'Redes > Vista previa', true)}
      ${this._guideStep(Icons.checkCircle, '3. Publica', 'Pulsa <b>Publicar</b>: de momento se guarda como <b>simulada</b> (naranja) con su enlace de ejemplo en el historial. Aparece tambien en la ficha del animal.', 'Redes > Publicar', true)}
      ${this._guideStep(Icons.info, '4. Conexion real (pendiente)', 'Para publicar de verdad hace falta cuenta de Empresa/Creador vinculada a Facebook + App de Meta. Entonces cada post guardara su enlace real y saldra en la ficha como "Ver post".', 'Meta Business', false)}`;
  },

  _tutorialApadrinamiento() {
    return `
      <div class="guide-diagram">${this._flowDiagram([
        ['Animal apadrinable', 'check + disponible/en acogida'],
        ['Nuevo apadrinamiento', 'socio o externo + aporte'],
        ['Varios padrinos', 'total €/mes en ficha'],
        ['Convertir a socio', 'externo pasa a Socios'],
        ['Finalizar', 'se libera, queda historial']
      ], '#7c3aed')}</div>
      ${this._guideStep(Icons.paw, '1. Marca el animal', 'En nuevo/editar animal activa <b>Acepta apadrinamiento</b>. Solo con el check y estado disponible/en acogida sale el boton de apadrinar.', 'Animales > ficha', true)}
      ${this._guideStep(Icons.users, '2. Socio o externo', 'Al apadrinar elige un <b>socio existente</b> o crea un <b>externo</b> (nombre + contacto + aporte €/mes). Un animal puede tener varios padrinos a la vez.', 'Ficha animal > Apadrinamientos', true)}
      ${this._guideStep(Icons.checkCircle, '3. Seguimiento', 'La ficha suma el total mensual. En la ficha del socio veras "Apadrina a" con su historial.', 'Fichas', true)}
      ${this._guideStep(Icons.trash, '4. Finalizar o convertir', '<b>Finalizar</b> cierra el apadrinamiento (queda en historial). Un externo se <b>convierte a socio</b> con un toque, enlazando su historial.', 'Ficha animal', false)}`;
  },

  _tutorialGestion() {
    return `
      <div class="guide-diagram">${this._flowDiagram([
        ['Gasto veterinario', 'ficha del animal'],
        ['Vencimiento', 'widget + aviso'],
        ['Donacion', 'pantalla Donaciones'],
        ['Socio / voluntario', 'cuota + carnet'],
        ['Documento', 'referencia en ficha']
      ], '#2563eb')}</div>
      ${this._guideStep(Icons.activity, '1. Gastos veterinarios', 'En la ficha del animal, seccion <b>Gastos</b>: fecha, concepto e importe, con total acumulado.', 'Animales > ficha', false)}
      ${this._guideStep(Icons.calendar, '2. Vencimientos', 'El widget del dashboard avisa (Vencido/Hoy/En N dias). Marca <b>Hecho</b> o elimina desde ahi mismo.', 'Dashboard', false)}
      ${this._guideStep(Icons.heart, '3. Donaciones', 'Pantalla propia con total, alta y baja. Cada donacion queda en su hoja.', 'Donaciones', false)}
      ${this._guideStep(Icons.users, '4. Socios y voluntarios', 'Perfiles <b>Socio</b>, <b>Voluntario</b> o <b>Ambos</b> (la cuota solo aplica a socios). El carnet cambia de color por perfil.', 'Socios', false)}
      ${this._guideStep(Icons.fileText, '5. Documentos', 'Referencias locales (cartilla, vacunas, analiticas) en la ficha del animal, marcadas como simuladas hasta archivar en Drive.', 'Animales > ficha', false)}`;
  },

  _tutorialEstados() {
    const estados = [
      ['pendiente', 'Pendiente', 'Acaba de llegar o se ha vuelto a desmarcar. Aun no se asigna nada.'],
      ['en_proceso', 'En proceso', 'Se esta valorando: se revisan respuestas y se dejan notas.'],
      ['aprobada', 'Aprobada', 'Candidata: desde su ficha se le puede asignar animal (y familia en acogida).'],
      ['descartada', 'Descartada', 'Apartada del proceso. No cuenta en el total activo.'],
      ['elegida', 'Elegida', 'Tiene animal asignado y un caso abierto (adopcion o acogida).']
    ];
    return `
      <div class="guide-note">${Icons.info} <span>Los estados se guardan <b>por solicitud</b> y se muestran siempre como etiqueta de color junto a cada persona. Cambiar de estado es <b>reversible</b> en cualquier momento.</span></div>
      <h4 class="guide-subtitle">Que significa cada estado</h4>
      <div class="guide-estados">${estados.map(e=>`<div class="guide-estado"><span class="estado-badge ${e[0]}">${e[1]}</span><p>${e[2]}</p></div>`).join('')}</div>`;
  },

  _tutorialIndex() {
    return `
      <div class="guide-index">
        <button class="guide-index-item" onclick="Dashboard._jumpTo('encuestas-perros')"><span class="guide-index-icon" style="background:#e8faf0;color:#16a34a">${Icons.dog}</span><div><b>Encuestas > Perros</b><small>Revisar solicitudes, aprobar/descartar, notas y asignar animal en la ficha.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('encuestas-gatos')"><span class="guide-index-icon" style="background:#e8faf0;color:#16a34a">${Icons.cat}</span><div><b>Encuestas > Gatos</b><small>Igual que perros, para la encuesta de gatos.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('encuestas-acogida')"><span class="guide-index-icon" style="background:#ebf5fb;color:#2563eb">${Icons.home}</span><div><b>Encuestas > Acogida</b><small>Solicitudes de acogida. Al aprobar se crea la familia.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('animales')"><span class="guide-index-icon" style="background:#e8faf0;color:#16a34a">${Icons.heart}</span><div><b>Animales</b><small>Registrar animales, camadas/grupos y ver disponibilidad (Disponible / En acogida / Adoptado).</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('acogidas')"><span class="guide-index-icon" style="background:#ebf5fb;color:#2563eb">${Icons.home}</span><div><b>Acogidas (familias)</b><small>Familias acogedoras, su capacidad y animales que tienen.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('acogidas-activas')"><span class="guide-index-icon" style="background:#ebf5fb;color:#2563eb">${Icons.home}</span><div><b>Acogidas activas</b><small>Casos en curso: avanzar la fase (Entrega → En casa → Finalizada).</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('adopciones')"><span class="guide-index-icon" style="background:#e8faf0;color:#16a34a">${Icons.fileText}</span><div><b>Adopciones</b><small>Casos de adopcion y contratos con firma en pantalla + PDF.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('socios')"><span class="guide-index-icon" style="background:#e8faf0;color:#16a34a">${Icons.users}</span><div><b>Socios</b><small>Socios activos/inactivos con generacion del carnet.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('blacklist')"><span class="guide-index-icon" style="background:#fee2e2;color:#dc2626">${Icons.ban}</span><div><b>Lista negra</b><small>Personas apartadas: apareceran avisos al abrir su solicitud.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('redes')"><span class="guide-index-icon" style="background:#fce4ec;color:#e91e63">${Icons.heart}</span><div><b>Redes</b><small>Publicaciones de Instagram (simuladas) con plantilla por animal.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard._jumpTo('donaciones')"><span class="guide-index-icon" style="background:#e8faf0;color:#16a34a">${Icons.heart}</span><div><b>Donaciones</b><small>Libro de donaciones puntuales con total.</small></div></button>
        <button class="guide-index-item" onclick="Dashboard.showTutorial('apadrinamiento')"><span class="guide-index-icon" style="background:#f3e8ff;color:#7c3aed">${Icons.paw}</span><div><b>Apadrinamiento</b><small>Varios padrinos (socios o externos) por animal, con aporte mensual.</small></div></button>
      </div>`;
  },

  closeTutorial() {
    const el = document.getElementById('tutorial-modal');
    if (el) el.style.display = 'none';
  },

  showProfile() {
    const el = document.getElementById('profile-modal');
    const body = document.getElementById('profile-content');
    if (!el || !body) return;
    const name = this.userProfile?.name || this.userProfile?.email || 'Usuario';
    const avatar = name.charAt(0).toUpperCase();
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0 20px">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--primary-lighter);color:var(--primary-hover);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700">${avatar}</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--gray-900);margin-top:8px">${this._esc(name)}</div>
        <div style="color:var(--gray-500);font-size:0.85rem">${this.userProfile?.email?this._esc(this.userProfile.email):''}</div>
        <div><span class="estado-badge en_proceso">${this.userProfile?.role||'admin'}</span></div>
      </div>
      <button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:8px" onclick="Dashboard.closeProfile();Dashboard.showTutorial()">${Icons.helpCircle} Guia de procesos</button>
      <button class="btn btn-danger btn-sm" style="width:100%" onclick="Auth.logout()">${Icons.xCircle} Cerrar sesion</button>`;
    el.style.display = 'flex';
    this.injectIcons();
  },

  closeProfile() {
    const el = document.getElementById('profile-modal');
    if (el) el.style.display = 'none';
  },

  showInfoModal(title, html) {
    const modal = document.getElementById('info-modal');
    const titleEl = document.getElementById('info-title');
    const body = document.getElementById('info-body');
    if (!modal || !body) return;
    if (titleEl) titleEl.textContent = title || 'Detalle';
    body.innerHTML = html;
    modal.style.display = 'flex';
    this.injectIcons();
    this._focusModal(modal);
  },

  closeInfoModal() {
    const modal = document.getElementById('info-modal');
    if (modal) modal.style.display = 'none';
  },

  showFormModal(title, html) {
    const modal = document.getElementById('form-modal');
    const titleEl = document.getElementById('form-title');
    const body = document.getElementById('form-body');
    if (!modal || !body) return;
    if (titleEl) titleEl.textContent = title || 'Formulario';
    body.innerHTML = html;
    modal.style.display = 'flex';
    this.injectIcons();
    this._focusModal(modal);
  },

  closeFormModal() {
    const modal = document.getElementById('form-modal');
    if (modal) modal.style.display = 'none';
  },

  async viewCuestionarioModal(surveyId, responseId) {
    this.showLoading();
    try {
      await Promise.all([
        this._loadResponses(surveyId),
        this.loadEstados(),
        this.loadNotas(),
        this._loadListBestEffort('animales', () => API.getAnimales())
      ]);
    } catch (err) {
      this.hideLoading();
      this.showSnackbar('No se pudo cargar el cuestionario: ' + this._errMsg(err), 'error');
      return;
    }
    this.hideLoading();
    const r = (this.responses[surveyId] || []).find(x => String(x.id) === String(responseId));
    if (!r) { this.showSnackbar('Cuestionario no encontrado', 'warning'); return; }
    const sections = this._buildSections(r, surveyId);
    const e = this.getEstado(r.id, surveyId);
    const note = this.notes[surveyId + '::' + r.id] || '';
    const surveyName = ((this.surveys || []).find(s => s.id === surveyId) || {}).name || surveyId;
    this.showInfoModal('Cuestionario · ' + surveyName, `
      <div class="detail-field"><div class="detail-question">Solicitante</div><div class="detail-answer">${this._esc(((r.nombre || '') + ' ' + (r.apellidos || '')).trim())} · ${this._esc(r.email || '')}</div></div>
      <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="estado-badge ${this._estadoCls(e)}">${this._estadoLabel(e)}</span></div></div>
      ${sections.map(s => `<div class="detail-section"><div class="detail-section-title">${s.title}</div>${s.fields.map(f => `<div class="detail-field"><div class="detail-question">${f.label}</div><div class="detail-answer">${f.value ?? '—'}</div></div>`).join('')}</div>`).join('')}
      ${note ? `<div class="detail-section"><div class="detail-section-title">${Icons.pencil} Notas</div><div class="detail-answer">${this._esc(note)}</div></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.exportSingle('${surveyId}','${r.id}')">${Icons.download} PDF</button>
        <button class="btn btn-outline-green btn-sm" onclick="Dashboard.openCuestionarioEnPagina('${surveyId}','${r.id}')">${Icons.arrowRight} Abrir en Encuestas</button>
      </div>`);
  },

  openCuestionarioEnPagina(surveyId, responseId) {
    this.closeInfoModal();
    const page = this._encuestaPage(surveyId);
    if (location.hash === '#' + page) { this.viewDetail(surveyId, responseId); return; }
    location.hash = page;
    const iv = setInterval(() => {
      const el = document.getElementById('page-' + page);
      if (el && el.querySelector('.response-list')) {
        clearInterval(iv);
        this.viewDetail(surveyId, responseId);
      }
    }, 150);
    setTimeout(() => clearInterval(iv), 6000);
  },

  async _renderAssignForm(surveyId, responseId) {
    try {
      await Promise.all([
        this._loadList('animales', () => API.getAnimales()),
        this._loadList('familias', () => API.getFamilias()),
        this._loadList('adopciones', () => API.getAdopciones())
      ]);
    } catch (err) { /* backend opcional, cae a local */ }
    const box = document.getElementById('assign-box-' + responseId);
    if (!box) return;
    if (this.getEstado(responseId, surveyId) !== 'aprobada') { box.innerHTML = ''; return; }
    let c = this._candidaturasDe(surveyId, responseId)[0];
    if (!c) c = this._crearCandidatura(surveyId, responseId, surveyId === 'pre-acogida' ? 'acogida' : 'adopcion');
    if (!c) { box.innerHTML = '<div style="color:var(--gray-400);font-size:0.85rem">No se pudo crear la candidatura para esta solicitud.</div>'; return; }
    if (c.animal_id) { box.innerHTML = '<div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="estado-badge aprobada">Animal asignado</span></div></div>'; return; }
    const selKey = surveyId + '-' + responseId;
    const disp = this.animales.filter(a => a.estado === 'disponible');
    const fams = this.familias.filter(f => (f.capacidad || 'Libre') !== 'Ocupada');
    const needsFam = c.tipo === 'acogida';
    box.innerHTML = `
      <div class="detail-field"><div class="detail-question">Animal disponible</div>
        <select id="asg-animal-${selKey}" class="form-input">${disp.length ? disp.map(a=>`<option value="${a.id}">${this._esc(a.nombre)} (${this._esc(a.especie)} · ${this._esc(a.raza)})</option>`).join('') : `<option value="">(Sin animales disponibles)</option>`}</select>
      </div>
      ${needsFam ? `<div class="detail-field"><div class="detail-question">Familia de acogida</div><select id="asg-familia-${selKey}" class="form-input">${fams.length ? fams.map(f=>`<option value="${f.id}">${this._esc(f.nombre)}${f.ubicacion?' · '+this._esc(f.ubicacion):''}</option>`).join('') : `<option value="">(Sin familias libres)</option>`}</select></div>` : ''}
      <div style="padding:12px 0 0;border-top:1px solid var(--gray-100);margin-top:8px"><button class="btn btn-primary btn-sm" ${disp.length?'':'disabled'} onclick="Dashboard.asignarCandidatura('${surveyId}','${responseId}')">${Icons.checkCircle} Asignar animal</button></div>`;
  },

  async asignarCandidatura(surveyId, responseId) {
    if (this.getEstado(responseId, surveyId) !== 'aprobada') {
      this.showSnackbar('La solicitud no esta aprobada', 'warning');
      this.viewDetail(surveyId, responseId);
      return;
    }
    let c = this._candidaturasDe(surveyId, responseId)[0];
    if (!c) c = this._crearCandidatura(surveyId, responseId, surveyId === 'pre-acogida' ? 'acogida' : 'adopcion');
    if (!c) return;
    const selKey = surveyId + '-' + responseId;
    const animalSel = document.getElementById('asg-animal-' + selKey);
    const a = animalSel ? this.animales.find(x => x.id === animalSel.value) : null;
    if (!a) { this.showSnackbar('Selecciona un animal', 'warning'); return; }
    let familiaId = null;
    if (c.tipo === 'acogida') {
      const fs = document.getElementById('asg-familia-' + selKey);
      familiaId = fs ? fs.value : c.familia_id;
        if (!familiaId) { this.showSnackbar('Selecciona una familia de acogida', 'warning'); return; }
    }
    const ok = await this._crearCasoDesdeCandidatura(c, a, familiaId);
    if (!ok) return;
    c.animal_id = a.id;
    c.familia_id = familiaId;
    c.estado = 'elegido';
    this.saveLocal();
    await this._updateLocalYApi('candidaturas', c);
    this.viewDetail(surveyId, responseId);
    this._regLog(c.tipo === 'acogida' ? 'acogida' : 'adopcion', (c.tipo === 'acogida' ? 'Caso de acogida' : 'Candidato asignado') + ': ' + a.nombre + (c.tipo === 'acogida' && familiaId ? ' a familia' : ''), 'candidatura', c.id);
    this.showSnackbar('Candidato asignado. Caso creado.', 'success');
  },

  async _crearCasoDesdeCandidatura(c, a, familiaId) {
    const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    if (c.tipo === 'acogida') {
      const fam = this.familias.find(f => f.id === familiaId);
      if (!fam) { this.showSnackbar('Familia no encontrada', 'warning'); return false; }
      const caso = {
        id: 'acg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        animal_id: a.id,
        familia_id: familiaId,
        animal: a.nombre + (a.raza ? ' (' + a.raza + ')' : ''),
        familia: fam.nombre,
        fase: 'entrega',
        estado: 'activa',
        inicio: hoy,
        solicitud_id: c.solicitud_id,
        notas: 'Desde candidatura ' + c.nombre
      };
      this.acogidas.push(caso);
      this.saveLocal();
      this._apiCreateRow(() => API.createAcogida(caso), { m: 'createAcogida', a: [caso] });
      a.estado = 'en_acogida';
      a.acogida_familia = familiaId;
      await this._updateLocalYApi('animales', a);
      if (fam.capacidad !== 'Ocupada') {
        fam.capacidad = 'Ocupada';
        fam.animales_actuales = (fam.animales_actuales || 0) + 1;
        if (fam.max_capacity && fam.animales_actuales >= parseInt(fam.max_capacity, 10)) fam.capacidad = 'Ocupada';
        await this._updateLocalYApi('familias', fam);
      }
      return true;
    }
    const adopcion = {
      animal: a.nombre + (a.raza ? ' (' + a.raza + ')' : ''),
      adoptante: c.nombre || c.email || 'Candidato',
      email: c.email || '',
      telefono: '',
      fase: 'Revision',
      estado: 'Candidato elegido',
      notas: 'Desde candidatura ' + c.solicitud_id,
      fecha: hoy,
      solicitud_id: c.solicitud_id,
      animal_id: a.id
    };
    let adopcionId = null;
    try {
      const res = await API.createAdopcion(adopcion);
      if (res.data) { this.adopciones.push(res.data); adopcionId = res.data.id; }
      else adopcionId = 'adp_' + Date.now().toString(36);
    } catch (err) {
      adopcionId = 'adp_' + Date.now().toString(36);
      this._pushLocal('adopciones', { ...adopcion, id: adopcionId });
      this._enqueueOp({ m: 'createAdopcion', a: [{ ...adopcion, id: adopcionId }] });
    }
    if (adopcionId) {
      const localRow = this.adopciones.find(x => x.id === adopcionId);
      if (localRow) adopcionId = localRow.id;
      a.estado = 'en_adopcion';
      a.adopcion_id = adopcionId;
      await this._updateLocalYApi('animales', a);
    }
    return true;
  },

  async _updateLocalYApi(col, item) {
    const map = { animales: 'updateAnimal', familias: 'updateFamilia', candidaturas: 'updateCandidatura', acogidas: 'updateAcogida', contratos: 'updateContrato', apadrinamientos: 'updateApadrinamiento', gastos: 'updateGasto', recordatorios: 'updateRecordatorio', donaciones: 'updateDonacion', seguimientos: 'updateSeguimiento' };
    const m = map[col];
    if (!m) return;
    try { await API[m](item.id, item); }
    catch (err) { this._enqueueOp({ m, a: [item.id, item] }); }
  },

  async _apiCreateRow(apiFn, op) {
    try { await apiFn(); }
    catch (err) {
      console.warn('API create fallback local:', err);
      if (op) this._enqueueOp(op);
    }
  },

  // Cola de operaciones pendientes (offline): se reintenta al volver la red.
  // El backend hace upsert por id, asi reintentar nunca duplica filas.
  _queueOps() {
    try { return JSON.parse(localStorage.getItem('gn_pending_ops') || '[]'); } catch { return []; }
  },

  _enqueueOp(op) {
    if (!op || !op.m) return;
    const q = this._queueOps();
    q.push({ m: op.m, a: op.a || [], ts: Date.now() });
    try { localStorage.setItem('gn_pending_ops', JSON.stringify(q.slice(-200))); } catch {}
    this._renderPendingBadge();
  },

  async flushPendingOps() {
    const q = this._queueOps();
    if (!q.length) return 0;
    const rest = [];
    let done = 0;
    for (const op of q) {
      try {
        const fn = API[op.m];
        if (typeof fn !== 'function') continue;
        await fn.apply(API, op.a || []);
        done++;
      } catch (err) { rest.push(op); }
    }
    try { localStorage.setItem('gn_pending_ops', JSON.stringify(rest)); } catch {}
    this._renderPendingBadge();
    if (done) this.showSnackbar('Sincronizadas ' + done + ' operaciones pendientes', 'success');
    return done;
  },

  _renderPendingBadge() {
    let n = 0;
    try { n = this._queueOps().length; } catch {}
    document.querySelectorAll('.pending-sync-badge').forEach(el => {
      el.style.display = n ? '' : 'none';
      el.textContent = n ? n + ' pendientes' : '';
    });
  },

  _regLog(tipo, detalle, entidad, entidadId) {
    const row = { id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), fecha: new Date().toISOString(), usuario: Auth.currentUser?.email || 'admin', tipo: tipo, detalle: detalle, entidad: entidad || '', entidad_id: entidadId || '', descripcion: detalle };
    (this.actividad || []).unshift(row);
    this.saveLocal();
    this._apiCreateRow(() => API.createActividad(row), { m: 'createActividad', a: [row] });
  },

  _pushLocal(col, row) {
    if (col === 'adopciones') this.adopciones.push(row);
    if (col === 'candidaturas') this.candidaturas.push(row);
    if (col === 'acogidas') this.acogidas.push(row);
    if (col === 'contratos') this.contratos.push(row);
  },

  async saveNote(id, surveyId) {
    const ta = document.getElementById('note-' + id);
    if (!ta) return;
    const nota = ta.value;
    this.notes[surveyId + '::' + id] = nota;
    try {
      await API.setNota(id, surveyId, nota);
      this.showSnackbar('Nota guardada', 'success');
    } catch (err) {
      this.showSnackbar(this._errMsg(err), 'error');
    }
  },

  exportSurvey(surveyId) {
    const survey = this.surveys.find(s => s.id === surveyId);
    const rows = (this.responses[surveyId] || []).filter(r => this.getEstado(r.id, surveyId) !== 'descartada');
    PdfExport.exportAllResponses(rows, survey);
  },
  exportSingle(surveyId, id) {
    const row = (this.responses[surveyId] || []).find(r => r.id === id);
    const survey = this.surveys.find(s => s.id === surveyId);
    if (row) PdfExport.exportSingleResponse(row, survey);
  },

  // Formatea fechas de Forms/Sheets (ISO, Date o "D/M/YYYY [hh:mm]").
  // Conservador: lo que no es fecha inequivoca se devuelve tal cual
  // (un "2024" suelto o un microchip no se tocan). Vacio -> "—".
  _fmtFecha(v) {
    if (v === undefined || v === null || v === '') return '—';
    if (v instanceof Date) return isNaN(v.getTime()) ? '—' : this._fechaCorta(v, v.getHours() || v.getMinutes() ? true : false);
    const s = String(v).trim();
    if (!s) return '—';
    let d = null, conHora = false;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      conHora = !!m[4];
    } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      conHora = !!m[4];
    }
    if (!d || isNaN(d.getTime())) return s;
    return this._fechaCorta(d, conHora);
  },

  _fechaCorta(d, conHora) {
    const f = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!conHora) return f;
    return f + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },

  _buildSections(row, sid) {
    const f = (l, v) => (v !== undefined && v !== null && v !== '') ? { label: l, value: v } : null;
    const s = [];
    const personal = [
      f('Nombre completo', [row.nombre, row.apellidos].filter(Boolean).join(' ').trim()),
      f('Email', row.email),
      f('Telefono', row.telefono),
      f('DNI', row.dni),
      f('Domicilio', row.domicilio),
      f('Ciudad', row.ciudad),
      f('Codigo postal', row.codigo_postal),
      f('Fecha de nacimiento', row.fecha_nacimiento ? this._fmtFecha(row.fecha_nacimiento) : null)
    ].filter(Boolean);
    if (personal.length) s.push({ title: 'Datos personales', fields: personal });

    const excl = new Set([
      '_row', 'id', '_survey', '_surveyId',
      'Marca temporal', 'Marca de tiempo', 'Timestamp',
      'Direcci\u00f3n de correo electr\u00f3nico', 'Direccion de correo electronico', 'Correo',
      'Nombre', 'Apellido(s)', 'Apellidos', 'DNI', 'Fecha de Nacimiento',
      'Telefono principal', 'Tel\u00e9fono', 'Domicilio',
      'C\u00f3digo Postal', 'Codigo Postal', 'Pueblo o Ciudad', 'Ciudad',
      'nombre', 'apellidos', 'email', 'telefono', 'dni', 'domicilio', 'ciudad', 'codigo_postal', 'fecha_creacion', 'fecha_nacimiento'
    ]);
    const questions = [];
    Object.keys(row).forEach(k => {
      if (k.charAt(0) === '_') return;
      if (excl.has(k)) return;
      const val = row[k];
      if (val === undefined || val === null || val === '') return;
      questions.push(f(k, this._fmtFecha(String(val).replace(/^(-?\d+)\.0+$/, '$1'))));
    });
    if (questions.length) s.push({ title: 'Cuestionario', fields: questions });
    return s;
  },

  // ==================== REDES SOCIALES (dummy local hasta conectar Meta) ====================
  // Corte a real (TODO Meta): _pushPublicacion/_removePublicacion pasaran a
  // llamar a API.createPublicacion/getPublicaciones/deletePublicacion y la
  // hoja Publicaciones sera la fuente (hoy: localStorage gn_publicaciones).
  _plantillaPublicacion(a, tipo, contacto) {
    a = a || {};
    tipo = tipo === 'acogida' ? 'acogida' : 'adopcion';
    const icon = a.especie === 'Gato' ? '🐱' : (a.especie === 'Perro' ? '🐶' : '🐾');
    const nombre = (String(a.nombre || '').trim()) || 'este peludo';
    const bits = [a.especie, a.raza, a.edad, a.sexo].map(x => String(x || '').trim()).filter(x => x);
    const desc = String(a.descripcion || '').trim();
    const sit = a.estado === 'en_acogida'
      ? 'Estoy en una casa de acogida y busco mi hogar definitivo.'
      : (a.estado === 'adoptado'
        ? 'Ya encontre mi hogar. Gracias por difundir.'
        : 'Estoy disponible para adopcion.');
    const legal = tipo === 'acogida'
      ? 'La acogida es temporal y se formaliza con acuerdo de acogida.'
      : 'La adopcion se formaliza con contrato de adopcion.';
    const cfg = contacto || ((typeof CONFIG !== 'undefined' && CONFIG.contacto) || {});
    const tel = String(cfg.telefono || '').trim();
    const mail = String(cfg.email || '').trim();
    const tags = ['#AdoptaNoCompres', '#GrupoNebak', '#AdopcionResponsable'];
    const esp = String(a.especie || '').replace(/[^A-Za-z]/g, '');
    if (esp) tags.push('#' + esp + 'EnAdopcion');
    const out = [icon + ' Hola! Soy ' + nombre + ' ' + icon];
    if (bits.length) out.push('❤️ ' + bits.join(' · '));
    if (desc) out.push('📝 ' + desc);
    out.push('');
    out.push('🏠 ' + sit);
    out.push('📋 ' + legal);
    out.push('');
    if (tel) out.push('📞 ' + tel);
    if (mail) out.push('📩 ' + mail);
    if (!tel && !mail) out.push('Escribenos por MD o email.');
    out.push('');
    out.push(tags.join(' '));
    return out.join('\n');
  },

  _dummyPermalink(id) {
    const code = String(id || '').replace(/^pub_/, '') || 'post';
    return 'https://www.instagram.com/p/' + code + '/';
  },

  _publicacionesDe(animalId) {
    return (this.publicaciones || []).filter(x => String(x.animal_id) === String(animalId));
  },

  _pushPublicacion(pub) {
    this.publicaciones.push(pub);
    this.saveLocal();
    return pub;
  },

  _removePublicacion(id) {
    this.publicaciones = (this.publicaciones || []).filter(x => x.id !== id);
    this.saveLocal();
  },

  publicarAnimal(animalId) {
    this._redesAnimalId = animalId;
    location.hash = 'redes';
  },

  async renderRedes(el) {
    await this._loadList('animales', () => API.getAnimales());
    const preset = this._redesAnimalId ? this._byId(this.animales, this._redesAnimalId) : null;
    this._redesAnimalId = null;
    const selId = preset ? preset.id : ((this.animales[0] || {}).id || '');
    el.innerHTML = `
      <div class="page-list-container">
        <div class="alert-item info" style="margin-bottom:16px">${Icons.info} <span>Modo <b>simulado</b>: las publicaciones se guardan en este dispositivo hasta conectar Instagram.</span></div>
        <div class="form-card" style="margin-bottom:16px"><h3>Nueva publicacion · Instagram</h3>
          <div class="form-row"><div class="form-group"><label>Animal *</label><select id="rd-animal" onchange="Dashboard._rellenarPlantilla()">${this.animales.map(a => `<option value="${this._esc(a.id)}" ${String(a.id) === String(selId) ? 'selected' : ''}>${this._esc(a.nombre)} · ${this._esc(a.especie || '')}</option>`).join('')}</select></div>
          <div class="form-group"><label>Tipo *</label><select id="rd-tipo" onchange="Dashboard._rellenarPlantilla()"><option value="adopcion">Adopcion (contrato)</option><option value="acogida">Acogida (acuerdo temporal)</option></select></div></div>
          <div class="form-group"><label>Foto principal</label><div id="rd-foto"></div></div>
          <div class="form-group"><label>Texto (plantilla editable)</label><textarea id="rd-caption" rows="8" maxlength="2200" oninput="Dashboard._actualizarPreviewRedes()"></textarea><div style="text-align:right;font-size:.72rem;color:var(--gray-400)"><span id="rd-count">0</span>/2200</div></div>
          <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard._copiarCaption()">Copiar texto</button><button type="button" class="btn btn-primary" onclick="Dashboard.publicarRedes()">${Icons.check} Publicar (simulado)</button></div>
        </div>
        <div class="card" style="margin-bottom:16px"><div class="card-header"><h3>Vista previa</h3></div><div class="card-body"><div id="rd-preview"></div></div></div>
        <div class="card"><div class="card-header"><h3>Historial</h3></div><div class="card-body-flush"><div id="redes-historial">${this._renderRedesHistorial()}</div></div></div>
      </div>
      <div class="page-detail-container"></div>`;
    this._rellenarPlantilla();
  },

  _redesTipo() {
    const sel = document.getElementById('rd-tipo');
    return sel && sel.value === 'acogida' ? 'acogida' : 'adopcion';
  },

  _rellenarPlantilla() {
    const sel = document.getElementById('rd-animal');
    const a = sel ? this._byId(this.animales, sel.value) : null;
    const ta = document.getElementById('rd-caption');
    if (ta) ta.value = this._plantillaPublicacion(a, this._redesTipo());
    const fv = document.getElementById('rd-foto');
    if (fv) fv.innerHTML = a && this._fotoSrc(a) ? `<img src="${this._esc(this._fotoSrc(a))}" alt="" style="width:120px;height:120px;border-radius:8px;object-fit:cover;border:2px solid var(--primary)">` : '<span style="color:var(--gray-400);font-size:.8rem">Sin foto</span>';
    this._actualizarPreviewRedes();
  },

  _actualizarPreviewRedes() {
    const pv = document.getElementById('rd-preview');
    const ta = document.getElementById('rd-caption');
    const cnt = document.getElementById('rd-count');
    const txt = ta ? ta.value : '';
    if (cnt) {
      cnt.textContent = txt.length;
      cnt.style.color = txt.length > 2200 ? 'var(--danger)' : 'var(--gray-400)';
    }
    if (!pv) return;
    const sel = document.getElementById('rd-animal');
    const a = sel ? this._byId(this.animales, sel.value) : null;
    const foto = a ? this._fotoSrc(a) : '';
    const cab = txt.split('\n').filter(l => l.trim())[0] || 'Nueva publicacion';
    pv.innerHTML = `
      <div style="border:1px solid var(--gray-200);border-radius:12px;overflow:hidden;max-width:420px">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
          <img src="assets/icons/logo-nebak.jpg" alt="Grupo Nebak" style="width:32px;height:32px;border-radius:50%;object-fit:cover">
          <div><div style="font-weight:700;font-size:.85rem">grupo_nebak</div><div style="font-size:.72rem;color:var(--gray-500)">Publicidad · Simulado</div></div>
        </div>
        ${foto ? `<img src="${this._esc(foto)}" alt="" style="width:100%;aspect-ratio:1/1;min-height:240px;object-fit:cover;display:block">` : `<div style="aspect-ratio:1/1;min-height:240px;display:flex;align-items:center;justify-content:center;background:var(--gray-100);color:var(--gray-400);font-size:.85rem">Sin foto</div>`}
        <div style="padding:10px 12px;font-size:.85rem;white-space:pre-wrap">${this._esc(cab)}${txt.split('\n').filter(l => l.trim()).length > 1 ? ' <span style="color:var(--gray-500)">...más</span>' : ''}</div>
        <div style="padding:0 12px 10px;font-size:.72rem;color:var(--gray-400)">Vista previa aproximada · ${this._esc((a && a.nombre) || '')}</div>
      </div>`;
  },

  async _copiarCaption() {
    const ta = document.getElementById('rd-caption');
    const txt = ta ? ta.value : '';
    try {
      await navigator.clipboard.writeText(txt);
      this.showSnackbar('Texto copiado', 'success');
    } catch (err) { this.showSnackbar('No se pudo copiar', 'error'); }
  },

  publicarRedes() {
    const sel = document.getElementById('rd-animal');
    const a = sel ? this._byId(this.animales, sel.value) : null;
    if (!a) { this.showSnackbar('Elige un animal', 'warning'); return; }
    const ta = document.getElementById('rd-caption');
    const tipo = this._redesTipo();
    const id = 'pub_' + Date.now().toString(36);
    this._pushPublicacion({
      id,
      fecha: new Date().toISOString(),
      red: 'instagram',
      tipo,
      animal_id: a.id,
      animal: a.nombre,
      caption: ta ? ta.value : this._plantillaPublicacion(a, tipo),
      media: this._fotoSrc(a),
      permalink: this._dummyPermalink(id),
      estado: 'simulado'
    });
    const h = document.getElementById('redes-historial');
    if (h) h.innerHTML = this._renderRedesHistorial();
    this.showSnackbar('Publicacion guardada (simulada)', 'success');
  },

  _renderRedesHistorial() {
    const items = (this.publicaciones || []).slice().reverse();
    if (!items.length) return '<div style="text-align:center;padding:16px;color:var(--gray-400)">Sin publicaciones todavia</div>';
    return `<table class="data-table"><thead><tr><th></th><th>Fecha</th><th>Animal</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>${items.map(p => `<tr><td>${p.media ? `<img loading="lazy" src="${this._esc(p.media)}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover">` : '<span style="color:var(--gray-300)">—</span>'}</td><td>${this._fmtFecha(p.fecha)}</td><td>${this._esc(p.animal || '')}</td><td>${p.tipo === 'acogida' ? 'Acogida' : 'Adopcion'}</td><td><span class="estado-badge en_proceso">${this._esc(p.estado)}</span></td><td style="white-space:nowrap"><a class="btn btn-outline-green btn-sm" href="${this._esc(p.permalink)}" target="_blank" rel="noopener">Ver</a> <button class="btn btn-danger btn-sm" onclick="Dashboard.borrarPublicacion('${this._esc(p.id)}')">${Icons.trash}</button></td></tr>`).join('')}</tbody></table>`;
  },

  async borrarPublicacion(id) {
    if (!(await this._confirm('Eliminar esta publicacion simulada?', 'Eliminar publicacion'))) return;
    this._removePublicacion(id);
    const h = document.getElementById('redes-historial');
    if (h) h.innerHTML = this._renderRedesHistorial();
  },

  _publicacionesFicha(animalId) {
    const pubs = this._publicacionesDe(animalId);
    const items = pubs.length
      ? pubs.slice().reverse().map(p => `<div class="detail-field"><div class="detail-question">${this._fmtFecha(p.fecha)} · Instagram</div><div class="detail-answer">${p.permalink ? `<a href="${this._esc(p.permalink)}" target="_blank" rel="noopener">Ver post</a>` : '<span style="color:var(--gray-400)">Simulada (sin enlace)</span>'} · <span class="estado-badge en_proceso">${this._esc(p.estado)}</span></div></div>`).join('')
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">Sin publicaciones todavia</div></div>`;
    return `<div class="detail-section"><div class="detail-section-title">${Icons.heart} Publicaciones</div>${items}<div style="padding:0 16px 16px"><button class="btn btn-primary btn-sm" onclick="Dashboard.publicarAnimal('${animalId}')">${Icons.plus} Publicar</button></div></div>`;
  },

  _apadrinamientosFicha(animalId) {
    const a = this._byId(this.animales, animalId);
    const list = this._apadrinamientosDe(animalId);
    const activos = list.filter(p => p.estado === 'activo');
    const total = this._totalAportes(list);
    const rows = list.length
      ? list.slice().reverse().map(p => {
        const quien = p.padrino_id
          ? `<a href="javascript:void(0)" onclick="Dashboard.openSocioFicha('${this._esc(p.padrino_id)}')">${this._esc(p.padrino_nombre || 'Socio')}</a>`
          : this._esc(p.padrino_nombre || 'Padrino');
        const acc = [];
        if (p.estado === 'activo') acc.push(`<button class="btn btn-outline-green btn-sm" onclick="Dashboard.finalizarApadrinamiento('${this._esc(p.id)}')">Finalizar</button>`);
        if (!p.padrino_id) acc.push(`<button class="btn btn-outline-green btn-sm" onclick="Dashboard.convertirPadrino('${this._esc(p.id)}')">A socio</button>`);
        acc.push(`<button class="btn btn-danger btn-sm" onclick="Dashboard.deleteApadrinamiento('${this._esc(p.id)}')">${Icons.trash}</button>`);
        return `<div class="detail-field"><div class="detail-question">${quien} · ${p.aporte_mensual ? this._esc(p.aporte_mensual) + ' €/mes' : 'sin aporte'} · desde ${p.fecha_inicio ? this._fmtFecha(p.fecha_inicio) : '—'}</div><div class="detail-answer"><span class="estado-badge ${p.estado === 'activo' ? 'aprobada' : ''}">${p.estado === 'activo' ? 'Activo' : 'Finalizado'}</span><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${acc.join('')}</div></div></div>`;
      }).join('')
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">Sin apadrinamientos todavia</div></div>`;
    const totalHtml = activos.length ? `<div class="detail-field"><div class="detail-question">Total</div><div class="detail-answer">${total} €/mes entre ${activos.length}</div></div>` : '';
    const nuevo = (a && this._esApadrinable(a))
      ? `<div style="padding:0 16px 16px"><button class="btn btn-primary btn-sm" onclick="Dashboard.showApadrinamientoForm('${animalId}')">${Icons.plus} Nuevo apadrinamiento</button></div>`
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">No apadrinable (requiere check + disponible/en acogida)</div></div>`;
    return `<div class="detail-section"><div class="detail-section-title">${Icons.paw} Apadrinamientos</div>${rows}${totalHtml}${nuevo}</div>`;
  },

  async showApadrinamientoForm(animalId) {
    const a = this._byId(this.animales, animalId);
    if (!a || !this._esApadrinable(a)) { this.showSnackbar('Este animal no es apadrinable (check + disponible/en acogida).', 'warning'); return; }
    await this._ensureListas(['socios']);
    const opts = (this.socios || []).map(s => `<option value="${this._esc(s.id)}">${this._esc(s.nombre)} · ${this._esc(s.tipo || '')}</option>`).join('');
    this.showFormModal('Nuevo apadrinamiento · ' + a.nombre, `
      <form onsubmit="Dashboard.saveApadrinamiento(event,'${a.id}')">
      <div class="form-group"><label>Tipo de padrino *</label><select id="ap-tipo" onchange="Dashboard._togglePadrino()"><option value="Socio">Socio existente</option><option value="Externo">Externo (nuevo)</option></select></div>
      <div class="form-group" id="ap-socio-wrap"><label>Socio *</label><select id="ap-socio">${opts || '<option value="">Sin socios</option>'}</select></div>
      <div id="ap-externo-wrap" style="display:none">
        <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="ap-nombre"></div><div class="form-group"><label>Email</label><input type="email" id="ap-email"></div></div>
        <div class="form-row"><div class="form-group"><label>Telefono</label><input type="text" id="ap-telefono"></div><div class="form-group"><label>Aporte (€/mes)</label><input type="text" id="ap-aporte-e" placeholder="Ej: 10"></div></div>
      </div>
      <div class="form-row" id="ap-comun-row"><div class="form-group" id="ap-aporte-wrap"><label>Aporte (€/mes)</label><input type="text" id="ap-aporte" placeholder="Ej: 10"></div><div class="form-group"><label>Inicio</label><input type="date" id="ap-inicio" value="${new Date().toISOString().slice(0, 10)}"></div></div>
      <div class="form-group"><label>Notas</label><textarea id="ap-notas" rows="2"></textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`);
  },

  _togglePadrino() {
    const t = document.getElementById('ap-tipo');
    const ext = t && t.value === 'Externo';
    const sw = document.getElementById('ap-socio-wrap');
    const ew = document.getElementById('ap-externo-wrap');
    const aw = document.getElementById('ap-aporte-wrap');
    if (sw) sw.style.display = ext ? 'none' : '';
    if (ew) ew.style.display = ext ? '' : 'none';
    if (aw) aw.style.display = ext ? 'none' : '';
  },

  async saveApadrinamiento(e, animalId) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const a = this._byId(this.animales, animalId);
    if (!a || !this._esApadrinable(a)) { this.showSnackbar('Este animal ya no es apadrinable.', 'warning'); finGuardar(); return; }
    const ext = document.getElementById('ap-tipo').value === 'Externo';
    let pid = '', pnom = '', pmail = '', ptel = '';
    if (!ext) {
      const s = this._byId(this.socios, document.getElementById('ap-socio').value);
      if (!s) { this.showSnackbar('Elige un socio', 'warning'); finGuardar(); return; }
      pid = s.id; pnom = s.nombre; pmail = s.email || ''; ptel = s.telefono || '';
    } else {
      pnom = document.getElementById('ap-nombre').value.trim();
      if (!pnom) { this.showSnackbar('Indica el nombre del padrino', 'warning'); finGuardar(); return; }
      pmail = document.getElementById('ap-email').value.trim();
      ptel = document.getElementById('ap-telefono').value.trim();
    }
    const row = {
      id: 'apd_' + Date.now().toString(36),
      animal_id: a.id,
      animal: a.nombre,
      padrino_tipo: ext ? 'externo' : 'socio',
      padrino_id: pid,
      padrino_nombre: pnom,
      padrino_email: pmail,
      padrino_telefono: ptel,
      aporte_mensual: (ext ? document.getElementById('ap-aporte-e') : document.getElementById('ap-aporte')).value.trim(),
      fecha_inicio: document.getElementById('ap-inicio').value || new Date().toISOString().slice(0, 10),
      fecha_fin: '',
      estado: 'activo',
      notas: document.getElementById('ap-notas').value.trim()
    };
    this.apadrinamientos.push(row);
    this.saveLocal();
    if (this.APADRINAMIENTOS_REMOTE) this._apiCreateRow(() => API.createApadrinamiento(row), { m: 'createApadrinamiento', a: [row] });
    this._regLog('apadrinamiento', 'Nuevo apadrinamiento de ' + pnom + ' a ' + a.nombre, 'apadrinamiento', row.id);
    finGuardar();
    this.closeFormModal();
    this.viewAnimal(animalId);
    this.showSnackbar('Apadrinamiento creado', 'success');
  },

  async finalizarApadrinamiento(id) {
    const p = this._byId(this.apadrinamientos, id);
    if (!p) return;
    if (!(await this._confirm('Finalizar este apadrinamiento?', 'Finalizar'))) return;
    p.estado = 'finalizada';
    p.fecha_fin = new Date().toISOString().slice(0, 10);
    this.saveLocal();
    if (this.APADRINAMIENTOS_REMOTE) await this._updateLocalYApi('apadrinamientos', p);
    this._regLog('apadrinamiento-fin', 'Fin apadrinamiento de ' + (p.padrino_nombre || '') + ' a ' + (p.animal || ''), 'apadrinamiento', p.id);
    this.viewAnimal(p.animal_id);
    this.showSnackbar('Apadrinamiento finalizado', 'success');
  },

  async deleteApadrinamiento(id) {
    const p = this._byId(this.apadrinamientos, id);
    if (!(await this._confirm('Eliminar este apadrinamiento?', 'Eliminar'))) return;
    if (this.APADRINAMIENTOS_REMOTE) {
      try {
        const res = await API.deleteApadrinamiento(id);
        this._assertDeleted(res, 'El apadrinamiento');
      } catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    }
    this.apadrinamientos = (this.apadrinamientos || []).filter(x => x.id !== id);
    this.saveLocal();
    if (p) this.viewAnimal(p.animal_id);
    this.showSnackbar('Apadrinamiento eliminado', 'success');
  },

  async convertirPadrino(id) {
    const p = this._byId(this.apadrinamientos, id);
    if (!p) return;
    if (p.padrino_id) { this.showSnackbar('Ya esta vinculado a un socio', 'warning'); return; }
    const email = (p.padrino_email || '').toLowerCase().trim();
    const ya = email ? (this.socios || []).find(s => (s.email || '').toLowerCase().trim() === email) : null;
    if (!(await this._confirm(ya ? ('Vincular con el socio existente ' + ya.nombre + '?') : ('Crear socio ' + (p.padrino_nombre || '') + '?'), 'Convertir a socio'))) return;
    this.showLoading();
    try {
      if (ya) {
        p.padrino_id = ya.id;
        p.padrino_tipo = 'socio';
      } else {
        const data = { nombre: p.padrino_nombre, email: p.padrino_email || '', telefono: p.padrino_telefono || '', tipo: 'Socio', cuota: '', area: '', foto: null, carnet_id: CarnetGenerator.generateCarnetId('SOC'), activo: true, fecha_registro: new Date().toISOString().slice(0, 10), horas_mes: 0, ultima_actividad: new Date().toISOString().slice(0, 10) };
        const res = await API.createSocio(data);
        const row = res && res.data ? res.data : { ...data, id: 'soc_' + Date.now().toString(36) };
        this.socios.push(row);
        p.padrino_id = row.id;
        p.padrino_tipo = 'socio';
      }
      if (this.APADRINAMIENTOS_REMOTE) await this._updateLocalYApi('apadrinamientos', p);
      this.saveLocal();
      this._regLog('padrino-convertido', 'Padrino ' + (p.padrino_nombre || '') + ' convertido a socio; apadrino a ' + (p.animal || ''), 'socio', p.padrino_id);
    } catch (err) {
      this.showSnackbar('No se pudo convertir: ' + this._errMsg(err), 'error');
      return;
    } finally {
      this.hideLoading();
    }
    this.viewAnimal(p.animal_id);
    this.showSnackbar('Padrino convertido a socio', 'success');
  },

  openSocioFicha(id) {
    location.hash = 'socios';
    const iv = setInterval(() => {
      const el = document.getElementById('page-socios');
      if (el && el.querySelector('.page-list-container')) { clearInterval(iv); this.viewSocio(id); }
    }, 150);
    setTimeout(() => clearInterval(iv), 6000);
  },

  openAnimalFicha(id) {
    location.hash = 'animales';
    const iv = setInterval(() => {
      const el = document.getElementById('page-animales');
      if (el && el.querySelector('.animal-grid')) { clearInterval(iv); this.viewAnimal(id); }
    }, 150);
    setTimeout(() => clearInterval(iv), 6000);
  },

  _apadrinaFicha(socioId) {
    const list = (this.apadrinamientos || []).filter(x => String(x.padrino_id) === String(socioId));
    const items = list.length
      ? list.slice().reverse().map(p => {
        const an = this._byId(this.animales, p.animal_id);
        const nom = an ? `<a href="javascript:void(0)" onclick="Dashboard.openAnimalFicha('${this._esc(p.animal_id)}')">${this._esc(p.animal || an.nombre)}</a>` : this._esc(p.animal || '—');
        return `<div class="detail-field"><div class="detail-question">${nom}</div><div class="detail-answer">${p.aporte_mensual ? this._esc(p.aporte_mensual) + ' €/mes · ' : ''}<span class="estado-badge ${p.estado === 'activo' ? 'aprobada' : ''}">${p.estado === 'activo' ? 'Activo' : 'Finalizado'}</span></div></div>`;
      }).join('')
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">No apadrina ningun animal</div></div>`;
    const total = this._totalAportes(list.filter(p => String(p.padrino_id) === String(socioId)));
    return `<div class="detail-section"><div class="detail-section-title">${Icons.paw} Apadrina a</div>${items}${list.length ? `<div class="detail-field"><div class="detail-question">Total</div><div class="detail-answer">${total} €/mes</div></div>` : ''}</div>`;
  },

  // ==================== GASTOS VETERINARIOS ====================
  _gastosDe(animalId) {
    return (this.gastos || []).filter(x => String(x.animal_id) === String(animalId));
  },

  _totalGastos(list) {
    return (list || []).reduce((s, g) => s + (parseFloat(String(g.importe).replace(',', '.')) || 0), 0);
  },

  _gastosFicha(animalId) {
    const list = this._gastosDe(animalId);
    const total = this._totalGastos(list);
    const rows = list.length
      ? list.slice().reverse().map(g => `<div class="detail-field"><div class="detail-question">${g.fecha ? this._fmtFecha(g.fecha) : '—'} · ${this._esc(g.concepto || 'Gasto')}</div><div class="detail-answer">${this._esc(g.importe || '0')} € <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="Dashboard.deleteGasto('${this._esc(g.id)}')">${Icons.trash}</button></div></div>`).join('')
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">Sin gastos registrados</div></div>`;
    return `<div class="detail-section"><div class="detail-section-title">${Icons.activity} Gastos veterinarios${list.length ? ` · Total ${total.toFixed(2)} €` : ''}</div>${rows}<div style="padding:0 16px 16px"><button class="btn btn-primary btn-sm" onclick="Dashboard.showGastoForm('${animalId}')">${Icons.plus} Nuevo gasto</button></div></div>`;
  },

  showGastoForm(animalId) {
    const a = this._byId(this.animales, animalId);
    if (!a) { this.showSnackbar('Animal no encontrado. Recarga la lista.', 'warning'); return; }
    this.showFormModal('Nuevo gasto · ' + a.nombre, `
      <form onsubmit="Dashboard.saveGasto(event,'${a.id}')">
      <div class="form-row"><div class="form-group"><label>Fecha *</label><input type="date" id="gs-fecha" value="${new Date().toISOString().slice(0, 10)}" required></div>
      <div class="form-group"><label>Importe (€) *</label><input type="text" id="gs-importe" required placeholder="Ej: 45.50" inputmode="decimal"></div></div>
      <div class="form-group"><label>Concepto *</label><input type="text" id="gs-concepto" required placeholder="Ej: Vacuna rabia"></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`);
  },

  async saveGasto(e, animalId) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const a = this._byId(this.animales, animalId);
    if (!a) { this.showSnackbar('Animal no encontrado. Recarga la lista.', 'warning'); finGuardar(); return; }
    const concepto = document.getElementById('gs-concepto').value.trim();
    const importe = document.getElementById('gs-importe').value.trim().replace(',', '.');
    if (!concepto || isNaN(parseFloat(importe))) { this.showSnackbar('Completa concepto e importe válido', 'warning'); finGuardar(); return; }
    const row = {
      id: 'gst_' + Date.now().toString(36),
      animal_id: a.id,
      animal: a.nombre,
      fecha: document.getElementById('gs-fecha').value || new Date().toISOString().slice(0, 10),
      concepto,
      importe
    };
    this.gastos.push(row);
    this.saveLocal();
    this._apiCreateRow(() => API.createGasto(row), { m: 'createGasto', a: [row] });
    this._regLog('gasto', 'Gasto ' + concepto + ' (' + importe + ' €) en ' + a.nombre, 'gasto', row.id);
    finGuardar();
    this.closeFormModal();
    this.viewAnimal(animalId);
    this.showSnackbar('Gasto guardado', 'success');
  },

  async deleteGasto(id) {
    const g = this._byId(this.gastos, id);
    if (!(await this._confirm('Eliminar este gasto?', 'Eliminar'))) return;
    try {
      const res = await API.deleteGasto(id);
      this._assertDeleted(res, 'El gasto');
    } catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.gastos = (this.gastos || []).filter(x => x.id !== id);
    this.saveLocal();
    if (g) this.viewAnimal(g.animal_id);
    this.showSnackbar('Gasto eliminado', 'success');
  },

  // ==================== DOCUMENTOS (dummy local: referencias sin fichero) ====================
  _documentosDe(animalId) {
    return (this.documentos || []).filter(x => String(x.animal_id) === String(animalId));
  },

  _documentosFicha(animalId) {
    const list = this._documentosDe(animalId);
    const rows = list.length
      ? list.slice().reverse().map(d => `<div class="detail-field"><div class="detail-question">${this._esc(d.tipo || 'Documento')}</div><div class="detail-answer">${this._esc(d.nombre || '—')} · ${d.fecha ? this._fmtFecha(d.fecha) : '—'} <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="Dashboard.deleteDocumento('${this._esc(d.id)}')">${Icons.trash}</button></div></div>`).join('')
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">Sin documentos</div></div>`;
    return `<div class="detail-section"><div class="detail-section-title">${Icons.fileText} Documentos <span class="estado-badge en_proceso">Simulado</span></div>${rows}<div style="padding:0 16px 16px"><button class="btn btn-primary btn-sm" onclick="Dashboard.showDocumentoForm('${animalId}')">${Icons.plus} Añadir referencia</button></div></div>`;
  },

  showDocumentoForm(animalId) {
    const a = this._byId(this.animales, animalId);
    if (!a) { this.showSnackbar('Animal no encontrado. Recarga la lista.', 'warning'); return; }
    this.showFormModal('Referencia de documento · ' + a.nombre, `
      <form onsubmit="Dashboard.saveDocumento(event,'${a.id}')">
      <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="dc-nombre" required placeholder="Ej: Cartilla 2026"></div>
      <div class="form-group"><label>Tipo *</label><select id="dc-tipo" required><option value="Cartilla">Cartilla</option><option value="Vacunas">Vacunas</option><option value="Analitica">Analitica</option><option value="Otro">Otro</option></select></div></div>
      <div class="alert-item info" style="margin-bottom:12px">${Icons.info} <span>Referencia local: el fichero seguira en Drive o papel.</span></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`);
  },

  saveDocumento(e, animalId) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const a = this._byId(this.animales, animalId);
    if (!a) { this.showSnackbar('Animal no encontrado. Recarga la lista.', 'warning'); finGuardar(); return; }
    const nombre = document.getElementById('dc-nombre').value.trim();
    if (!nombre) { this.showSnackbar('Indica el nombre del documento', 'warning'); finGuardar(); return; }
    this.documentos.push({
      id: 'doc_' + Date.now().toString(36),
      animal_id: a.id,
      animal: a.nombre,
      nombre,
      tipo: document.getElementById('dc-tipo').value,
      fecha: new Date().toISOString().slice(0, 10)
    });
    this.saveLocal();
    finGuardar();
    this.closeFormModal();
    this.viewAnimal(animalId);
    this.showSnackbar('Referencia guardada (simulada)', 'success');
  },

  async deleteDocumento(id) {
    const d = this._byId(this.documentos, id);
    if (!(await this._confirm('Eliminar esta referencia?', 'Eliminar'))) return;
    this.documentos = (this.documentos || []).filter(x => x.id !== id);
    this.saveLocal();
    if (d) this.viewAnimal(d.animal_id);
    this.showSnackbar('Referencia eliminada', 'success');
  },

  // ==================== ANIMALES CRUD ====================
  async renderAnimales(el) {
    await Promise.all([
      this._loadList('animales', () => API.getAnimales()),
      this._loadList('familias', () => API.getFamilias())
    ]);
    const filter = this._currentAnimalFilter;
    const especie = this._currentEspecieFilter;
    let filtered = filter==='all' ? this.animales : this.animales.filter(a=>a.estado===filter);
    if (especie!=='all') filtered = especie==='otro' ? filtered.filter(a=>!['Perro','Gato'].includes(a.especie)) : filtered.filter(a=>(a.especie||'')===especie);
    const counts = {all:this.animales.length, disponible:this.animales.filter(a=>a.estado==='disponible').length, en_acogida:this.animales.filter(a=>a.estado==='en_acogida').length, en_adopcion:this.animales.filter(a=>a.estado==='en_adopcion').length, adoptado:this.animales.filter(a=>a.estado==='adoptado').length};
    const nPerros=this.animales.filter(a=>a.especie==='Perro').length, nGatos=this.animales.filter(a=>a.especie==='Gato').length, nOtro=this.animales.filter(a=>a.especie&&!['Perro','Gato'].includes(a.especie)).length;
    el.innerHTML = `
      <div class="page-list-container">
        <div class="list-header"><span class="response-count">${filtered.length} animales</span><button class="btn btn-outline-green btn-sm" onclick="Dashboard.showCamadaForm()">${Icons.plus} Alta de camada</button><button class="btn btn-primary btn-sm" onclick="Dashboard.showAnimalForm()">${Icons.plus} Nuevo</button></div>
        <div class="filters-bar"><div class="filter-row">
          <select onchange="Dashboard._currentAnimalFilter=this.value;Dashboard.renderAnimales(document.getElementById('page-animales'))">
            <option value="all" ${filter==='all'?'selected':''}>Todos (${counts.all})</option>
            <option value="disponible" ${filter==='disponible'?'selected':''}>Disponibles (${counts.disponible})</option>
            <option value="en_acogida" ${filter==='en_acogida'?'selected':''}>En acogida (${counts.en_acogida})</option>
            <option value="en_adopcion" ${filter==='en_adopcion'?'selected':''}>Reservados (${counts.en_adopcion})</option>
            <option value="adoptado" ${filter==='adoptado'?'selected':''}>Adoptados (${counts.adoptado})</option>
          </select>
          <select onchange="Dashboard._currentEspecieFilter=this.value;Dashboard.renderAnimales(document.getElementById('page-animales'))">
            <option value="all" ${especie==='all'?'selected':''}>Especie: Todas</option>
            <option value="Perro" ${especie==='Perro'?'selected':''}>Perros (${nPerros})</option>
            <option value="Gato" ${especie==='Gato'?'selected':''}>Gatos (${nGatos})</option>
            <option value="otro" ${especie==='otro'?'selected':''}>Otros (${nOtro})</option>
          </select>
        </div></div>
        <div id="animales-form-container"></div>
        <div class="animal-grid">${filtered.length ? filtered.map(a=>`
          <div class="animal-card" onclick="Dashboard.viewAnimal('${a.id}')">
            ${this._fotoSrc(a) ? `<div class="animal-card-img"><img loading="lazy" src="${this._esc(this._fotoSrc(a, 'w200'))}" alt="${this._esc(a.nombre)}" style="width:100%;height:100%;object-fit:cover"></div>` : `<div class="animal-card-img" style="display:flex;align-items:center;justify-content:center;background:${a.especie==='Perro'?'#e8faf0':'#ebf5fb'};color:${a.especie==='Perro'?'var(--primary-hover)':'var(--info)'}">${a.especie==='Perro'?Icons.dog:(a.especie==='Gato'?Icons.cat:Icons.paw)}</div>`}
            <div class="animal-card-body">
              <div class="animal-card-name">${this._esc(a.nombre)}</div>
              <div class="animal-card-breed">${a.raza} &middot; ${a.edad} &middot; ${a.sexo}</div>
              <div class="animal-card-status ${a.estado}">${this._animalEstadoLabel(a.estado)}</div>
              ${a.grupo_id?`<div class="animal-group-badge">${Icons.users} ${this._esc(a.grupo||a.grupo_id)} · ${this._grupoSize(a.grupo_id)}</div>`:''}
            </div>
          </div>`).join('') : (this.animales.length ? `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">${Icons.dog}</div><h3>Sin animales para este filtro</h3><p>Prueba otro estado o cambia la especie.</p></div>` : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">${Icons.dog}</div><h3>Aun no hay animales</h3><p>Registra el primer animal o usa el alta de camada.</p></div>`)}</div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  _grupoSize(gid) { return (this.animales||[]).filter(x=>x.grupo_id===gid).length; },

  // Foto principal normalizada para <img>: admite thumbnail, fileId de Drive,
  // enlaces file/d/... o uc?...id=... (fotos antiguas) y rutas/URLs directas.
  _fotoSrc(a, sz) {
    const size = sz || 'w800';
    if (!a) return '';
    if (a.foto_drive_id) return 'https://drive.google.com/thumbnail?id=' + a.foto_drive_id + '&sz=' + size;
    const raw = String(a.foto || a.foto_url || '');
    if (!raw) return '';
    const m = raw.match(/[?&]id=([A-Za-z0-9_-]+)/) || raw.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=' + size;
    return raw;
  },

  showAnimalForm(data) {
    const isEdit = !!data;
    const especies = ['Perro', 'Gato'];
    const custom = data?.especie && !especies.includes(data.especie) ? data.especie : null;
    const especieOpts = especies.map(s=>`<option value="${s}" ${data?.especie===s?'selected':''}>${s}</option>`).join('') + (custom ? `<option value="${this._esc(custom)}" selected>${this._esc(custom)}</option>` : '') + (custom ? '' : `<option value="__otro__">Otro...</option>`);
    const grupos = [...new Set(this.animales.map(a => a.grupo || a.grupo_id).filter(Boolean))];
    const grupoVal = data?.grupo || data?.grupo_id || '';
    this.showFormModal(isEdit ? 'Editar Animal' : 'Nuevo Animal', `<form onsubmit="Dashboard.saveAnimal(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="an-nombre" value="${this._esc(data?.nombre||'')}" required></div><div class="form-group"><label>Especie *</label><select id="an-especie" required onchange="Dashboard._toggleEspecieOtra(this.value)">${especieOpts}</select><input type="text" id="an-especie-otra" style="display:none;margin-top:4px" placeholder="Otra especie"></div></div>
      <div class="form-row"><div class="form-group"><label>Raza *</label><input type="text" id="an-raza" value="${this._esc(data?.raza||'')}" required></div><div class="form-group"><label>Edad</label><input type="text" id="an-edad" value="${this._esc(data?.edad||'')}" placeholder="Ej: 2 anios"></div></div>
      <div class="form-row"><div class="form-group"><label>Peso</label><input type="text" id="an-peso" value="${this._esc(data?.peso||'')}" placeholder="Ej: 4.2 kg"></div><div class="form-group"><label>Sexo *</label><select id="an-sexo" required><option value="Macho" ${data?.sexo==='Macho'?'selected':''}>Macho</option><option value="Hembra" ${data?.sexo==='Hembra'?'selected':''}>Hembra</option></select></div></div>
      <div class="form-row"><div class="form-group"><label>Grupo / Camada</label><input type="text" id="an-grupo" value="${this._esc(grupoVal)}" list="grupo-list" placeholder="Ej: Camada Luna"><datalist id="grupo-list">${grupos.map(g=>`<option value="${this._esc(g)}">`).join('')}</datalist></div><div class="form-group"><label style="display:flex;align-items:center;gap:6px;padding-top:22px"><input type="checkbox" id="an-grupo-obl" ${data?.grupo_obligatorio?'checked':''}> Grupo obligatorio</label></div></div>
      <div class="form-row"><div class="form-group"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="an-apadrinable" ${data?.apadrinable?'checked':''}> Acepta apadrinamiento</label></div></div>
      <div class="form-row"><div class="form-group"><label>Foto principal (opcional)</label><input type="file" id="an-foto" accept="image/*" onchange="Dashboard._previewFoto(this,'an-foto-preview')"><div id="an-foto-preview">${this._fotoSrc(data) ? `<img src="${this._esc(this._fotoSrc(data))}" style="max-width:140px;max-height:140px;border-radius:8px;border:2px solid var(--primary)">` : ''}</div><p style="font-size:.72rem;color:var(--gray-500)">Opcional. Tambien puedes colocarla en <code>src/assets/animales/</code> y referenciarla por ruta en el campo Foto (URL) del carnet.</p></div><div class="form-group"><label>Foto (URL/ruta opcional)</label><input type="text" id="an-foto-url" value="${this._esc(data?.foto_url||'')}" placeholder="Ej: assets/animales/luna.jpg"></div></div>
      <div class="form-row"><div class="form-group"><label>Estado *</label><select id="an-estado" required><option value="disponible" ${data?.estado==='disponible'?'selected':''}>Disponible</option><option value="en_acogida" ${data?.estado==='en_acogida'?'selected':''}>En acogida</option><option value="en_adopcion" ${data?.estado==='en_adopcion'?'selected':''} ${!data?'disabled':''}>Reservado</option><option value="adoptado" ${data?.estado==='adoptado'?'selected':''}>Adoptado</option></select></div><div class="form-group"><label>Microchip</label><input type="text" id="an-microchip" value="${this._esc(data?.microchip||'')}"></div></div>
      <div class="form-group"><label>Descripcion</label><textarea id="an-descripcion" rows="2">${this._esc(data?.descripcion||'')}</textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form>`);
  },

  showAnimalFormById(id) {
    if (!id) { this.showAnimalForm(null); return; }
    const data = this._byId(this.animales, id);
    if (!data) { this.showSnackbar('Animal no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    this.showAnimalForm(data);
  },

  _toggleEspecieOtra(val) {
    const el = document.getElementById('an-especie-otra');
    if (el) el.style.display = val === '__otro__' ? 'block' : 'none';
  },

  _toggleCuota() {
    const t = document.getElementById('so-tipo');
    const w = document.getElementById('so-cuota-wrap');
    if (w) w.style.display = t && (t.value === 'Socio' || t.value === 'Ambos') ? '' : 'none';
  },

  _tipoBadgeCls(t) {
    return t === 'Socio' ? 'aprobada' : (t === 'Voluntario' ? 'en_proceso' : 'finalizada');
  },

  // Estado de cuota: null si no es socio (no aplica). Al dia = pago hace <=365 dias.
  _cuotaEstado(s) {
    if (!s || (s.tipo !== 'Socio' && s.tipo !== 'Ambos')) return null;
    if (!s.ultimo_pago) return { label: 'Sin pagos', cls: '' };
    const t = new Date(String(s.ultimo_pago).replace(' ', 'T')).getTime();
    if (isNaN(t)) return { label: 'Sin datos', cls: '' };
    const dias = Math.floor((Date.now() - t) / 86400000);
    if (dias < 0) return { label: 'Al dia', cls: 'aprobada' };
    return dias <= 365 ? { label: 'Al dia', cls: 'aprobada' } : { label: 'Pendiente', cls: 'descartada' };
  },

  showCamadaForm() {
    this.showFormModal('Alta de camada', `<form onsubmit="Dashboard.saveCamada(event)">
      <div class="form-row"><div class="form-group"><label>Nombre del grupo *</label><input type="text" id="cm-grupo" required placeholder="Ej: Camada Luna Mayo 2026"></div><div class="form-group"><label>Nombre base *</label><input type="text" id="cm-base" required placeholder="Ej: Luna"></div></div>
      <div class="form-row"><div class="form-group"><label>Cantidad *</label><input type="number" id="cm-cantidad" min="1" max="12" value="3" required></div><div class="form-group"><label>Especie *</label><select id="cm-especie" required><option value="Perro">Perro</option><option value="Gato">Gato</option></select></div></div>
      <div class="form-row"><div class="form-group"><label>Raza</label><input type="text" id="cm-raza" placeholder="Ej: Mestizo"></div><div class="form-group"><label>Edad</label><input type="text" id="cm-edad" placeholder="Ej: 2 meses"></div></div>
      <div class="form-row"><div class="form-group"><label>Sexo *</label><select id="cm-sexo"><option value="Macho">Macho</option><option value="Hembra">Hembra</option></select></div><div class="form-group"><label style="display:flex;align-items:center;gap:6px;padding-top:22px"><input type="checkbox" id="cm-obl" checked> Grupo obligatorio</label></div></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Crear camada</button></div>
    </form>`);
  },

  async saveCamada(e) {
    e.preventDefault();
    const grupo = document.getElementById('cm-grupo').value.trim();
    const base = document.getElementById('cm-base').value.trim();
    const cantidad = parseInt(document.getElementById('cm-cantidad').value, 10) || 1;
    const especie = document.getElementById('cm-especie').value;
    const raza = document.getElementById('cm-raza').value.trim();
    const edad = document.getElementById('cm-edad').value.trim();
    const sexo = document.getElementById('cm-sexo').value;
    const obl = document.getElementById('cm-obl').checked;
    if (!grupo || !base) { this.showSnackbar('Completa grupo y nombre base', 'warning'); return; }
    const grupo_id = 'gpo_' + Date.now().toString(36);
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    try {
      for (let i = 1; i <= cantidad; i++) {
        const nombre = cantidad > 1 ? base + ' ' + this._romano(i) : base;
        const row = { nombre, especie, raza, edad, sexo, estado: 'disponible', grupo_id, grupo, grupo_obligatorio: obl, descripcion: 'Camada: ' + grupo, esterilizada: false, vacunas: 'Pendientes', microchip: '', fecha_ingreso: new Date().toISOString().slice(0, 10) };
        try {
          const res = await API.createAnimal(row);
          if (res && res.data) this.animales.push(res.data);
          else this.animales.push({ ...row, id: 'ani_' + Date.now().toString(36) + i });
        } catch (err) {
          this.animales.push({ ...row, id: 'ani_' + Date.now().toString(36) + i });
        }
      }
    } finally { finGuardar(); }
    this.closeFormModal();
    this.renderAnimales(document.getElementById('page-animales'));
    this.showSnackbar('Camada ' + grupo + ' creada (' + cantidad + ' animales)', 'success');
  },

  _romano(n) {
    const r = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let s = ''; let x = n;
    r.forEach(([v, l]) => { while (x >= v) { s += l; x -= v; } });
    return s;
  },

  async saveAnimal(e, isEdit, id) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const existing = isEdit ? this._byId(this.animales, id) : null;
    let especie = document.getElementById('an-especie').value;
    if (especie === '__otro__') especie = document.getElementById('an-especie-otra').value.trim() || especie;
    const gv = document.getElementById('an-grupo').value.trim();
    let grupo_id = existing?.grupo_id || (gv ? 'gpo_' + Date.now().toString(36) : '');
    if (existing && gv && gv === existing.grupo) grupo_id = existing.grupo_id;
    const data = {
      nombre: document.getElementById('an-nombre').value.trim(),
      especie,
      raza: document.getElementById('an-raza').value.trim(),
      edad: document.getElementById('an-edad').value.trim(),
      peso: document.getElementById('an-peso').value.trim(),
      sexo: document.getElementById('an-sexo').value,
      estado: document.getElementById('an-estado').value,
      microchip: document.getElementById('an-microchip').value.trim(),
      descripcion: document.getElementById('an-descripcion').value.trim(),
      grupo_id: gv ? grupo_id : '',
      grupo: gv ? gv : '',
      grupo_obligatorio: document.getElementById('an-grupo-obl').checked,
      apadrinable: document.getElementById('an-apadrinable').checked,
      esterilizada: existing?.esterilizada || false,
      vacunas: existing?.vacunas || 'Pendientes',
      fecha_ingreso: existing?.fecha_ingreso || new Date().toISOString().slice(0,10),
      foto_drive_id: existing?.foto_drive_id || '',
      foto_url: existing?.foto_url || '',
      foto: existing?.foto || ''
    };
    const fotoUrlInput = document.getElementById('an-foto-url');
    const fotoInput = document.getElementById('an-foto');
    let fotoBase64 = null;
    if (fotoInput && fotoInput.files && fotoInput.files[0]) {
      fotoBase64 = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = async ev => resolve(await this._downscaleImage(ev.target.result, 800, 600, 0.78));
        r.onerror = () => resolve(null);
        r.readAsDataURL(fotoInput.files[0]);
      });
    } else if (fotoUrlInput && fotoUrlInput.value.trim()) {
      data.foto_url = fotoUrlInput.value.trim();
      data.foto = fotoUrlInput.value.trim();
    } else if (existing?.foto) {
      data.foto = existing.foto;
    }

    if (fotoBase64) {
      try {
        const rawB64 = fotoBase64.indexOf(',') !== -1 ? fotoBase64.split(',')[1] : fotoBase64;
        const up = await API.uploadFotoAnimal(rawB64, `animal_${data.nombre.replace(/\s+/g,'_')}_${Date.now()}.jpg`, 'image/jpeg');
        if (up.data && up.data.fileId) {
          data.foto_drive_id = up.data.fileId;
          data.foto_url = up.data.webViewLink || up.data.webContentLink;
          data.foto = 'https://drive.google.com/thumbnail?id=' + up.data.fileId + '&sz=w800';
        }
      } catch (err) {
        this.showSnackbar('Foto guardada en Drive falló, se usa URL local: ' + this._errMsg(err), 'warning');
      }
    }
    try {
      if (isEdit) {
        await API.updateAnimal(id, data);
        const item = this._byId(this.animales, id); if (item) Object.assign(item, data);
      } else {
        const res = await API.createAnimal(data);
        if (res.data) this.animales.push(res.data);
      }
    } catch (err) {
      this.showSnackbar('No se pudo guardar: ' + this._errMsg(err), 'error');
      finGuardar();
      return;
    }
    finGuardar();
    this.closeFormModal();
    if (isEdit) this.viewAnimal(id);
    else this.renderAnimales(document.getElementById('page-animales'));
    this.showSnackbar(isEdit ? 'Animal actualizado' : 'Animal creado', 'success');
  },

  // Apadrinable = check activo Y estado disponible/en_acogida.
  _esApadrinable(a) {
    if (!a) return false;
    const ok = a.apadrinable === true || a.apadrinable === 'TRUE' || a.apadrinable === 'true' || a.apadrinable === 1;
    return ok && (a.estado === 'disponible' || a.estado === 'en_acogida');
  },

  _apadrinamientosDe(animalId) {
    return (this.apadrinamientos || []).filter(x => String(x.animal_id) === String(animalId));
  },

  _totalAportes(list) {
    return (list || []).filter(p => p.estado === 'activo').reduce((s, p) => s + (parseFloat(p.aporte_mensual) || 0), 0);
  },

  async viewAnimal(id) {
    await this._ensureListas(['apadrinamientos', 'gastos']);
    const a = this._byId(this.animales, id);
    if(!a) { this.showSnackbar('Animal no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    const foster = a.acogida_familia ? this.familias.find(f => f.id === a.acogida_familia) : null;
    const siblings = a.grupo_id ? this.animales.filter(x => x.grupo_id === a.grupo_id && x.id !== a.id) : [];
    this._showDetail('animales', a.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showAnimalFormById('${a.id}')">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteAnimal('${a.id}')">${Icons.trash} Eliminar</button>
      </div>
      ${this._publicacionesFicha(a.id)}
      ${this._fotoSrc(a) ? `<div style="margin-bottom:16px"><img src="${this._esc(this._fotoSrc(a))}" alt="${this._esc(a.nombre)}" style="width:160px;height:160px;border-radius:12px;object-fit:cover;border:2px solid var(--primary)"></div>` : ''}
      ${this._apadrinamientosFicha(a.id)}
      ${this._gastosFicha(a.id)}
      ${this._documentosFicha(a.id)}
      <div class="detail-section"><div class="detail-section-title">Informacion General</div>
        <div class="detail-field"><div class="detail-question">Especie</div><div class="detail-answer">${this._esc(a.especie)}</div></div>
        <div class="detail-field"><div class="detail-question">Raza</div><div class="detail-answer">${this._esc(a.raza)}</div></div>
        <div class="detail-field"><div class="detail-question">Edad</div><div class="detail-answer">${this._esc(a.edad)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Peso</div><div class="detail-answer">${this._esc(a.peso)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Sexo</div><div class="detail-answer">${this._esc(a.sexo)}</div></div>
        <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="animal-card-status ${a.estado}">${this._animalEstadoLabel(a.estado)}</span></div></div>
        <div class="detail-field"><div class="detail-question">Grupo / Camada</div><div class="detail-answer">${this._esc(a.grupo||a.grupo_id)||'—'}${a.grupo_obligatorio?' <span class="estado-badge aprobada">Grupo obligatorio</span>':''}</div></div>
        <div class="detail-field"><div class="detail-question">Descripcion</div><div class="detail-answer">${this._esc(a.descripcion)||'—'}</div></div>
      </div>
      ${siblings.length?`<div class="detail-section"><div class="detail-section-title">${Icons.users} Grupo (${siblings.length+1})</div>${siblings.map(x=>`<div class="detail-field"><div class="detail-question">${this._esc(x.nombre)}</div><div class="detail-answer">${this._esc(x.especie)} &middot; ${this._esc(x.raza)} &middot; ${this._esc(x.edad||'')} &middot; <span class="animal-card-status ${x.estado}">${this._animalEstadoLabel(x.estado)}</span></div></div>`).join('')}</div>`:''}
      ${foster?`<div class="detail-section"><div class="detail-section-title">${Icons.home} Familia Acogedora</div>
        <div class="detail-field"><div class="detail-question">Familia</div><div class="detail-answer">${this._esc(foster.nombre)}</div></div>
        <div class="detail-field"><div class="detail-question">Ubicacion</div><div class="detail-answer">${this._esc(foster.ubicacion)}</div></div>
        <div class="detail-field"><div class="detail-question">Especialidad</div><div class="detail-answer">${this._esc(foster.especialidad)}</div></div>
      </div>`:''}
      <div class="detail-section"><div class="detail-section-title">${Icons.stethoscope} Historial Medico</div>
        <div class="detail-field"><div class="detail-question">Microchip</div><div class="detail-answer">${a.microchip||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Vacunas</div><div class="detail-answer">${a.vacunas||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Esterilizado/a</div><div class="detail-answer">${a.esterilizada?'Si':'No'}</div></div>
        <div class="detail-field"><div class="detail-question">Fecha ingreso</div><div class="detail-answer">${a.fecha_ingreso||'—'}</div></div>
      </div>`);
  },

  // El backend devuelve {success:false} si la fila no existe (p. ej. id no
  // sincronizado con la hoja). Sin este chequeo el borrado parecia OK en
  // pantalla pero el registro reaparecia al recargar.
  _assertDeleted(res, what) {
    if (res && res.success === false) {
      throw new Error((what || 'El registro') + ' no existe en la hoja (id sin sincronizar). Revisa la hoja o recarga.');
    }
  },

  async deleteAnimal(id) {
    if (!(await this._confirm('Eliminar este animal permanentemente? Los casos y candidaturas asociados se quedaran sin animal.'))) return;
    await this._ensureListas(['acogidas', 'candidaturas', 'adopciones']);
    try { const res = await API.deleteAnimal(id); this._assertDeleted(res, 'El animal'); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    const casos = this.acogidas.filter(x => x.animal_id === id);
    if (casos.length) {
      this.acogidas = this.acogidas.filter(x => x.animal_id !== id);
      casos.forEach(c => { if (c.id) this._apiCreateRow(() => API.deleteAcogida(c.id), { m: 'deleteAcogida', a: [c.id] });
        if (c.familia_id) {
          const fam = this.familias.find(f => f.id === c.familia_id);
          if (fam) {
            fam.animales_actuales = Math.max(0, (fam.animales_actuales || 0) - 1);
            if (fam.capacidad === 'Ocupada' && fam.animales_actuales === 0) fam.capacidad = 'Libre';
            this._updateLocalYApi('familias', fam);
          }
        }
      });
    }
    const cands = this.candidaturas.filter(x => x.animal_id === id);
    if (cands.length) { this.candidaturas = this.candidaturas.filter(x => x.animal_id !== id); cands.forEach(c => { if (c.id) this._apiCreateRow(() => API.deleteCandidatura(c.id), { m: 'deleteCandidatura', a: [c.id] }); }); }
    const adps = this.adopciones.filter(x => x.animal_id === id);
    if (adps.length) { this.adopciones = this.adopciones.filter(x => x.animal_id !== id); adps.forEach(p => { if (p.id) this._apiCreateRow(() => API.deleteAdopcion(p.id), { m: 'deleteAdopcion', a: [p.id] }); }); }
    this.animales = this.animales.filter(a => a.id !== id);
    this.saveLocal();
    this._hideDetail('animales');
    this.renderAnimales(document.getElementById('page-animales'));
    this.showSnackbar('Animal eliminado (y casos asociados liberados)', 'success');
  },

  // ==================== ACOGIDAS CRUD ====================
  async renderAcogidas(el) {
    await Promise.all([
      this._loadList('familias', () => API.getFamilias()),
      this._loadList('animales', () => API.getAnimales())
    ]);
    const filter = this._currentFosterFilter;
    const filtered = filter==='all' ? this.familias : this.familias.filter(f=>f.capacidad===filter);
    const counts = {all:this.familias.length, Libre:this.familias.filter(f=>f.capacidad==='Libre').length, Ocupada:this.familias.filter(f=>f.capacidad==='Ocupada').length};
    el.innerHTML = `
      <div class="page-list-container">
        <div class="list-header"><span class="response-count">${filtered.length} familias</span><button class="btn btn-primary btn-sm" onclick="Dashboard.showFamiliaForm()">${Icons.plus} Nueva</button></div>
      <div class="filters-bar"><div class="filter-row">
        <select onchange="Dashboard._currentFosterFilter=this.value;Dashboard.renderAcogidas(document.getElementById('page-acogidas'))">
          <option value="all" ${filter==='all'?'selected':''}>Todas (${counts.all})</option>
          <option value="Libre" ${filter==='Libre'?'selected':''}>Libres (${counts.Libre})</option>
          <option value="Ocupada" ${filter==='Ocupada'?'selected':''}>Ocupadas (${counts.Ocupada})</option>
        </select>
      </div></div>
      <div id="familias-form-container"></div>
      <div class="response-list">${filtered.length ? filtered.map(f=>`<div class="response-card" onclick="Dashboard.viewFosterFamily('${f.id}')">
          <div class="response-card-header">
            <div class="response-avatar" style="background:var(--info-light);color:var(--info)">${this._esc(String(f.nombre).charAt(0))}</div>
            <div class="response-info">
              <div class="response-name">${this._esc(f.nombre)} <span class="estado-badge ${f.capacidad==='Libre'?'en_proceso':'pendiente'}">${this._esc(f.capacidad)}</span></div>
              <div class="response-email">${this._esc(f.email)} &middot; ${this._esc(f.especialidad)} &middot; ${this._esc(f.ubicacion)}</div>
            </div>
            <div class="response-date">${f.animales_actuales}/${f.max_capacity}</div>
          </div>
        </div>`).join('') : (this.familias.length ? `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">${Icons.home}</div><h3>Sin familias para este filtro</h3><p>Prueba a mostrar todas o libres.</p></div>` : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">${Icons.home}</div><h3>Aun no hay familias</h3><p>Registra una nueva familia acogedora.</p></div>`)}</div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  showFamiliaForm(data) {
    const isEdit = !!data;
    this._renderForm('acogidas', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nueva'} Familia Acogedora</h3><form onsubmit="Dashboard.saveFamilia(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="fa-nombre" value="${data?.nombre||''}" required></div><div class="form-group"><label>Email *</label><input type="email" id="fa-email" value="${data?.email||''}" required></div></div>
      <div class="form-row"><div class="form-group"><label>Telefono</label><input type="text" id="fa-telefono" value="${data?.telefono||''}"></div><div class="form-group"><label>Ubicacion *</label><input type="text" id="fa-ubicacion" value="${data?.ubicacion||''}" required></div></div>
      <div class="form-row"><div class="form-group"><label>Especialidad</label><input type="text" id="fa-especialidad" value="${data?.especialidad||''}" placeholder="Ej: Gatos, Perros pequenos"></div><div class="form-group"><label>Max animales</label><input type="number" id="fa-max" value="${data?.max_capacity||2}" min="1"></div></div>
      <div class="form-group"><label>Notas</label><textarea id="fa-notas" rows="2">${data?.notas||''}</textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.cancelForm('acogidas')">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form></div>`);
  },

  showFamiliaFormById(id) {
    if (!id) { this.showFamiliaForm(null); return; }
    const data = this._byId(this.familias, id);
    if (!data) { this.showSnackbar('Familia no encontrada (id ' + id + '). Recarga la lista.', 'warning'); return; }
    this.showFamiliaForm(data);
  },

  async saveFamilia(e, isEdit, id) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const existing = isEdit ? this._byId(this.familias, id) : null;
    const data = {
      nombre: document.getElementById('fa-nombre').value.trim(),
      email: document.getElementById('fa-email').value.trim(),
      telefono: document.getElementById('fa-telefono').value.trim(),
      ubicacion: document.getElementById('fa-ubicacion').value.trim(),
      especialidad: document.getElementById('fa-especialidad').value.trim(),
      max_capacity: parseInt(document.getElementById('fa-max').value) || 2,
      notas: document.getElementById('fa-notas').value.trim(),
      capacidad: existing ? (existing.capacidad || 'Libre') : 'Libre',
      animales_actuales: existing ? (existing.animales_actuales || 0) : 0
    };
    try {
      if (isEdit) {
        await API.updateFamilia(id, data);
        Object.assign(existing, data);
      } else {
        const res = await API.createFamilia(data);
        if (res.data) this.familias.push(res.data);
      }
    } catch (err) {
      this.showSnackbar('No se pudo guardar: ' + this._errMsg(err), 'error');
      finGuardar();
      return;
    }
    finGuardar();
    this.cancelForm('acogidas');
    if (isEdit) this.viewFosterFamily(id);
    else this.renderAcogidas(document.getElementById('page-acogidas'));
    this.showSnackbar(isEdit ? 'Familia actualizada' : 'Familia creada', 'success');
  },

  viewFosterFamily(id) {
    const f = this._byId(this.familias, id);
    if(!f) { this.showSnackbar('Familia no encontrada (id ' + id + '). Recarga la lista.', 'warning'); return; }
    const animalesEnAcogida = this.animales.filter(a => a.acogida_familia === id);
    this._showDetail('acogidas', f.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showFamiliaFormById('${f.id}')">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteFamilia('${f.id}')">${Icons.trash} Eliminar</button>
      </div>
      <div class="detail-section"><div class="detail-section-title">Informacion de la Familia</div>
        <div class="detail-field"><div class="detail-question">Nombre</div><div class="detail-answer">${this._esc(f.nombre)}</div></div>
        <div class="detail-field"><div class="detail-question">Email</div><div class="detail-answer">${this._esc(f.email)}</div></div>
        <div class="detail-field"><div class="detail-question">Telefono</div><div class="detail-answer">${this._esc(f.telefono)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Ubicacion</div><div class="detail-answer">${this._esc(f.ubicacion)}</div></div>
        <div class="detail-field"><div class="detail-question">Especialidad</div><div class="detail-answer">${this._esc(f.especialidad)}</div></div>
        <div class="detail-field"><div class="detail-question">Capacidad</div><div class="detail-answer">${f.animales_actuales}/${f.max_capacity} animales</div></div>
        <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="estado-badge ${f.capacidad==='Libre'?'en_proceso':'pendiente'}">${f.capacidad}</span></div></div>
        <div class="detail-field"><div class="detail-question">Fecha registro</div><div class="detail-answer">${f.fecha_registro||'—'}</div></div>
      </div>
      ${f.notas?`<div class="detail-section"><div class="detail-section-title">Notas</div><div class="detail-field"><div class="detail-answer">${this._esc(f.notas)}</div></div></div>`:''}
      ${animalesEnAcogida.length?`<div class="detail-section"><div class="detail-section-title">${Icons.home} Animales en Acogida</div>${animalesEnAcogida.map(a=>`<div class="detail-field"><div class="detail-question">${this._esc(a.nombre)}</div><div class="detail-answer">${this._esc(a.especie)} &middot; ${this._esc(a.raza)} &middot; ${this._esc(a.edad||'')}</div></div>`).join('')}</div>`:''}
      `);
  },

  async deleteFamilia(id) {
    if (!(await this._confirm('Eliminar esta familia acogedora permanentemente? Los casos activos se cerraran y los animales quedaran disponibles.'))) return;
    await this._ensureListas(['acogidas']);
    try { const res = await API.deleteFamilia(id); this._assertDeleted(res, 'La familia'); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    const casos = this.acogidas.filter(x => x.familia_id === id && x.estado === 'activa' && x.fase !== 'finalizada');
    if (casos.length) {
      for (const c of casos) {
        if (c.id) this._apiCreateRow(() => API.deleteAcogida(c.id), { m: 'deleteAcogida', a: [c.id] });
        const a = this._byId(this.animales, c.animal_id);
        if (a && a.estado === 'en_acogida' && (!a.acogida_familia || a.acogida_familia === id)) {
          a.estado = 'disponible';
          a.acogida_familia = '';
          await this._updateLocalYApi('animales', a);
        }
        await this._rollbackSolicitud(c.solicitud_id);
      }
      this.acogidas = this.acogidas.filter(x => x.familia_id !== id);
    }
    this.familias = this.familias.filter(f => f.id !== id);
    this.saveLocal();
    this._hideDetail('acogidas');
    this.renderAcogidas(document.getElementById('page-acogidas'));
    this.showSnackbar('Familia eliminada', 'success');
  },

  // ==================== ACOGIDAS ACTIVAS ====================
  async renderAcogidasActivas(el) {
    await Promise.all([
      this._loadList('animales', () => API.getAnimales()),
      this._loadList('familias', () => API.getFamilias())
    ]);
    await this._loadListBestEffort('acogidas', () => API.getAcogidas());
    const casos = (this.acogidas || []).slice().reverse();
    const fases = ['entrega', 'en_casa', 'finalizada'];
    const faseLabel = { entrega: 'Entrega', en_casa: 'En casa', finalizada: 'Finalizada' };
    const faseCls = { entrega: 'en_proceso', en_casa: 'aprobada', finalizada: 'finalizada' };
    el.innerHTML = `
      <div class="page-list-container">
        <div class="list-header"><span class="response-count">${casos.length} casos</span><button class="btn btn-sm btn-outline-green" onclick="Dashboard.showTutorial()">${Icons.helpCircle} Guia</button></div>
        <div class="card" style="margin-bottom:16px"><div class="card-body">
          <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:8px">${fases.map(ff => {
            const n = casos.filter(c => c.fase === ff).length;
            return `<div style="flex:1;min-width:80px;text-align:center;padding:8px 4px;border-radius:8px;background:${n ? 'var(--primary-lighter)' : 'var(--gray-50)'}">
              <div style="font-size:1.2rem;font-weight:800;color:${n ? 'var(--primary-hover)' : 'var(--gray-300)'}">${n}</div>
              <div style="font-size:0.65rem;color:var(--gray-500);margin-top:2px">${faseLabel[ff]}</div>
            </div>`;
          }).join('')}</div>
        </div></div>
        <div class="response-list">${casos.length ? casos.map(c => `
          <div class="response-card">
            <div class="response-card-header">
              <div class="response-avatar" style="background:var(--primary-lighter);color:var(--primary-hover)">${Icons.home}</div>
              <div class="response-info">
                <div class="response-name">${this._esc(c.animal)} <span class="estado-badge ${faseCls[c.fase] || ''}">${faseLabel[c.fase] || c.fase}</span></div>
                <div class="response-email">${this._esc(c.familia)} &middot; desde ${this._esc(c.inicio || '')}</div>
              </div>
              <div class="response-date">${c.estado}</div>
            </div>
            <div style="padding:0 16px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${c.fase === 'entrega' ? `<button class="btn btn-sm btn-outline-green" onclick="Dashboard.avanzarFaseAcogida('${c.id}')">${Icons.checkCircle} En casa</button>` : ''}
              ${c.fase === 'en_casa' ? `<button class="btn btn-sm btn-primary" onclick="Dashboard.avanzarFaseAcogida('${c.id}')">${Icons.check} Finalizar acogida</button>` : ''}
              <button class="btn btn-danger btn-sm" title="Eliminar caso" onclick="Dashboard.deleteAcogida('${c.id}')">${Icons.trash}</button>
              ${c.notas ? `<span style="color:var(--gray-400);font-size:0.75rem">${this._esc(c.notas)}</span>` : ''}
            </div>
          </div>`).join('') : `<div class="empty-state"><div class="empty-state-icon">${Icons.home}</div><h3>Sin acogidas activas</h3><p>Aprueba una encuesta de acogida y asigna un animal desde su ficha.</p></div>`}
        </div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  async avanzarFaseAcogida(id) {
    const c = this._byId(this.acogidas, id);
    if (!c) return;
    const order = { entrega: 'en_casa', en_casa: 'finalizada' };
    const next = order[c.fase];
    if (!next) return;
    if (next === 'finalizada' && !(await this._confirm('Finalizar la acogida? El animal volvera a Disponible y la familia quedara Libre.', 'Finalizar acogida'))) return;
    c.fase = next;
    if (c.fase === 'finalizada') {
      c.estado = 'finalizada';
      c.fin = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const a = c.animal_id ? this._byId(this.animales, c.animal_id) : null;
      if (a) {
        a.estado = 'disponible';
        a.acogida_familia = '';
        this._updateLocalYApi('animales', a);
      }
      const fam = c.familia_id ? this._byId(this.familias, c.familia_id) : null;
      if (fam) {
        fam.animales_actuales = Math.max(0, (fam.animales_actuales || 1) - 1);
        if (fam.animales_actuales === 0) fam.capacidad = 'Libre';
        this._updateLocalYApi('familias', fam);
      }
      const sol = this._parseSolicitud(c.solicitud_id);
      if (sol) await this.setEstado(sol.responseId, 'finalizada', sol.surveyId);
      this.showSnackbar('Acogida finalizada. Animal vuelve a disponible.', 'success');
      this._regLog('acogida', 'Acogida finalizada de ' + (a ? a.nombre : 'animal'), 'acogida', c.id);
    } else {
      this.showSnackbar('Fase actualizada', 'success');
    }
    this.saveLocal();
    this.renderAcogidasActivas(document.getElementById('page-acogidas-activas'));
  },

  async deleteAcogida(id) {
    if (!(await this._confirm('Eliminar este caso de acogida? El animal volvera a Disponible y la solicitud a En proceso.', 'Eliminar acogida'))) return;
    const target = this._byId(this.acogidas, id);
    try {
      const res = await API.deleteAcogida(id);
      this._assertDeleted(res, 'El caso');
    } catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    const a = target && target.animal_id ? this._byId(this.animales, target.animal_id) : null;
    if (a && a.estado === 'en_acogida') {
      a.estado = 'disponible';
      a.acogida_familia = '';
      await this._updateLocalYApi('animales', a);
    }
    const fam = target && target.familia_id ? this._byId(this.familias, target.familia_id) : null;
    if (fam) {
      fam.animales_actuales = Math.max(0, (fam.animales_actuales || 1) - 1);
      if (fam.animales_actuales === 0) fam.capacidad = 'Libre';
      await this._updateLocalYApi('familias', fam);
    }
    await this._rollbackSolicitud(target && target.solicitud_id);
    this.acogidas = (this.acogidas || []).filter(x => x.id !== id);
    this.saveLocal();
    this.renderAcogidasActivas(document.getElementById('page-acogidas-activas'));
    this.showSnackbar('Caso eliminado: animal disponible y solicitud en proceso', 'success');
  },

  // ==================== ADOPCIONES CRUD ====================
  async renderAdopciones(el) {
    await this._loadList('adopciones', () => API.getAdopciones());
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    el.innerHTML = `
      <div class="page-list-container">
        <div class="list-header"><span class="response-count">${this.adopciones.length} procesos</span><button class="btn btn-primary btn-sm" onclick="Dashboard.showAdopcionForm()">${Icons.plus} Nueva</button></div>
      <div class="card" style="margin-bottom:16px"><div class="card-body">
        <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:8px">${fases.map((f,i)=>{
          const count = this.adopciones.filter(p=>p.fase===f).length;
          return `<div style="flex:1;min-width:80px;text-align:center;padding:8px 4px;border-radius:8px;background:${count?'var(--primary-lighter)':'var(--gray-50)'}">
            <div style="font-size:1.2rem;font-weight:800;color:${count?'var(--primary-hover)':'var(--gray-300)'}">${count}</div>
            <div style="font-size:0.65rem;color:var(--gray-500);margin-top:2px">${f}</div>
          </div>`;
        }).join('')}</div>
      </div></div>
      <div id="adopciones-form-container"></div>
      <div class="response-list">${this.adopciones.length ? this.adopciones.map(p=>`
        <div class="response-card" onclick="Dashboard.viewAdopcion('${p.id}')">
          <div class="response-card-header">
            <div class="response-avatar" style="background:var(--warning-light);color:var(--warning)">${Icons.heart}</div>
            <div class="response-info">
              <div class="response-name">${p.animal} <span class="estado-badge ${p.fase==='Contrato'?'en_proceso':'pendiente'}">${p.fase}</span></div>
              <div class="response-email">${p.adoptante} &middot; ${p.estado}</div>
            </div>
            <div class="response-date">${p.fecha}</div>
          </div>
        </div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">${Icons.heart}</div><h3>Aun no hay procesos de adopcion</h3><p>Las solicitudes aprobadas apareceran aqui al asignarles un animal.</p></div>`}</div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  async showAdopcionForm(data) {
    const isEdit = !!data;
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    await this._ensureListas(['animales']);
    this._renderForm('adopciones', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nueva'} Adopcion</h3><form onsubmit="Dashboard.saveAdopcion(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-row"><div class="form-group"><label>Animal *</label><input type="text" id="ad-animal" value="${this._esc(data?.animal||'')}" required placeholder="Ej: Max (Labrador)"></div><div class="form-group"><label>Adoptante *</label><input type="text" id="ad-adoptante" value="${this._esc(data?.adoptante||'')}" required></div></div>
      <div class="form-group"><label>Vincular animal (reserva estado)</label><select id="ad-animal-id" onchange="Dashboard._vincularAnimalTexto()"><option value="">Sin vincular (solo texto)</option>${this.animales.map(a=>`<option value="${this._esc(a.id)}" ${String(data?.animal_id||'')===String(a.id)?'selected':''}>${this._esc(a.nombre)} · ${this._esc(a.especie||'')}</option>`).join('')}</select></div>
      <div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="ad-email" value="${this._esc(data?.email||'')}"></div><div class="form-group"><label>Telefono</label><input type="text" id="ad-telefono" value="${this._esc(data?.telefono||'')}"></div></div>
      <div class="form-row"><div class="form-group"><label>Fase *</label><select id="ad-fase" required>${fases.map(f=>`<option value="${f}" ${data?.fase===f?'selected':''}>${f}</option>`).join('')}</select></div><div class="form-group"><label>Estado</label><input type="text" id="ad-estado" value="${this._esc(data?.estado||'')}" placeholder="Descripcion del estado actual"></div></div>
      <div class="form-group"><label>Notas</label><textarea id="ad-notas" rows="2">${this._esc(data?.notas||'')}</textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.cancelForm('adopciones')">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form></div>`);
  },

  showAdopcionFormById(id) {
    if (!id) { this.showAdopcionForm(null); return; }
    const data = this._byId(this.adopciones, id);
    if (!data) { this.showSnackbar('Caso no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    this.showAdopcionForm(data);
  },

  async saveAdopcion(e, isEdit, id) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const data = {
      animal: document.getElementById('ad-animal').value.trim(),
      adoptante: document.getElementById('ad-adoptante').value.trim(),
      email: document.getElementById('ad-email').value.trim(),
      telefono: document.getElementById('ad-telefono').value.trim(),
      fase: document.getElementById('ad-fase').value,
      estado: document.getElementById('ad-estado').value.trim(),
      notas: document.getElementById('ad-notas').value.trim(),
      animal_id: document.getElementById('ad-animal-id').value
    };
    try {
      if (isEdit) {
        const prevAnimal = (this._byId(this.adopciones, id) || {}).animal_id || '';
        await API.updateAdopcion(id, data);
        const item = this._byId(this.adopciones, id); if (item) Object.assign(item, data);
        if (prevAnimal !== (data.animal_id || '')) {
          await this._liberarAnimal(prevAnimal, id);
          if (data.animal_id) await this._reservarAnimal(data.animal_id, id);
        }
      } else {
        const res = await API.createAdopcion(data);
        if (res.data) {
          this.adopciones.push(res.data);
          if (data.animal_id) await this._reservarAnimal(data.animal_id, res.data.id);
        }
      }
    } catch (err) {
      this.showSnackbar('No se pudo guardar: ' + this._errMsg(err), 'error');
      finGuardar();
      return;
    }
    finGuardar();
    this.cancelForm('adopciones');
    if (isEdit) this.viewAdopcion(id);
    else this.renderAdopciones(document.getElementById('page-adopciones'));
    this.showSnackbar(isEdit ? 'Adopcion actualizada' : 'Adopcion creada', 'success');
  },

  _vincularAnimalTexto() {
    const sel = document.getElementById('ad-animal-id');
    const t = document.getElementById('ad-animal');
    if (!sel || !t || t.value.trim()) return;
    const o = sel.options[sel.selectedIndex];
    if (o && sel.value) t.value = o.text.split(' · ')[0];
  },

  // Reserva/libera animal para casos (idempotente y seguro ante ausencias).
  async _reservarAnimal(animalId, adopcionId) {
    const a = animalId ? this._byId(this.animales, animalId) : null;
    if (!a) return;
    a.estado = 'en_adopcion';
    a.adopcion_id = adopcionId;
    await this._updateLocalYApi('animales', a);
  },

  async _liberarAnimal(animalId, adopcionId) {
    const a = animalId ? this._byId(this.animales, animalId) : null;
    if (!a) return;
    if ((a.estado === 'en_adopcion' || a.estado === 'adoptado') && (!a.adopcion_id || a.adopcion_id === adopcionId)) {
      a.estado = 'disponible';
      a.adopcion_id = '';
      await this._updateLocalYApi('animales', a);
    }
  },

  // solicitud_id tiene forma "surveyId::responseId" (viene de la candidatura).
  _parseSolicitud(solicitudId) {
    if (!solicitudId || String(solicitudId).indexOf('::') === -1) return null;
    const parts = String(solicitudId).split('::');
    const surveyId = parts[0], responseId = parts.slice(1).join('::');
    if (!surveyId || !responseId) return null;
    return { surveyId, responseId };
  },

  _encuestaPage(surveyId) {
    return { 'pre-adopcion-perros': 'encuestas-perros', 'pre-adopcion-gatos': 'encuestas-gatos', 'pre-acogida': 'encuestas-acogida' }[surveyId] || 'encuestas';
  },

  // Rollback compartido adopcion/acogida: solicitud aprobada -> en_proceso
  // y candidatura liberada (en_lista sin animal). Idempotente.
  async _rollbackSolicitud(solicitudId) {
    const sol = this._parseSolicitud(solicitudId);
    if (!sol) return false;
    if (this.getEstado(sol.responseId, sol.surveyId) === 'aprobada') {
      await this.setEstado(sol.responseId, 'en_proceso', sol.surveyId);
    }
    let tocadas = false;
    (this.candidaturas || []).forEach(cand => {
      if (cand.solicitud_id === (sol.surveyId + '::' + sol.responseId) && cand.animal_id) {
        cand.estado = 'en_lista';
        cand.animal_id = '';
        this._updateLocalYApi('candidaturas', cand);
        tocadas = true;
      }
    });
    if (tocadas) this.saveLocal();
    return true;
  },

  async viewAdopcion(id) {
    await this._ensureListas(['contratos', 'seguimientos']);
    const p = this._byId(this.adopciones, id);
    if(!p) { this.showSnackbar('Caso no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    const currentIdx = fases.indexOf(p.fase);
    const contrato = this._contratoDeAdopcion(p.id);
    const sol = this._parseSolicitud(p.solicitud_id);
    const contratoHtml = p.fase === 'Contrato' ? `
      <div class="detail-section"><div class="detail-section-title">${Icons.pencil} Contrato de adopcion</div>
        ${contrato ? `
          <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="estado-badge aprobada">Contrato firmado</span></div></div>
          <div class="detail-field"><div class="detail-question">Fecha firma</div><div class="detail-answer">${this._esc(contrato.fecha)||'—'}</div></div>
          <div class="detail-field"><div class="detail-question">Firmante 1</div><div class="detail-answer">${this._esc(contrato.f1_nombre)||'—'} (${this._esc(contrato.f1_rol)||'Titular'})</div></div>
          ${contrato.f2_nombre ? `<div class="detail-field"><div class="detail-question">Firmante 2</div><div class="detail-answer">${this._esc(contrato.f2_nombre)} (${this._esc(contrato.f2_rol)||'Segundo firmante'})</div></div>` : ''}
          <div style="padding:0 16px 16px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="Dashboard.descargarContrato('${p.id}')">${Icons.download} Descargar PDF</button><button class="btn btn-danger btn-sm" onclick="Dashboard.anularContrato('${p.id}')">${Icons.xCircle} Anular firma</button></div>`
        : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">Contrato pendiente de firma del adoptante.</div></div>
          <div style="padding:0 16px 16px"><button class="btn btn-primary btn-sm" onclick="Dashboard.showContratoForm('${p.id}')">${Icons.pencil} Firmar contrato</button></div>`}
      </div>` : '';
    this._showDetail('adopciones', p.animal, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showAdopcionFormById('${p.id}')">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteAdopcion('${p.id}')">${Icons.trash} Eliminar</button>
        ${currentIdx < fases.length-1?`<button class="btn btn-sm btn-outline-green" onclick="Dashboard.avanzarFase('${p.id}')">${Icons.arrowRight} Avanzar fase</button>`:''}
        ${currentIdx > 0?`<button class="btn btn-sm btn-outline-green" onclick="Dashboard.retrocederFase('${p.id}')">${Icons.arrowLeft} Retroceder</button>`:''}
      </div>
      ${sol ? `<div class="detail-section"><div class="detail-section-title">${Icons.clipboard} Solicitud de origen</div><div class="detail-field"><div class="detail-question">Cuestionario</div><div class="detail-answer"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.viewCuestionarioModal('${sol.surveyId}','${sol.responseId}')">${Icons.eye} Ver cuestionario</button></div></div></div>` : ''}
      <div class="detail-section"><div class="detail-section-title">Pipeline de Adopcion</div>
        <div style="padding:16px;display:flex;gap:4px;overflow-x:auto">${fases.map((f,i)=>`<div style="flex:1;min-width:60px;text-align:center;padding:8px 4px;border-radius:8px;background:${i<currentIdx?'var(--primary-lighter)':i===currentIdx?'var(--primary)':'var(--gray-50)'};color:${i===currentIdx?'white':i<currentIdx?'var(--primary-hover)':'var(--gray-400)'};font-size:0.7rem;font-weight:600">${f}</div>`).join('')}</div>
      </div>
      ${contratoHtml}
      ${this._seguimientosFicha(p.id)}
      <div class="detail-section"><div class="detail-section-title">Detalles</div>
        <div class="detail-field"><div class="detail-question">Animal</div><div class="detail-answer">${p.animal_id ? `<a href="javascript:void(0)" onclick="Dashboard.openAnimalFicha('${this._esc(p.animal_id)}')">${this._esc(p.animal)}</a>` : this._esc(p.animal)}</div></div>
        <div class="detail-field"><div class="detail-question">Adoptante</div><div class="detail-answer">${this._esc(p.adoptante)}</div></div>
        <div class="detail-field"><div class="detail-question">Email</div><div class="detail-answer">${this._esc(p.email)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Telefono</div><div class="detail-answer">${this._esc(p.telefono)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Fase actual</div><div class="detail-answer"><span class="estado-badge en_proceso">${p.fase}</span></div></div>
        <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer">${this._esc(p.estado)}</div></div>
        <div class="detail-field"><div class="detail-question">Fecha inicio</div><div class="detail-answer">${p.fecha}</div></div>
        ${p.notas?`<div class="detail-field"><div class="detail-question">Notas</div><div class="detail-answer">${this._esc(p.notas)}</div></div>`:''}
      </div>`);
  },

  _fasesAdopcion() {
    return ['Encuesta recibida', 'Revision', 'Visita domiciliaria', 'Contrato', 'Entrega', 'Seguimiento'];
  },

  async avanzarFase(id) {
    const p = this._byId(this.adopciones, id);
    if (!p) return;
    const fases = this._fasesAdopcion();
    const idx = fases.indexOf(p.fase);
    if (idx >= fases.length - 1) return;
    const newFase = fases[idx + 1];
    try { await API.updateAdopcion(id, { fase: newFase, estado: `Fase: ${newFase}` }); }
    catch (err) { this.showSnackbar('No se pudo avanzar de fase', 'error'); return; }
    p.fase = newFase;
    p.estado = `Fase: ${newFase}`;
    this.viewAdopcion(id);
  },

  async retrocederFase(id) {
    const p = this._byId(this.adopciones, id);
    if (!p) return;
    const fases = this._fasesAdopcion();
    const idx = fases.indexOf(p.fase);
    if (idx <= 0) return;
    const newFase = fases[idx - 1];
    try { await API.updateAdopcion(id, { fase: newFase, estado: `Fase: ${newFase}` }); }
    catch (err) { this.showSnackbar('No se pudo retroceder de fase', 'error'); return; }
    p.fase = newFase;
    p.estado = `Fase: ${newFase}`;
    this.viewAdopcion(id);
  },

  _seguimientosFicha(adopcionId) {
    const list = (this.seguimientos || []).filter(x => String(x.adopcion_id) === String(adopcionId));
    const rows = list.length
      ? list.slice().reverse().map(s => `<div class="detail-field"><div class="detail-question">${s.fecha ? this._fmtFecha(s.fecha) : '—'} · ${this._esc(s.tipo || 'Seguimiento')}</div><div class="detail-answer">${this._esc(s.nota || '—')}<div style="margin-top:6px"><button class="btn btn-danger btn-sm" onclick="Dashboard.deleteSeguimiento('${this._esc(s.id)}')">${Icons.trash}</button></div></div></div>`).join('')
      : `<div class="detail-field"><div class="detail-answer" style="color:var(--gray-400)">Sin seguimientos todavia</div></div>`;
    return `<div class="detail-section"><div class="detail-section-title">${Icons.calendar} Seguimiento post-adopcion</div>${rows}<div style="padding:0 16px 16px"><button class="btn btn-primary btn-sm" onclick="Dashboard.showSeguimientoForm('${adopcionId}')">${Icons.plus} Nuevo seguimiento</button></div></div>`;
  },

  showSeguimientoForm(adopcionId) {
    const p = this._byId(this.adopciones, adopcionId);
    if (!p) { this.showSnackbar('Caso no encontrado. Recarga la lista.', 'warning'); return; }
    this.showFormModal('Nuevo seguimiento', `
      <form onsubmit="Dashboard.saveSeguimiento(event,'${p.id}')">
      <div class="form-row"><div class="form-group"><label>Fecha *</label><input type="date" id="sg-fecha" value="${new Date().toISOString().slice(0, 10)}" required></div>
      <div class="form-group"><label>Tipo *</label><select id="sg-tipo" required><option value="Llamada">Llamada</option><option value="Visita">Visita</option><option value="Email">Email</option><option value="Otro">Otro</option></select></div></div>
      <div class="form-group"><label>Nota *</label><textarea id="sg-nota" rows="3" required placeholder="Como esta el animal, acuerdos..."></textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`);
  },

  async saveSeguimiento(e, adopcionId) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const p = this._byId(this.adopciones, adopcionId);
    if (!p) { this.showSnackbar('Caso no encontrado. Recarga la lista.', 'warning'); finGuardar(); return; }
    const nota = document.getElementById('sg-nota').value.trim();
    if (!nota) { this.showSnackbar('Escribe la nota del seguimiento', 'warning'); finGuardar(); return; }
    const row = {
      id: 'seg_' + Date.now().toString(36),
      adopcion_id: p.id,
      adoptante: p.adoptante || '',
      animal: p.animal || '',
      fecha: document.getElementById('sg-fecha').value || new Date().toISOString().slice(0, 10),
      tipo: document.getElementById('sg-tipo').value,
      nota
    };
    this.seguimientos.push(row);
    this.saveLocal();
    this._apiCreateRow(() => API.createSeguimiento(row), { m: 'createSeguimiento', a: [row] });
    this._regLog('seguimiento', 'Seguimiento (' + row.tipo + ') en adopcion de ' + (p.animal || ''), 'seguimiento', row.id);
    finGuardar();
    this.closeFormModal();
    this.viewAdopcion(adopcionId);
    this.showSnackbar('Seguimiento guardado', 'success');
  },

  async deleteSeguimiento(id) {
    const s = this._byId(this.seguimientos, id);
    if (!(await this._confirm('Eliminar este seguimiento?', 'Eliminar'))) return;
    try {
      const res = await API.deleteSeguimiento(id);
      this._assertDeleted(res, 'El seguimiento');
    } catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.seguimientos = (this.seguimientos || []).filter(x => x.id !== id);
    this.saveLocal();
    if (s) this.viewAdopcion(s.adopcion_id);
    this.showSnackbar('Seguimiento eliminado', 'success');
  },

  async deleteAdopcion(id) {
    if (!(await this._confirm('Eliminar este caso de adopcion? El animal volvera a Disponible y la solicitud a En proceso.', 'Eliminar adopcion'))) return;
    const target = this._byId(this.adopciones, id);
    try { const res = await API.deleteAdopcion(id); this._assertDeleted(res, 'El caso'); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    await this._ensureListas(['contratos']);
    const c = this._contratoDeAdopcion(id);
    if (c) { this.contratos = this.contratos.filter(x => x.id !== c.id); try { await API.deleteContrato(c.id); } catch (err2) { /* local only */ } }
    // Espejo local del rollback (el backend ya lo aplico en las hojas):
    if (target) await this._liberarAnimal(target.animal_id, id);
    await this._rollbackSolicitud(target && target.solicitud_id);
    this.adopciones = this.adopciones.filter(x => x.id !== id);
    this.saveLocal();
    this._hideDetail('adopciones');
    this.renderAdopciones(document.getElementById('page-adopciones'));
    this.showSnackbar('Caso eliminado: animal disponible y solicitud en proceso', 'success');
  },

  // ==================== CONTRATOS DE ADOPCION ====================
  _contratoDeAdopcion(adopcionId) {
    return (this.contratos || []).find(c => c.adopcion_id === adopcionId);
  },

  showContratoForm(adopcionId) {
    const p = this.adopciones.find(x => x.id === adopcionId);
    if (!p) return;
    const modal = document.getElementById('contrato-modal');
    const body = document.getElementById('contrato-content');
    if (!modal || !body) return;
    const roles1 = ['El adoptante', 'Titular', 'Tutor', 'Representante'];
    const roles2 = ['Mayor de edad', 'Tutor del menor', 'Contacto responsable', 'Persona de avanzada edad'];
    body.innerHTML = `
      <div class="alert-item info" style="margin-bottom:14px">${Icons.pencil} <span>Contrato para <b>${this._esc(p.animal)}</b>.</span></div>
      <form onsubmit="Dashboard.guardarContrato(event,'${adopcionId}')">
        <div class="form-row"><div class="form-group"><label>Fecha de adopcion</label><input type="date" id="ct-fecha" value="${new Date().toISOString().slice(0,10)}"></div><div class="form-group"><label>Ciudad</label><input type="text" id="ct-ciudad" placeholder="Localidad del contrato"></div></div>

        <div class="detail-section" style="margin-top:6px"><div class="detail-section-title">Firmante 1 · Titular</div>
          <div class="form-row"><div class="form-group"><label>Nombre completo *</label><input type="text" id="f1-nombre" value="${this._esc(p.adoptante || '')}" required></div><div class="form-group"><label>DNI</label><input type="text" id="f1-dni" placeholder="12345678A"></div></div>
          <div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="f1-email" value="${this._esc(p.email || '')}"></div><div class="form-group"><label>Telefono</label><input type="text" id="f1-telefono" value="${this._esc(p.telefono || '')}"></div></div>
          <div class="form-row"><div class="form-group"><label>Rol</label><select id="f1-rol">${roles1.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div><div class="form-group"></div></div>
          <div class="form-group"><label class="detail-question" style="margin-bottom:6px">Firma del firmante 1</label><canvas id="f1-firma" width="560" height="160" style="width:100%;border:1px dashed var(--gray-300);border-radius:8px;background:var(--white);touch-action:none"></canvas><button type="button" class="btn btn-sm btn-outline-green" style="margin-top:6px" onclick="Dashboard._clearFirmaCanvas('f1-firma')">Limpiar firma</button></div>
        </div>

        <div class="detail-section"><div class="detail-section-title">Firmante 2 · Segundo firmante (opcional)</div>
          <div class="form-row"><div class="form-group"><label>Nombre completo</label><input type="text" id="f2-nombre" placeholder="Menor con tutor o persona que respalda"></div><div class="form-group"><label>DNI</label><input type="text" id="f2-dni" placeholder="12345678A"></div></div>
          <div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="f2-email"></div><div class="form-group"><label>Telefono</label><input type="text" id="f2-telefono"></div></div>
          <div class="form-row"><div class="form-group"><label>Rol</label><select id="f2-rol">${roles2.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div><div class="form-group"></div></div>
          <div class="form-group"><label class="detail-question" style="margin-bottom:6px">Firma del firmante 2</label><canvas id="f2-firma" width="560" height="160" style="width:100%;border:1px dashed var(--gray-300);border-radius:8px;background:var(--white);touch-action:none"></canvas><button type="button" class="btn btn-sm btn-outline-green" style="margin-top:6px" onclick="Dashboard._clearFirmaCanvas('f2-firma')">Limpiar firma</button></div>
        </div>

        <div class="form-actions" style="padding-top:12px"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeContratoForm()">Cancelar</button><button type="submit" class="btn btn-primary">Firmar y guardar</button></div>
      </form>`;
    modal.style.display = 'flex';
    this._setupFirmaCanvas('f1-firma');
    this._setupFirmaCanvas('f2-firma');
  },

  _setupFirmaCanvas(canvasId) {
    const cv = document.getElementById(canvasId);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let drawing = false;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      const xRatio = cv.width / (r.width || 1);
      const yRatio = cv.height / (r.height || 1);
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (cx - r.left) * xRatio, y: (cy - r.top) * yRatio };
    };
    const start = (e) => { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#191919'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };
    const stop = () => { drawing = false; ctx.beginPath(); };
    cv.addEventListener('mousedown', start);
    cv.addEventListener('mousemove', move);
    cv.addEventListener('mouseup', stop);
    cv.addEventListener('mouseleave', stop);
    cv.addEventListener('touchstart', start, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', stop);
  },

  _clearFirmaCanvas(canvasId) {
    const cv = document.getElementById(canvasId);
    if (!cv) return;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  },

  closeContratoForm() {
    const el = document.getElementById('contrato-modal');
    if (el) el.style.display = 'none';
  },

  async guardarContrato(e, adopcionId) {
    e.preventDefault();
    const p = this._byId(this.adopciones, adopcionId);
    if (!p) return;
    const firma = async (id) => {
      const cv = document.getElementById(id);
      if (!cv) return '';
      const ctx = cv.getContext('2d');
      const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let hasInk = false;
      for (let p = 0; p < px.length; p += 4) { if (px[p + 3] > 0) { hasInk = true; break; } }
      if (!hasInk) return '';
      return await this._downscaleImage(cv.toDataURL('image/png'), 256, 256, 0.85);
    };
    const c = {
      id: 'ctr_' + Date.now().toString(36),
      adopcion_id: adopcionId,
      animal: p.animal,
      animal_id: p.animal_id || null,
      fecha: document.getElementById('ct-fecha').value || new Date().toISOString().slice(0, 10),
      ciudad: document.getElementById('ct-ciudad').value.trim(),
      f1_nombre: document.getElementById('f1-nombre').value.trim(),
      f1_dni: document.getElementById('f1-dni').value.trim(),
      f1_email: document.getElementById('f1-email').value.trim(),
      f1_telefono: document.getElementById('f1-telefono').value.trim(),
      f1_rol: document.getElementById('f1-rol').value,
      f1_firma: await firma('f1-firma'),
      f2_nombre: document.getElementById('f2-nombre').value.trim(),
      f2_dni: document.getElementById('f2-dni').value.trim(),
      f2_email: document.getElementById('f2-email').value.trim(),
      f2_telefono: document.getElementById('f2-telefono').value.trim(),
      f2_rol: document.getElementById('f2-rol').value,
      f2_firma: await firma('f2-firma'),
      estado: 'firmado',
      creado: new Date().toISOString()
    };
    if (!c.f1_firma) { this.showSnackbar('Falta la firma del firmante 1: dibujala en el recuadro', 'warning'); return; }
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const a = p.animal_id ? this._byId(this.animales, p.animal_id) : null;
    if (a) { c.especie = a.especie; c.raza = a.raza; c.edad = a.edad; }
    this.contratos.push(c);
    this.saveLocal();
    this._apiCreateRow(() => API.createContrato(c), { m: 'createContrato', a: [c] });
    if (p) {
      p.estado = 'Contrato firmado';
      p.estado_firma = 'firmado';
      try { await API.updateAdopcion(adopcionId, { estado: 'Contrato firmado', estado_firma: 'firmado' }); } catch (err) { /* local only */ }
    }
    if (a && a.estado !== 'adoptado') {
      a.estado = 'adoptado';
      await this._updateLocalYApi('animales', a);
    }
    this.closeContratoForm();
    this.viewAdopcion(adopcionId);
    this._regLog('contrato', 'Contrato firmado para ' + (p.animal || ''), 'contrato', c.id);
    finGuardar();
    this.showSnackbar('Contrato firmado y guardado', 'success');
  },

  async descargarContrato(adopcionId) {
    await this._ensureListas(['contratos']);
    const c = this._contratoDeAdopcion(adopcionId);
    if (!c) { this.showSnackbar('No hay contrato firmado', 'warning'); return; }
    PdfExport.exportContracto(c);
  },

  async anularContrato(adopcionId) {
    if (!(await this._confirm('Anular la firma del contrato?'))) return;
    await this._ensureListas(['contratos']);
    const c = (this.contratos || []).find(x => x.adopcion_id === adopcionId);
    if (!c) { this.showSnackbar('No hay contrato que anular', 'warning'); return; }
    this.contratos = this.contratos.filter(x => x.id !== c.id);
    this.saveLocal();
    if (c) { try { await API.deleteContrato(c.id); } catch (err) { /* local only */ } }
    const p = this._byId(this.adopciones, adopcionId);
    if (p) {
      p.estado = 'Fase: Contrato';
      p.estado_firma = '';
      try { await API.updateAdopcion(adopcionId, { estado: 'Fase: Contrato', estado_firma: '' }); } catch (err) { /* local only */ }
    }
    const a = p && p.animal_id ? this._byId(this.animales, p.animal_id) : null;
    if (a && a.estado === 'adoptado') {
      a.estado = 'en_adopcion';
      await this._updateLocalYApi('animales', a);
    }
    this._regLog('contrato', 'Firma anulada para ' + (p ? p.animal : ''), 'contrato', c.id);
    this.viewAdopcion(adopcionId);
    this.showSnackbar('Firma anulada', 'success');
  },

  // ==================== SOCIOS CRUD ====================
  async renderSocios(el) {
    await this._loadList('socios', () => API.getSocios());
    const activos = this.socios.filter(s=>s.activo).length;
    const areas = [...new Set(this.socios.map(s=>s.area))];
    const esSocio = s => s.tipo === 'Socio' || s.tipo === 'Ambos';
    const esVol = s => s.tipo === 'Voluntario' || s.tipo === 'Ambos';
    const tipoF = this._currentSocioTipoFilter || 'all';
    const visibles = tipoF === 'Socio' ? this.socios.filter(esSocio) : (tipoF === 'Voluntario' ? this.socios.filter(esVol) : this.socios);
    el.innerHTML = `
      <div class="page-list-container">
        <div class="stats-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-card-icon green">${Icons.users}</div><div class="stat-card-info"><div class="stat-card-label">Total Socios</div><div class="stat-card-value">${this.socios.length}</div></div></div>
          <div class="stat-card"><div class="stat-card-icon blue">${Icons.checkCircle}</div><div class="stat-card-info"><div class="stat-card-label">Activos</div><div class="stat-card-value">${activos}</div></div></div>
          <div class="stat-card"><div class="stat-card-icon orange">${Icons.calendar}</div><div class="stat-card-info"><div class="stat-card-label">Areas</div><div class="stat-card-value">${areas.length}</div></div></div>
        </div>
        <div class="list-header"><span class="response-count">${visibles.length} registros</span><button class="btn btn-primary btn-sm" onclick="Dashboard.showSocioForm()">${Icons.plus} Nuevo</button></div>
      <div class="filters-bar"><div class="filter-row">
        <select onchange="Dashboard._currentSocioTipoFilter=this.value;Dashboard.renderSocios(document.getElementById('page-socios'))">
          <option value="all" ${tipoF==='all'?'selected':''}>Todos (${this.socios.length})</option>
          <option value="Socio" ${tipoF==='Socio'?'selected':''}>Socios (${this.socios.filter(s=>s.tipo==='Socio'||s.tipo==='Ambos').length})</option>
          <option value="Voluntario" ${tipoF==='Voluntario'?'selected':''}>Voluntarios (${this.socios.filter(s=>s.tipo==='Voluntario'||s.tipo==='Ambos').length})</option>
        </select>
      </div></div>
      <div id="socios-form-container"></div>
      <div class="card"><div class="card-body-flush"><table class="data-table">
        <thead><tr><th>Nombre</th><th>Email</th><th>Tipo</th><th>Area</th><th>Estado</th></tr></thead>
        <tbody>${visibles.length ? visibles.map(s=>`<tr onclick="Dashboard.viewSocio('${s.id}')" style="cursor:pointer"><td>${this._esc(s.nombre)}</td><td>${this._esc(s.email)}</td><td><span class="estado-badge ${this._tipoBadgeCls(s.tipo)}">${this._esc(s.tipo||'—')}</span></td><td>${this._esc(s.area)}</td><td><span class="estado-badge ${s.activo?'en_proceso':'descartada'}">${s.activo?'Activo':'Inactivo'}</span></td></tr>`).join('') : `<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--gray-400)">Aun no hay socios registrados</td></tr>`}</tbody>
      </table></div></div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  showSocioForm(data) {
    const isEdit = !!data;
    const fotoPreview = data?.foto ? `<img src="${this._esc(data.foto)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);margin-bottom:8px;display:block">` : '';
    this._renderForm('socios', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nuevo'} Socio</h3><form onsubmit="Dashboard.saveSocio(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-group"><label>Foto del socio</label>${fotoPreview}<input type="file" id="so-foto" accept="image/*" onchange="Dashboard._previewFoto(this,'so-foto-preview')"><div id="so-foto-preview"></div></div>
      <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="so-nombre" value="${this._esc(data?.nombre||'')}" required></div><div class="form-group"><label>Email *</label><input type="email" id="so-email" value="${this._esc(data?.email||'')}" required></div></div>
      <div class="form-row"><div class="form-group"><label>Tipo *</label><select id="so-tipo" required onchange="Dashboard._toggleCuota()"><option value="">Seleccionar...</option><option value="Socio" ${data?.tipo==='Socio'?'selected':''}>Solo socio (cuota)</option><option value="Voluntario" ${data?.tipo==='Voluntario'?'selected':''}>Solo voluntario (colabora)</option><option value="Ambos" ${data?.tipo==='Ambos'?'selected':''}>Ambos</option></select></div><div class="form-group" id="so-cuota-wrap" style="${(data?.tipo==='Socio'||data?.tipo==='Ambos')?'':'display:none'}"><label>Cuota (€/año)</label><input type="text" id="so-cuota" value="${this._esc(data?.cuota||'')}" placeholder="Ej: 30"><label style="margin-top:8px">Ultimo pago</label><input type="date" id="so-ultimo-pago" value="${this._esc(data?.ultimo_pago||'')}"></div></div>
      <div class="form-row"><div class="form-group"><label>Telefono</label><input type="text" id="so-telefono" value="${this._esc(data?.telefono||'')}"></div><div class="form-group"><label>Area *</label><select id="so-area" required><option value="">Seleccionar area...</option><option value="Paseos de perros" ${data?.area==='Paseos de perros'?'selected':''}>Paseos de perros</option><option value="Socializacion de gatos" ${data?.area==='Socializacion de gatos'?'selected':''}>Socializacion de gatos</option><option value="Cuidado de acogida" ${data?.area==='Cuidado de acogida'?'selected':''}>Cuidado de acogida</option><option value="Transporte de animales" ${data?.area==='Transporte de animales'?'selected':''}>Transporte de animales</option><option value="Eventos y captacion" ${data?.area==='Eventos y captacion'?'selected':''}>Eventos y captacion</option><option value="Fotografia" ${data?.area==='Fotografia'?'selected':''}>Fotografia</option><option value="Administracion" ${data?.area==='Administracion'?'selected':''}>Administracion</option></select></div></div>
      ${data?.carnet_id ? `<div class="form-group"><label>ID Carnet</label><input type="text" value="${this._esc(data.carnet_id)}" readonly style="background:var(--gray-100);font-family:monospace"></div>` : ''}
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.cancelForm('socios')">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form></div>`);
  },

  showSocioFormById(id) {
    if (!id) { this.showSocioForm(null); return; }
    const data = this._byId(this.socios, id);
    if (!data) { this.showSnackbar('Socio no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    this.showSocioForm(data);
  },

  _previewFoto(input, previewId) {
    const preview = document.getElementById(previewId);
    if (!preview || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => { preview.innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);margin-top:8px">`; };
    reader.readAsDataURL(input.files[0]);
  },

  async _downscaleImage(dataUrl, maxWidth, maxHeight, quality) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / (img.width || 1), maxHeight / (img.height || 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality || 0.7));
        } catch (err) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  },

  async saveSocio(e, isEdit, id) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const data = {
      nombre: document.getElementById('so-nombre').value.trim(),
      email: document.getElementById('so-email').value.trim(),
      telefono: document.getElementById('so-telefono').value.trim(),
      tipo: document.getElementById('so-tipo').value,
      cuota: (document.getElementById('so-tipo').value === 'Socio' || document.getElementById('so-tipo').value === 'Ambos') ? document.getElementById('so-cuota').value.trim() : '',
      ultimo_pago: (document.getElementById('so-tipo').value === 'Socio' || document.getElementById('so-tipo').value === 'Ambos') ? document.getElementById('so-ultimo-pago').value : '',
      area: document.getElementById('so-area').value
    };
    // Foto
    const fotoInput = document.getElementById('so-foto');
    if (fotoInput && fotoInput.files[0]) {
      const raw = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(fotoInput.files[0]);
      });
      data.foto = await this._downscaleImage(raw, 128, 128);
    } else if (isEdit) {
      const existing = this._byId(this.socios, id);
      data.foto = existing?.foto || null;
    }
    // Carnet ID
    if (!isEdit) {
      data.carnet_id = CarnetGenerator.generateCarnetId(data.area);
      data.activo = true;
      data.fecha_registro = new Date().toISOString().slice(0,10);
      data.horas_mes = 0;
      data.ultima_actividad = new Date().toISOString().slice(0,10);
    } else {
      const existing = this._byId(this.socios, id);
      data.carnet_id = existing?.carnet_id || CarnetGenerator.generateCarnetId(data.area);
      data.activo = existing?.activo ?? true;
      data.fecha_registro = existing?.fecha_registro || new Date().toISOString().slice(0,10);
      data.horas_mes = existing?.horas_mes || 0;
      data.ultima_actividad = existing?.ultima_actividad || new Date().toISOString().slice(0,10);
    }
    try {
      if (isEdit) {
        await API.updateSocio(id, data);
        const item = this._byId(this.socios, id); if (item) Object.assign(item, data);
      } else {
        const res = await API.createSocio(data);
        if (res.data) this.socios.push(res.data);
      }
    } catch (err) {
      this.showSnackbar('No se pudo guardar: ' + this._errMsg(err), 'error');
      finGuardar();
      return;
    }
    finGuardar();
    this.cancelForm('socios');
    if (isEdit) this.viewSocio(id);
    else this.renderSocios(document.getElementById('page-socios'));
    this.showSnackbar(isEdit ? 'Socio actualizado' : 'Socio creado', 'success');
  },

  async viewSocio(id) {
    await this._ensureListas(['apadrinamientos', 'animales']);
    const s = this._byId(this.socios, id);
    if(!s) { this.showSnackbar('Socio no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    const fotoHtml = s.foto ? `<img src="${s.foto}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);margin-bottom:12px">` : `<div style="width:100px;height:100px;border-radius:50%;background:var(--gray-100);display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--primary);margin-bottom:12px">${s.nombre?.charAt(0)||'?'}</div>`;
    this._showDetail('socios', s.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showSocioFormById('${s.id}')">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteSocio('${s.id}')">${Icons.trash} Eliminar</button>
        <button class="btn btn-sm ${s.activo?'btn-outline-green':'btn-primary'}" onclick="Dashboard.toggleSocio('${s.id}')">${s.activo?'Desactivar':'Activar'}</button>
        <button class="btn btn-sm" style="background:var(--gray-900);color:var(--white)" onclick="Dashboard.showCarnet('${s.id}')">${Icons.download} Ver Carnet</button>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
        <div>${fotoHtml}</div>
        <div style="flex:1;min-width:min(200px,100%)">
          <div class="detail-section"><div class="detail-section-title">Informacion del Socio</div>
            <div class="detail-field"><div class="detail-question">Nombre</div><div class="detail-answer">${this._esc(s.nombre)}</div></div>
            <div class="detail-field"><div class="detail-question">Email</div><div class="detail-answer">${this._esc(s.email)}</div></div>
            <div class="detail-field"><div class="detail-question">Telefono</div><div class="detail-answer">${s.telefono||'—'}</div></div>
            <div class="detail-field"><div class="detail-question">Tipo</div><div class="detail-answer"><span class="estado-badge ${this._tipoBadgeCls(s.tipo)}">${this._esc(s.tipo||'—')}</span></div></div>
            ${(s.tipo==='Socio'||s.tipo==='Ambos')?`<div class="detail-field"><div class="detail-question">Cuota</div><div class="detail-answer">${this._esc(s.cuota||'—')} €/año</div></div><div class="detail-field"><div class="detail-question">Ultimo pago</div><div class="detail-answer">${s.ultimo_pago?this._fmtFecha(s.ultimo_pago):'—'}</div></div><div class="detail-field"><div class="detail-question">Estado cuota</div><div class="detail-answer"><span class="estado-badge ${this._cuotaEstado(s).cls}">${this._cuotaEstado(s).label}</span></div></div>`:''}
            <div class="detail-field"><div class="detail-question">Area</div><div class="detail-answer">${s.area}</div></div>
            <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="estado-badge ${s.activo?'en_proceso':'descartada'}">${s.activo?'Activo':'Inactivo'}</span></div></div>
            <div class="detail-field"><div class="detail-question">Fecha registro</div><div class="detail-answer">${s.fecha_registro||'—'}</div></div>
            <div class="detail-field"><div class="detail-question">ID Carnet</div><div class="detail-answer" style="font-family:monospace;font-size:13px">${s.carnet_id||'Sin generar'}</div></div>
          </div>
        </div>
      </div>
      <div class="detail-section"><div class="detail-section-title">${Icons.activity} Actividad</div>
        <div class="detail-field"><div class="detail-question">Horas este mes</div><div class="detail-answer">${s.horas_mes||0}h</div></div>
        <div class="detail-field"><div class="detail-question">Ultima actividad</div><div class="detail-answer">${s.ultima_actividad||'Sin registro'}</div></div>
      </div>
      ${this._apadrinaFicha(s.id)}`);
  },

  showCarnet(id) {
    const s = this._byId(this.socios, id);
    if (!s) return;
    CarnetGenerator.showCarnetModal(s);
  },

  async toggleSocio(id) {
    const s = this._byId(this.socios, id);
    if (!s) return;
    const newActivo = !s.activo;
    try { await API.updateSocio(id, { activo: newActivo }); }
    catch (err) { this.showSnackbar('No se pudo actualizar el estado', 'error'); return; }
    s.activo = newActivo;
    this.viewSocio(id);
    this.showSnackbar(newActivo ? 'Socio activado' : 'Socio desactivado', 'success');
  },

  async deleteSocio(id) {
    if (!(await this._confirm('Eliminar este socio permanentemente?'))) return;
    try { const res = await API.deleteSocio(id); this._assertDeleted(res, 'El socio'); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.socios = this.socios.filter(s => s.id !== id);
    this._hideDetail('socios');
    this.renderSocios(document.getElementById('page-socios'));
    this.showSnackbar('Socio eliminado', 'success');
  },

  // ==================== BLACKLIST ====================
  async renderBlacklist(el) {
    await this._loadList('blacklist', () => API.getBlacklist());
    el.innerHTML = `
      <div class="list-header"><div class="search-box" style="flex:1"><span class="search-icon"></span><input type="text" placeholder="Buscar..." oninput="Dashboard.filterBlacklist(this)"></div><button class="btn btn-primary btn-sm" onclick="Dashboard.showAddBlacklist()">${Icons.plus} Anadir</button></div>
      <div id="blacklist-list-container">${this._renderBlacklistCards()}</div><div id="blacklist-form-container"></div>`;
  },

  filterBlacklist(input) { const c=document.getElementById('blacklist-list-container'); if(c) c.innerHTML=this._renderBlacklistCards(input.value); },

  _renderBlacklistCards(search='') {
    let items=this.blacklist || [];
    if(search) items=items.filter(bl=>((bl.nombre||'')+' '+(bl.apellidos||'')+' '+(bl.email||'')+' '+(bl.motivo||'')).toLowerCase().includes(search.toLowerCase()));
    if(!items.length) return '<div class="empty-state"><div class="empty-state-icon">'+Icons.checkCircle+'</div><p>No hay personas en la lista negra</p></div>';
    return items.map((bl,i)=>`<div class="bl-card"><div class="bl-card-header"><span class="bl-card-name">${this._esc(bl.nombre)} ${this._esc(bl.apellidos)}</span><div style="display:flex;gap:4px"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.showEditBlacklistItem('${this._esc(bl.id||'')}')">${Icons.pencil}</button><button class="btn btn-danger btn-sm" onclick="Dashboard.removeBlacklistItem('${this._esc(bl.id||i)}')">${Icons.trash}</button></div></div>${bl.email?'<div class="bl-card-email">'+this._esc(bl.email)+'</div>':''}<div class="bl-card-motivo">${this._esc(bl.motivo)}</div><div class="bl-card-meta">${this._esc(bl.origen||'manual')} ${bl.fecha?'&middot; '+this._esc(new Date(bl.fecha).toLocaleDateString('es-ES')):''}</div></div>`).join('');
  },

  showAddBlacklist() {
    const c=document.getElementById('blacklist-form-container');
    if(!c) return;
    c.innerHTML = this._blacklistFormHTML();
  },

  showEditBlacklistItem(id) {
    const c=document.getElementById('blacklist-form-container');
    if(!c) return;
    const bl = (this.blacklist || []).find(b => String(b.id) === String(id)) || this.blacklist[Number(id)];
    if (!bl) return;
    c.innerHTML = this._blacklistFormHTML(bl, id);
  },

  _blacklistFormHTML(data, id) {
    const isEdit = id !== undefined;
    return `<div class="form-card" style="margin-top:16px"><h3>${isEdit?'Editar':'Anadir a lista negra'}</h3><form onsubmit="Dashboard.saveBlacklistItem(event,'${isEdit ? this._esc(String(id)) : ''}')"><div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="bl-nombre" value="${this._esc(data?.nombre||'')}" required></div><div class="form-group"><label>Apellidos *</label><input type="text" id="bl-apellidos" value="${this._esc(data?.apellidos||'')}" required></div></div><div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="bl-email" value="${this._esc(data?.email||'')}"></div><div class="form-group"><label>Telefono</label><input type="text" id="bl-telefono" value="${this._esc(data?.telefono||'')}"></div></div><div class="form-group"><label>Motivo *</label><select id="bl-motivo" required><option value="">Seleccionar...</option>${['Incompatible con animales','Vivienda inadecuada','Historial de maltrato','Informacion falsa','Sin compromiso','Otros'].map(m=>`<option ${data?.motivo===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="form-group"><label>Notas</label><textarea id="bl-notas" rows="2">${this._esc(data?.notas||'')}</textarea></div><div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="document.getElementById('blacklist-form-container').innerHTML=''">Cancelar</button><button type="submit" class="btn btn-danger">${isEdit?'Actualizar':'Anadir'}</button></div></form></div>`;
  },

  async saveBlacklistItem(e, id) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const prev = id ? (this.blacklist || []).find(b => String(b.id) === String(id)) || this.blacklist[Number(id)] : null;
    const item = {
      id: prev ? prev.id : ('bl_' + Date.now().toString(36)),
      nombre: document.getElementById('bl-nombre').value.trim(),
      apellidos: document.getElementById('bl-apellidos').value.trim(),
      email: document.getElementById('bl-email').value.trim(),
      telefono: document.getElementById('bl-telefono').value.trim(),
      motivo: document.getElementById('bl-motivo').value,
      notas: document.getElementById('bl-notas').value.trim(),
      origen: prev ? prev.origen : 'manual',
      fecha: prev ? prev.fecha : new Date().toISOString()
    };
    try { await (id ? API.updateBlacklist(item.id, item) : API.createBlacklist(item)); }
    catch (err) { this.showSnackbar(this._errMsg(err), 'error'); finGuardar(); return; }
    finGuardar();
    if (id) { const i = (this.blacklist || []).findIndex(b => String(b.id) === String(item.id)); if (i >= 0) this.blacklist[i] = item; }
    else { this.blacklist.push(item); }
    this.saveLocal();
    document.getElementById('blacklist-form-container').innerHTML='';
    const lc=document.getElementById('blacklist-list-container'); if(lc) lc.innerHTML=this._renderBlacklistCards();
    this._regLog(id ? 'blacklist' : 'blacklist', (id ? 'Actualizado: ' : 'Anadido a lista negra: ') + item.nombre + ' ' + item.apellidos);
    this.showSnackbar(id ? 'Guardado en lista negra' : 'Anadido a lista negra', 'success');
  },

  async removeBlacklistItem(id) {
    if (!(await this._confirm('Eliminar esta persona de la lista negra?'))) return;
    const idx = (this.blacklist || []).findIndex(b => String(b.id) === String(id));
    const target = idx >= 0 ? this.blacklist[idx] : this.blacklist[Number(id)];
    if (!target) return;
    try { await API.deleteBlacklist(target.id); }
    catch (err) { this.showSnackbar(this._errMsg(err), 'error'); return; }
    this.blacklist.splice(idx >= 0 ? idx : Number(id), 1);
    this.saveLocal();
    const lc=document.getElementById('blacklist-list-container'); if(lc) lc.innerHTML=this._renderBlacklistCards();
    this.showSnackbar('Eliminado de la lista negra', 'success');
  },

  // ==================== DONACIONES ====================
  _totalDonaciones(list) {
    return (list || []).reduce((s, d) => s + (parseFloat(String(d.importe).replace(',', '.')) || 0), 0);
  },

  async renderDonaciones(el) {
    await this._loadList('donaciones', () => API.getDonaciones());
    const total = this._totalDonaciones(this.donaciones);
    const items = (this.donaciones || []).slice().reverse();
    el.innerHTML = `
      <div class="page-list-container">
        <div class="stats-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-card-icon green">${Icons.heart}</div><div class="stat-card-info"><div class="stat-card-label">Total donado</div><div class="stat-card-value">${total.toFixed(2)} €</div><div class="stat-card-change">${this.donaciones.length} donaciones</div></div></div>
        </div>
        <div class="list-header"><span class="response-count">${this.donaciones.length} donaciones</span><button class="btn btn-primary btn-sm" onclick="Dashboard.showDonacionForm()">${Icons.plus} Nueva</button></div>
        <div class="card"><div class="card-body-flush"><table class="data-table"><thead><tr><th>Fecha</th><th>Donante</th><th>Importe</th><th></th></tr></thead><tbody>${items.length ? items.map(d => `<tr><td>${d.fecha ? this._fmtFecha(d.fecha) : '—'}</td><td>${this._esc(d.donante || '')}</td><td>${this._esc(d.importe || '0')} €</td><td><button class="btn btn-danger btn-sm" onclick="Dashboard.deleteDonacion('${this._esc(d.id)}')">${Icons.trash}</button></td></tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--gray-400)">Aun no hay donaciones</td></tr>`}</tbody></table></div></div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  showDonacionForm() {
    this.showFormModal('Nueva donacion', `
      <form onsubmit="Dashboard.saveDonacion(event)">
      <div class="form-row"><div class="form-group"><label>Donante *</label><input type="text" id="dn-donante" required placeholder="Nombre o Anonimo"></div>
      <div class="form-group"><label>Importe (€) *</label><input type="text" id="dn-importe" required placeholder="Ej: 50" inputmode="decimal"></div></div>
      <div class="form-row"><div class="form-group"><label>Fecha *</label><input type="date" id="dn-fecha" required value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="form-group"><label>Notas</label><input type="text" id="dn-notas" placeholder="Opcional"></div></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.closeFormModal()">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
      </form>`);
  },

  async saveDonacion(e) {
    e.preventDefault();
    const finGuardar = this._guardando(e.target);
    if (!finGuardar) return;
    const donante = document.getElementById('dn-donante').value.trim();
    const importe = document.getElementById('dn-importe').value.trim().replace(',', '.');
    if (!donante || isNaN(parseFloat(importe))) { this.showSnackbar('Completa donante e importe válido', 'warning'); finGuardar(); return; }
    const row = {
      id: 'don_' + Date.now().toString(36),
      donante,
      importe,
      fecha: document.getElementById('dn-fecha').value || new Date().toISOString().slice(0, 10),
      notas: document.getElementById('dn-notas').value.trim()
    };
    this.donaciones.push(row);
    this.saveLocal();
    this._apiCreateRow(() => API.createDonacion(row), { m: 'createDonacion', a: [row] });
    this._regLog('donacion', 'Donacion de ' + donante + ' (' + importe + ' €)', 'donacion', row.id);
    finGuardar();
    this.closeFormModal();
    this.renderDonaciones(document.getElementById('page-donaciones'));
    this.showSnackbar('Donacion guardada', 'success');
  },

  async deleteDonacion(id) {
    if (!(await this._confirm('Eliminar esta donacion?', 'Eliminar'))) return;
    try {
      const res = await API.deleteDonacion(id);
      this._assertDeleted(res, 'La donacion');
    } catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.donaciones = (this.donaciones || []).filter(x => x.id !== id);
    this.saveLocal();
    this.renderDonaciones(document.getElementById('page-donaciones'));
    this.showSnackbar('Donacion eliminada', 'success');
  },

  // ==================== REPORTES ====================
  async renderReportes(el) {
    await this._loadSurveys();
    await Promise.all([
      this.loadEstados(),
      this._loadList('animales', () => API.getAnimales()),
      this._loadList('adopciones', () => API.getAdopciones()),
      this._loadList('socios', () => API.getSocios()),
      ...this.surveys.map(s => this._loadResponses(s.id)),
    ]);
    const all = Object.values(this.responses).flat();
    const activas = all.filter(r => this.getEstado(r.id, r._surveyId) !== 'descartada');
    const total = activas.length;
    const perros = (this.responses['pre-adopcion-perros'] || []).filter(r => this.getEstado(r.id, 'pre-adopcion-perros') !== 'descartada').length;
    const gatos = (this.responses['pre-adopcion-gatos'] || []).filter(r => this.getEstado(r.id, 'pre-adopcion-gatos') !== 'descartada').length;
    const acogida = (this.responses['pre-acogida'] || []).filter(r => this.getEstado(r.id, 'pre-acogida') !== 'descartada').length;
    const adoptados = this.animales.filter(a => a.estado === 'adoptado').length;
    const enAcogida = this.animales.filter(a => a.estado === 'en_acogida').length;
    const disponibles = this.animales.filter(a => a.estado === 'disponible').length;
    const sociosActivos = this.socios.filter(s => s.activo).length;
    const tasaAdopcion = this.animales.length ? Math.round(adoptados/this.animales.length*100) : 0;
    const enProceso = activas.filter(r => this.getEstado(r.id, r._surveyId)==='en_proceso').length;
    const tasaConversion = total ? Math.round(enProceso/total*100) : 0;

    el.innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="stat-card-icon green">${Icons.trendingUp}</div><div class="stat-card-info"><div class="stat-card-label">Tasa de Adopcion</div><div class="stat-card-value">${tasaAdopcion}%</div><div class="stat-card-change">${adoptados} adoptados / ${this.animales.length} total</div></div></div>
        <div class="stat-card"><div class="stat-card-icon blue">${Icons.clipboard}</div><div class="stat-card-info"><div class="stat-card-label">Total Encuestas</div><div class="stat-card-value">${total}</div><div class="stat-card-change">${perros} perros · ${gatos} gatos · ${acogida} acogida</div></div></div>
        <div class="stat-card"><div class="stat-card-icon orange">${Icons.heart}</div><div class="stat-card-info"><div class="stat-card-label">Tasa de Conversion</div><div class="stat-card-value">${tasaConversion}%</div><div class="stat-card-change">${enProceso} en proceso de ${total}</div></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-header"><h3>Resumen por Entidad</h3></div><div class="card-body">
        <div class="alert-item info">${Icons.dog} <span>${perros} encuestas perros</span></div>
        <div class="alert-item info">${Icons.cat} <span>${gatos} encuestas gatos</span></div>
        <div class="alert-item info">${Icons.home} <span>${acogida} solicitudes acogida</span></div>
        <div class="alert-item info">${Icons.heart} <span>${this.animales.length} animales (${disponibles} disponibles, ${enAcogida} en acogida, ${adoptados} adoptados)</span></div>
        <div class="alert-item info">${Icons.users} <span>${this.socios.length} socios (${sociosActivos} activos)</span></div>
        <div class="alert-item info">${Icons.calendar} <span>${this.adopciones.length} adopciones en curso</span></div>
      </div></div>
      <div class="card"><div class="card-header"><h3>Reportes</h3></div><div class="card-body">
        <div class="alert-item info" style="cursor:pointer" onclick="Dashboard.exportSurvey('pre-adopcion-perros')">${Icons.download} <span>Exportar encuestas perros (PDF)</span></div>
        <div class="alert-item info" style="cursor:pointer" onclick="Dashboard.exportSurvey('pre-adopcion-gatos')">${Icons.download} <span>Exportar encuestas gatos (PDF)</span></div>
        <div class="alert-item info" style="cursor:pointer" onclick="Dashboard.exportSurvey('pre-acogida')">${Icons.download} <span>Exportar solicitudes acogida (PDF)</span></div>
      </div></div>
      <div class="card"><div class="card-header"><h3>Mantenimiento</h3></div><div class="card-body">
        <div class="alert-item warning" style="cursor:pointer" onclick="Dashboard.descartar2025()">${Icons.alertTriangle} <span>Descartar todas las solicitudes de 2025 (${this._restantes2025().length} pendientes)</span></div>
      </div></div>`;
  },

  _anioFecha(f) {
    if (!f) return null;
    const s = String(f).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return +m[1];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return +m[3];
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d.getFullYear();
  },

  // Solicitudes de 2025 aun no descartadas (todas las encuestas).
  _restantes2025() {
    const out = [];
    (this.surveys || []).forEach(s => (this.responses[s.id] || []).forEach(r => {
      if (this._anioFecha(r.fecha_creacion) !== 2025) return;
      if (this.getEstado(r.id, s.id) === 'descartada') return;
      out.push({ surveyId: s.id, id: r.id });
    }));
    return out;
  },

  async descartar2025() {
    const lista = this._restantes2025();
    if (!lista.length) { this.showSnackbar('No hay solicitudes de 2025 por descartar', 'success'); return; }
    if (!(await this._confirm('Descartar ' + lista.length + ' solicitudes de 2025? Ya no contaran en dashboard ni reportes.', 'Descartar 2025'))) return;
    this.showLoading();
    let ok = 0;
    try {
      for (const it of lista) {
        await API.setEstado(it.id, it.surveyId, 'descartada');
        this.states[(it.surveyId || '') + '::' + it.id] = 'descartada';
        this._syncCard(it.surveyId, it.id);
        ok++;
      }
    } catch (err) {
      this.showSnackbar('Descartadas ' + ok + ' de ' + lista.length + ': ' + this._errMsg(err), 'error');
    } finally {
      this.hideLoading();
    }
    this.renderReportes(document.getElementById('page-reportes'));
    this.showSnackbar('Descartadas ' + ok + ' solicitudes de 2025', 'success');
  },

  // Anti-doble-clic en Guardar: deshabilita el boton, pone "Guardando..."
  // y muestra el overlay (con spinner). Devuelve liberador, o null si el
  // form ya esta en curso (segundo submit por Enter) -> el llamante retorna.
  _guardando(form) {
    if (form && form.dataset && form.dataset.guardando === '1') return null;
    const btn = form ? form.querySelector('button[type="submit"]') : null;
    const prev = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }
    if (form && form.dataset) form.dataset.guardando = '1';
    this.showLoading();
    let done = false;
    return () => {
      if (done) return; done = true;
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = prev; }
      if (form && form.dataset) delete form.dataset.guardando;
      this.hideLoading();
    };
  },

  showLoading() { document.getElementById('loading')?.classList.add('active'); },
  hideLoading() { document.getElementById('loading')?.classList.remove('active'); },

  _errMsg(err) {
    if (!err) return 'Error desconocido';
    const m = err.message || err.error || '';
    if (m && m !== 'Error') return m;
    return 'Error desconocido';
  },

  showSnackbar(msg, type = 'error') {
    const el = document.getElementById('error-message');
    if (!el) { console.error(msg); return; }
    el.textContent = msg;
    el.className = 'toast-error toast-' + type;
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
    clearTimeout(this._snackbarTimer);
    const token = (this._snackbarToken = (this._snackbarToken || 0) + 1);
    this._snackbarTimer = setTimeout(() => {
      if (this._snackbarToken !== token) return;
      el.classList.remove('active');
      el.className = 'toast-error';
    }, 5000);
  },

  showError(msg) { this.showSnackbar(msg, 'error'); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Dashboard;
