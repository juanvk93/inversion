/* MI CARTERA · Service Worker
   Estrategia: cache-first con revalidación en segundo plano (stale-while-revalidate).
   - Pre-caché de assets locales en install (saltándose la caché HTTP)
   - CDN externos (Chart.js, Google Fonts) se cachean bajo demanda, solo si la
     respuesta es correcta (ok, no opaca) */

const CACHE = "cartera-v79";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
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
  // cache: "reload" → pide los assets a la red saltándose la caché HTTP (GitHub
  // Pages manda max-age=600): evita guardar un index.html nuevo con un app.js viejo.
  // Sin catch: si falla algún asset, la instalación falla y sigue activo el SW
  // anterior con su caché completa (antes se activaba con la caché vacía).
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
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
  // Las llamadas a APIs de precios (CoinGecko, Twelve Data, proxies CORS de Yahoo)
  // se dejan pasar a la red sin interceptar: así no se sirven precios obsoletos
  // desde caché ni se almacena la URL con la API key.
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.has(url.hostname)) return;

  const fromNetwork = fetch(req).then(async (resp) => {
    // Solo respuestas correctas: una opaca (status 0) puede ser un 404/5xx del CDN
    // y además consume ~7 MB de cuota cada una en Chrome.
    if (resp && resp.ok && resp.type !== "opaque") {
      const cache = await caches.open(CACHE);
      await cache.put(req, resp.clone());
    }
    return resp;
  });

  // La revalidación en segundo plano debe completarse aunque ya hayamos
  // respondido desde caché: sin waitUntil el navegador puede matar el SW antes.
  e.waitUntil(fromNetwork.then(() => {}, () => {}));

  e.respondWith((async () => {
    // Navegaciones con query (?utm=…) → misma página cacheada
    const cached = await caches.match(req, { ignoreSearch: req.mode === "navigate" })
      || (req.mode === "navigate" && sameOrigin ? await caches.match("./index.html") : undefined);
    if (cached) return cached;
    try { return await fromNetwork; }
    catch (err) {
      if (req.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
