const CACHE_NAME = 'caderno-psi-v9';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/branding-toth.css',
  './js/app.js',
  './img/icone-psi-toth-192-fofinho.png',
  './img/icone-toth-caderno-roxo-azul-fofinho.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        ASSETS.map((asset) => cache.add(asset).catch(() => undefined))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : undefined)
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
