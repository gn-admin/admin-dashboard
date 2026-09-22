const Dashboard = {
  surveys: [], responses: {}, states: {}, blacklist: [], notes: {}, userProfile: null,
  animales: [], familias: [], adopciones: [], socios: [], actividad: [],
  _currentAnimalFilter: 'all', _currentFosterFilter: 'all',
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
      'encuestas-perros': () => this.renderEncuesta(el, 'pre-adopcion-perros'),
      'encuestas-gatos': () => this.renderEncuesta(el, 'pre-adopcion-gatos'),
      'encuestas-acogida': () => this.renderEncuesta(el, 'pre-acogida'),
      animales: () => this.renderAnimales(el),
      acogidas: () => this.renderAcogidas(el),
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
    set('mas-icon-adopciones', Icons.heart);
    set('mas-icon-socios', Icons.users);
    set('mas-icon-reportes', Icons.barChart);
    set('mas-icon-blacklist', Icons.ban);
    document.querySelectorAll('.sidebar-link-icon').forEach(el => {
      const p = el.closest('.sidebar-link')?.dataset.page;
      const m = { dashboard: Icons.dashboard, 'encuestas-perros': Icons.dog, 'encuestas-gatos': Icons.cat, 'encuestas-acogida': Icons.home, animales: Icons.heart, acogidas: Icons.home, adopciones: Icons.heart, socios: Icons.users, blacklist: Icons.ban, reportes: Icons.barChart };
      el.innerHTML = m[p] || Icons.clipboard;
    });
    document.querySelectorAll('.bottom-nav-icon').forEach(el => {
      const p = el.closest('.bottom-nav-item')?.dataset.page;
      if (!p) return;
      const m = { dashboard: Icons.dashboard, 'encuestas-perros': Icons.dog, 'encuestas-gatos': Icons.cat, animales: Icons.heart, blacklist: Icons.ban };
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
    try { this.blacklist = JSON.parse(localStorage.getItem('gn_blacklist') || '[]'); } catch { this.blacklist = []; }
  },

  saveLocal() {
    localStorage.setItem('gn_blacklist', JSON.stringify(this.blacklist));
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
      this[key] = res.data || [];
      this._loaded[key] = true;
      return this[key];
    })();
    try { return await this._loading[key]; } finally { this._loading[key] = null; }
  },

  getEstado(id, surveyId) { return this.states[(surveyId || '') + '::' + id] || 'pendiente'; },

  _syncCard(surveyId, id) {
    const card = document.querySelector(`.response-card[data-card="${surveyId}::${id}"]`);
    if (!card) return;
    const badge = card.querySelector('.estado-badge');
    if (!badge) return;
    const e = this.getEstado(id, surveyId);
    badge.className = 'estado-badge ' + e;
    badge.textContent = ({ pendiente: 'Pendiente', en_proceso: 'En proceso', descartada: 'Descartada' })[e] || e;
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

  _confirm(msg) { return window.confirm(msg); },

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
      <div class="dashboard-grid" style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:24px;">
        <div class="card"><div class="card-header"><h3>Solicitudes por Mes</h3></div><div class="chart-container">${this._buildBarChart()}</div></div>
        <div class="card"><div class="card-header"><h3>Distribucion por Tipo</h3></div><div class="donut-chart-wrapper">${this._buildDonutChart(perros,gatos,acogida)}</div></div>
      </div>
      <div class="dashboard-grid" style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:24px;">
        <div class="card"><div class="card-header"><h3>Actividad Reciente</h3></div><div class="timeline">${this._buildTimeline()}</div></div>
        <div class="card"><div class="card-header"><h3>Acciones Rapidas</h3></div><div class="quick-actions">
          <a class="quick-action-btn" href="#encuestas-perros">${Icons.dog}<span>Perros</span></a>
          <a class="quick-action-btn" href="#encuestas-gatos">${Icons.cat}<span>Gatos</span></a>
          <a class="quick-action-btn" href="#animales">${Icons.heart}<span>Animales</span></a>
          <a class="quick-action-btn" href="#acogidas">${Icons.home}<span>Acogidas</span></a>
          <a class="quick-action-btn" href="#adopciones">${Icons.calendar}<span>Adopciones</span></a>
          <a class="quick-action-btn" href="#blacklist">${Icons.ban}<span>Lista Negra</span></a>
        </div></div>
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
      const dt = new Date(String(r.fecha_creacion).replace(' ', 'T'));
      if (isNaN(dt.getTime())) return;
      const k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      if (k in idx) buckets[idx[k]].count++;
    });
    const curKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const max = Math.max(...buckets.map(b => b.count), 1);
    return `<div class="bar-chart">${buckets.map(b=>{const h=(b.count/max*130);return`<div class="bar-chart-col"><div class="bar-chart-bar" style="height:${h}px${b.key===curKey?';background:var(--primary-hover)':''}"><span class="bar-tooltip">${b.label}: ${b.count}</span></div><span class="bar-chart-label">${b.label}</span></div>`;}).join('')}</div>`;
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
    return all.slice(0,5).map(r=>{const e=this.getEstado(r.id, r._surveyId);const d=r.fecha_creacion?new Date(r.fecha_creacion).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'';const pageMap={'pre-adopcion-perros':'encuestas-perros','pre-adopcion-gatos':'encuestas-gatos','pre-acogida':'encuestas-acogida'};const page=pageMap[r._surveyId]||'dashboard';return`<tr style="cursor:pointer" onclick="location.hash='${page}'"><td>${r.nombre||''} ${r.apellidos||''}</td><td>${r._survey}</td><td><span class="estado-badge ${e}">${e}</span></td><td>${d}</td></tr>`;}).join('');
  },

  // ==================== ENCUESTAS ====================
  async renderEncuesta(el, surveyId) {
    await this._loadSurveys();
    await Promise.all([this._loadResponses(surveyId), this.loadEstados()]);
    const responses = this._sortEncuestas((this.responses[surveyId]||[]).filter(r=>!this.checkBlacklist(r.nombre,r.email)));
    this._shown[surveyId] = 20;
    el.innerHTML = `
      <div class="page-list-container">
        <div class="filters-bar"><div class="search-box"><span class="search-icon"></span><input type="text" placeholder="Buscar nombre o email..." oninput="Dashboard.filterEncuesta(this.closest('.page'),'${surveyId}')"></div><div class="filter-row"><select onchange="Dashboard.filterEncuesta(this.closest('.page'),'${surveyId}')"><option value="">Todos</option><option value="pendiente">Pendientes</option><option value="en_proceso">En proceso</option><option value="descartada">Descartadas</option></select></div></div>
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
    c.innerHTML = this._renderResponseList(r,surveyId);
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

  _renderResponseList(responses, surveyId) {
    const shown = this._shown[surveyId] || 20;
    let html = this._renderResponseCards(responses.slice(0, shown), surveyId);
    const rest = responses.length - shown;
    if (rest > 0) html += `<div class="load-more-wrap"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.loadMore('${surveyId}')">+ Cargar más (${rest} restantes)</button></div>`;
    return html;
  },

  _renderResponseCards(responses, surveyId) {
    if(!responses.length) return '<div class="empty-state"><div class="empty-state-icon">'+Icons.clipboard+'</div><p>No hay solicitudes</p></div>';
    return responses.map(r=>{const i=(r.nombre?.[0]||'')+(r.apellidos?.[0]||'');const d=r.fecha_creacion?new Date(r.fecha_creacion).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}):'';const e=this.getEstado(r.id, surveyId);const l={pendiente:'Pendiente',en_proceso:'En proceso',descartada:'Descartada'};return`<div class="response-card" data-card="${surveyId}::${r.id}" onclick="Dashboard.viewDetail('${surveyId}','${r.id}')"><div class="response-card-header"><div class="response-avatar">${i}</div><div class="response-info"><div class="response-name">${r.nombre||''} ${r.apellidos||''} <span class="estado-badge ${e}">${l[e]}</span></div><div class="response-email">${r.email||''}</div></div><div class="response-date">${d}</div></div></div>`;}).join('');
  },

  viewDetail(surveyId, responseId) {
    const r=(this.responses[surveyId]||[]).find(x=>x.id===responseId);
    if(!r) return;
    const sections=this._buildSections(r,surveyId);
    const e=this.getEstado(r.id, surveyId);
    const note=this.notes[surveyId+'::'+r.id]||'';
    const pageMap={'pre-adopcion-perros':'encuestas-perros','pre-adopcion-gatos':'encuestas-gatos','pre-acogida':'encuestas-acogida'};
    const pageId=pageMap[surveyId]||surveyId;
    this._showDetail(pageId, `${r.nombre} ${r.apellidos}`, `
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.exportSingle('${surveyId}','${r.id}')">${Icons.download} PDF</button>
        <button class="btn btn-sm ${e==='en_proceso'?'btn-outline-green':'btn-primary'}" onclick="Dashboard.cycleEstado('${surveyId}','${r.id}')">${Icons.arrowRight} ${e==='pendiente'?'En proceso':e==='en_proceso'?'Pendiente':'Restaurar'}</button>
        ${e!=='descartada'?`<button class="btn btn-danger btn-sm" onclick="Dashboard.setEstado('${r.id}','descartada','${surveyId}').then(()=>Dashboard.viewDetail('${surveyId}','${r.id}'))">${Icons.xCircle} Descartar</button>`:''}
      </div>
      ${sections.map(s=>`<div class="detail-section"><div class="detail-section-title">${s.title}</div>${s.fields.map(f=>`<div class="detail-field"><div class="detail-question">${f.label}</div><div class="detail-answer">${f.value??'—'}</div></div>`).join('')}</div>`).join('')}
      <div class="notes-section"><div class="detail-section-title"><span>${Icons.pencil} Notas</span><button class="btn btn-primary btn-sm" onclick="Dashboard.saveNote('${r.id}','${surveyId}')">Guardar</button></div><textarea id="note-${r.id}" placeholder="Escribe una nota...">${note}</textarea></div>`);
  },

  async cycleEstado(surveyId, id) { const a=this.getEstado(id, surveyId); await this.setEstado(id,a==='pendiente'?'en_proceso':'pendiente',surveyId); this.viewDetail(surveyId,id); },
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
    PdfExport.exportAllResponses(this.responses[surveyId] || [], survey);
  },
  exportSingle(surveyId, id) {
    const row = (this.responses[surveyId] || []).find(r => r.id === id);
    const survey = this.surveys.find(s => s.id === surveyId);
    if (row) PdfExport.exportSingleResponse(row, survey);
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
      f('Fecha de nacimiento', row.fecha_nacimiento)
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
      questions.push(f(k, String(val).replace(/^(-?\d+)\.0+$/, '$1')));
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
    const filtered = filter==='all' ? this.animales : this.animales.filter(a=>a.estado===filter);
    const counts = {all:this.animales.length, disponible:this.animales.filter(a=>a.estado==='disponible').length, en_acogida:this.animales.filter(a=>a.estado==='en_acogida').length, adoptado:this.animales.filter(a=>a.estado==='adoptado').length};
    el.innerHTML = `
      <div class="page-list-container">
        <div class="list-header"><span class="response-count">${filtered.length} animales</span><button class="btn btn-primary btn-sm" onclick="Dashboard.showAnimalForm()">${Icons.plus} Nuevo</button></div>
        <div class="filters-bar"><div class="filter-row">
          <select onchange="Dashboard._currentAnimalFilter=this.value;Dashboard.renderAnimales(document.getElementById('page-animales'))">
            <option value="all" ${filter==='all'?'selected':''}>Todos (${counts.all})</option>
            <option value="disponible" ${filter==='disponible'?'selected':''}>Disponibles (${counts.disponible})</option>
            <option value="en_acogida" ${filter==='en_acogida'?'selected':''}>En acogida (${counts.en_acogida})</option>
            <option value="adoptado" ${filter==='adoptado'?'selected':''}>Adoptados (${counts.adoptado})</option>
          </select>
        </div></div>
        <div id="animales-form-container"></div>
        <div class="animal-grid">${filtered.map(a=>`
          <div class="animal-card" onclick="Dashboard.viewAnimal('${a.id}')">
            <div class="animal-card-img" style="display:flex;align-items:center;justify-content:center;background:${a.especie==='Perro'?'#e8faf0':'#ebf5fb'};color:${a.especie==='Perro'?'var(--primary-hover)':'var(--info)'}">${a.especie==='Perro'?Icons.dog:Icons.cat}</div>
            <div class="animal-card-body">
              <div class="animal-card-name">${this._esc(a.nombre)}</div>
              <div class="animal-card-breed">${a.raza} &middot; ${a.edad} &middot; ${a.sexo}</div>
              <div class="animal-card-status ${a.estado}">${a.estado==='disponible'?'Disponible':a.estado==='en_acogida'?'En acogida':'Adoptado'}</div>
            </div>
          </div>`).join('')}</div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  showAnimalForm(data) {
    const isEdit = !!data;
    this._renderForm('animales', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nuevo'} Animal</h3><form onsubmit="Dashboard.saveAnimal(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="an-nombre" value="${data?.nombre||''}" required></div><div class="form-group"><label>Especie *</label><select id="an-especie" required><option value="Perro" ${data?.especie==='Perro'?'selected':''}>Perro</option><option value="Gato" ${data?.especie==='Gato'?'selected':''}>Gato</option></select></div></div>
      <div class="form-row"><div class="form-group"><label>Raza *</label><input type="text" id="an-raza" value="${data?.raza||''}" required></div><div class="form-group"><label>Edad</label><input type="text" id="an-edad" value="${data?.edad||''}" placeholder="Ej: 2 anios"></div></div>
      <div class="form-row"><div class="form-group"><label>Peso</label><input type="text" id="an-peso" value="${data?.peso||''}" placeholder="Ej: 4.2 kg"></div><div class="form-group"><label>Sexo *</label><select id="an-sexo" required><option value="Macho" ${data?.sexo==='Macho'?'selected':''}>Macho</option><option value="Hembra" ${data?.sexo==='Hembra'?'selected':''}>Hembra</option></select></div></div>
      <div class="form-row"><div class="form-group"><label>Estado *</label><select id="an-estado" required><option value="disponible" ${data?.estado==='disponible'?'selected':''}>Disponible</option><option value="en_acogida" ${data?.estado==='en_acogida'?'selected':''}>En acogida</option><option value="adoptado" ${data?.estado==='adoptado'?'selected':''}>Adoptado</option></select></div><div class="form-group"><label>Microchip</label><input type="text" id="an-microchip" value="${data?.microchip||''}"></div></div>
      <div class="form-group"><label>Descripcion</label><textarea id="an-descripcion" rows="2">${data?.descripcion||''}</textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.cancelForm('animales')">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form></div>`);
  },

  async saveAnimal(e, isEdit, id) {
    e.preventDefault();
    const existing = isEdit ? this.animales.find(a => a.id === id) : null;
    const data = {
      nombre: document.getElementById('an-nombre').value.trim(),
      especie: document.getElementById('an-especie').value,
      raza: document.getElementById('an-raza').value.trim(),
      edad: document.getElementById('an-edad').value.trim(),
      peso: document.getElementById('an-peso').value.trim(),
      sexo: document.getElementById('an-sexo').value,
      estado: document.getElementById('an-estado').value,
      microchip: document.getElementById('an-microchip').value.trim(),
      descripcion: document.getElementById('an-descripcion').value.trim(),
      esterilizada: existing?.esterilizada || false,
      vacunas: existing?.vacunas || 'Pendientes',
      fecha_ingreso: existing?.fecha_ingreso || new Date().toISOString().slice(0,10),
      foto: existing?.foto || null
    };
    try {
      if (isEdit) {
        await API.updateAnimal(id, data);
        const item = this.animales.find(a => a.id === id); if (item) Object.assign(item, data);
      } else {
        const res = await API.createAnimal(data);
        if (res.data) this.animales.push(res.data);
      }
    } catch (err) {
      this.showSnackbar('No se pudo guardar: ' + this._errMsg(err), 'error');
      return;
    }
    this.cancelForm('animales');
    if (isEdit) this.viewAnimal(id);
    else this.renderAnimales(document.getElementById('page-animales'));
    this.showSnackbar(isEdit ? 'Animal actualizado' : 'Animal creado', 'success');
  },

  viewAnimal(id) {
    const a = this.animales.find(x=>x.id===id);
    if(!a) return;
    const foster = a.acogida_familia ? this.familias.find(f => f.id === a.acogida_familia) : null;
    this._showDetail('animales', a.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showAnimalForm(${JSON.stringify(a).replace(/"/g,'&quot;')})">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteAnimal('${a.id}')">${Icons.trash} Eliminar</button>
      </div>
      <div class="detail-section"><div class="detail-section-title">Informacion General</div>
        <div class="detail-field"><div class="detail-question">Especie</div><div class="detail-answer">${this._esc(a.especie)}</div></div>
        <div class="detail-field"><div class="detail-question">Raza</div><div class="detail-answer">${this._esc(a.raza)}</div></div>
        <div class="detail-field"><div class="detail-question">Edad</div><div class="detail-answer">${this._esc(a.edad)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Peso</div><div class="detail-answer">${this._esc(a.peso)||'—'}</div></div>
        <div class="detail-field"><div class="detail-question">Sexo</div><div class="detail-answer">${this._esc(a.sexo)}</div></div>
        <div class="detail-field"><div class="detail-question">Estado</div><div class="detail-answer"><span class="animal-card-status ${a.estado}">${a.estado==='disponible'?'Disponible':a.estado==='en_acogida'?'En acogida':'Adoptado'}</span></div></div>
        <div class="detail-field"><div class="detail-question">Descripcion</div><div class="detail-answer">${this._esc(a.descripcion)||'—'}</div></div>
      </div>
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

  async deleteAnimal(id) {
    if (!this._confirm('Eliminar este animal permanentemente?')) return;
    try { await API.deleteAnimal(id); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.animales = this.animales.filter(a => a.id !== id);
    this._hideDetail('animales');
    this.renderAnimales(document.getElementById('page-animales'));
    this.showSnackbar('Animal eliminado', 'success');
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
      <div class="response-list">${filtered.map(f=>`<div class="response-card" onclick="Dashboard.viewFosterFamily('${f.id}')">
          <div class="response-card-header">
            <div class="response-avatar" style="background:var(--info-light);color:var(--info)">${f.nombre.charAt(0)}</div>
            <div class="response-info">
              <div class="response-name">${f.nombre} <span class="estado-badge ${f.capacidad==='Libre'?'en_proceso':'pendiente'}">${f.capacidad}</span></div>
              <div class="response-email">${f.email} &middot; ${f.especialidad} &middot; ${f.ubicacion}</div>
            </div>
            <div class="response-date">${f.animales_actuales}/${f.max_capacity}</div>
          </div>
        </div>`).join('')}</div>
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

  async saveFamilia(e, isEdit, id) {
    e.preventDefault();
    const existing = isEdit ? this.familias.find(f => f.id === id) : null;
    const data = {
      nombre: document.getElementById('fa-nombre').value.trim(),
      email: document.getElementById('fa-email').value.trim(),
      telefono: document.getElementById('fa-telefono').value.trim(),
      ubicacion: document.getElementById('fa-ubicacion').value.trim(),
      especialidad: document.getElementById('fa-especialidad').value.trim(),
      max_capacity: parseInt(document.getElementById('fa-max').value) || 2,
      notas: document.getElementById('fa-notas').value.trim(),
      capacidad: 'Libre', animales_actuales: existing?.animales_actuales || 0
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
    const f = this.familias.find(x=>x.id===id);
    if(!f) return;
    const animalesEnAcogida = this.animales.filter(a => a.acogida_familia === id);
    this._showDetail('acogidas', f.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showFamiliaForm(${JSON.stringify(f).replace(/"/g,'&quot;')})">${Icons.pencil} Editar</button>
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
    if (!this._confirm('Eliminar esta familia acogedora permanentemente?')) return;
    try { await API.deleteFamilia(id); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.familias = this.familias.filter(f => f.id !== id);
    this._hideDetail('acogidas');
    this.renderAcogidas(document.getElementById('page-acogidas'));
    this.showSnackbar('Familia eliminada', 'success');
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
      <div class="response-list">${this.adopciones.map(p=>`
        <div class="response-card" onclick="Dashboard.viewAdopcion('${p.id}')">
          <div class="response-card-header">
            <div class="response-avatar" style="background:var(--warning-light);color:var(--warning)">${Icons.heart}</div>
            <div class="response-info">
              <div class="response-name">${p.animal} <span class="estado-badge ${p.fase==='Contrato'?'en_proceso':'pendiente'}">${p.fase}</span></div>
              <div class="response-email">${p.adoptante} &middot; ${p.estado}</div>
            </div>
            <div class="response-date">${p.fecha}</div>
          </div>
        </div>`).join('')}</div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  showAdopcionForm(data) {
    const isEdit = !!data;
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    this._renderForm('adopciones', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nueva'} Adopcion</h3><form onsubmit="Dashboard.saveAdopcion(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-row"><div class="form-group"><label>Animal *</label><input type="text" id="ad-animal" value="${data?.animal||''}" required placeholder="Ej: Max (Labrador)"></div><div class="form-group"><label>Adoptante *</label><input type="text" id="ad-adoptante" value="${data?.adoptante||''}" required></div></div>
      <div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="ad-email" value="${data?.email||''}"></div><div class="form-group"><label>Telefono</label><input type="text" id="ad-telefono" value="${data?.telefono||''}"></div></div>
      <div class="form-row"><div class="form-group"><label>Fase *</label><select id="ad-fase" required>${fases.map(f=>`<option value="${f}" ${data?.fase===f?'selected':''}>${f}</option>`).join('')}</select></div><div class="form-group"><label>Estado</label><input type="text" id="ad-estado" value="${data?.estado||''}" placeholder="Descripcion del estado actual"></div></div>
      <div class="form-group"><label>Notas</label><textarea id="ad-notas" rows="2">${data?.notas||''}</textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.cancelForm('adopciones')">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form></div>`);
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
        const item = this.adopciones.find(a => a.id === id); if (item) Object.assign(item, data);
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

  viewAdopcion(id) {
    const p = this.adopciones.find(x=>x.id===id);
    if(!p) return;
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    const currentIdx = fases.indexOf(p.fase);
    this._showDetail('adopciones', p.animal, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showAdopcionForm(${JSON.stringify(p).replace(/"/g,'&quot;')})">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteAdopcion('${p.id}')">${Icons.trash} Eliminar</button>
        ${currentIdx < fases.length-1?`<button class="btn btn-sm btn-outline-green" onclick="Dashboard.avanzarFase('${p.id}')">${Icons.arrowRight} Avanzar fase</button>`:''}
      </div>
      <div class="detail-section"><div class="detail-section-title">Pipeline de Adopcion</div>
        <div style="padding:16px;display:flex;gap:4px;overflow-x:auto">${fases.map((f,i)=>`<div style="flex:1;min-width:60px;text-align:center;padding:8px 4px;border-radius:8px;background:${i<currentIdx?'var(--primary-lighter)':i===currentIdx?'var(--primary)':'var(--gray-50)'};color:${i===currentIdx?'white':i<currentIdx?'var(--primary-hover)':'var(--gray-400)'};font-size:0.7rem;font-weight:600">${f}</div>`).join('')}</div>
      </div>
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

  async avanzarFase(id) {
    const p = this.adopciones.find(a => a.id === id);
    if (!p) return;
    const fases = ['Encuesta recibida','Revision','Visita domiciliaria','Contrato','Entrega','Seguimiento'];
    const idx = fases.indexOf(p.fase);
    if (idx >= fases.length - 1) return;
    const newFase = fases[idx + 1];
    try { await API.updateAdopcion(id, { fase: newFase, estado: `Fase: ${newFase}` }); }
    catch (err) { this.showSnackbar('No se pudo avanzar de fase', 'error'); return; }
    p.fase = newFase;
    p.estado = `Fase: ${newFase}`;
    this.viewAdopcion(id);
  },

  async deleteAdopcion(id) {
    if (!this._confirm('Eliminar esta adopcion permanentemente?')) return;
    try { await API.deleteAdopcion(id); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.adopciones = this.adopciones.filter(a => a.id !== id);
    this._hideDetail('adopciones');
    this.renderAdopciones(document.getElementById('page-adopciones'));
    this.showSnackbar('Adopcion eliminada', 'success');
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
        <tbody>${this.socios.map(s=>`<tr onclick="Dashboard.viewSocio('${s.id}')" style="cursor:pointer"><td>${this._esc(s.nombre)}</td><td>${this._esc(s.email)}</td><td>${this._esc(s.area)}</td><td><span class="estado-badge ${s.activo?'en_proceso':'descartada'}">${s.activo?'Activo':'Inactivo'}</span></td></tr>`).join('')}</tbody>
      </table></div></div>
      </div>
      <div class="page-detail-container"></div>`;
  },

  showSocioForm(data) {
    const isEdit = !!data;
    const fotoPreview = data?.foto ? `<img src="${data.foto}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);margin-bottom:8px;display:block">` : '';
    this._renderForm('socios', `<div class="form-card" style="margin-bottom:16px"><h3>${isEdit?'Editar':'Nuevo'} Socio</h3><form onsubmit="Dashboard.saveSocio(event,${isEdit?'true':'false'},'${data?.id||''}')">
      <div class="form-group"><label>Foto del socio</label>${fotoPreview}<input type="file" id="so-foto" accept="image/*" onchange="Dashboard._previewFoto(this,'so-foto-preview')"><div id="so-foto-preview"></div></div>
      <div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="so-nombre" value="${data?.nombre||''}" required></div><div class="form-group"><label>Email *</label><input type="email" id="so-email" value="${data?.email||''}" required></div></div>
      <div class="form-row"><div class="form-group"><label>Telefono</label><input type="text" id="so-telefono" value="${data?.telefono||''}"></div><div class="form-group"><label>Area *</label><select id="so-area" required><option value="">Seleccionar area...</option><option value="Paseos de perros" ${data?.area==='Paseos de perros'?'selected':''}>Paseos de perros</option><option value="Socializacion de gatos" ${data?.area==='Socializacion de gatos'?'selected':''}>Socializacion de gatos</option><option value="Cuidado de acogida" ${data?.area==='Cuidado de acogida'?'selected':''}>Cuidado de acogida</option><option value="Transporte de animales" ${data?.area==='Transporte de animales'?'selected':''}>Transporte de animales</option><option value="Eventos y captacion" ${data?.area==='Eventos y captacion'?'selected':''}>Eventos y captacion</option><option value="Fotografia" ${data?.area==='Fotografia'?'selected':''}>Fotografia</option><option value="Administracion" ${data?.area==='Administracion'?'selected':''}>Administracion</option></select></div></div>
      ${data?.carnet_id ? `<div class="form-group"><label>ID Carnet</label><input type="text" value="${data.carnet_id}" readonly style="background:#f5f5f5;font-family:monospace"></div>` : ''}
      <div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="Dashboard.cancelForm('socios')">Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form></div>`);
  },

  _previewFoto(input, previewId) {
    const preview = document.getElementById(previewId);
    if (!preview || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => { preview.innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);margin-top:8px">`; };
    reader.readAsDataURL(input.files[0]);
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
      data.foto = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(fotoInput.files[0]);
      });
    } else if (isEdit) {
      const existing = this.socios.find(s => s.id === id);
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
      const existing = this.socios.find(s => s.id === id);
      data.carnet_id = existing?.carnet_id || CarnetGenerator.generateCarnetId(data.area);
      data.activo = existing?.activo ?? true;
      data.fecha_registro = existing?.fecha_registro || new Date().toISOString().slice(0,10);
      data.horas_mes = existing?.horas_mes || 0;
      data.ultima_actividad = existing?.ultima_actividad || new Date().toISOString().slice(0,10);
    }
    try {
      if (isEdit) {
        await API.updateSocio(id, data);
        const item = this.socios.find(s => s.id === id); if (item) Object.assign(item, data);
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
    const s = this.socios.find(x=>x.id===id);
    if(!s) return;
    const fotoHtml = s.foto ? `<img src="${s.foto}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);margin-bottom:12px">` : `<div style="width:100px;height:100px;border-radius:50%;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--primary);margin-bottom:12px">${s.nombre?.charAt(0)||'?'}</div>`;
    this._showDetail('socios', s.nombre, `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="Dashboard.showSocioForm(${JSON.stringify(s).replace(/"/g,'&quot;')})">${Icons.pencil} Editar</button>
        <button class="btn btn-danger btn-sm" onclick="Dashboard.deleteSocio('${s.id}')">${Icons.trash} Eliminar</button>
        <button class="btn btn-sm ${s.activo?'btn-outline-green':'btn-primary'}" onclick="Dashboard.toggleSocio('${s.id}')">${s.activo?'Desactivar':'Activar'}</button>
        <button class="btn btn-sm" style="background:#191919;color:#fff" onclick="Dashboard.showCarnet('${s.id}')">${Icons.download} Ver Carnet</button>
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
    const s = this.socios.find(x => x.id === id);
    if (!s) return;
    CarnetGenerator.showCarnetModal(s);
  },

  async toggleSocio(id) {
    const s = this.socios.find(x => x.id === id);
    if (!s) return;
    const newActivo = !s.activo;
    try { await API.updateSocio(id, { activo: newActivo }); }
    catch (err) { this.showSnackbar('No se pudo actualizar el estado', 'error'); return; }
    s.activo = newActivo;
    this.viewSocio(id);
    this.showSnackbar(newActivo ? 'Socio activado' : 'Socio desactivado', 'success');
  },

  async deleteSocio(id) {
    if (!this._confirm('Eliminar este socio permanentemente?')) return;
    try { await API.deleteSocio(id); }
    catch (err) { this.showSnackbar('No se pudo eliminar: ' + this._errMsg(err), 'error'); return; }
    this.socios = this.socios.filter(s => s.id !== id);
    this._hideDetail('socios');
    this.renderSocios(document.getElementById('page-socios'));
    this.showSnackbar('Socio eliminado', 'success');
  },

  // ==================== BLACKLIST ====================
  renderBlacklist(el) {
    el.innerHTML = `
      <div class="list-header"><div class="search-box" style="flex:1"><span class="search-icon"></span><input type="text" placeholder="Buscar..." oninput="Dashboard.filterBlacklist(this)"></div><button class="btn btn-primary btn-sm" onclick="Dashboard.showAddBlacklist()">${Icons.plus} Anadir</button></div>
      <div id="blacklist-list-container">${this._renderBlacklistCards()}</div><div id="blacklist-form-container"></div>`;
  },

  filterBlacklist(input) { const c=document.getElementById('blacklist-list-container'); if(c) c.innerHTML=this._renderBlacklistCards(input.value); },

  _renderBlacklistCards(search='') {
    let items=this.blacklist;
    if(search) items=items.filter(bl=>((bl.nombre||'')+' '+(bl.apellidos||'')+' '+(bl.email||'')+' '+(bl.motivo||'')).toLowerCase().includes(search.toLowerCase()));
    if(!items.length) return '<div class="empty-state"><div class="empty-state-icon">'+Icons.checkCircle+'</div><p>No hay personas en la lista negra</p></div>';
    return items.map((bl,i)=>`<div class="bl-card"><div class="bl-card-header"><span class="bl-card-name">${bl.nombre} ${bl.apellidos}</span><div style="display:flex;gap:4px"><button class="btn btn-outline-green btn-sm" onclick="Dashboard.showEditBlacklist(${i})">${Icons.pencil}</button><button class="btn btn-danger btn-sm" onclick="Dashboard.removeBlacklistItem(${i})">${Icons.trash}</button></div></div>${bl.email?'<div class="bl-card-email">'+bl.email+'</div>':''}<div class="bl-card-motivo">${bl.motivo}</div><div class="bl-card-meta">${bl.origen||'manual'} ${bl.fecha?'&middot; '+new Date(bl.fecha).toLocaleDateString('es-ES'):''}</div></div>`).join('');
  },

  showAddBlacklist() {
    const c=document.getElementById('blacklist-form-container');
    if(!c) return;
    c.innerHTML = this._blacklistFormHTML();
  },

  showEditBlacklist(idx) {
    const c=document.getElementById('blacklist-form-container');
    if(!c) return;
    const bl = this.blacklist[idx];
    if (!bl) return;
    c.innerHTML = this._blacklistFormHTML(bl, idx);
  },

  _blacklistFormHTML(data, idx) {
    const isEdit = idx !== undefined;
    return `<div class="form-card" style="margin-top:16px"><h3>${isEdit?'Editar':'Anadir a lista negra'}</h3><form onsubmit="Dashboard.saveBlacklistItem(event,${isEdit?idx:'null'})"><div class="form-row"><div class="form-group"><label>Nombre *</label><input type="text" id="bl-nombre" value="${data?.nombre||''}" required></div><div class="form-group"><label>Apellidos *</label><input type="text" id="bl-apellidos" value="${data?.apellidos||''}" required></div></div><div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="bl-email" value="${data?.email||''}"></div><div class="form-group"><label>Telefono</label><input type="text" id="bl-telefono" value="${data?.telefono||''}"></div></div><div class="form-group"><label>Motivo *</label><select id="bl-motivo" required><option value="">Seleccionar...</option>${['Incompatible con animales','Vivienda inadecuada','Historial de maltrato','Informacion falsa','Sin compromiso','Otros'].map(m=>`<option ${data?.motivo===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="form-group"><label>Notas</label><textarea id="bl-notas" rows="2">${data?.notas||''}</textarea></div><div class="form-actions"><button type="button" class="btn btn-outline-green" onclick="document.getElementById('blacklist-form-container').innerHTML=''">Cancelar</button><button type="submit" class="btn btn-danger">${isEdit?'Actualizar':'Anadir'}</button></div></form></div>`;
  },

  saveBlacklistItem(e, idx) {
    e.preventDefault();
    const item = {nombre:document.getElementById('bl-nombre').value.trim(),apellidos:document.getElementById('bl-apellidos').value.trim(),email:document.getElementById('bl-email').value.trim(),telefono:document.getElementById('bl-telefono').value.trim(),motivo:document.getElementById('bl-motivo').value,notas:document.getElementById('bl-notas').value.trim(),origen:'manual',fecha:new Date().toISOString()};
    if (idx !== null && idx !== undefined) { this.blacklist[idx] = item; }
    else { this.blacklist.push(item); }
    this.saveLocal();
    document.getElementById('blacklist-form-container').innerHTML='';
    const lc=document.getElementById('blacklist-list-container'); if(lc) lc.innerHTML=this._renderBlacklistCards();
  },

  removeBlacklistItem(idx) {
    if (!this._confirm('Eliminar esta persona de la lista negra?')) return;
    this.blacklist.splice(idx, 1);
    this.saveLocal();
    const lc=document.getElementById('blacklist-list-container'); if(lc) lc.innerHTML=this._renderBlacklistCards();
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
    if (!el) { window.alert(msg); return; }
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
