import { invalidateStatsCache } from "./calc.js";
import { COLORES, DB_KV, ENTRADAS_INIT, ETF_PROVIDERS, PRODUCTOS_INIT, STORE_K_E, STORE_K_P, STORE_K_SNAP } from "./config.js";
import { _cryptoKey, _locked, decryptValue, encryptValue, setLocked } from "./crypto.js";
import { ConflictoError, dbGet, dbWriteRev } from "./db.js";
import { avisar } from "./dialog.js";
import { promptUnlock } from "./seguridad.js";
import { anunciarGuardado, desfasada, marcarDesfasada, revActual, setRev } from "./sincro.js";
import { $ } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// 3. STATE · STORAGE
// ═══════════════════════════════════════════════════════════════════════════

export const state = {
  productos:      [],
  entradas:       {},
  objetivos:      [],
  tab:            "total",
  horizonte:      20,
  aportMensual:   null,
  filtroPeriodo:  "all",
  proyProductos:  null,
  ultimaCartera:  null,    // última pestaña de Total/producto (botón "Cartera" de la barra)
  fireGasto:      2000,    // gasto mensual deseado para FIRE
  fireRegla:      0.04,    // regla de retirada (3%/3.5%/4%/5%)   // { [id]: boolean } — visibilidad en gráfico proyección
  inflacion:      0.025,   // tasa de inflación anual para valores en € reales (proyección/FIRE)
  editEntradaId:  null,
  cierre:         null,    // borrador de la vista Cierre de mes (solo en memoria)
  editProdId:     null,
  productoColor:  COLORES[0],
  lastSnapshot:   null,
  lastExport:     null,   // ISO de la última copia que salió del navegador (descarga/compartir)
  logros:         {},      // { [logroId]: "YYYY-MM-DD" } — fecha de desbloqueo
  tiposCambio:    {},      // { USD: { "YYYY-MM": EUR por unidad } } — divisas.js (caché en el KV, no es estado del usuario)
  // Vistas avanzadas
  asignacionAporte: 0,           // simulador de aportación en Asignación
  diffSnapA:       null,         // id del snapshot A
  diffSnapB:       "current",    // id del snapshot B o "current"
  fiscalSim:       {},           // { [productoId]: { venderEur: number } }
  benchmarkSymbol:  "EUNL.DE",   // índice de referencia activo (ver BENCHMARKS)
  // Configuración
  etfProvider:      "twelvedata", // "twelvedata" | "yahoo"
  twelveDataApiKey: "",          // API key para precios de ETFs vía Twelve Data
};

// Caché de precios (no persiste — solo en memoria)
export const priceCache = {};          // { coingeckoId: { eur, ts } }
export const priceFetching = {};       // { coingeckoId: Promise } — evita duplicados
export const twelveDataCache    = {};       // { ticker: { eur, ts, currency } }
export const twelveDataFetching = {};
export const yahooCache    = {};       // { ticker: { eur, ts, currency } }
export const yahooFetching = {};
export const benchmarkCache    = {};   // { symbol: { serie:{YYYY-MM:close}, currency, last, ts } | { error, ts } }
export const benchmarkFetching = {};

export const charts = {};

// localStorage puede lanzar (Safari con almacenamiento bloqueado / modo privado)
export const lsGet = (k)    => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin persistencia */ } };
export const lsDel = (k)    => { try { localStorage.removeItem(k); } catch { /* sin persistencia */ } };

function migrarEntrada(e) {
  if (e.manual !== undefined || e.saveback !== undefined || e.roundup !== undefined) {
    return {
      ...e,
      manual:    e.manual    ?? 0,
      saveback:  e.saveback  ?? 0,
      roundup:   e.roundup   ?? 0,
      dividendo: e.dividendo ?? 0,
      nota:      e.nota       ?? "",
    };
  }
  return { ...e, manual: e.aportacion || 0, saveback: 0, roundup: 0, dividendo: e.dividendo || 0, nota: e.nota || "" };
}

export let _arranqueVacio = false;   // IndexedDB vacío al arrancar (p. ej. tras borrar los datos del navegador)

