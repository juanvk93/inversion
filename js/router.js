/* ============================================================
   router.js — Router hash sencillo con soporte de parámetros.
   Rutas: '#/', '#/session/:id', '#/exercises', etc.
   ============================================================ */

const routes = [];
let notFoundHandler = null;
let currentRoute = null;

/** Registra una ruta. pattern usa ':param' para segmentos dinámicos. */
export function route(pattern, handler, meta = {}) {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ pattern, parts, handler, meta });
}

export function setNotFound(handler) { notFoundHandler = handler; }

function parseHash() {
  let hash = location.hash || '#/';
  if (!hash.startsWith('#')) hash = '#' + hash;
  const path = hash.slice(1) || '/';
  return path.split('/').filter(Boolean); // ['session','abc'] etc.
}

function match(segs) {
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) { ok = false; break; }
    }
    if (ok) return { r, params };
  }
  return null;
}

async function resolve() {
  const segs = parseHash();
  const m = match(segs);
  const ctx = { params: m ? m.params : {}, path: '#/' + segs.join('/') };
  currentRoute = ctx.path;
  if (m) {
    await m.r.handler(ctx);
  } else if (notFoundHandler) {
    await notFoundHandler(ctx);
  }
  window.dispatchEvent(new CustomEvent('route:changed', { detail: ctx }));
  window.scrollTo(0, 0);
}

export function navigate(path) {
  if (location.hash === path) resolve();
  else location.hash = path;
}

export function getCurrentRoute() { return currentRoute; }

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  if (!location.hash) location.replace('#/');
  resolve();
}
