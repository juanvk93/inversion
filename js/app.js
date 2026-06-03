/* ============================================================
   app.js — Punto de entrada.
   Inicializa tema, router, vistas, cabecera, tabbar y el
   service worker. Orquesta el renderizado de cada vista.
   ============================================================ */

import { route, setNotFound, startRouter, navigate, getCurrentRoute } from './router.js';
import { qs, qsa, el, esc } from './utils.js';
import { setTheme, getTheme } from './theme.js';
import * as store from './store.js';

// Vistas
import { home } from './views/home.js';
import { session, sessionSummary } from './views/session.js';
import { exercises } from './views/exercises.js';
import { groups } from './views/groups.js';
import { reports } from './views/reports.js';
import { calendar } from './views/calendar.js';
import { weight } from './views/weight.js';
import { calculator } from './views/calculator.js';
import { settings } from './views/settings.js';

const viewHost = qs('#view');
const titleEl = qs('#app-title');
const backBtn = qs('#back-btn');

let backTarget = false; // ruta de retroceso o false

/** Renderiza el resultado de una vista en el DOM. */
async function renderView(producer, ctx) {
  viewHost.innerHTML = '<div class="spinner"></div>';
  try {
    const result = await producer(ctx);
    titleEl.textContent = result.title || 'Gym Tracker';
    backTarget = result.back || false;
    backBtn.hidden = !backTarget;
    viewHost.innerHTML = '';
    viewHost.appendChild(result.node);
  } catch (err) {
    console.error(err);
    viewHost.innerHTML = '';
    viewHost.appendChild(el('<div class="empty"><p>Algo salió mal.</p><p class="faint">' + esc(err?.message || '') + '</p></div>'));
  }
}

/** Marca la pestaña activa de la tabbar. */
function syncTabbar() {
  const cur = getCurrentRoute() || '#/';
  qsa('.tab').forEach((tab) => {
    const r = tab.dataset.route;
    let active = false;
    if (r === '#/') active = cur === '#/' || cur.startsWith('#/session');
    else if (r === '#/settings') active = cur === '#/settings' || ['#/exercises', '#/groups', '#/weight', '#/calculator'].includes(cur);
    else active = cur === r;
    tab.classList.toggle('active', active);
  });
}

/* ---------------- Rutas ---------------- */
route('/', (ctx) => renderView(home, ctx));
route('/session/:id', (ctx) => renderView(session, ctx));
route('/session/:id/summary', (ctx) => renderView(sessionSummary, ctx));
route('/exercises', (ctx) => renderView(exercises, ctx));
route('/groups', (ctx) => renderView(groups, ctx));
route('/reports', (ctx) => renderView(reports, ctx));
route('/calendar', (ctx) => renderView(calendar, ctx));
route('/weight', (ctx) => renderView(weight, ctx));
route('/calculator', (ctx) => renderView(calculator, ctx));
route('/settings', (ctx) => renderView(settings, ctx));
setNotFound((ctx) => renderView(async () => ({
  title: 'No encontrado', back: '#/',
  node: el('<div class="empty"><p>Página no encontrada.</p></div>'),
}), ctx));

window.addEventListener('route:changed', syncTabbar);

/* ---------------- Cabecera ---------------- */
backBtn.onclick = () => {
  if (typeof backTarget === 'string') navigate(backTarget);
  else history.back();
};

/* ---------------- Service Worker ---------------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Ruta relativa para funcionar bajo subdirectorios (GitHub Pages).
  const swUrl = new URL('./service-worker.js', window.location.href);
  navigator.serviceWorker.register(swUrl.pathname).catch((e) => console.warn('SW no registrado', e));
}

/* ---------------- Arranque ---------------- */
async function init() {
  setTheme(getTheme());
  await store.seedIfEmpty();
  await store.migrate();
  startRouter();
  syncTabbar();
  registerSW();
}

init();
