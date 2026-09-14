const CACHE = 'shoes-v12';

const PRECACHE = [
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/db.js',
  'js/money.js',
  'js/lock.js',
  'js/settings.js',
  'js/stock.js',
  'js/views.js',
  'js/backup.js',
  'lib/idb.js',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

let offlineMode = true;

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SET_OFFLINE_MODE') {
    offlineMode = e.data.value;
  }
});

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' bypasses the browser HTTP cache so a new version always
      // precaches genuinely fresh files, never stale copies
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      if (offlineMode) {
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
    })
  );
});
