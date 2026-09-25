const CACHE_NAME = 'gn-encuestas-v67';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/icons.js',
  './js/auth.js',
  './js/api.js',
  './js/dashboard.js',
  './js/carnet-generator.js',
  './js/pdf-export.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/logo-nebak.jpg'
];

// Install: cache assets estÃ¡ticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpiar caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first para assets estÃ¡ticos, network-first para API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls: network-first (no cachear datos de usuario)
  if (url.searchParams.has('endpoint') || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then(m => m || Response.error())
      )
    );
    return;
  }

  // CDN de terceros (Firebase/gstatic): network-first, NUNCA cachear.
  // Si firebase-app se cacheara pero firebase-auth no, `firebase` existe
  // pero `firebase.auth` no -> error "firebase.auth is not a function".
  if (url.hostname.endsWith('gstatic.com') || url.pathname.includes('/firebasejs/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets estÃ¡ticos: cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            // Cachear nuevos assets
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone));
            }
            return response;
          });
      })
  );
});
