/* MI CARTERA · Service Worker
   Estrategia:
   - Assets propios: pre-caché por versión en install (saltándose la caché HTTP)
     y servidos solo desde ella. Una versión nueva = CACHE nuevo; queda en espera
     hasta que el usuario pulsa RECARGAR en el aviso (js/version.js).
   - CDN externos (Chart.js, Google Fonts): stale-while-revalidate, cacheados bajo
     demanda solo si la respuesta es correcta (ok, no opaca) */

const CACHE = "cartera-v95";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/atras.js",
  "./js/bindings.js",
  "./js/calc.js",
  "./js/charts.js",
  "./js/config.js",
  "./js/crypto.js",
  "./js/db.js",
  "./js/dialog.js",
  "./js/divisas.js",
  "./js/drawer.js",
  "./js/io/backup.js",
  "./js/io/csv.js",
  "./js/io/json.js",
  "./js/logros.js",
  "./js/main.js",
  "./js/modals/calc.js",
  "./js/modals/changelog.js",
  "./js/modals/entrada.js",
  "./js/modals/objetivos.js",
  "./js/modals/producto.js",
  "./js/pdf.js",
  "./js/precios.js",
  "./js/seguridad.js",
  "./js/shortcuts.js",
  "./js/sincro.js",
  "./js/snapshots.js",
  "./js/state.js",
  "./js/tema.js",
  "./js/utils.js",
  "./js/version.js",
  "./js/views/asignacion.js",
  "./js/views/benchmark.js",
  "./js/views/cierre.js",
  "./js/views/config.js",
  "./js/views/diff.js",
  "./js/views/fire.js",
  "./js/views/fiscal.js",
  "./js/views/producto.js",
  "./js/views/proyeccion.js",
  "./js/views/render.js",
  "./js/views/resumen.js",
  "./js/views/wrapped.js",
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
  // Pages manda max-age=600): evita guardar un index.html nuevo con módulos js/ viejos.
  // Sin catch: si falla algún asset, la instalación falla y sigue activo el SW
  // anterior con su caché completa (antes se activaba con la caché vacía).
  // Sin skipWaiting: la versión nueva espera a que el usuario pulse RECARGAR en
  // el aviso (js/version.js); activarla con la página abierta mezclaba versiones.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
  );
});

// El aviso "Nueva versión · RECARGAR" pide activar la versión en espera
self.addEventListener("message", (e) => {
  if (e.data?.tipo === "activar") self.skipWaiting();
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

  // Assets propios: solo desde la pre-caché de ESTA versión, sin revalidar.
  // Antes la revalidación metía archivos de la versión nueva en la caché de la
  // vieja y el siguiente arranque podía mezclar index.html nuevo con módulos
  // viejos. Las versiones nuevas llegan enteras con un SW nuevo (CACHE).
  if (sameOrigin) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: req.mode === "navigate" })
        || (req.mode === "navigate" ? await caches.match("./index.html") : undefined);
      return cached || fetch(req);
    })());
    return;
  }

  // CDN y fuentes: stale-while-revalidate
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
    const cached = await caches.match(req);
    return cached || fromNetwork;
  })());
});
