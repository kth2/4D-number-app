/* Service worker: precache the app shell, stale-while-revalidate for data. */
const VERSION = 'my4d-v13';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/i18n.js',
  './js/data.js',
  './js/stats.js',
  './js/charts.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Data: serve cache immediately, refresh in the background (stale-while-revalidate).
  // When the background refresh brings NEWER data than what was served, tell every
  // open page so it can offer a one-tap reload.
  if (url.pathname.endsWith('/data/draws.json')) {
    e.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request)
          .then(async (res) => {
            if (res.ok) {
              const tag = (r) => r.headers.get('ETag') || r.headers.get('Last-Modified') || '';
              const changed = cached && tag(res) && tag(res) !== tag(cached);
              await cache.put(e.request, res.clone());
              if (changed) {
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach((c) => c.postMessage({ type: 'data-updated' }));
              }
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Shell: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
