/* sw.js — Finance Tracker Service Worker */

const CACHE = 'finance-v4';
const STATIC_ASSETS = [
  './manifest.json',
  './icon.svg',
];

// Assets that must always be fresh — use network-first, fall back to cache
const FRESH_ASSETS = [
  './index.html',
  './app.js',
  './styles.css',
  './data2025.js',
  './',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('script.google.com') || url.includes('googleusercontent.com')) return;
  if (e.request.method !== 'GET') return;

  const pathname = new URL(url).pathname.replace(/\/$/, '') || '/';
  const isFresh  = FRESH_ASSETS.some(a => url.endsWith(a.replace('./', '/')) || url.endsWith(pathname));

  if (isFresh) {
    // Network-first: always get latest code; fall back to cache only when offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for static assets (icons, manifest)
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
