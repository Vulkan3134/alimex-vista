/* Service worker de la plataforma de demostración.
   Permite abrir la interfaz sin red después de la primera visita.
   Los movimientos hechos sin conexión se validan al sincronizar. */
const CACHE = 'alimex-logistica-demo-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/icon.svg',
  './src/main.js',
  './src/config.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/tests/')) return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('Sin conexión y el archivo no está en caché.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
