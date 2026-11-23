// Lignarc dashboard service worker: always try the network first (fresh numbers), fall back to the last copy when offline.
const CACHE = 'lignarc-v17';
const SHELL = ['./', './index.html', './assets/styles.css?v=17', './assets/app.js?v=17', './assets/merge.js', './assets/us-states.json', './assets/logo-walnut.png', './assets/logo-white.png', './assets/mark-walnut.png', './assets/icon-192.png', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-store' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
});
