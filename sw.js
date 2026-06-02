/* MI CARTERA · Service Worker
   Estrategia: cache-first con revalidación en segundo plano (stale-while-revalidate).
   - Pre-caché de assets locales en install
   - CDN externos (Chart.js, Google Fonts) se cachean bajo demanda */

const CACHE = "cartera-v67";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
];

// Hosts externos cuyos assets SÍ queremos cachear para uso offline (CDN/fuentes).
// El resto de orígenes (APIs de precios) NO se interceptan: van siempre a red,
// evitando servir cotizaciones obsoletas y almacenar URLs con API key en caché.
const CACHEABLE_HOSTS = new Set([
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

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

  // Solo cacheamos assets propios (mismo origen) y los CDN/fuentes conocidos.
  // Las llamadas a APIs de precios (CoinGecko, Twelve Data, Yahoo, proxies CORS)
  // se dejan pasar a la red sin interceptar: así no se sirven precios obsoletos
  // desde caché ni se almacena la URL con la API key.
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || CACHEABLE_HOSTS.has(url.hostname);
  if (!cacheable) return;

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
