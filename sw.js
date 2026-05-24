/* MI CARTERA · Service Worker
   Estrategia: cache-first con revalidación en segundo plano (stale-while-revalidate).
   - Pre-caché de assets locales en install
   - CDN externos (Chart.js, Google Fonts) se cachean bajo demanda */

const CACHE = "cartera-v31";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then(cached => {
      const fromNetwork = fetch(req).then(resp => {
        if (resp && (resp.status === 200 || resp.type === "opaque")) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);

      return cached || fromNetwork;
    })
  );
});
