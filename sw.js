const CACHE_NAME = 'siap-upload-v2';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Data dari Apps Script & file Drive HARUS selalu fresh, jangan di-cache.
  if (req.url.indexOf('script.google.com') !== -1 || req.url.indexOf('drive.google.com') !== -1) {
    return;
  }

  // Shell app: cache-first supaya buka cepat & tetap jalan pas offline,
  // fallback ke network kalau belum ke-cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => cached);
    })
  );
});
