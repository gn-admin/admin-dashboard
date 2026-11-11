const App = {
  currentPage: null,

  init() {
    if (typeof Pwa !== 'undefined') Pwa.init();
    else this.registerServiceWorker();
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
    }, 25000);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        // Forzar verificacion de actualizacion del SW
        reg.update().catch(() => {});
        // Si hay un SW esperando, activarlo inmediatamente
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nuevo SW instalado, recargar para obtener la version nueva
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          });
        });
        // Verificar actualizaciones cada 60 segundos
        setInterval(() => { reg.update().catch(() => {}); }, 60000);
      }).catch(() => {});
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
    // Si Firebase cambia de cuenta, no se puede reutilizar ni la cache ni el
    // DOM de la cuenta anterior. `setUser` devuelve true solo en ese cambio.
    const uid = (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser.uid : '';
    const changed = typeof Dashboard !== 'undefined' && typeof Dashboard.setUser === 'function'
      ? Dashboard.setUser(uid)
      : false;
    if (changed) this.currentPage = null;
    await Dashboard.init();
    const hash = location.hash.replace('#', '') || 'dashboard';
    this.navigateTo(hash);
  },

  showLogin() {
    this._routed = true;
    if (typeof Dashboard !== 'undefined' && typeof Dashboard.setUser === 'function') Dashboard.setUser(null);
    this.currentPage = null;
    document.getElementById('loading')?.classList.remove('active');
    document.getElementById('dashboard-view').classList.remove('active');
    document.getElementById('login-view').classList.add('active');
  },

  // Pestana de la bottom-nav que corresponde a una pagina (incluye subpaginas).
  _bottomParent(page) {
    const p = String(page || '');
    if (p === 'dashboard' || p === 'animales') return p;
    if (p.indexOf('encuestas') === 0) return 'encuestas';
    const mas = ['acogidas', 'acogidas-activas', 'adopciones', 'socios', 'blacklist', 'reportes', 'redes', 'donaciones', 'almacen'];
    return mas.includes(p) ? 'mas' : '';
  },

  navigateTo(page) {
    if (typeof Dashboard !== 'undefined' && typeof Dashboard.puedeAccederPagina === 'function' && !Dashboard.puedeAccederPagina(page)) {
      const fallback = (typeof Dashboard.primeraPaginaPermitida === 'function') ? Dashboard.primeraPaginaPermitida() : 'dashboard';
      if (page !== fallback) { location.hash = fallback; return; }
      page = fallback;
    }
    if (this.currentPage === page) return;
    const aplicar = () => {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const target = document.getElementById('page-' + page);
      if (target) {
        target.classList.add('active');
        this.currentPage = page;
      } else {
        // Ruta no existente: no quedarse en pantalla blanca, redirigir a dashboard
        console.warn(`Ruta no encontrada: #${page}. Redirigiendo a #dashboard`);
        location.hash = 'dashboard';
        return;
      }
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
      const bottomParent = this._bottomParent(page);
      document.querySelectorAll('.bottom-nav-item').forEach(l => {
        const active = l.id === 'mas-menu-toggle' ? bottomParent === 'mas' : l.dataset.page === bottomParent;
        l.classList.toggle('active', active);
        if (active) l.setAttribute('aria-current', 'page');
        else l.removeAttribute('aria-current');
      });
      document.querySelectorAll('.mas-menu-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
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
        reportes: 'Reportes y actividad',
        redes: 'Redes Sociales',
        donaciones: 'Donaciones',
        almacen: 'Almacén'
      };
      document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
      this.closeSidebar();
      this.closeMasMenu();
      Dashboard.loadPage(page);
    };
    // Nota: se probo envolver `aplicar` en document.startViewTransition para
    // un cross-fade entre paginas, pero en navegadores con la API presente
    // pero inestable la transicion fallaba y `aplicar` no se llegaba a
    // ejecutar (pantallas en blanco). Se navega siempre de forma directa.
    aplicar();
  },

  onHashChange() {
    const page = location.hash.replace('#', '') || 'dashboard';
    this.navigateTo(page);
  },

  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const wasOpen = !!sidebar && sidebar.classList.contains('open');
    sidebar?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
    if (wasOpen) this._lockBg(false);
  },

  // Bloquea el scroll del fondo mientras drawer o menu cubren la pantalla.
  _lockBg(open) {
    if (typeof Dashboard !== 'undefined' && typeof Dashboard._modalScrollLock === 'function') {
      Dashboard._modalScrollLock(open);
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const willOpen = !!sidebar && !sidebar.classList.contains('open');
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('active');
    this._lockBg(willOpen);
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
    const toggle = document.getElementById('mas-menu-toggle');
    const isOpen = popup?.style.display === 'block';
    if (isOpen) { this.closeMasMenu(); }
    else {
      popup.style.display = 'block';
      overlay?.classList.add('active');
      toggle?.setAttribute('aria-expanded', 'true');
      this._lockBg(true);
    }
  },

  closeMasMenu() {
    const popup = document.getElementById('mas-menu-popup');
    const overlay = document.getElementById('mas-menu-overlay');
    const wasOpen = popup?.style.display === 'block';
    if (popup) popup.style.display = 'none';
    overlay?.classList.remove('active');
    document.getElementById('mas-menu-toggle')?.setAttribute('aria-expanded', 'false');
    if (wasOpen) this._lockBg(false);
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
      catch (err) { errorEl.textContent = Auth._msgLogin(err); errorEl.classList.add('active'); }
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
      if (e.key === 'Tab') {
        const open = [...document.querySelectorAll('.modal-overlay')].filter(m => m.style.display === 'flex');
        if (!open.length) return;
        const top = open[open.length - 1];
        const f = [...top.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.key === 'Enter' || e.key === ' ') {
        const t = e.target?.closest?.('[role="button"]');
        if (t && !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) {
          e.preventDefault();
          t.click();
        }
        return;
      }
      if (typeof Dashboard !== 'undefined' && typeof Dashboard._modalCloseTop === 'function' && Dashboard._modalCloseTop()) return;
      this.closeMasMenu();
      this.closeSidebar();
    });
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => this.toggleSidebarCollapse());

    // Botón "Ir arriba" (móvil)
    const scrollBtn = document.getElementById('scroll-to-top');
    if (scrollBtn) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 2 * window.innerHeight) {
          scrollBtn.classList.add('visible');
        } else {
          scrollBtn.classList.remove('visible');
        }
      }, { passive: true });
      scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

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
