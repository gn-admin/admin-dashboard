const Auth = {
  currentUser: null,
  _listeners: [],
  _resolved: false,

  init() {
    this._loadFirebaseSDK().then(() => {
      firebase.initializeApp(CONFIG.firebase);
      firebase.auth().onAuthStateChanged(user => {
        this._resolved = true;
        this.currentUser = user ? {
          uid: user.uid,
          email: user.email,
          name: user.displayName || user.email,
          role: null
        } : null;
        try {
          if (user) localStorage.setItem('gn_session', '1');
          else localStorage.removeItem('gn_session');
        } catch {}
        this._notifyListeners();
      });
    }).catch(err => {
      console.error('Error cargando Firebase SDK:', err);
      this._resolved = true;
      this._notifyListeners();
    });
  },

  async loginWithEmail(email, password) {
    await this._ensureSDK();
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);
    const fbUser = result.user;
    this.currentUser = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: fbUser.displayName || fbUser.email,
      role: null
    };
    try { localStorage.setItem('gn_session', '1'); } catch {}
    return this.currentUser;
  },

  async logout() {
    await firebase.auth().signOut();
    this.currentUser = null;
    try { localStorage.removeItem('gn_session'); } catch {}
    ['gn_responses_all','gn_animales','gn_familias','gn_adopciones','gn_socios','gn_blacklist','gn_candidaturas','gn_contratos','gn_acogidas','gn_actividad','gn_publicaciones','gn_apadrinamientos','gn_pending_ops'].forEach(k => localStorage.removeItem(k));
    try { Object.keys(localStorage).filter(k => k.indexOf('gn_cache_') === 0).forEach(k => localStorage.removeItem(k)); } catch {}
    this._notifyListeners();
  },

  async getIdToken() {
    await this._ensureSDK();
    if (!firebase.auth().currentUser) {
      throw new Error('No hay usuario autenticado');
    }
    return await firebase.auth().currentUser.getIdToken();
  },

  isAuthenticated() {
    return this.currentUser !== null;
  },

  onAuthChange(callback) {
    this._listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  },

  _notifyListeners() {
    this._listeners.forEach(cb => cb(this.currentUser));
  },

  _ensureSDK() {
    if (window.firebase) return Promise.resolve();
    return this._loadFirebaseSDK();
  },

  _loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      const sdkReady = () =>
        window.firebase &&
        typeof window.firebase.initializeApp === 'function' &&
        typeof window.firebase.auth === 'function';

      if (sdkReady()) {
        resolve();
        return;
      }

      const scripts = [
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js'
      ];

      let attempts = 0;
      const load = () => {
        window.__fbAuthLoading = true;
        const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const tags = [];
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          window.__fbAuthLoading = false;
          if (ok && sdkReady()) resolve();
          else if (attempts < 2) { attempts++; setTimeout(load, 600 + attempts * 400); }
          else reject(new Error('No se pudo cargar el SDK de Firebase (app/auth)'));
        };

        scripts.forEach(src => {
          const script = document.createElement('script');
          script.src = src + (src.includes('?') ? '&' : '?') + 'v=' + nonce;
          script.onload = () => { if (sdkReady()) finish(true); };
          script.onerror = () => finish(false);
          tags.push(script);
          document.head.appendChild(script);
        });

        // Timeout de seguridad por si un script se queda colgado
        setTimeout(() => finish(false), 15000);
      };

      if (window.__fbAuthLoading) {
        // Ya hay una carga en curso: esperar a que termine
        const interval = setInterval(() => {
          if (sdkReady()) { clearInterval(interval); resolve(); }
          else if (!window.__fbAuthLoading) { clearInterval(interval); load(); }
        }, 400);
        return;
      }

      load();
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Auth;
}