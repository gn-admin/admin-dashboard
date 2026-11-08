/**
 * PWA: instalacion como app (Android/escritorio via beforeinstallprompt e
 * iOS via guia paso a paso) y registro del service worker.
 *
 * No depende del login: los botones de instalar viven tambien en la pantalla
 * de acceso. Todo es best-effort; si el navegador no soporta instalacion se
 * muestra la guia generica.
 */
const Pwa = {
  deferred: null,
  _inited: false,
  _installed: false,
  _updateReady: false,

  init() {
    if (this._inited) return;
    this._inited = true;

    const icon = (typeof Icons !== 'undefined' && Icons.download) || '';
    const setIcon = id => { const el = document.getElementById(id); if (el) el.innerHTML = icon; };
    setIcon('pwa-install-btn');
    setIcon('pwa-login-install-icon');

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferred = e;
      this.refresh();
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this._installed = true;
      this.closeGuide();
      this.refresh();
      this._toast('GN Admin instalada. Abrela desde tu pantalla de inicio.', 'success');
    });

    document.getElementById('pwa-install-btn')?.addEventListener('click', () => this.install());
    document.getElementById('pwa-install-side')?.addEventListener('click', () => this.install());
    document.getElementById('pwa-login-install')?.addEventListener('click', () => this.install());
    document.getElementById('pwa-modal-close')?.addEventListener('click', () => this.closeGuide());
    document.getElementById('pwa-modal')?.addEventListener('click', e => {
      if (e.target.id === 'pwa-modal') this.closeGuide();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._guideOpen()) this.closeGuide();
    });

    try {
      const mq = window.matchMedia('(display-mode: standalone)');
      if (mq.addEventListener) mq.addEventListener('change', () => this.refresh());
    } catch {}

    this.registerSW();
    this.refresh();
  },

  isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || (window.matchMedia && window.matchMedia('(display-mode: window-controls-overlay)').matches)
      || window.navigator.standalone === true;
  },

  isIOS() {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return iOS && !window.MSStream;
  },

  canInstall() {
    return !this.isStandalone() && !this._installed;
  },

  // Muestra/oculta los accesos de instalacion segun el estado real.
  refresh() {
    const visible = this.canInstall();
    ['pwa-install-btn', 'pwa-login-install'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? (el.tagName === 'BUTTON' ? '' : 'flex') : 'none';
    });
  },

  async install() {
    if (this.deferred) {
      const prompt = this.deferred;
      this.deferred = null;
      this.closeGuide();
      try {
        prompt.prompt();
        await prompt.userChoice;
      } catch {}
      this.refresh();
      return;
    }
    this.showGuide();
  },

  _guideOpen() {
    return document.getElementById('pwa-modal')?.style.display === 'flex';
  },

  showGuide() {
    const body = document.getElementById('pwa-guide-body');
    const modal = document.getElementById('pwa-modal');
    if (!body || !modal) return;
    const ios = this.isIOS();
    const steps = ios
      ? [
          'Abre esta pagina en <strong>Safari</strong>.',
          'Toca el boton <strong>Compartir</strong> (cuadrado con flecha).',
          'Elige <strong>Anadir a pantalla de inicio</strong>.',
          'Confirma con <strong>Anadir</strong>. La app aparecera junto al resto.'
        ]
      : [
          'Abre el menu del navegador (los tres puntos).',
          'Elige <strong>Instalar aplicacion</strong> o <strong>Instalar GN Admin</strong>.',
          'Confirma con <strong>Instalar</strong>.',
          'La app se abrira en su propia ventana, sin barra del navegador.'
        ];
    body.innerHTML = `
      <div class="pwa-guide">
        <p class="pwa-guide-lead">Instala GN Admin para abrirla a pantalla completa, con su icono y acceso directo, sin pasar por el navegador.</p>
        <div class="pwa-guide-brand">
          <img src="assets/icons/icon-192.png" alt="" class="pwa-guide-logo">
          <div>
            <div class="pwa-guide-name">GN Admin</div>
            <div class="pwa-guide-meta">Grupo Nebak</div>
          </div>
        </div>
        ${this.deferred ? '<button type="button" class="btn btn-primary btn-full" id="pwa-guide-install">Instalar ahora</button>' : ''}
        <ol class="pwa-guide-steps">
          ${steps.map((s, i) => `<li class="pwa-guide-step"><span class="pwa-guide-num">${i + 1}</span><span>${s}</span></li>`).join('')}
        </ol>
        <p class="pwa-guide-note">${ios ? 'En iPhone/iPad la instalacion solo esta disponible desde Safari.' : 'Si no ves la opcion, actualiza el navegador o abrelo en Chrome/Edge.'}</p>
      </div>`;
    modal.style.display = 'flex';
    document.body.classList.add('pwa-modal-open');
    document.getElementById('pwa-guide-install')?.addEventListener('click', () => this.install());
  },

  closeGuide() {
    const modal = document.getElementById('pwa-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('pwa-modal-open');
  },

  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      const check = () => {
        if (reg.waiting || reg.installing) this._updateReady = true;
      };
      check();
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            this._updateReady = true;
            this._toast('Hay una version nueva. Cierra y vuelve a abrir la app.', 'warning');
          }
        });
      });
    }).catch(() => {});
  },

  _toast(msg, tipo) {
    try {
      if (typeof Dashboard !== 'undefined' && Dashboard.showSnackbar) Dashboard.showSnackbar(msg, tipo);
    } catch {}
  }
};

document.addEventListener('DOMContentLoaded', () => Pwa.init());
