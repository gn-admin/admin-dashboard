const App = {
  currentPage: null,

  init() {
    this.registerServiceWorker();
    this.initSidebarCollapse();
    this.initSidebarSections();
    this._routed = false;
    Auth.init();
    let previa = false;
    try { previa = localStorage.getItem('gn_session') === '1'; } catch {}
    if (previa) {
      // Hubo login previo: loading directo, sin pintar el login (pareceria deslogueo).
      document.getElementById('login-view')?.classList.remove('active');
      document.getElementById('loading')?.classList.add('active');
    }
    Auth.onAuthChange(async user => {
      if (!Auth._resolved && !user) return; // aun verificando sesion
      if (user) await this.showDashboard();
      else this.showLogin();
    });
    this.setupEventListeners();
    window.addEventListener('hashchange', () => this.onHashChange());
    setTimeout(() => {
      if (!this._routed) {
        document.getElementById('loading')?.classList.remove('active');
        this.showLogin();
      }
    }, 12000);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  initSidebarCollapse() {
    const stored = localStorage.getItem('gn_sidebar_collapsed');
    const isTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches;
    const collapsed = stored === 'true' || (stored === null && isTablet);
    if (collapsed) {
      document.getElementById('sidebar')?.classList.add('collapsed');
      const btn = document.getElementById('sidebar-collapse-btn');
      if (btn) btn.innerHTML = Icons.arrowRight;
    }
  },

  async showDashboard() {
    this._routed = true;
    document.getElementById('login-view').classList.remove('active');
    document.getElementById('dashboard-view').classList.add('active');
    await Dashboard.init();
    const hash = location.hash.replace('#', '') || 'dashboard';
    this.navigateTo(hash);
  },

  showLogin() {
    this._routed = true;
    document.getElementById('loading')?.classList.remove('active');
    document.getElementById('dashboard-view').classList.remove('active');
    document.getElementById('login-view').classList.add('active');
  },

  navigateTo(page) {
    if (this.currentPage === page) return;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) {
      target.classList.add('active');
      this.currentPage = page;
    }
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    document.querySelectorAll('.bottom-nav-item').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    const titles = {
      dashboard: 'Dashboard',
      encuestas: 'Encuestas',
      'encuestas-perros': 'Pre-adopcion Perros',
      'encuestas-gatos': 'Pre-adopcion Gatos',
      'encuestas-acogida': 'Solicitudes de Acogida',
      animales: 'Animales',
      acogidas: 'Familias de Acogida',
      'acogidas-activas': 'Acogidas Activas',
      adopciones: 'Adopciones',
      socios: 'Socios / Voluntarios',
      blacklist: 'Lista Negra',
      reportes: 'Reportes',
      redes: 'Redes Sociales'
    };
    document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
    this.closeSidebar();
    this.closeMasMenu();
    Dashboard.loadPage(page);
  },

  onHashChange() {
    const page = location.hash.replace('#', '') || 'dashboard';
    this.navigateTo(page);
  },

  closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('active');
  },

  toggleSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('collapsed');
    const isCollapsed = sidebar?.classList.contains('collapsed');
    localStorage.setItem('gn_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    const btn = document.getElementById('sidebar-collapse-btn');
    if (btn) btn.innerHTML = isCollapsed ? Icons.arrowRight : Icons.sidebarCollapse;
  },

  initSidebarSections() {
    let collapsed = [];
    try { collapsed = JSON.parse(localStorage.getItem('gn_sidebar_sections') || '[]'); } catch {}
    document.querySelectorAll('.sidebar-section[data-section]').forEach(sec => {
      const key = sec.dataset.section;
      const toggle = sec.querySelector('[data-section-toggle]');
      if (collapsed.includes(key)) sec.classList.add('collapsed');
      if (toggle) {
        toggle.setAttribute('aria-expanded', collapsed.includes(key) ? 'false' : 'true');
        toggle.addEventListener('click', () => this.toggleSidebarSection(key));
      }
    });
  },

  toggleSidebarSection(key) {
    const sec = document.querySelector('.sidebar-section[data-section="' + key + '"]');
    if (!sec) return;
    sec.classList.toggle('collapsed');
    const isCollapsed = sec.classList.contains('collapsed');
    sec.querySelector('[data-section-toggle]')?.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    let collapsed = [];
    try { collapsed = JSON.parse(localStorage.getItem('gn_sidebar_sections') || '[]'); } catch {}
    const i = collapsed.indexOf(key);
    if (isCollapsed && i === -1) collapsed.push(key);
    if (!isCollapsed && i !== -1) collapsed.splice(i, 1);
    localStorage.setItem('gn_sidebar_sections', JSON.stringify(collapsed));
  },

  toggleMasMenu() {
    const popup = document.getElementById('mas-menu-popup');
    const overlay = document.getElementById('mas-menu-overlay');
    const isOpen = popup?.style.display === 'block';
    if (isOpen) { this.closeMasMenu(); }
    else { popup.style.display = 'block'; overlay?.classList.add('active'); }
  },

  closeMasMenu() {
    const popup = document.getElementById('mas-menu-popup');
    const overlay = document.getElementById('mas-menu-overlay');
    if (popup) popup.style.display = 'none';
    overlay?.classList.remove('active');
  },

  setupEventListeners() {
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const btn = document.getElementById('login-submit-btn');
      const errorEl = document.getElementById('login-error');
      errorEl.classList.remove('active');
      btn.classList.add('loading');
      btn.disabled = true;
      try { await Auth.loginWithEmail(email, password); }
      catch (err) { errorEl.textContent = err.message || 'Error al iniciar sesion'; errorEl.classList.add('active'); }
      finally { btn.classList.remove('loading'); btn.disabled = false; }
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());
    document.getElementById('mobile-logout-btn')?.addEventListener('click', () => Auth.logout());

    document.getElementById('password-toggle')?.addEventListener('click', () => {
      const input = document.getElementById('password');
      const btn = document.getElementById('password-toggle');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn?.setAttribute('title', show ? 'Ocultar contrasena' : 'Mostrar contrasena');
      btn?.setAttribute('aria-label', show ? 'Ocultar contrasena' : 'Mostrar contrasena');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.getElementById('confirm-modal')?.style.display === 'flex') { Dashboard.cancelConfirm(false); return; }
      if (document.getElementById('contrato-modal')?.style.display === 'flex') { Dashboard.closeContratoForm(); return; }
      if (document.getElementById('form-modal')?.style.display === 'flex') { Dashboard.closeFormModal(); return; }
      if (document.getElementById('info-modal')?.style.display === 'flex') { Dashboard.closeInfoModal(); return; }
      if (document.getElementById('profile-modal')?.style.display === 'flex') { Dashboard.closeProfile(); return; }
      if (document.getElementById('tutorial-modal')?.style.display === 'flex') { Dashboard.closeTutorial(); return; }
      this.closeMasMenu();
    });
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => this.toggleSidebarCollapse());

    document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = link.dataset.page;
      });
    });

    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = link.dataset.page;
      });
    });

    document.getElementById('mas-menu-toggle')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleMasMenu();
    });

    document.getElementById('mas-menu-overlay')?.addEventListener('click', () => this.closeMasMenu());

    document.querySelectorAll('.mas-menu-item[data-page]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeMasMenu();
        location.hash = item.dataset.page;
      });
    });

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('sidebar-overlay')) this.closeSidebar();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
