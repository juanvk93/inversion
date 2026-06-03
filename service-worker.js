/* ============================================================
   service-worker.js — Cache del app shell para uso offline.
   Estrategia: cache-first para los recursos estáticos del shell,
   con actualización en segundo plano (stale-while-revalidate).
   Las rutas se resuelven relativas a la ubicación del SW para
   funcionar bajo subdirectorios (GitHub Pages).
   ============================================================ */

const CACHE = 'gym-tracker-v22';

// Base = directorio donde vive el service worker.
const BASE = self.location.pathname.replace(/service-worker\.js$/, '');

const ASSETS = [
  '',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/router.js',
  'js/db.js',
  'js/store.js',
  'js/utils.js',
  'js/theme.js',
  'js/prefs.js',
  'js/views/home.js',
  'js/views/session.js',
  'js/views/exercises.js',
  'js/views/groups.js',
  'js/views/reports.js',
  'js/views/calendar.js',
  'js/views/weight.js',
  'js/views/calculator.js',
  'js/views/settings.js',
  'icons/icon.svg',
  'icons/maskable.svg',
].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] precache falló', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Solo gestionamos peticiones del mismo origen.
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, cae a index.html cacheado (SPA offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(BASE + 'index.html'))
    );
    return;
  }

  // Recursos estáticos: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
