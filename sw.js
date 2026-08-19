const CACHE_NAME = 'siap-upload-v5';
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

  // Data dari Apps Script & file Drive HARUS selalu fresh, jangan disentuh SW.
  if (req.url.indexOf('script.google.com') !== -1 || req.url.indexOf('drive.google.com') !== -1) {
    return;
  }

  // NETWORK-FIRST: selama online, selalu ambil versi terbaru dari server dan
  // simpan salinannya ke cache. Cache cuma dipakai sebagai fallback pas
  // offline (mis. sinyal HP jelek). Ini biar update kode gak butuh
  // uninstall/reinstall manual tiap kali seperti sebelumnya.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
