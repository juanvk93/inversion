import { invalidateStatsCache } from "./calc.js";
import { DB_KV } from "./config.js";
import { dbGet, dbPut } from "./db.js";
import { state } from "./state.js";
import { fetchWithTimeout, hoy } from "./utils.js";
import { render } from "./views/render.js";

// ═══════════════════════════════════════════════════════════════════════════
// DIVISAS · tipos de cambio mensuales a EUR (BCE vía Frankfurter)
// ═══════════════════════════════════════════════════════════════════════════

// Antes la divisa de un producto era solo una etiqueta y el Total sumaba
// dólares como si fueran euros. Ahora se cargan los tipos de cambio del BCE
// (api.frankfurter.app, gratis y sin clave) desde el primer mes con entradas y
// se guarda el último tipo de cada mes en state.tiposCambio, que usa calc.js.
// Caché en el KV ("tiposCambio", fuera de la revisión de sincro.js: no son datos
// del usuario) para funcionar sin conexión.

const API = "https://api.frankfurter.app";
const TTL = 12 * 60 * 60 * 1000;   // los tipos del BCE se publican una vez al día
const REINTENTO = 10 * 60 * 1000;    // tras un fallo (o sin el mes en curso), no insistir en cada render
let _cargando = null;
const _ultimoIntento = {};

// Divisas en uso y primer mes con entradas de cada una
function divisasEnUso() {
  const usadas = {};
  state.productos.forEach(p => {
    const d = (p.divisa || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(d) || d === "EUR") return;
    const primera = (state.entradas[p.id] || []).map(e => e.fecha).sort()[0];
    if (primera && (!usadas[d] || primera < usadas[d])) usadas[d] = primera;
  });
  return usadas;
}

// { "2025-01-31": { EUR: 0.96 }, … } → { "2025-01": 0.96, … } (último del mes)
function porMes(rates) {
  const out = {};
  Object.keys(rates || {}).sort().forEach(dia => {
    const v = rates[dia]?.EUR;
    if (Number.isFinite(v) && v > 0) out[dia.slice(0, 7)] = v;
  });
  return out;
}

async function descargar(divisa, desdeMes) {
  const r = await fetchWithTimeout(`${API}/${desdeMes}-01..?from=${encodeURIComponent(divisa)}&to=EUR`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const meses = porMes((await r.json())?.rates);
  if (!Object.keys(meses).length) throw new Error("Sin tipos de cambio");
  return meses;
}

// En cada render (barato: sale enseguida si no hay divisas o está todo al día):
// usa la caché y, si falta una divisa o un mes o ha caducado, descarga y repinta.
export function cargarTiposCambio() {
  if (_cargando) return _cargando;
  _cargando = (async () => {
    const usadas = divisasEnUso();
    if (!Object.keys(usadas).length) return;
    const cache = (await dbGet(DB_KV, "tiposCambio").catch(() => null)) || { tipos: {}, desde: {}, ts: 0 };
    let cambio = false;
    // Lo que haya en caché sirve ya (también sin conexión)
    for (const d of Object.keys(usadas)) {
      if (cache.tipos[d] && !state.tiposCambio[d]) { state.tiposCambio[d] = cache.tipos[d]; cambio = true; }
    }
    const caducada = Date.now() - (cache.ts || 0) > TTL;
    for (const [d, desde] of Object.entries(usadas)) {
      const cubre = cache.tipos[d] && cache.desde[d] <= desde && cache.tipos[d][hoy()] != null;
      if (cubre && !caducada) continue;
      if (Date.now() - (_ultimoIntento[d] || 0) < REINTENTO) continue;
      _ultimoIntento[d] = Date.now();
      try {
        cache.tipos[d] = await descargar(d, desde);
        cache.desde[d] = desde;
        state.tiposCambio[d] = cache.tipos[d];
        cambio = true;
      } catch (err) {
        console.warn(`[Cartera] Tipo de cambio ${d} no disponible`, err);
      }
    }
    if (cambio) {
      cache.ts = Date.now();
      dbPut(DB_KV, cache, "tiposCambio").catch(() => { /* no crítico */ });
      invalidateStatsCache();
      render();
    }
  })().finally(() => { _cargando = null; });
  return _cargando;
}