export async function loadState() {
  try {
    // 0. Si la BD está cifrada, pedir passphrase antes de leer
    const encMeta = await dbGet(DB_KV, "encMeta");
    if (encMeta?.enabled) {
      const ok = await promptUnlock(encMeta);
      if (!ok) {
        // Usuario canceló: bloqueamos la app para NO sobrescribir los datos
        // cifrados con texto plano en un guardado posterior.
        setLocked(true);
        state.productos = [];
        state.entradas  = {};
        state.objetivos = [];
        avisar("Datos bloqueados. Recarga la página para introducir la passphrase.");
        return;
      }
    }

    // Revisión ANTES de leer los datos: si otra ventana guarda entre medias, el
    // primer guardado de esta detecta el conflicto en vez de pisar sus cambios
    setRev(await dbGet(DB_KV, "rev"));

    // Lectura tolerante para campos secundarios: si uno está corrupto (o quedó
    // cifrado sin clave activa) no debe impedir cargar la cartera principal.
    const safeRead = async (key) => {
      try { return await readField(key); }
      catch (err) { console.warn(`[Cartera] No se pudo leer el campo "${key}"`, err); return undefined; }
    };

    // 1. Intentar leer de IndexedDB (descifrando si hay clave activa)
    const productosDB = await readField("productos");
    const entradasDB  = await readField("entradas");

    if (productosDB !== undefined || entradasDB !== undefined) {
      state.productos = productosDB || PRODUCTOS_INIT;
      const ents = entradasDB || {};
      state.entradas  = Object.fromEntries(Object.entries(ents).map(([k, list]) => [k, (Array.isArray(list) ? list : []).map(migrarEntrada)]));
      state.objetivos = ((await safeRead("objetivos")) || []).map(o =>
        o.productoId === "total" ? { ...o, productoId: null } : o
      );
      const firePrefs = await safeRead("firePrefs");
      if (firePrefs) {
        if (firePrefs.gasto != null) state.fireGasto = firePrefs.gasto;
        if (firePrefs.regla != null) state.fireRegla = firePrefs.regla;
        if (firePrefs.inflacion != null) state.inflacion = firePrefs.inflacion;
      }
      const tdKey = await safeRead("twelveDataApiKey");
      if (typeof tdKey === "string") state.twelveDataApiKey = tdKey;
      const etfProv = await safeRead("etfProvider");
      if (ETF_PROVIDERS.includes(etfProv)) state.etfProvider = etfProv;
      const bench = await safeRead("benchmarkSymbol");
      if (typeof bench === "string" && bench) state.benchmarkSymbol = bench;
      const logros = await safeRead("logros");
      if (logros && typeof logros === "object") state.logros = logros;
      // La copia antigua de localStorage ya se migró: borrarla. Si no, seguía ahí
      // para siempre, en claro aunque se active el cifrado.
      lsDel(STORE_K_P);
      lsDel(STORE_K_E);
      // Migración: twelveDataTicker → etfTicker (campo genérico)
      state.productos.forEach(p => {
        if (p.twelveDataTicker && !p.etfTicker) p.etfTicker = p.twelveDataTicker;
        delete p.twelveDataTicker;
      });
    } else {
      // 2. Primer arranque con IndexedDB: migrar desde localStorage si existe.
      // Try/catch propio: un JSON legado corrupto no debe bloquear la app para
      // siempre (IndexedDB seguiría vacío y fallaría en cada arranque).
      let p = null, e = null;
      try {
        p = JSON.parse(lsGet(STORE_K_P) || "null");
        e = JSON.parse(lsGet(STORE_K_E) || "null");
        if (p != null && !Array.isArray(p)) p = null;
        if (e != null && typeof e !== "object") e = null;
      } catch (err) {
        console.warn("[Cartera] Datos legados de localStorage corruptos; se ignoran", err);
        avisar("Los datos antiguos guardados en este navegador están dañados y no se han podido migrar. La app arranca vacía.");
        p = e = null;
      }
      if (p || e) {
        console.info("[Cartera] Migrando datos de localStorage → IndexedDB");
        state.productos = p || PRODUCTOS_INIT;
        const ents = e || ENTRADAS_INIT;
        state.entradas = Object.fromEntries(Object.entries(ents).map(([k, list]) => [k, (Array.isArray(list) ? list : []).map(migrarEntrada)]));
      } else {
        state.productos = PRODUCTOS_INIT;
        state.entradas  = ENTRADAS_INIT;
        _arranqueVacio  = true;
      }
      saveState();   // fire-and-forget, persiste a IndexedDB
    }

    state.lastSnapshot = (await dbGet(DB_KV, "lastSnapshot")) || lsGet(STORE_K_SNAP) || null;
    state.lastExport   = (await dbGet(DB_KV, "lastExport")) || null;
  } catch (err) {
    // Fallo leyendo la cartera principal: bloqueamos las escrituras para NO
    // sobrescribir con estado vacío los datos que sí siguen en IndexedDB.
    console.error("[Cartera] Error cargando estado — modo solo lectura", err);
    setLocked(true);
    state.productos = [];
    state.entradas  = {};
    state.objetivos = [];
    avisar("Error al cargar los datos guardados. La app queda en modo solo lectura para protegerlos; recarga la página para reintentar.");
  }
  state.tab = state.productos[0]?.id || "total";
}

