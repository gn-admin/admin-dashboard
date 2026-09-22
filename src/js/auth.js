const Auth = {
  currentUser: null,
  _listeners: [],

  init() {
    this._loadFirebaseSDK().then(() => {
      firebase.initializeApp(CONFIG.firebase);
      firebase.auth().onAuthStateChanged(user => {
        this.currentUser = user ? {
          uid: user.uid,
          email: user.email,
          name: user.displayName || user.email,
          role: null
        } : null;
        this._notifyListeners();
      });
    }).catch(err => {
      console.error('Error cargando Firebase SDK:', err);
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
    return this.currentUser;
  },

  async logout() {
    await firebase.auth().signOut();
    this.currentUser = null;
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
      if (window.firebase) {
        resolve();
        return;
      }

      const scripts = [
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js'
      ];

      let loaded = 0;
      scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
          loaded++;
          if (loaded === scripts.length) resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Auth;
}