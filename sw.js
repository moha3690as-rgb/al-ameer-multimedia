const CACHE = 'ameer-shell-v1';
const SHELL = ['/', '/styles.css', '/app.js', '/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never cache API writes
  if (new URL(req.url).pathname.startsWith('/api/')) return; // always go to network for data
  if (new URL(req.url).pathname.startsWith('/admin')) return; // admin always fresh

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached || caches.match('/offline.html'));
      return cached || network;
    })
  );
});