// Lee un campo del KV, descifrándolo si _cryptoKey está activa.
async function readField(key) {
  const raw = await dbGet(DB_KV, key);
  if (raw === undefined) return undefined;
  if (raw?.__enc) {
    if (!_cryptoKey) throw new Error("Campo cifrado sin clave activa");
    return decryptValue(raw, _cryptoKey);
  }
  return raw;
}

// Campos persistidos del estado, como pares [clave KV, valor].
export function stateFieldPairs() {
  return [
    ["productos",        state.productos],
    ["entradas",         state.entradas],
    ["objetivos",        state.objetivos],
    ["firePrefs",        { gasto: state.fireGasto, regla: state.fireRegla, inflacion: state.inflacion }],
    ["twelveDataApiKey", state.twelveDataApiKey || ""],
    ["etfProvider",      state.etfProvider || "twelvedata"],
    ["benchmarkSymbol",  state.benchmarkSymbol || "EUNL.DE"],
    ["logros",           state.logros || {}],
  ];
}

// Cifra (si hay clave) los pares antes de abrir la transacción: IndexedDB
// auto-confirma la transacción en cuanto se cede el control a una promesa.
export async function encodePairs(pairs, key) {
  return Promise.all(pairs.map(async ([k, v]) => [k, key ? await encryptValue(v, key) : v]));
}

export const LOCKED_MSG = "Datos bloqueados: los cambios no se guardarán. Recarga la página e introduce la passphrase.";
// Guarda para acciones que modifican datos: en modo bloqueado avisa y aborta
// (antes parecían funcionar y se perdían al recargar).
export const DESFASADA_MSG = "Esta ventana tiene datos antiguos: la app se ha usado en otra ventana. Recarga para ver los datos actuales.";
export function bloqueado() {
  if (_locked) { avisar(LOCKED_MSG); return true; }
  if (desfasada()) { avisar(DESFASADA_MSG); return true; }
  return false;
}

// Cola de escritura: serializa los saveState (y las operaciones de cifrado)
// para evitar carreras. Todos los campos se escriben en UNA transacción.
let _saveQueue = Promise.resolve();
export function saveState() {
  // En estado bloqueado (cifrado sin desbloquear) no escribimos: evitaría
  // pisar los blobs cifrados con texto plano del estado vacío en memoria.
  if (_locked) { showSaveError(LOCKED_MSG); return _saveQueue; }
  // Otra ventana guardó después: escribir aquí pisaría sus cambios (ver sincro.js)
  if (desfasada()) { showSaveError(DESFASADA_MSG); return _saveQueue; }
  invalidateStatsCache();
  _saveQueue = _saveQueue
    .then(async () => {
      const pares = await encodePairs(stateFieldPairs(), _cryptoKey);
      anunciarGuardado(await dbWriteRev(pares, revActual()));
      hideSaveError();
    })
    .catch(err => {
      if (err instanceof ConflictoError) {
        showSaveError(DESFASADA_MSG);
        avisar("El último cambio no se ha guardado: la app está abierta en otra ventana que guardó después. Recarga para ver los datos actuales y repítelo.");
        marcarDesfasada();
        return;
      }
      console.error("[Cartera] Error guardando estado", err);
      showSaveError(err?.message || "error al guardar");
    });
  return _saveQueue;
}

// Encola una operación de escritura arbitraria tras los guardados pendientes.
// Devuelve su promesa (con su error, si lo hay) sin romper la cola.
export function enqueueWrite(fn) {
  const run = _saveQueue.then(fn);
  _saveQueue = run.catch(() => {});
  return run;
}


export function flash() {
  const el = $("#saved");
  if (!el || _locked || desfasada()) return;   // no se guarda nada: no mostrar "guardado"
  el.style.display = "inline";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 2000);
}

export function showSaveError(msg) {
  const el = $("#saveError");
  if (!el) return;
  el.title = msg || "";
  el.textContent = _locked ? "🔒 bloqueado · sin guardar" : "⚠ error al guardar";
  el.style.display = "inline";
}
function hideSaveError() {
  const el = $("#saveError");
  if (el) el.style.display = "none";
}
