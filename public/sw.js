const CACHE_NAME = 'financeiro-pwa-v9';
const OFFLINE_URL = '/offline.html';
const STATIC_ASSETS = [
  '/css/tokens.css',
  '/css/app.css',
  '/css/mobile-bank.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/pwa.js',
  '/js/app.js',
  '/js/perfil.js',
  '/js/admin.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
  OFFLINE_URL,
  '/images/logo-home-financas.png',
];

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && accept.includes('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sem conexão' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  if (event.request.method !== 'GET') return;

  if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(async () => {
          if (cached) return cached;
          if (isNavigationRequest(event.request)) {
            const offline = await caches.match(OFFLINE_URL);
            if (offline) return offline;
          }
          return Response.error();
        });

      return cached || network;
    })
  );
});
