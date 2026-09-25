const Dashboard = {
  surveys: [], responses: {}, states: {}, blacklist: [], notes: {}, userProfile: null,
  animales: [], familias: [], adopciones: [], socios: [], actividad: [],
  _currentAnimalFilter: 'all', _currentFosterFilter: 'all', _currentEspecieFilter: 'all',
  _loaded: {}, _loading: {}, _pageToken: 0, _snackbarTimer: null, _shown: {},

  async init() {
    this.loadLocal();
    this.injectIcons();
    this.showLoading();
    try {
      this.userProfile = await API.getUserProfile();
      this.updateUserUI();
      await this._loadSurveys();
      await this.loadEstados();
      await this.loadNotas();
      await Promise.all([
        this._loadListBestEffort('candidaturas', () => API.getCandidaturas()),
        this._loadListBestEffort('acogidas', () => API.getAcogidas()),
        this._loadListBestEffort('contratos', () => API.getContratos())
      ]);
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
    set('mas-icon-blacklist', Icons.ban);
    document.querySelectorAll('.sidebar-link-icon').forEach(el => {
      const p = el.closest('.sidebar-link')?.dataset.page;
      const m = { dashboard: Icons.dashboard, 'encuestas-perros': Icons.dog, 'encuestas-gatos': Icons.cat, 'encuestas-acogida': Icons.home, animales: Icons.heart, acogidas: Icons.home, 'acogidas-activas': Icons.home, adopciones: Icons.heart, socios: Icons.users, blacklist: Icons.ban, reportes: Icons.barChart };
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
  },

  saveLocal() {
    localStorage.setItem('gn_blacklist', JSON.stringify(this.blacklist));
    localStorage.setItem('gn_candidaturas', JSON.stringify(this.candidaturas || []));
    localStorage.setItem('gn_contratos', JSON.stringify(this.contratos || []));
    localStorage.setItem('gn_acogidas', JSON.stringify(this.acogidas || []));
  },

  // Busqueda por id tolerante a tipos (la hoja puede devolver numeros y el
  // DOM siempre strings). Las filas SIN id nunca coinciden: asi un registro
  // fantasma no abre un form vacio haciendose pasar por edicion.
  _byId(list, id) {
    if (id === undefined || id === null || id === '') return null;
    const want = String(id);
    return (list || []).find(x => x && x.id !== undefined && x.id !== null && x.id !== '' && String(x.id) === want) || null;
  },

  async loadEstados(force) {
    if (this._loaded.estados && !force) return this.states;
    if (this._loading.estados) return this._loading.estados;
    this._loading.estados = (async () => {
      const res = await API.getEstados();
      this.states = res.data || {};
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
      const remote = (res.data || []).map(r => (r && r.id !== undefined && r.id !== null) ? { ...r, id: String(r.id) } : r);
      const ids = new Set(remote.map(r => r.id));
      const localOnly = (this[key] || []).filter(l => l && l.id && !ids.has(l.id));
      this[key] = remote.concat(localOnly);
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
    await this._loadSurveys();
    await Promise.all([
      this.loadEstados(),
      this._loadList('animales', () => API.getAnimales()),
      this._loadList('familias', () => API.getFamilias()),
      this._loadList('actividad', () => API.getActividad()),
      ...this.surveys.map(s => this._loadResponses(s.id)),
    ]);
    const all = Object.values(this.responses).flat();
    const activas = all.filter(r => this.getEstado(r.id, r._surveyId) !== 'descartada');
    const total = activas.length;
    const pendientes = activas.filter(r => this.getEstado(r.id, r._surveyId) === 'pendiente').length;
    const enProceso = activas.filter(r => this.getEstado(r.id, r._surveyId) === 'en_proceso').length;
    const enAcogida = this.animales.filter(a => a.estado === 'en_acogida').length;
    const disponibles = this.animales.filter(a => a.estado === 'disponible').length;
    const adoptados = this.animales.filter(a => a.estado === 'adoptado').length;
    const perros = (this.responses['pre-adopcion-perros'] || []).filter(r => this.getEstado(r.id, 'pre-adopcion-perros') !== 'descartada').length;
    const gatos = (this.responses['pre-adopcion-gatos'] || []).filter(r => this.getEstado(r.id, 'pre-adopcion-gatos') !== 'descartada').length;
    const acogida = (this.responses['pre-acogida'] || []).filter(r => this.getEstado(r.id, 'pre-acogida') !== 'descartada').length;
    const familiasLibres = this.familias.filter(f => f.capacidad === 'Libre').length;

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card-icon green">${Icons.clipboard}</div><div class="stat-card-info"><div class="stat-card-label">Total Solicitudes</div><div class="stat-card-value">${total}</div><div class="stat-card-change">${perros} perros · ${gatos} gatos · ${acogida} acogida</div></div></div>
        <div class="stat-card"><div class="stat-card-icon orange">${Icons.clock}</div><div class="stat-card-info"><div class="stat-card-label">En Proceso</div><div class="stat-card-value">${enProceso}</div><div class="progress-bar"><div class="progress-bar-fill orange" style="width:${total?(enProceso/total*100):0}%"></div></div></div></div>
        <div class="stat-card"><div class="stat-card-icon blue">${Icons.heart}</div><div class="stat-card-info"><div class="stat-card-label">En Acogida</div><div class="stat-card-value">${enAcogida}</div><div class="stat-card-change">${familiasLibres} familias libres</div></div></div>
        <div class="stat-card"><div class="stat-card-icon green">${Icons.checkCircle}</div><div class="stat-card-info"><div class="stat-card-label">Adoptados</div><div class="stat-card-value">${adoptados}</div><div class="stat-card-change up">${disponibles} disponibles</div></div></div>
      </div>
      <div class="dashboard-grid" style="display:grid;gap:16px;margin-bottom:24px;">
        <div class="card"><div class="card-header"><h3>Solicitudes por Mes</h3></div><div class="chart-container">${this._buildBarChart()}</div></div>
        <div class="card"><div class="card-header"><h3>Distribucion por Tipo</h3></div><div class="donut-chart-wrapper">${this._buildDonutChart(perros,gatos,acogida)}</div></div>
      </div>
      <div class="dashboard-grid" style="display:grid;gap:16px;margin-bottom:24px;">
        <div class="card"><div class="card-header"><h3>Actividad Reciente</h3></div><div class="timeline">${this._buildTimeline()}</div></div>
        <div class="card"><div class="card-header"><h3>Requieren atención</h3></div><div class="card-body-flush"><table class="data-table"><thead><tr><th>Solicitante</th><th>Estado</th><th>Espera</th></tr></thead><tbody>${this._atencionRows()}</tbody></table></div></div>
      </div>
      <div class="card" style="margin-bottom:24px"><div class="card-header"><h3>Solicitudes Recientes</h3></div><div class="card-body-flush"><table class="data-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${this._recentRows()}</tbody></table></div></div>
      <div class="card"><div class="card-header"><h3>Alertas</h3></div><div class="card-body">
        ${pendientes?`<div class="alert-item warning">${Icons.alertTriangle}<span>${pendientes} solicitudes pendientes</span></div>`:''}
        ${enProceso?`<div class="alert-item info">${Icons.activity}<span>${enProceso} procesos en curso</span></div>`:''}
        ${this.blacklist.length?`<div class="alert-item danger">${Icons.ban}<span>${this.blacklist.length} en lista negra</span></div>`:''}
        ${enAcogida?`<div class="alert-item info">${Icons.home}<span>${enAcogida} animales en acogida</span></div>`:''}
        ${!pendientes&&!enProceso&&!this.blacklist.length?'<div style="text-align:center;padding:16px;color:var(--gray-400)">No hay alertas pendientes</div>':''}
      </div></div>`;
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

  _buildDonutChart(perros, gatos, acogida) {
    const total = perros+gatos+acogida;
    if(!total) return '<p style="color:var(--gray-400)">Sin datos</p>';
    const r=54,c=2*Math.PI*r;
    const d1=(perros/total)*c,d2=(gatos/total)*c,d3=(acogida/total)*c;
    const colors=['#1FC95B','#3498db','#f39c12'];
    return `<div class="donut-chart"><svg viewBox="0 0 140 140"><circle cx="70" cy="70" r="${r}" stroke="#e8eaed" stroke-width="20"/><circle cx="70" cy="70" r="${r}" stroke="${colors[0]}" stroke-width="20" stroke-dasharray="${d1} ${c-d1}" stroke-dashoffset="0"/><circle cx="70" cy="70" r="${r}" stroke="${colors[1]}" stroke-width="20" stroke-dasharray="${d2} ${c-d2}" stroke-dashoffset="${-d1}"/><circle cx="70" cy="70" r="${r}" stroke="${colors[2]}" stroke-width="20" stroke-dasharray="${d3} ${c-d3}" stroke-dashoffset="${-(d1+d2)}"/></svg><div class="donut-center"><span class="donut-center-value">${total}</span><span class="donut-center-label">Total</span></div></div>
    <div class="donut-legend"><div class="donut-legend-item"><span class="donut-legend-dot" style="background:${colors[0]}"></span>Perros<span class="donut-legend-value">${perros}</span></div><div class="donut-legend-item"><span class="donut-legend-dot" style="background:${colors[1]}"></span>Gatos<span class="donut-legend-value">${gatos}</span></div><div class="donut-legend-item"><span class="donut-legend-dot" style="background:${colors[2]}"></span>Acogida<span class="donut-legend-value">${acogida}</span></div></div>`;
  },

  _buildTimeline() {
    if (!this.actividad.length) {
      const staticItems = [
        {text:'Sistema iniciado',time:'Ahora',color:'green'},
      ];
      return staticItems.map(item=>`<div class="timeline-item"><div class="timeline-dot-wrap"><div class="timeline-dot ${item.color}"></div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-text">${item.text}</div><div class="timeline-time">${item.time}</div></div></div>`).join('');
    }
    const colorMap = { animal_creado:'green', animal_actualizado:'blue', animal_eliminado:'red', familia_creada:'green', familia_actualizada:'blue', familia_eliminada:'red', adopcion_creada:'orange', adopcion_actualizada:'blue', adopcion_eliminada:'red', socio_creado:'green', socio_actualizado:'blue', socio_eliminado:'red' };
    const labelMap = { animal_creado:'Animal registrado', animal_actualizado:'Animal actualizado', animal_eliminado:'Animal eliminado', familia_creada:'Familia registrada', familia_actualizada:'Familia actualizada', familia_eliminada:'Familia eliminada', adopcion_creada:'Adopcion iniciada', adopcion_actualizada:'Adopcion actualizada', adopcion_eliminada:'Adopcion eliminada', socio_creado:'Socio registrado', socio_actualizado:'Socio actualizado', socio_eliminado:'Socio eliminado' };
    return this.actividad.slice(0, 5).map(item => {
      const t = new Date(item.fecha);
      const diff = Math.floor((Date.now() - t.getTime()) / 60000);
      const time = diff < 1 ? 'Ahora' : diff < 60 ? `Hace ${diff}m` : diff < 1440 ? `Hace ${Math.floor(diff/60)}h` : `Hace ${Math.floor(diff/1440)}d`;
      return `<div class="timeline-item"><div class="timeline-dot-wrap"><div class="timeline-dot ${colorMap[item.tipo]||'blue'}"></div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-text">${labelMap[item.tipo]||item.tipo}: <strong>${item.detalle}</strong></div><div class="timeline-time">${time}</div></div></div>`;
    }).join('');
  },

  _recentRows() {
    const all = [];
    this.surveys.forEach(s => (this.responses[s.id]||[]).forEach(r => all.push({...r,_survey:s.name,_surveyId:s.id})));
    all.sort((a,b)=>(b.fecha_creacion||'').localeCompare(a.fecha_creacion||''));
    return all.slice(0,5).map(r=>{const e=this.getEstado(r.id, r._surveyId);const d=r.fecha_creacion?new Date(r.fecha_creacion).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'';const pageMap={'pre-adopcion-perros':'encuestas-perros','pre-adopcion-gatos':'encuestas-gatos','pre-acogida':'encuestas-acogida'};const page=pageMap[r._surveyId]||'dashboard';return`<tr style="cursor:pointer" onclick="location.hash='${page}'"><td>${this._esc(r.nombre||'')} ${this._esc(r.apellidos||'')}</td><td>${this._esc(r._survey)}</td><td><span class="estado-badge ${e}">${e}</span></td><td>${d}</td></tr>`;}).join('');
  },

  // Pendientes/en_proceso mas antiguos (descartadas y resto fuera).
  _atencionItems(max) {
    const all = [];
    (this.surveys || []).forEach(s => (this.responses[s.id] || []).forEach(r => {
      const e = this.getEstado(r.id, s.id);
      if (e !== 'pendiente' && e !== 'en_proceso') return;
      all.push({ ...r, _survey: s.name, _surveyId: s.id, _estado: e });
    }));
    all.sort((a, b) => (a.fecha_creacion || '').localeCompare(b.fecha_creacion || ''));
    return all.slice(0, max || 5);
  },

  _diasEspera(fecha) {
    if (!fecha) return '—';
    const t = new Date(String(fecha).replace(' ', 'T')).getTime();
    if (isNaN(t)) return '—';
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'hoy' : (d === 1 ? '1 día' : d + ' días');
  },

  _atencionRows() {
    const items = this._atencionItems(5);
    if (!items.length) return `<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:16px">Todo al día, sin pendientes</td></tr>`;
    return items.map(r => `<tr style="cursor:pointer" onclick="Dashboard.openCuestionarioEnPagina('${r._surveyId}','${r.id}')"><td>${this._esc(r.nombre || '')} ${this._esc(r.apellidos || '')}<div style="font-size:.72rem;color:var(--gray-500)">${this._esc(r._survey)}</div></td><td><span class="estado-badge ${this._estadoCls(r._estado)}">${this._estadoLabel(r._estado)}</span></td><td>${this._diasEspera(r.fecha_creacion)}</td></tr>`).join('');
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

  viewDetail(surveyId, responseId) {
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
    const tabs = { general: 'Flujo general', adopcion: 'Adopcion (perros/gatos)', acogida: 'Acogida', estados: 'Estados y consejos' };
    if (!tab) tab = this._tutorialTabActive || 'general';
    this._tutorialTabActive = tab;
    const tabbar = `<div class="tutorial-tabs">${Object.keys(tabs).map(t=>`<button class="tutorial-tab${t===tab?' active':''}" onclick="Dashboard.showTutorial('${t}')">${tabs[t]}</button>`).join('')}</div>`;
    const panels = {
      general: this._tutorialGeneral(),
      adopcion: this._tutorialAdopcion(),
      acogida: this._tutorialAcogida(),
      estados: this._tutorialEstados()
    };
    body.innerHTML = tabbar + `<div class="tutorial-panel">` + panels[tab] + `</div>`;
    el.style.display = 'flex';
    body.scrollTop = 0;
    this.injectIcons();
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
      <div class="guide-estados">${estados.map(e=>`<div class="guide-estado"><span class="estado-badge ${e[0]}">${e[1]}</span><p>${e[2]}</p></div>`).join('')}</div>
      <h4 class="guide-subtitle">Donde esta cada cosa</h4>
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
    this._regLog(c.tipo === 'acogida' ? 'acogida' : 'adopcion', (c.tipo === 'acogida' ? 'Caso de acogida' : 'Candidato asignado') + ': ' + a.nombre + (c.tipo === 'acogida' && familiaId ? ' a familia' : ''));
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
    const map = { animales: 'updateAnimal', familias: 'updateFamilia', candidaturas: 'updateCandidatura', acogidas: 'updateAcogida', contratos: 'updateContrato' };
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

  _regLog(tipo, detalle) {
    const row = { id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), fecha: new Date().toISOString(), usuario: Auth.currentUser?.email || 'admin', tipo: tipo, detalle: detalle };
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
    this.showLoading();
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
    } finally { this.hideLoading(); }
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
      return;
    }
    this.closeFormModal();
    if (isEdit) this.viewAnimal(id);
    else this.renderAnimales(document.getElementById('page-animales'));
    this.showSnackbar(isEdit ? 'Animal actualizado' : 'Animal creado', 'success');
  },

  viewAnimal(id) {
    const a = this._byId(this.animales, id);
    if(!a) { this.showSnackbar('Animal no encontrado (id ' + id + '). Recarga la lista.', 'warning'); return; }
    const foster = a.acogida_familia ? this.familias.find(f => f.id === a.acogida_familia) : null;
    const siblings = a.grupo_id ? this.animales.filter(x => x.grupo_id === a.grupo_id && x.id !== a.id) : [];
    this._showDetail('animales', a.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showAnimalFormById('${a.id}')">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteAnimal('${a.id}')">${Icons.trash} Eliminar</button>
      </div>
      ${this._fotoSrc(a) ? `<div style="margin-bottom:16px"><img src="${this._esc(this._fotoSrc(a))}" alt="${this._esc(a.nombre)}" style="width:160px;height:160px;border-radius:12px;object-fit:cover;border:2px solid var(--primary)"></div>` : ''}
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
      return;
    }
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
      this._regLog('acogida', 'Acogida finalizada de ' + (a ? a.nombre : 'animal'));
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

  showAdopcionForm(data) {
    const isEdit = !!data;
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    this._renderForm('adopciones', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nueva'} Adopcion</h3><form onsubmit="Dashboard.saveAdopcion(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-row"><div class="form-group"><label>Animal *</label><input type="text" id="ad-animal" value="${this._esc(data?.animal||'')}" required placeholder="Ej: Max (Labrador)"></div><div class="form-group"><label>Adoptante *</label><input type="text" id="ad-adoptante" value="${this._esc(data?.adoptante||'')}" required></div></div>
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
    const data = {
      animal: document.getElementById('ad-animal').value.trim(),
      adoptante: document.getElementById('ad-adoptante').value.trim(),
      email: document.getElementById('ad-email').value.trim(),
      telefono: document.getElementById('ad-telefono').value.trim(),
      fase: document.getElementById('ad-fase').value,
      estado: document.getElementById('ad-estado').value.trim(),
      notas: document.getElementById('ad-notas').value.trim()
    };
    try {
      if (isEdit) {
        await API.updateAdopcion(id, data);
        const item = this._byId(this.adopciones, id); if (item) Object.assign(item, data);
      } else {
        const res = await API.createAdopcion(data);
        if (res.data) this.adopciones.push(res.data);
      }
    } catch (err) {
      this.showSnackbar('No se pudo guardar: ' + this._errMsg(err), 'error');
      return;
    }
    this.cancelForm('adopciones');
    if (isEdit) this.viewAdopcion(id);
    else this.renderAdopciones(document.getElementById('page-adopciones'));
    this.showSnackbar(isEdit ? 'Adopcion actualizada' : 'Adopcion creada', 'success');
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

  viewAdopcion(id) {
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
      <div class="detail-section"><div class="detail-section-title">Detalles</div>
        <div class="detail-field"><div class="detail-question">Animal</div><div class="detail-answer">${this._esc(p.animal)}</div></div>
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

  async deleteAdopcion(id) {
    if (!(await this._confirm('Eliminar este caso de adopcion? El animal volvera a Disponible y la solicitud a En proceso.', 'Eliminar adopcion'))) return;
    const target = this._byId(this.adopciones, id);
    try { const res = await API.deleteAdopcion(id); this._assertDeleted(res, 'El caso'); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    const c = this._contratoDeAdopcion(id);
    if (c) { this.contratos = this.contratos.filter(x => x.id !== c.id); try { await API.deleteContrato(c.id); } catch (err2) { /* local only */ } }
    // Espejo local del rollback (el backend ya lo aplico en las hojas):
    const a = target && target.animal_id ? this._byId(this.animales, target.animal_id) : null;
    if (a && (a.estado === 'en_adopcion' || a.estado === 'adoptado') && (!a.adopcion_id || a.adopcion_id === id)) {
      a.estado = 'disponible';
      a.adopcion_id = '';
      await this._updateLocalYApi('animales', a);
    }
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
    this._regLog('contrato', 'Contrato firmado para ' + (p.animal || ''));
    this.showSnackbar('Contrato firmado y guardado', 'success');
  },

  descargarContrato(adopcionId) {
    const c = this._contratoDeAdopcion(adopcionId);
    if (!c) { this.showSnackbar('No hay contrato firmado', 'warning'); return; }
    PdfExport.exportContracto(c);
  },

  async anularContrato(adopcionId) {
    if (!(await this._confirm('Anular la firma del contrato?'))) return;
    const c = (this.contratos || []).find(x => x.adopcion_id === adopcionId);
    this.contratos = this.contratos.filter(x => x.id !== c.id);
    this.saveLocal();
    if (c) { try { await API.deleteContrato(c.id); } catch (err) { /* local only */ } }
    const p = this.adopciones.find(x => x.id === adopcionId);
    if (p) {
      p.estado = 'Fase: Contrato';
      p.estado_firma = '';
      try { await API.updateAdopcion(adopcionId, { estado: 'Fase: Contrato', estado_firma: '' }); } catch (err) { /* local only */ }
    }
    const a = p && p.animal_id ? this.animales.find(x => x.id === p.animal_id) : null;
    if (a && a.estado === 'adoptado') {
      a.estado = 'en_adopcion';
      await this._updateLocalYApi('animales', a);
    }
    this._regLog('contrato', 'Firma anulada para ' + (p ? p.animal : ''));
    this.viewAdopcion(adopcionId);
    this.showSnackbar('Firma anulada', 'success');
  },

  // ==================== SOCIOS CRUD ====================
  async renderSocios(el) {
    await this._loadList('socios', () => API.getSocios());
    const activos = this.socios.filter(s=>s.activo).length;
    const areas = [...new Set(this.socios.map(s=>s.area))];
    el.innerHTML = `
      <div class="page-list-container">
        <div class="stats-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-card-icon green">${Icons.users}</div><div class="stat-card-info"><div class="stat-card-label">Total Socios</div><div class="stat-card-value">${this.socios.length}</div></div></div>
          <div class="stat-card"><div class="stat-card-icon blue">${Icons.checkCircle}</div><div class="stat-card-info"><div class="stat-card-label">Activos</div><div class="stat-card-value">${activos}</div></div></div>
          <div class="stat-card"><div class="stat-card-icon orange">${Icons.calendar}</div><div class="stat-card-info"><div class="stat-card-label">Areas</div><div class="stat-card-value">${areas.length}</div></div></div>
        </div>
        <div class="list-header"><span class="response-count">${this.socios.length} socios</span><button class="btn btn-primary btn-sm" onclick="Dashboard.showSocioForm()">${Icons.plus} Nuevo</button></div>
      <div id="socios-form-container"></div>
      <div class="card"><div class="card-body-flush"><table class="data-table">
        <thead><tr><th>Nombre</th><th>Email</th><th>Area</th><th>Estado</th></tr></thead>
        <tbody>${this.socios.length ? this.socios.map(s=>`<tr onclick="Dashboard.viewSocio('${s.id}')" style="cursor:pointer"><td>${this._esc(s.nombre)}</td><td>${this._esc(s.email)}</td><td>${this._esc(s.area)}</td><td><span class="estado-badge ${s.activo?'en_proceso':'descartada'}">${s.activo?'Activo':'Inactivo'}</span></td></tr>`).join('') : `<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--gray-400)">Aun no hay socios registrados</td></tr>`}</tbody>
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
    const data = {
      nombre: document.getElementById('so-nombre').value.trim(),
      email: document.getElementById('so-email').value.trim(),
      telefono: document.getElementById('so-telefono').value.trim(),
      area: document.getElementById('so-area').value
    };
    // Foto
    const fotoInput = document.getElementById('so-foto');
    if (fotoInput && fotoInput.files[0]) {
      const raw = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
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
      return;
    }
    this.cancelForm('socios');
    if (isEdit) this.viewSocio(id);
    else this.renderSocios(document.getElementById('page-socios'));
    this.showSnackbar(isEdit ? 'Socio actualizado' : 'Socio creado', 'success');
  },

  viewSocio(id) {
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
        <div style="flex:1;min-width:200px">
          <div class="detail-section"><div class="detail-section-title">Informacion del Socio</div>
            <div class="detail-field"><div class="detail-question">Nombre</div><div class="detail-answer">${this._esc(s.nombre)}</div></div>
            <div class="detail-field"><div class="detail-question">Email</div><div class="detail-answer">${this._esc(s.email)}</div></div>
            <div class="detail-field"><div class="detail-question">Telefono</div><div class="detail-answer">${s.telefono||'—'}</div></div>
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
      </div>`);
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
    catch (err) { this.showSnackbar(this._errMsg(err), 'error'); return; }
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
      </div></div>`;
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
    this._snackbarTimer = setTimeout(() => { el.classList.remove('active'); el.className = 'toast-error'; }, 5000);
  },

  showError(msg) { this.showSnackbar(msg, 'error'); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Dashboard;
