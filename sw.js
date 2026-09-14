const CACHE = 'shoes-v15';

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

// Files come from the cache first, so the app opens instantly with or without a
// connection. Updates never pass through this handler: the browser fetches sw.js
// itself to look for a new version, and a new worker's install bypasses it — so
// no switch to block the network is needed, and none is offered.

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
      // Both apps live on the same origin and share one cache storage, so only
      // this app's own old versions are removed — never the receipts app's.
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('shoes-') && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
      if (response.ok && e.request.method === 'GET') {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return response;
    }).catch(() => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
  );
});
