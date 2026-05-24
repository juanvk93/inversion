/* ═══════════════════════════════════════════════════════════════════════════
   MI CARTERA · app.js
   Aplicación de seguimiento de cartera personal de inversiones.
   Todo el código vive dentro de un IIFE para no contaminar el global scope.
   Organización (busca con ctrl-F las cabeceras):
     1. CONFIG       — constantes, datos iniciales
     2. UTILS        — helpers genéricos (formato, fechas, DOM)
     3. STATE        — estado global de la app, persistencia
     4. CALCS        — lógica financiera (stats, TIR, proyección, agrupación)
     5. CSV          — import/export
    5b. SNAPSHOTS    — puntos de restauración y recordatorio
     6. CHARTS       — Chart.js helpers y configuración
     7. RENDER       — todas las vistas
     8. MODALS       — modales de entrada y producto
     9. DRAWER       — panel lateral
    10. SHORTCUTS    — atajos de teclado
    11. BINDINGS     — event listeners
    12. INIT         — arranque
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const MESES   = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COLORES = ["#60A5FA","#F97316","#A78BFA","#6EE7B7","#F472B6","#FBBF24","#34D399","#FB7185"];
const TIPOLOGIAS = ["ETF", "Fondo Indexado", "Fondo de Inversión", "Criptomoneda", "Acción", "Bono", "Materia Prima", "Inmobiliario", "Cuenta Remunerada", "Otro"];
const DIVISAS    = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD"];

// Claves de localStorage (legado — se migran a IndexedDB en el primer arranque)
const STORE_K_P     = "cartera_html_productos";
const STORE_K_E     = "cartera_html_entradas";
const STORE_K_SNAP  = "cartera_html_last_snapshot";  // timestamp ISO

// IndexedDB
const DB_NAME = "cartera-db";
const DB_VER  = 1;
const DB_KV   = "kv";          // clave→valor (productos, entradas, lastSnapshot, …)
const DB_SNAP = "snapshots";   // snapshots por timestamp

const SNAP_REMINDER_DAYS = 7;
const SNAP_MAX           = 20;   // máximo de snapshots in-app (los más antiguos se descartan)

// CoinGecko
const COINGECKO_BASE = "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_TTL  = 5 * 60 * 1000;   // 5 minutos de caché

// Tramos IRPF 2026 (renta del ahorro, modelo D-100)
const FISCAL_TRAMOS_2026 = [
  { hasta:    6000, tipo: 0.19 },
  { hasta:   50000, tipo: 0.21 },
  { hasta:  200000, tipo: 0.23 },
  { hasta:  300000, tipo: 0.27 },
  { hasta: Infinity, tipo: 0.28 },
];

const PRODUCTOS_INIT = [
  { id: "etf", nombre: "MSCI World", referencia: "IE00B4L5Y983 · Acc · EUR", color: "#60A5FA" },
  { id: "btc", nombre: "Bitcoin",    referencia: "BTC · Kraken · EUR",        color: "#F97316" },
];

const ENTRADAS_INIT = {
  etf: [
    { id: 1,  fecha: "2024-01", manual: 290, saveback: 10, roundup: 0, valor: 310,  nota: "" },
    { id: 2,  fecha: "2024-02", manual: 280, saveback: 15, roundup: 5, valor: 640,  nota: "" },
    { id: 3,  fecha: "2024-03", manual: 290, saveback: 8,  roundup: 2, valor: 980,  nota: "" },
    { id: 4,  fecha: "2024-04", manual: 290, saveback: 7,  roundup: 3, valor: 1250, nota: "" },
    { id: 5,  fecha: "2024-05", manual: 300, saveback: 15, roundup: 5, valor: 1600, nota: "Subida tech" },
    { id: 6,  fecha: "2024-06", manual: 295, saveback: 12, roundup: 3, valor: 1870, nota: "" },
    { id: 7,  fecha: "2024-07", manual: 285, saveback: 12, roundup: 3, valor: 2150, nota: "" },
    { id: 8,  fecha: "2024-08", manual: 290, saveback: 8,  roundup: 2, valor: 2380, nota: "" },
    { id: 9,  fecha: "2024-09", manual: 290, saveback: 7,  roundup: 3, valor: 2690, nota: "" },
    { id: 10, fecha: "2024-10", manual: 310, saveback: 15, roundup: 5, valor: 3020, nota: "Aporte extra bonus" },
    { id: 11, fecha: "2024-11", manual: 290, saveback: 8,  roundup: 2, valor: 3280, nota: "" },
    { id: 12, fecha: "2024-12", manual: 290, saveback: 7,  roundup: 3, valor: 3540, nota: "" },
    { id: 13, fecha: "2025-01", manual: 295, saveback: 12, roundup: 3, valor: 3820, nota: "" },
    { id: 14, fecha: "2025-02", manual: 290, saveback: 7,  roundup: 3, valor: 4050, nota: "" },
    { id: 15, fecha: "2025-03", manual: 285, saveback: 12, roundup: 3, valor: 4180, nota: "Corrección de mercado" },
    { id: 16, fecha: "2025-04", manual: 300, saveback: 15, roundup: 5, valor: 4450, nota: "" },
  ],
  btc: [
    { id: 1,  fecha: "2024-01", manual: 95,  saveback: 5, roundup: 0, valor: 95,   nota: "" },
    { id: 2,  fecha: "2024-02", manual: 90,  saveback: 8, roundup: 2, valor: 230,  nota: "" },
    { id: 3,  fecha: "2024-03", manual: 95,  saveback: 4, roundup: 1, valor: 420,  nota: "" },
    { id: 4,  fecha: "2024-04", manual: 95,  saveback: 4, roundup: 1, valor: 510,  nota: "" },
    { id: 5,  fecha: "2024-05", manual: 110, saveback: 8, roundup: 2, valor: 680,  nota: "" },
    { id: 6,  fecha: "2024-06", manual: 100, saveback: 8, roundup: 2, valor: 720,  nota: "" },
    { id: 7,  fecha: "2024-07", manual: 95,  saveback: 4, roundup: 1, valor: 850,  nota: "" },
    { id: 8,  fecha: "2024-08", manual: 95,  saveback: 4, roundup: 1, valor: 790,  nota: "Mes bajista" },
    { id: 9,  fecha: "2024-09", manual: 95,  saveback: 4, roundup: 1, valor: 920,  nota: "" },
    { id: 10, fecha: "2024-10", manual: 110, saveback: 8, roundup: 2, valor: 1150, nota: "" },
    { id: 11, fecha: "2024-11", manual: 95,  saveback: 4, roundup: 1, valor: 1480, nota: "Rally pre-halving" },
    { id: 12, fecha: "2024-12", manual: 95,  saveback: 4, roundup: 1, valor: 1620, nota: "" },
    { id: 13, fecha: "2025-01", manual: 100, saveback: 8, roundup: 2, valor: 1750, nota: "" },
    { id: 14, fecha: "2025-02", manual: 95,  saveback: 4, roundup: 1, valor: 1590, nota: "Corrección" },
    { id: 15, fecha: "2025-03", manual: 95,  saveback: 4, roundup: 1, valor: 1820, nota: "" },
    { id: 16, fecha: "2025-04", manual: 110, saveback: 8, roundup: 2, valor: 2010, nota: "" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. UTILS
// ═══════════════════════════════════════════════════════════════════════════

const fmt        = (n, d = 2) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtE       = (n)        => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
const labelMes   = (ym)       => { const [y, m] = ym.split("-"); return `${MESES[+m-1]} ${y.slice(2)}`; };
const hoy        = ()         => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const aportTotal = (e)        => (e.manual || 0) + (e.saveback || 0) + (e.roundup || 0);
const esc        = (s)        => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const RESERVED_IDS = new Set(["total", "proyeccion"]);
const sanitizeId = (s) => {
  let out = String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  if (!out) out = `id_${Date.now()}`;
  if (RESERVED_IDS.has(out)) out = `prod_${out}`;
  return out;
};
const $          = (sel)      => document.querySelector(sel);
const $$         = (sel)      => Array.from(document.querySelectorAll(sel));

function debounce(fn, ms = 60) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2a. CRYPTO · cifrado local AES-GCM con clave derivada por PBKDF2
// ═══════════════════════════════════════════════════════════════════════════

const PBKDF2_ITER = 200_000;
let _cryptoKey = null;   // CryptoKey activa en memoria (null = sin cifrado)

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptValue(value, key) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const buf = new TextEncoder().encode(JSON.stringify(value));
  const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf);
  return { __enc: true, iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

async function decryptValue(blob, key) {
  if (!blob?.__enc) return blob;
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

function genSalt() { return crypto.getRandomValues(new Uint8Array(16)); }

// ═══════════════════════════════════════════════════════════════════════════
// 2b. INDEXEDDB · capa de persistencia
// ═══════════════════════════════════════════════════════════════════════════

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_KV))   db.createObjectStore(DB_KV);
      if (!db.objectStoreNames.contains(DB_SNAP)) db.createObjectStore(DB_SNAP, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(store, value, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readwrite");
    const os  = tx.objectStore(store);
    const req = key !== undefined ? os.put(value, key) : os.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. STATE · STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const state = {
  productos:      [],
  entradas:       {},
  objetivos:      [],
  tab:            "total",
  vistaAno:       false,
  horizonte:      20,
  aportMensual:   null,
  filtroPeriodo:  "all",
  proyProductos:  null,
  fireGasto:      2000,    // gasto mensual deseado para FIRE
  fireRegla:      0.04,    // regla de retirada (3%/3.5%/4%/5%)   // { [id]: boolean } — visibilidad en gráfico proyección
  editEntradaId:  null,
  editProdId:     null,
  productoColor:  COLORES[0],
  lastSnapshot:   null,
  // Vistas avanzadas
  asignacionAporte: 0,           // simulador de aportación en Asignación
  diffSnapA:       null,         // id del snapshot A
  diffSnapB:       "current",    // id del snapshot B o "current"
  fiscalSim:       {},           // { [productoId]: { venderEur: number } }
};

// Caché de precios (no persiste — solo en memoria)
const priceCache = {};          // { coingeckoId: { eur, ts } }
const priceFetching = {};       // { coingeckoId: Promise } — evita duplicados

const charts = {};

function migrarEntrada(e) {
  if (e.manual !== undefined || e.saveback !== undefined || e.roundup !== undefined) {
    return {
      ...e,
      manual:   e.manual   ?? 0,
      saveback: e.saveback ?? 0,
      roundup:  e.roundup  ?? 0,
      nota:     e.nota     ?? "",
    };
  }
  return { ...e, manual: e.aportacion || 0, saveback: 0, roundup: 0, nota: e.nota || "" };
}

async function loadState() {
  try {
    // 0. Si la BD está cifrada, pedir passphrase antes de leer
    const encMeta = await dbGet(DB_KV, "encMeta");
    if (encMeta?.enabled) {
      const ok = await promptUnlock(encMeta);
      if (!ok) {
        // Usuario canceló: dejamos state vacío y avisamos
        state.productos = [];
        state.entradas  = {};
        state.objetivos = [];
        return;
      }
    }

    // 1. Intentar leer de IndexedDB (descifrando si hay clave activa)
    const productosDB = await readField("productos");
    const entradasDB  = await readField("entradas");

    if (productosDB !== undefined || entradasDB !== undefined) {
      state.productos = productosDB || PRODUCTOS_INIT;
      const ents = entradasDB || {};
      state.entradas  = Object.fromEntries(Object.entries(ents).map(([k, list]) => [k, list.map(migrarEntrada)]));
      state.objetivos = ((await readField("objetivos")) || []).map(o =>
        o.productoId === "total" ? { ...o, productoId: null } : o
      );
      const firePrefs = await readField("firePrefs");
      if (firePrefs) {
        if (firePrefs.gasto != null) state.fireGasto = firePrefs.gasto;
        if (firePrefs.regla != null) state.fireRegla = firePrefs.regla;
      }
    } else {
      // 2. Primer arranque con IndexedDB: migrar desde localStorage si existe
      const p = JSON.parse(localStorage.getItem(STORE_K_P) || "null");
      const e = JSON.parse(localStorage.getItem(STORE_K_E) || "null");
      if (p || e) {
        console.info("[Cartera] Migrando datos de localStorage → IndexedDB");
        state.productos = p || PRODUCTOS_INIT;
        const ents = e || ENTRADAS_INIT;
        state.entradas = Object.fromEntries(Object.entries(ents).map(([k, list]) => [k, list.map(migrarEntrada)]));
      } else {
        state.productos = PRODUCTOS_INIT;
        state.entradas  = ENTRADAS_INIT;
      }
      saveState();   // fire-and-forget, persiste a IndexedDB
    }

    state.lastSnapshot = (await dbGet(DB_KV, "lastSnapshot")) || localStorage.getItem(STORE_K_SNAP) || null;
  } catch (err) {
    console.warn("[Cartera] Error cargando estado, usando datos iniciales", err);
    state.productos = PRODUCTOS_INIT;
    state.entradas  = ENTRADAS_INIT;
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

// Escribe un campo en el KV, cifrándolo si _cryptoKey está activa.
async function writeField(key, value) {
  if (_cryptoKey) {
    const blob = await encryptValue(value, _cryptoKey);
    await dbPut(DB_KV, blob, key);
  } else {
    await dbPut(DB_KV, value, key);
  }
}

// Cola de escritura: serializa los saveState para evitar carreras.
let _saveQueue = Promise.resolve();
function saveState() {
  invalidateStatsCache();
  _saveQueue = _saveQueue
    .then(async () => {
      await writeField("productos", state.productos);
      await writeField("entradas",  state.entradas);
      await writeField("objetivos", state.objetivos);
      await writeField("firePrefs", { gasto: state.fireGasto, regla: state.fireRegla });
      hideSaveError();
    })
    .catch(err => {
      console.error("[Cartera] Error guardando estado", err);
      showSaveError(err?.message || "error al guardar");
    });
  return _saveQueue;
}

// Espera a que se complete cualquier escritura pendiente. Útil antes de hacer
// snapshots para evitar capturar un estado obsoleto.
async function awaitSave() { try { await _saveQueue; } catch { /* ya lo logueó saveState */ } }

function flash() {
  const el = $("#saved");
  if (!el) return;
  el.style.display = "inline";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 2000);
}

function showSaveError(msg) {
  const el = $("#saveError");
  if (!el) return;
  el.title = msg || "";
  el.style.display = "inline";
}
function hideSaveError() {
  const el = $("#saveError");
  if (el) el.style.display = "none";
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CALCS
// ═══════════════════════════════════════════════════════════════════════════

function calcStats(entradas) {
  if (!entradas?.length) return [];
  let acum = 0, acumManual = 0, acumSaveback = 0, acumRoundup = 0, prevValor = null;
  return [...entradas].sort((a,b) => a.fecha.localeCompare(b.fecha)).map(e => {
    const ap = aportTotal(e);
    acum         += ap;
    acumManual   += (e.manual   || 0);
    acumSaveback += (e.saveback || 0);
    acumRoundup  += (e.roundup  || 0);
    const ganancia = e.valor - acum;
    const rentPct  = acum > 0 ? (ganancia / acum) * 100 : 0;
    let rentMes = null;
    if (prevValor !== null && prevValor > 0) {
      // Modified Dietz: ganancia / (valorInicial + aportación × 0,5)
      // Asume aportaciones a mediados del período → denominador más preciso
      const base = prevValor + ap * 0.5;
      rentMes = ((e.valor - ap - prevValor) / base) * 100;
    }
    prevValor = e.valor;
    return { ...e, aportacion: ap, acumAportado: acum, acumManual, acumSaveback, acumRoundup, ganancia, rentPct, rentMes, label: labelMes(e.fecha) };
  });
}

// Caché para statsTotalCalc — invalidada en saveState, render y restauración de snapshot.
let _statsTotalCache = null;
function invalidateStatsCache() { _statsTotalCache = null; }

function statsTotalCalc() {
  if (_statsTotalCache) return _statsTotalCache;

  // 1. Recopilar todas las fechas únicas y ordenarlas
  const fechasSet = new Set();
  state.productos.forEach(p => (state.entradas[p.id] || []).forEach(e => fechasSet.add(e.fecha)));
  const fechasOrd = [...fechasSet].sort();

  // 2. Indexar entradas por producto y fecha para acceso O(1)
  const idxPorProd = {};
  state.productos.forEach(p => {
    idxPorProd[p.id] = {};
    (state.entradas[p.id] || []).forEach(e => { idxPorProd[p.id][e.fecha] = e; });
  });

  // 3. Para cada fecha: sumar aportaciones del mes (solo si hay entrada ese mes)
  //    y valor de cartera usando CARRY-FORWARD del último valor conocido por producto.
  const lastValor = {};
  const filas = fechasOrd.map(fecha => {
    let manual = 0, saveback = 0, roundup = 0, valor = 0;
    state.productos.forEach(p => {
      const e = idxPorProd[p.id][fecha];
      if (e) {
        manual   += e.manual   || 0;
        saveback += e.saveback || 0;
        roundup  += e.roundup  || 0;
        lastValor[p.id] = e.valor || 0;
      }
      valor += lastValor[p.id] || 0;
    });
    return { id: fecha, fecha, manual, saveback, roundup, valor };
  });

  _statsTotalCache = calcStats(filas);
  return _statsTotalCache;
}

// Newton-Raphson XIRR para un guess inicial; null si no converge o no es razonable.
function _xirrSingle(days, amts, guess) {
  let r = guess;
  for (let i = 0; i < 80; i++) {
    let f = 0, df = 0;
    for (let j = 0; j < amts.length; j++) {
      const exp  = days[j] / 365;
      const base = 1 + r;
      if (base <= 0) { r = -0.999; break; }
      const v = amts[j] / Math.pow(base, exp);
      f  += v;
      df += -exp * v / base;
    }
    if (Math.abs(df) < 1e-12) return null;
    const rNew = r - f / df;
    if (!isFinite(rNew)) return null;
    if (Math.abs(rNew - r) < 1e-7) return rNew;
    r = rNew;
    if (r < -0.9999) r = -0.9999;
  }
  return null;
}

// Prueba varios guesses iniciales para robustez y filtra resultados absurdos.
function xirr(flows) {
  if (!flows || flows.length < 2) return null;
  const t0   = flows[0].date.getTime();
  const days = flows.map(f => (f.date.getTime() - t0) / 86400000);
  const amts = flows.map(f => f.amount);
  if (!amts.some(a => a > 0) || !amts.some(a => a < 0)) return null;

  const guesses = [0.1, 0.0, -0.1, 0.05, 0.3, -0.3, 0.5];
  for (const g of guesses) {
    const r = _xirrSingle(days, amts, g);
    // Cotas razonables: TIR entre −99% y +1000% anual (los valores fuera de aquí casi
    // siempre son artefactos numéricos, no realidades financieras).
    if (r != null && r > -0.999 && r < 10) return r;
  }
  return null;
}

function calcTIR(entradasOrd) {
  if (!entradasOrd?.length) return null;
  const flows = entradasOrd.map(e => {
    const [y, m] = e.fecha.split("-").map(Number);
    return { date: new Date(y, m - 1, 1), amount: -aportTotal(e) };
  });
  const ult = entradasOrd[entradasOrd.length - 1];
  const [y, m] = ult.fecha.split("-").map(Number);
  flows.push({ date: new Date(y, m - 1, 1), amount: ult.valor });
  return xirr(flows);
}

function calcProyeccion(valorInicial, aportacionMensual, anos, tasaAnual) {
  const tasaMensual = tasaAnual / 12;
  const meses       = anos * 12;
  const puntos      = [];
  let valor    = valorInicial;
  let aportado = valorInicial;
  const h = new Date();
  for (let m = 0; m <= meses; m++) {
    const fecha = new Date(h.getFullYear(), h.getMonth() + m, 1);
    if (m === 0 || fecha.getMonth() === 0 || m === meses) {
      puntos.push({
        label:    m === 0 ? "Hoy" : `${fecha.getFullYear()}`,
        valor:    Math.round(valor),
        aportado: Math.round(aportado)
      });
    }
    if (m < meses) {
      valor    = valor * (1 + tasaMensual) + aportacionMensual;
      aportado += aportacionMensual;
    }
  }
  return puntos;
}

function agruparPorAno(filas) {
  if (!filas?.length) return [];
  const map = {};
  filas.forEach(f => {
    const y = f.fecha.slice(0, 4);
    if (!map[y]) map[y] = { ano: y, aportadoAno: 0, valorFin: 0, ultimoAcum: 0, fechas: [] };
    map[y].aportadoAno += f.aportacion;
    map[y].valorFin     = f.valor;
    map[y].ultimoAcum   = f.acumAportado;
    map[y].fechas.push(f);
  });
  return Object.values(map).map(g => {
    const ganancia = g.valorFin - g.ultimoAcum;
    const rentPct  = g.ultimoAcum > 0 ? (ganancia / g.ultimoAcum) * 100 : 0;
    const vIni     = g.fechas[0].valor - g.fechas[0].aportacion;
    const rentAno  = vIni > 0 ? ((g.valorFin - g.aportadoAno - vIni) / vIni) * 100 : null;
    return { ...g, ganancia, rentPct, rentAno, meses: g.fechas.length };
  });
}

function calcMaxDrawdown(filas) {
  if (!filas || filas.length < 2) return null;
  let peak = -Infinity, maxDd = 0;
  for (const f of filas) {
    if (f.valor > peak) peak = f.valor;
    if (peak > 0) {
      const dd = (peak - f.valor) / peak * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

function calcVolatilidad(filas) {
  const rents = filas.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (rents.length < 3) return null;
  const mean = rents.reduce((s, v) => s + v, 0) / rents.length;
  const variance = rents.reduce((s, v) => s + (v - mean) ** 2, 0) / (rents.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

function calcSharpe(filas, tirAnual) {
  if (tirAnual == null) return null;
  const vol = calcVolatilidad(filas);
  if (!vol) return null;
  return (tirAnual * 100) / vol;
}

// Sortino: como Sharpe pero solo penaliza la desviación negativa.
// downside-deviation = sqrt(mean(min(r, 0)^2)) sobre rentabilidades mensuales (%).
function calcSortino(filas, tirAnual) {
  if (tirAnual == null) return null;
  const rents = filas.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (rents.length < 3) return null;
  const downsq = rents.map(r => r < 0 ? r * r : 0).reduce((s, v) => s + v, 0);
  const downDev = Math.sqrt(downsq / rents.length) * Math.sqrt(12);   // anualizada
  if (downDev === 0) return null;   // no hay meses negativos → indefinido
  return (tirAnual * 100) / downDev;
}

// Encuentra el mes con mayor rentabilidad positiva. Devuelve { rent, fecha } o null.
function calcMejorMes(filas) {
  let best = null;
  for (const f of filas) {
    if (f.rentMes == null) continue;
    if (!best || f.rentMes > best.rentMes) best = { rentMes: f.rentMes, fecha: f.fecha };
  }
  return best && best.rentMes > 0 ? best : best;   // devuelve incluso si es <=0 (mostrar "—" en UI si conviene)
}

// Encuentra el mes peor. Análogo a calcMejorMes pero por mínimo.
function calcPeorMes(filas) {
  let worst = null;
  for (const f of filas) {
    if (f.rentMes == null) continue;
    if (!worst || f.rentMes < worst.rentMes) worst = { rentMes: f.rentMes, fecha: f.fecha };
  }
  return worst;
}

// Racha máxima de meses consecutivos con rentabilidad positiva (rentMes > 0).
function calcRachaMaxPositiva(filas) {
  let max = 0, cur = 0;
  for (const f of filas) {
    if (f.rentMes == null) continue;
    if (f.rentMes > 0) { cur++; if (cur > max) max = cur; }
    else cur = 0;
  }
  return max;
}

// Media de la aportación total mensual (manual + saveback + roundup).
// Por defecto sobre los últimos N meses con dato; si N <= 0 usa toda la serie.
function calcAportacionMedia(filas, n = 3) {
  if (!filas.length) return null;
  const subset = n > 0 ? filas.slice(-n) : filas;
  if (!subset.length) return null;
  const total = subset.reduce((s, f) => s + (f.aportacion || 0), 0);
  return total / subset.length;
}

// % de la aportación acumulada que viene de Saveback + Round-up (vs Manual).
function calcDCAAutomatico(ultima) {
  if (!ultima) return null;
  const auto = (ultima.acumSaveback || 0) + (ultima.acumRoundup || 0);
  const tot  = ultima.acumAportado || 0;
  if (tot <= 0) return null;
  return (auto / tot) * 100;
}

// Box-Muller: muestra de N(0,1)
function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Simula `nSims` trayectorias con retornos normales N(mediaMensual, stdMensual).
// Devuelve array de trayectorias (cada una tiene meses+1 valores).
function simulateMonteCarlo({ valorInicial, aportMensual, meses, mediaMensual, stdMensual, nSims }) {
  const trayectorias = new Array(nSims);
  for (let s = 0; s < nSims; s++) {
    const path = new Float64Array(meses + 1);
    path[0] = valorInicial;
    let v = valorInicial;
    for (let m = 1; m <= meses; m++) {
      const ret = mediaMensual + stdMensual * randomNormal();
      v = v * (1 + ret) + aportMensual;
      if (v < 0) v = 0;   // cartera no puede ir bajo cero
      path[m] = v;
    }
    trayectorias[s] = path;
  }
  return trayectorias;
}

// Para cada mes, calcula los percentiles de las trayectorias.
function percentilesPorMes(trayectorias, percentiles) {
  const meses = trayectorias[0].length;
  const nSims = trayectorias.length;
  const buf   = new Float64Array(nSims);
  const out   = percentiles.map(() => new Array(meses));
  for (let m = 0; m < meses; m++) {
    for (let s = 0; s < nSims; s++) buf[s] = trayectorias[s][m];
    buf.sort();
    percentiles.forEach((p, i) => {
      const idx = Math.min(Math.floor(nSims * p / 100), nSims - 1);
      out[i][m] = buf[idx];
    });
  }
  return out;
}

// Cuenta meses consecutivos hacia atrás partiendo del último, sobre un set de fechas YYYY-MM.
function streakMeses(fechasDesc) {
  if (!fechasDesc.length) return 0;
  let streak = 1;
  let [py, pm] = fechasDesc[0].split("-").map(Number);
  for (let i = 1; i < fechasDesc.length; i++) {
    const [y, m] = fechasDesc[i].split("-").map(Number);
    let expM = pm - 1, expY = py;
    if (expM < 1) { expM = 12; expY--; }
    if (y === expY && m === expM) { streak++; py = y; pm = m; }
    else break;
  }
  return streak;
}

// Calcula el streak de un producto (entradas con aportTotal > 0).
function calcStreakProducto(entradas) {
  const fechas = [...(entradas || [])]
    .filter(e => aportTotal(e) > 0)
    .map(e => e.fecha)
    .sort()
    .reverse();
  return streakMeses(fechas);
}

// Streak global de la cartera: meses consecutivos en los que al menos un producto aportó.
function calcStreakTotal() {
  const set = new Set();
  state.productos.forEach(p => (state.entradas[p.id] || []).forEach(e => {
    if (aportTotal(e) > 0) set.add(e.fecha);
  }));
  return streakMeses([...set].sort().reverse());
}

// Tramos IRPF de la base del ahorro (España, vigentes 2025-2026).
// Aplica a plusvalías y rendimientos del capital mobiliario.
const TRAMOS_AHORRO_ES = [
  { hasta: 6000,     tipo: 0.19 },
  { hasta: 50000,    tipo: 0.21 },
  { hasta: 200000,   tipo: 0.23 },
  { hasta: 300000,   tipo: 0.27 },
  { hasta: Infinity, tipo: 0.28 },
];

function calcImpuestoPlusvalia(ganancia) {
  if (ganancia == null || ganancia <= 0) return 0;
  let restante = ganancia, impuesto = 0, anterior = 0;
  for (const t of TRAMOS_AHORRO_ES) {
    if (restante <= 0) break;
    const aplicar = Math.min(restante, t.hasta - anterior);
    impuesto  += aplicar * t.tipo;
    restante  -= aplicar;
    anterior   = t.hasta;
  }
  return impuesto;
}

// Tipo medio efectivo (impuesto / ganancia bruta). Útil para mostrar contexto.
function tipoMedioEfectivo(ganancia) {
  if (ganancia <= 0) return 0;
  return calcImpuestoPlusvalia(ganancia) / ganancia;
}

// Filtra filas por periodo. periodo: "all" | "3m" | "6m" | "1y" | "ytd"
function filtrarFilas(filas, periodo) {
  if (!filas?.length || periodo === "all" || !periodo) return filas;
  const ult = filas.at(-1).fecha;
  const [uy, um] = ult.split("-").map(Number);
  let cy = uy, cm = um;
  if      (periodo === "3m") cm -= 2;   // últimos 3 meses incluyendo el actual
  else if (periodo === "6m") cm -= 5;
  else if (periodo === "1y") cm -= 11;
  else if (periodo === "ytd") { cm = 1; cy = uy; }
  while (cm <= 0) { cm += 12; cy--; }
  const cutoff = `${cy}-${String(cm).padStart(2,"0")}`;
  return filas.filter(f => f.fecha >= cutoff);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CSV
// ═══════════════════════════════════════════════════════════════════════════

const CSV_HEADERS = ["producto_id","producto_nombre","fecha","manual","saveback","roundup","valor","nota"];

function escCSV(v) {
  if (v == null) return "";
  let s = String(v);
  // CSV injection: si empieza por =, +, -, @, tab o CR, prefijar con ' para que Excel/LibreOffice
  // no la interpreten como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCSVLine(linea) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (inQ) {
      if (c === '"') {
        if (linea[i+1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function generarCSV() {
  const lineas = [CSV_HEADERS.join(",")];
  state.productos.forEach(p => {
    (state.entradas[p.id] || []).forEach(e => {
      lineas.push([
        escCSV(p.id), escCSV(p.nombre), escCSV(e.fecha),
        e.manual || 0, e.saveback || 0, e.roundup || 0,
        e.valor || 0, escCSV(e.nota || ""),
      ].join(","));
    });
  });
  return lineas.join("\n");
}

function descargarCSV(nombre, contenido) {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function exportarCSV() {
  const fecha = new Date().toISOString().slice(0, 10);
  descargarCSV(`mi-cartera-${fecha}.csv`, generarCSV());
  flash();
  closeDrawer();
}

function importarCSV(texto) {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim());
  if (!lineas.length) return null;
  const cab = parseCSVLine(lineas[0]).map(h => h.trim().toLowerCase());
  const idx = (n) => cab.indexOf(n);
  const iPid = idx("producto_id"), iPnom = idx("producto_nombre"), iF = idx("fecha"),
        iM   = idx("manual"),      iS    = idx("saveback"),        iR = idx("roundup"),
        iV   = idx("valor"),       iN    = idx("nota"),            iA = idx("aportacion");

  const prodMap = {};
  const ents = {};
  for (let i = 1; i < lineas.length; i++) {
    const c = parseCSVLine(lineas[i]);
    if (!c[iPid] && !c[iPnom]) continue;
    const rawPid = (c[iPid] || `prod_${c[iPnom] || ""}`).trim();
    const pid    = sanitizeId(rawPid);   // bloquea caracteres peligrosos en IDs
    const pnom   = (c[iPnom] || pid).trim();
    if (!prodMap[pid]) {
      prodMap[pid] = { id: pid, nombre: pnom, referencia: "", color: COLORES[Object.keys(prodMap).length % COLORES.length] };
      ents[pid] = [];
    }
    let manual = 0, saveback = 0, roundup = 0;
    if (iM >= 0) manual   = parseFloat(c[iM]) || 0;
    if (iS >= 0) saveback = parseFloat(c[iS]) || 0;
    if (iR >= 0) roundup  = parseFloat(c[iR]) || 0;
    if (iM < 0 && iA >= 0) manual = parseFloat(c[iA]) || 0;
    ents[pid].push({
      id:    Date.now() + Math.random(),
      fecha: (c[iF] || "").trim(),
      manual, saveback, roundup,
      valor: parseFloat(c[iV]) || 0,
      nota:  (iN >= 0 ? c[iN] : "") || "",
    });
  }
  let descartadas = 0;
  Object.keys(ents).forEach(pid => {
    const antes = ents[pid].length;
    ents[pid] = ents[pid].filter(e => /^\d{4}-\d{2}$/.test(e.fecha)).sort((a,b) => a.fecha.localeCompare(b.fecha));
    descartadas += antes - ents[pid].length;
  });
  return { productos: Object.values(prodMap), entradas: ents, descartadas };
}

function handleImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = importarCSV(reader.result); }
    catch (err) { alert("Error al leer CSV: " + err.message); return; }
    if (!data || !data.productos.length) { alert("No se encontraron datos válidos en el CSV"); return; }
    const total = Object.values(data.entradas).flat().length;
    const avisoDesc = data.descartadas
      ? `\n⚠ ${data.descartadas} fila(s) descartadas por fecha inválida (formato esperado: AAAA-MM).\n`
      : "";
    const modo = confirm(
      `Encontrados ${data.productos.length} productos y ${total} entradas.${avisoDesc}\n` +
      `OK: REEMPLAZAR todos los datos actuales\nCancelar: FUSIONAR con los datos actuales`
    );
    if (modo) {
      state.productos = data.productos;
      state.entradas  = data.entradas;
      state.tab       = state.productos[0]?.id || "total";
    } else {
      const ids = new Set(state.productos.map(p => p.id));
      data.productos.forEach(p => { if (!ids.has(p.id)) state.productos.push(p); });
      Object.entries(data.entradas).forEach(([pid, list]) => {
        const ya = state.entradas[pid] || [];
        const fechasYa = new Set(ya.map(x => x.fecha));
        const nuevas   = list.filter(x => !fechasYa.has(x.fecha));
        state.entradas[pid] = [...ya, ...nuevas].sort((a,b) => a.fecha.localeCompare(b.fecha));
      });
    }
    saveState();
    render();
    flash();
    closeDrawer();
  };
  reader.readAsText(file);
}

// ── JSON · backup completo ────────────────────────────────────────────────
// Exporta TODO el estado relevante (productos con metadatos, entradas,
// objetivos, preferencias FIRE) en un único archivo JSON portable.

const JSON_EXPORT_VERSION = 1;

function generarJSON() {
  const payload = {
    app:        "MI CARTERA",
    version:    JSON_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    productos:  state.productos.map(p => ({
      id:                 p.id,
      nombre:             p.nombre || "",
      referencia:         p.referencia  || "",
      tipologia:          p.tipologia   || "",
      divisa:             p.divisa      || "",
      comentarios:        p.comentarios || "",
      color:              p.color       || COLORES[0],
      unidades:           Number.isFinite(+p.unidades) ? +p.unidades : 0,
      precioManual:       Number.isFinite(+p.precioManual) ? +p.precioManual : 0,
      coingeckoId:        p.coingeckoId || "",
      asignacionObjetivo: Number.isFinite(+p.asignacionObjetivo) ? +p.asignacionObjetivo : 0,
    })),
    entradas: Object.fromEntries(
      Object.entries(state.entradas).map(([pid, list]) => [
        pid,
        (list || []).map(e => ({
          id:       e.id,
          fecha:    e.fecha,
          manual:   e.manual   || 0,
          saveback: e.saveback || 0,
          roundup:  e.roundup  || 0,
          valor:    e.valor    || 0,
          nota:     e.nota     || "",
        })),
      ])
    ),
    objetivos: (state.objetivos || []).map(o => ({
      id:         o.id,
      nombre:     o.nombre || "",
      meta:       o.meta   || 0,
      productoId: o.productoId ?? null,
    })),
    firePrefs: {
      gasto: state.fireGasto,
      regla: state.fireRegla,
    },
  };
  return JSON.stringify(payload, null, 2);
}

function descargarArchivo(nombre, contenido, mime) {
  const blob = new Blob([contenido], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function exportarJSON() {
  const fecha = new Date().toISOString().slice(0, 10);
  descargarArchivo(`mi-cartera-${fecha}.json`, generarJSON(), "application/json;charset=utf-8");
  flash();
  closeDrawer();
}

function importarJSON(texto) {
  let raw;
  try { raw = JSON.parse(texto); }
  catch (err) { throw new Error("JSON inválido: " + err.message); }
  if (!raw || typeof raw !== "object") throw new Error("El archivo no contiene un objeto JSON");

  // Productos
  if (!Array.isArray(raw.productos)) throw new Error("Falta 'productos' (debe ser un array)");
  const usadosId = new Set();
  const productos = raw.productos.map((p, i) => {
    if (!p || typeof p !== "object") throw new Error(`productos[${i}]: entrada no válida`);
    let id = sanitizeId(p.id || p.nombre || `prod_${i}`);
    while (usadosId.has(id)) id = `${id}_${i}`;
    usadosId.add(id);
    const num = (v) => (Number.isFinite(+v) && +v >= 0) ? +v : 0;
    return {
      id,
      nombre:             String(p.nombre || id),
      referencia:         String(p.referencia  || ""),
      tipologia:          String(p.tipologia   || ""),
      divisa:             String(p.divisa      || "").toUpperCase(),
      comentarios:        String(p.comentarios || ""),
      color:              /^#[0-9a-fA-F]{6}$/.test(p.color || "")
        ? p.color
        : COLORES[i % COLORES.length],
      unidades:           num(p.unidades),
      precioManual:       num(p.precioManual),
      coingeckoId:        String(p.coingeckoId || "").toLowerCase().replace(/[^a-z0-9-]/g, ""),
      asignacionObjetivo: Math.max(0, Math.min(100, num(p.asignacionObjetivo))),
    };
  });
  const idsValidos = new Set(productos.map(p => p.id));

  // Entradas
  if (raw.entradas != null && typeof raw.entradas !== "object")
    throw new Error("'entradas' debe ser un objeto { productoId: [...] }");
  const entradas = {};
  let descartadas = 0;
  productos.forEach(p => { entradas[p.id] = []; });
  Object.entries(raw.entradas || {}).forEach(([pidRaw, list]) => {
    const pid = sanitizeId(pidRaw);
    if (!idsValidos.has(pid) || !Array.isArray(list)) return;
    list.forEach(e => {
      if (!e || typeof e !== "object") { descartadas++; return; }
      const fecha = String(e.fecha || "").trim();
      if (!/^\d{4}-\d{2}$/.test(fecha)) { descartadas++; return; }
      const num = (v) => Number.isFinite(+v) ? +v : 0;
      entradas[pid].push({
        id:       e.id ?? (Date.now() + Math.random()),
        fecha,
        manual:   num(e.manual),
        saveback: num(e.saveback),
        roundup:  num(e.roundup),
        valor:    num(e.valor),
        nota:     String(e.nota || ""),
      });
    });
    entradas[pid].sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  // Objetivos (opcional)
  const objetivos = Array.isArray(raw.objetivos)
    ? raw.objetivos
        .filter(o => o && typeof o === "object" && o.nombre && Number.isFinite(+o.meta))
        .map(o => ({
          id:         o.id ?? (Date.now() + Math.random()),
          nombre:     String(o.nombre),
          meta:       +o.meta,
          productoId: o.productoId && idsValidos.has(sanitizeId(o.productoId))
            ? sanitizeId(o.productoId)
            : null,
        }))
    : [];

  // Preferencias FIRE (opcional)
  let firePrefs = null;
  if (raw.firePrefs && typeof raw.firePrefs === "object") {
    const g = +raw.firePrefs.gasto;
    const r = +raw.firePrefs.regla;
    firePrefs = {
      gasto: Number.isFinite(g) && g > 0 ? g : null,
      regla: Number.isFinite(r) && r > 0 ? r : null,
    };
  }

  return { productos, entradas, objetivos, firePrefs, descartadas };
}

function handleImportJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = importarJSON(reader.result); }
    catch (err) { alert("Error al leer JSON: " + err.message); return; }
    if (!data.productos.length) { alert("No se encontraron productos válidos en el JSON"); return; }
    const total = Object.values(data.entradas).flat().length;
    const partes = [`${data.productos.length} productos`, `${total} entradas`];
    if (data.objetivos.length) partes.push(`${data.objetivos.length} objetivos`);
    const avisoDesc = data.descartadas
      ? `\n⚠ ${data.descartadas} entrada(s) descartadas por fecha inválida.\n`
      : "";
    const modo = confirm(
      `Encontrados: ${partes.join(", ")}.${avisoDesc}\n` +
      `OK: REEMPLAZAR todos los datos actuales\nCancelar: FUSIONAR con los datos actuales`
    );
    if (modo) {
      state.productos = data.productos;
      state.entradas  = data.entradas;
      state.objetivos = data.objetivos;
      if (data.firePrefs) {
        if (data.firePrefs.gasto != null) state.fireGasto = data.firePrefs.gasto;
        if (data.firePrefs.regla != null) state.fireRegla = data.firePrefs.regla;
      }
      state.tab = state.productos[0]?.id || "total";
    } else {
      const ids = new Set(state.productos.map(p => p.id));
      data.productos.forEach(p => { if (!ids.has(p.id)) state.productos.push(p); });
      Object.entries(data.entradas).forEach(([pid, list]) => {
        const ya = state.entradas[pid] || [];
        const fechasYa = new Set(ya.map(x => x.fecha));
        const nuevas   = list.filter(x => !fechasYa.has(x.fecha));
        state.entradas[pid] = [...ya, ...nuevas].sort((a, b) => a.fecha.localeCompare(b.fecha));
      });
      const objIds = new Set((state.objetivos || []).map(o => o.id));
      data.objetivos.forEach(o => { if (!objIds.has(o.id)) state.objetivos.push(o); });
    }
    saveState();
    render();
    flash();
    closeDrawer();
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5b. SNAPSHOTS · puntos de restauración in-app (IndexedDB)
// ═══════════════════════════════════════════════════════════════════════════

const clone = (obj) => (typeof structuredClone === "function") ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

async function crearSnapshot() {
  // Esperar a que se hayan persistido todas las escrituras pendientes antes de
  // clonar el estado, evitando capturar una versión obsoleta.
  await awaitSave();
  const fecha = new Date();
  const iso   = fecha.toISOString();
  const snap  = {
    id:        fecha.getTime(),
    fecha:     iso,
    productos: clone(state.productos),
    entradas:  clone(state.entradas),
  };
  try {
    await dbPut(DB_SNAP, snap);
    state.lastSnapshot = iso;
    await dbPut(DB_KV, iso, "lastSnapshot");
    // Limitar a SNAP_MAX: descartar los más antiguos
    const todos = await listarSnapshots();
    for (let i = SNAP_MAX; i < todos.length; i++) {
      await dbDelete(DB_SNAP, todos[i].id);
    }
    updateSnapSub();
    await renderSnapshots();
    hideSnapToast();
    flash();
  } catch (err) {
    console.warn("[Cartera] Error creando snapshot", err);
    alert("No se pudo crear el punto de restauración: " + err.message);
  }
}

async function listarSnapshots() {
  try {
    const all = await dbAll(DB_SNAP);
    return all.sort((a, b) => b.id - a.id);   // más recientes primero
  } catch {
    return [];
  }
}

async function restaurarSnapshot(id) {
  const snap = await dbGet(DB_SNAP, id);
  if (!snap) return;
  const cuando = formatSnapDate(snap.fecha);
  if (!confirm(`¿Restaurar el punto del ${cuando}?\n\nLos datos actuales se reemplazarán por completo.`)) return;
  state.productos = clone(snap.productos);
  state.entradas  = clone(snap.entradas);
  state.tab       = state.productos[0]?.id || "total";
  state.vistaAno  = false;
  invalidateStatsCache();
  saveState();
  render();
  await renderSnapshots();
  flash();
  closeDrawer();
}

async function eliminarSnapshot(id) {
  if (!confirm("¿Eliminar este punto de restauración?")) return;
  await dbDelete(DB_SNAP, id);
  await renderSnapshots();
}

function ultimoSnapshot() {
  return state.lastSnapshot ? new Date(state.lastSnapshot) : null;
}

function diasSinSnapshot() {
  const last = ultimoSnapshot();
  if (!last) return Infinity;
  return (Date.now() - last.getTime()) / 86400000;
}

function updateSnapSub() {
  const el = $("#snapSub");
  if (!el) return;
  const last = ultimoSnapshot();
  if (!last) { el.textContent = "Sin guardado reciente"; return; }
  const d = diasSinSnapshot();
  if (d < 1) el.textContent = `Hoy · ${last.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  else if (d < 2) el.textContent = "Hace 1 día";
  else el.textContent = `Hace ${Math.floor(d)} días`;
}

function formatSnapDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function renderSnapshots() {
  const el = $("#snapList");
  if (!el) return;
  const all = await listarSnapshots();
  if (!all.length) {
    el.innerHTML = `<div class="snap-empty">Sin puntos guardados aún</div>`;
    return;
  }
  el.innerHTML = all.map(s => {
    const nEnt = Object.values(s.entradas || {}).reduce((n, l) => n + (l?.length || 0), 0);
    return `<div class="snap-item">
      <div class="snap-info">
        <div class="snap-date">${formatSnapDate(s.fecha)}</div>
        <div class="snap-meta">${s.productos.length} producto(s) · ${nEnt} entrada(s)</div>
      </div>
      <div class="snap-actions">
        <button class="snap-btn" data-restore="${esc(s.id)}" title="Restaurar">↻</button>
        <button class="snap-btn danger" data-snapdel="${esc(s.id)}" title="Eliminar">✕</button>
      </div>
    </div>`;
  }).join("");
  $$('[data-restore]').forEach(b => b.onclick = () => restaurarSnapshot(+b.dataset.restore));
  $$('[data-snapdel]').forEach(b => b.onclick = () => eliminarSnapshot(+b.dataset.snapdel));
}

function showSnapToast() { $("#snapToast").style.display = "flex"; }
function hideSnapToast() { $("#snapToast").style.display = "none"; }
function checkSnapReminder() { if (diasSinSnapshot() >= SNAP_REMINDER_DAYS) showSnapToast(); }

// ═══════════════════════════════════════════════════════════════════════════
// 5c. PRECIOS · CoinGecko + precio manual
// ═══════════════════════════════════════════════════════════════════════════

// Devuelve precio en EUR para un producto. Si tiene coingeckoId usa la caché
// (con fetch en background si está caducada). Si no, usa precioManual.
function getProductPriceSync(prod) {
  if (!prod) return null;
  if (prod.coingeckoId) {
    const c = priceCache[prod.coingeckoId];
    if (c && Number.isFinite(c.eur)) {
      return { eur: c.eur, ts: c.ts, source: "coingecko", id: prod.coingeckoId };
    }
  }
  if (Number.isFinite(+prod.precioManual) && +prod.precioManual > 0) {
    return { eur: +prod.precioManual, ts: null, source: "manual" };
  }
  return null;
}

// Fetch (deduplicado) — devuelve Promise con el precio actualizado.
async function fetchCoinGeckoPrice(id) {
  if (!id) return null;
  const cached = priceCache[id];
  if (cached && Date.now() - cached.ts < COINGECKO_TTL) return cached;
  if (priceFetching[id]) return priceFetching[id];
  priceFetching[id] = (async () => {
    try {
      const url = `${COINGECKO_BASE}?ids=${encodeURIComponent(id)}&vs_currencies=eur`;
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const eur = data?.[id]?.eur;
      if (!Number.isFinite(eur)) throw new Error("Sin precio en respuesta");
      priceCache[id] = { eur, ts: Date.now() };
      return priceCache[id];
    } catch (err) {
      console.warn("[Cartera] CoinGecko falló para", id, err);
      return null;
    } finally {
      delete priceFetching[id];
    }
  })();
  return priceFetching[id];
}

// Refresca en background los precios de todos los productos con coingeckoId
// y vuelve a renderizar si llega algo nuevo. Llamado tras cada render.
async function refreshAllPricesAsync() {
  const ids = state.productos
    .map(p => p.coingeckoId)
    .filter(id => id && (!priceCache[id] || Date.now() - priceCache[id].ts >= COINGECKO_TTL));
  if (!ids.length) return;
  const before = ids.map(id => priceCache[id]?.eur);
  await Promise.all(ids.map(fetchCoinGeckoPrice));
  const changed = ids.some((id, i) => priceCache[id]?.eur !== before[i]);
  // Solo re-renderizar si hay cambios y seguimos en la misma tab interesada
  if (changed && needsPriceRender()) render();
}

function needsPriceRender() {
  return state.tab === "asignacion" ||
         state.tab === "fiscal" ||
         (state.tab !== "total" && state.tab !== "proyeccion" &&
          state.tab !== "fire" && state.tab !== "diff");
}

function priceAgeLabel(ts) {
  if (!ts) return "manual";
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min === 0) return "ahora";
  if (min === 1) return "hace 1 min";
  if (min < 60)  return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CHARTS
// ═══════════════════════════════════════════════════════════════════════════

Chart.defaults.color       = "#374151";
Chart.defaults.font.family = "monospace";
Chart.defaults.font.size   = 10;
Chart.defaults.borderColor = "rgba(255,255,255,0.04)";

function destroyChart(key)   { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
function destroyAllCharts()  { Object.keys(charts).forEach(destroyChart); }

function gridConfig(yTickFmt) {
  return {
    x: { grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false }, ticks: { color: "#374151" } },
    y: {
      grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false },
      ticks: { color: "#374151", callback: yTickFmt }
    },
  };
}

// Formatter de eje Y para € que se adapta al rango. Usa los ticks del propio eje
// para decidir la escala (€, k, M) y los decimales necesarios. Evita el problema
// "0k 0k 0k" cuando la cartera está por debajo de 1.000 €.
function fmtTickEUR(value, index, ticks) {
  const max = ticks && ticks.length
    ? Math.max(...ticks.map(t => Math.abs(t.value)))
    : Math.abs(value);
  if (max >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (max >= 10_000)    return `${(value / 1000).toFixed(0)}k`;
  if (max >= 1000)      return `${(value / 1000).toFixed(1)}k`;
  if (max >= 100)       return `${Math.round(value)}`;
  return `${value.toFixed(0)}`;
}

function makeGradient(ctx, color, area, alpha = 0.2) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2,"0"));
  g.addColorStop(1, color + "00");
  return g;
}

const TOOLTIP_BASE = {
  backgroundColor: "#0C1117",
  borderColor:     "rgba(255,255,255,0.08)",
  borderWidth:     1,
  titleColor:      "#6B7280",
  titleFont:       { family: "monospace", size: 11 },
  bodyFont:        { family: "monospace", size: 12 },
  padding:         12,
  boxPadding:      4,
};

function drawChartValor(filas, accent) {
  const ctx = $("#chartValor")?.getContext("2d");
  if (!ctx) return;
  // Anotaciones: puntos destacados donde hay nota
  const notas = filas.map(f => f.nota ? f.valor : null);
  const tieneNotas = notas.some(v => v != null);
  charts.valor = new Chart(ctx, {
    type: "line",
    data: {
      labels: filas.map(f => f.label),
      datasets: [
        {
          label: "Aportado",
          data: filas.map(f => f.acumAportado),
          borderColor: "#4B5563", borderWidth: 1.5, borderDash: [4, 3],
          backgroundColor: (c) => c.chart.chartArea ? makeGradient(c.chart.ctx, "#4B5563", c.chart.chartArea, 0.15) : "transparent",
          tension: 0.3, fill: true, pointRadius: 0,
        },
        {
          label: "Valor real",
          data: filas.map(f => f.valor),
          borderColor: accent, borderWidth: 2,
          backgroundColor: (c) => c.chart.chartArea ? makeGradient(c.chart.ctx, accent, c.chart.chartArea, 0.20) : "transparent",
          tension: 0.3, fill: true, pointRadius: 0,
          pointHoverRadius: filas.map(f => f.nota ? 0 : 4),
        },
        ...(tieneNotas ? [{
          label: "Notas",
          data: notas,
          borderColor: "transparent",
          backgroundColor: "rgb(163, 53, 53)",
          pointRadius: 5, pointHoverRadius: 8,
          pointStyle: "circle",
          pointBorderColor: getComputedStyle(document.body).backgroundColor || "#080C12",
          pointBorderWidth: 2,
          showLine: false, fill: false,
        }] : []),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: {
            label: (c) => c.dataset.label === "Notas" ? "" : ` ${c.dataset.label}: ${fmtE(c.parsed.y)}`,
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              const f = filas[i];
              return f?.nota ? [``, `📝 ${f.nota}`] : [];
            },
          },
        }
      },
      scales: gridConfig(fmtTickEUR),
    }
  });
}

function drawChartMonteCarlo(labels, percs, aportado) {
  const ctx = $("#chartMC")?.getContext("2d");
  if (!ctx) return;
  const purpA = (a) => `rgba(167,139,250,${a})`;
  charts.mc = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "p5",   data: percs[0], borderColor: purpA(0.18), borderWidth: 1, pointRadius: 0, fill: false, tension: 0.25 },
        { label: "p25",  data: percs[1], borderColor: purpA(0.28), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.07), tension: 0.25 },
        { label: "p50 (mediana)", data: percs[2], borderColor: "#A78BFA", borderWidth: 2.5, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.13), tension: 0.25 },
        { label: "p75",  data: percs[3], borderColor: purpA(0.28), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.13), tension: 0.25 },
        { label: "p95",  data: percs[4], borderColor: purpA(0.18), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.07), tension: 0.25 },
        { label: "Aportado", data: aportado, borderColor: "#4B5563", borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#9CA3AF", font: { family: "monospace", size: 10 }, boxWidth: 12, padding: 12, filter: it => it.text !== "p5" && it.text !== "p25" && it.text !== "p75" } },
        tooltip: { ...TOOLTIP_BASE, callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtE(c.parsed.y)}` } },
      },
      scales: gridConfig(fmtTickEUR),
    },
  });
}

function drawChartRent(filas, accent) {
  const ctx = $("#chartRent")?.getContext("2d");
  if (!ctx) return;
  charts.rent = new Chart(ctx, {
    type: "line",
    data: {
      labels: filas.map(f => f.label),
      datasets: [{
        label: "Rent. acumulada",
        data: filas.map(f => f.rentPct),
        borderColor: accent, borderWidth: 2, tension: 0.3, fill: false,
        pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: accent,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: false,
          callbacks: { label: (ctx) => { const v = ctx.parsed.y; return ` ${v>=0?"+":""}${fmt(v)}%`; } }
        }
      },
      scales: gridConfig(v => `${v.toFixed(0)}%`),
    }
  });
}

function drawChartTirComp(data) {
  const ctx = $("#chartTirComp")?.getContext("2d");
  if (!ctx) return;
  charts.tirComp = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(d => d.nombre),
      datasets: [{
        label: "TIR",
        data: data.map(d => d.tir != null ? +(d.tir * 100).toFixed(2) : 0),
        backgroundColor: data.map(d => d.color + "D9"),
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => ` ${ctx.parsed.x>=0?"+":""}${fmt(ctx.parsed.x)}%`
          }
        }
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false },
             ticks: { color: "#374151", callback: v => `${v.toFixed(0)}%` } },
        y: { grid: { display: false }, border: { display: false },
             ticks: { color: "#9CA3AF", font: { size: 11 } } }
      }
    }
  });
}

function drawChartProy(labels, datasets) {
  const ctx = $("#chartProy")?.getContext("2d");
  if (!ctx) return;
  charts.proy = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#9CA3AF", font: { family: "monospace", size: 10 }, boxWidth: 12, padding: 12 } },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtE(ctx.parsed.y)}` }
        }
      },
      scales: gridConfig(fmtTickEUR),
    }
  });
}

const HIST_BUCKETS = [
  { label: "<−5%",    min: -Infinity, max: -5 },
  { label: "−5/−3%", min: -5,        max: -3 },
  { label: "−3/−1%", min: -3,        max: -1 },
  { label: "−1/0%",  min: -1,        max:  0 },
  { label: "0/+1%",  min:  0,        max:  1 },
  { label: "+1/+3%", min:  1,        max:  3 },
  { label: "+3/+5%", min:  3,        max:  5 },
  { label: ">+5%",   min:  5,        max: Infinity },
];

function drawChartHistograma(filas) {
  const ctx = $("#chartHist")?.getContext("2d");
  if (!ctx) return;
  const rents = filas.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (!rents.length) return;
  const counts = HIST_BUCKETS.map(b => rents.filter(r => r >= b.min && r < b.max).length);
  const colors = HIST_BUCKETS.map(b => b.max <= 0 ? "rgba(248,113,113,0.75)" : "rgba(110,231,183,0.75)");
  charts.hist = new Chart(ctx, {
    type: "bar",
    data: {
      labels: HIST_BUCKETS.map(b => b.label),
      datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4, borderSkipped: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: false,
          callbacks: { label: (c) => ` ${c.parsed.y} ${c.parsed.y === 1 ? "mes" : "meses"}` } },
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#6B7280", font: { family: "monospace", size: 9 } } },
        y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#6B7280", font: { family: "monospace", size: 9 }, stepSize: 1 }, beginAtZero: true },
      },
    },
  });
}

function drawChartPeso(data) {
  const ctx = $("#chartPeso")?.getContext("2d");
  if (!ctx) return;
  charts.peso = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: data.map(d => d.nombre),
      datasets: [{
        data: data.map(d => d.valor),
        backgroundColor: data.map(d => d.color + "D9"),
        borderColor: data.map(d => d.color + "40"),
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#9CA3AF", font: { family: "monospace", size: 10 }, padding: 14, boxWidth: 10, boxHeight: 10 }
        },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
              const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${fmtE(ctx.parsed)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. RENDER
// ═══════════════════════════════════════════════════════════════════════════

function getAccentColor() {
  if (state.tab === "proyeccion") return "#A78BFA";
  if (state.tab === "fire")       return "#34D399";
  if (state.tab === "asignacion") return "#22D3EE";
  if (state.tab === "diff")       return "#FB923C";
  if (state.tab === "fiscal")     return "#F87171";
  if (state.tab === "total")      return "#FBBF24";
  return state.productos.find(p => p.id === state.tab)?.color || "#FBBF24";
}

function setAccentVars(color) {
  document.documentElement.style.setProperty("--accent",      color);
  document.documentElement.style.setProperty("--accent-soft", color + "0F");
  document.documentElement.style.setProperty("--accent-line", color + "18");
  document.documentElement.style.setProperty("--accent-glow", color + "09");
}

let _dragId = null;
let _touchDragHappened = false;

// Sparkline SVG inline para el dot del tab. Valores: array de valores numéricos.
function sparkline(values, color, w = 38, h = 12) {
  if (!values || values.length < 2) return `<span class="dot" style="background:${color}"></span>`;
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const dx    = w / (values.length - 1);
  const pts   = values.map((v, i) => `${(i*dx).toFixed(1)},${(h - (v-min)/range*h).toFixed(1)}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
  </svg>`;
}

function valoresProducto(pid) {
  return [...(state.entradas[pid] || [])]
    .sort((a,b) => a.fecha.localeCompare(b.fecha))
    .map(e => e.valor || 0);
}

function renderTabs() {
  const tabs = [
    { id: "total", nombre: "Total", color: "#FBBF24" },
    ...state.productos,
  ];
  const html = tabs.map(t => {
    const active  = state.tab === t.id ? "active" : "";
    const isProd  = t.id !== "total" && t.id !== "proyeccion";
    const extra   = t.id === "total" ? "tab-total" : "";
    const drag    = isProd ? 'draggable="true"' : '';
    const style   = active
      ? `--accent:${t.color};color:${t.color}`
      : `color:${t.color}`;
    return `<button class="tab ${active} ${extra}" ${drag} data-tab="${esc(t.id)}" style="${style}">
      ${esc(t.nombre.toUpperCase())}
    </button>`;
  }).join("");
  $("#tabs").innerHTML = html;
  $$("#tabs .tab[data-tab]").forEach(b => {
    b.onclick = () => {
      if (_touchDragHappened) { _touchDragHappened = false; return; }
      state.tab = b.dataset.tab;
      state.vistaAno = false;
      render();
    };
  });
  bindTabDrag();
}

function reorderProductos(srcId, dstId) {
  const si = state.productos.findIndex(p => p.id === srcId);
  const di = state.productos.findIndex(p => p.id === dstId);
  if (si === -1 || di === -1) return;
  const arr = [...state.productos];
  arr.splice(di, 0, arr.splice(si, 1)[0]);
  state.productos = arr;
  saveState();
  render();
}

function bindTabDrag() {
  const btns = $$("#tabs .tab[draggable='true']");
  if (!btns.length) return;

  btns.forEach(btn => {
    // HTML5 drag (escritorio)
    btn.addEventListener("dragstart", e => {
      _dragId = btn.dataset.tab;
      btn.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    btn.addEventListener("dragend", () => {
      _dragId = null;
      btn.classList.remove("dragging");
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
    });
    btn.addEventListener("dragover", e => {
      if (!_dragId || btn.dataset.tab === _dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
      btn.classList.add("drag-over");
    });
    btn.addEventListener("dragleave", () => btn.classList.remove("drag-over"));
    btn.addEventListener("drop", e => {
      e.preventDefault();
      if (!_dragId || _dragId === btn.dataset.tab) return;
      reorderProductos(_dragId, btn.dataset.tab);
    });

    // Touch drag (móvil)
    let _tsrc = null;
    btn.addEventListener("touchstart", () => { _tsrc = btn.dataset.tab; }, { passive: true });
    btn.addEventListener("touchmove", e => {
      if (!_tsrc) return;
      e.preventDefault();
      const pt  = e.touches[0];
      const el  = document.elementFromPoint(pt.clientX, pt.clientY);
      const tgt = el?.closest?.(".tab[draggable='true']");
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
      if (tgt && tgt.dataset.tab !== _tsrc) tgt.classList.add("drag-over");
    }, { passive: false });
    btn.addEventListener("touchend", e => {
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
      if (!_tsrc) return;
      const pt  = e.changedTouches[0];
      const el  = document.elementFromPoint(pt.clientX, pt.clientY);
      const tgt = el?.closest?.(".tab[draggable='true']");
      if (tgt && tgt.dataset.tab !== _tsrc) {
        _touchDragHappened = true;
        reorderProductos(_tsrc, tgt.dataset.tab);
      }
      _tsrc = null;
    });
  });
}

// Lista plana de IDs de pestaña (para atajos 1-9)
function tabIds() {
  return ["total", ...state.productos.map(p => p.id)];
}

function render() {
  invalidateStatsCache();
  destroyAllCharts();
  const accent = getAccentColor();
  setAccentVars(accent);
  renderTabs();

  const btnAdd = $("#btnAddEntry");
  const reservados = new Set(["total", "proyeccion", "fire", "asignacion", "diff", "fiscal"]);
  const esProd = !reservados.has(state.tab);
  btnAdd.style.display    = esProd ? "inline-block" : "none";
  btnAdd.style.background = accent;
  btnAdd.onclick          = () => openEntryModal();

  let result;
  if      (state.tab === "proyeccion") result = renderProyeccion();
  else if (state.tab === "fire")       result = renderFIRE();
  else if (state.tab === "asignacion") result = renderAsignacion();
  else if (state.tab === "diff")       result = renderDiff();
  else if (state.tab === "fiscal")     result = renderFiscal();
  else                                  result = renderTabActual();
  // Fetch async de precios CoinGecko + re-render si llega algo
  refreshAllPricesAsync();
  return result;
}

function renderTabActual() {
  const accent   = getAccentColor();
  const esTotal  = state.tab === "total";
  const prod     = state.productos.find(p => p.id === state.tab);
  const filasFull = esTotal ? statsTotalCalc() : calcStats(state.entradas[state.tab] || []);
  // Filtro temporal: solo afecta display (tablas, charts, heatmap).
  // Las KPIs siguen usando la última entrada para mantener "VALOR ACTUAL" coherente.
  const filas    = filtrarFilas(filasFull, state.filtroPeriodo);
  const ultima   = filasFull[filasFull.length - 1];
  const anterior = filasFull.length > 1 ? filasFull[filasFull.length - 2] : null;
  const varMes   = ultima && anterior ? ultima.valor - anterior.valor : null;

  let tirActual = null;
  if (esTotal) {
    const ents = filasFull.map(f => ({ fecha: f.fecha, manual: f.manual, saveback: f.saveback, roundup: f.roundup, valor: f.valor }));
    tirActual = calcTIR(ents);
  } else {
    tirActual = calcTIR(state.entradas[state.tab] || []);
  }
  const vol    = calcVolatilidad(filasFull);
  const sharpe = calcSharpe(filasFull, tirActual);

  // Streak (basado en datos completos, no afectado por filtro)
  const streak = esTotal ? calcStreakTotal() : calcStreakProducto(state.entradas[state.tab] || []);

  const titulo = esTotal ? "CARTERA TOTAL" : prod.nombre.toUpperCase();
  let subHTML;
  if (esTotal) {
    subHTML = esc(state.productos.map(p => p.nombre).join("  ·  "));
  } else {
    const tags = [];
    if (prod.tipologia) tags.push(`<span class="prod-tag">${esc(prod.tipologia)}</span>`);
    if (prod.divisa)    tags.push(`<span class="prod-tag">${esc(prod.divisa)}</span>`);
    // Badge de precio actual y unidades, si están disponibles
    const price = getProductPriceSync(prod);
    if (price) {
      const fuente = price.source === "coingecko" ? `CG · ${priceAgeLabel(price.ts)}` : "manual";
      tags.push(`<span class="prod-tag prod-tag-price" title="Precio unitario actual">${fmtE(price.eur)}/u · ${fuente}</span>`);
    }
    if (Number.isFinite(+prod.unidades) && +prod.unidades > 0) {
      tags.push(`<span class="prod-tag">${(+prod.unidades).toLocaleString("es-ES", { maximumFractionDigits: 8 })} u</span>`);
    }
    const refTxt = prod.referencia ? `<span class="prod-ref">${esc(prod.referencia)}</span>` : "";
    subHTML = [tags.join(""), refTxt].filter(Boolean).join(" ");
  }
  const comentariosHTML = !esTotal && prod.comentarios
    ? `<div class="prod-coment">${esc(prod.comentarios)}</div>`
    : "";

  const PERIODOS = [
    { id: "all", l: "TODO" },
    { id: "1y",  l: "1A"   },
    { id: "ytd", l: "YTD"  },
    { id: "6m",  l: "6M"   },
    { id: "3m",  l: "3M"   },
  ];

  let html = `
    <div class="title-row">
      <div>
        <h2>${esc(titulo)}</h2>
        <div class="subtitle">${subHTML}</div>
        ${comentariosHTML}
        ${streak >= 2 ? `<div class="streak-badge">🔥 ${streak} MES${streak===1?"":"ES"} SEGUIDO${streak===1?"":"S"} APORTANDO</div>` : ""}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <div class="filter-period">
          ${PERIODOS.map(p => `<button class="${state.filtroPeriodo===p.id?"active":""}" data-period="${p.id}">${p.l}</button>`).join("")}
        </div>
        <div class="toggle">
          <button class="${!state.vistaAno ? "active" : ""}" data-vista="mes">MES</button>
          <button class="${state.vistaAno  ? "active" : ""}" data-vista="ano">AÑO</button>
        </div>
        ${!esTotal ? `<div class="prod-acts">
          <button class="btn-edit" id="btnEditProd">EDITAR</button>
          <button class="btn-del" id="btnDelProd">ELIMINAR</button>
        </div>` : ""}
      </div>
    </div>
  `;

  if (!filasFull.length) {
    html += `<div class="empty">
      <div class="empty-title">SIN ENTRADAS AÚN</div>
      <div class="empty-sub">Pulsa "+ ENTRADA" para registrar el primer mes</div>
    </div>`;
    $("#main").innerHTML = html;
    bindCommon();
    return;
  }

  const maxDd     = calcMaxDrawdown(filasFull);
  const mejorMes  = calcMejorMes(filasFull);
  const kpis = [
    { l: "VALOR ACTUAL", v: fmtE(ultima.valor),    s: `Aportado: ${fmtE(ultima.acumAportado)}`,
      c: accent,
      tip: `Desglose del total aportado:\n• Manual: ${fmtE(ultima.acumManual)}\n• Saveback: ${fmtE(ultima.acumSaveback)}\n• Round-up: ${fmtE(ultima.acumRoundup)}` },
    { l: "GANANCIA",     v: fmtE(ultima.ganancia), s: `${ultima.ganancia>=0?"+":""}${fmt(ultima.rentPct)}% total`,        c: ultima.ganancia>=0 ? "var(--green)" : "var(--red)" },
    { l: "ESTE MES",
      v: varMes != null ? fmtE(varMes) : "—",
      s: varMes != null ? (varMes>=0 ? "↑ vs mes anterior" : "↓ vs mes anterior") : "Sin mes anterior",
      c: varMes == null ? "var(--dimmer)" : (varMes>=0 ? "var(--green)" : "var(--red)") },
    { l: "MEJOR MES",
      v: mejorMes != null
        ? `${mejorMes.rentMes>=0?"+":""}${fmt(mejorMes.rentMes)}%`
        : "—",
      s: mejorMes != null ? labelMes(mejorMes.fecha) : "Sin datos suficientes",
      c: mejorMes == null ? "var(--dimmer)" : (mejorMes.rentMes >= 0 ? "var(--green)" : "var(--red)"),
      tip: "Mayor rentabilidad mensual registrada. Útil para contextualizar las caídas: cuando aparezca un mes muy malo, este KPI te recuerda que también puede haber meses muy buenos en la otra dirección." },
    { l: "TIR ANUALIZADA",
      v: tirActual != null ? `${tirActual>=0?"+":""}${fmt(tirActual*100)}%` : "—",
      s: tirActual != null ? `XIRR · ${filasFull.length} meses` : "Datos insuficientes",
      c: tirActual == null ? "var(--dimmer)" : (tirActual>=0 ? "var(--green)" : "var(--red)"),
      tip: "Tasa Interna de Retorno anualizada (XIRR). Pondera el momento exacto de cada aportación. Es la rentabilidad anual constante que habría producido el mismo resultado que tu historial real." },
    { l: "DRAWDOWN MÁX",
      v: maxDd != null ? `-${fmt(maxDd)}%` : "—",
      s: maxDd != null ? "Máx. caída desde pico" : "Sin datos suficientes",
      c: maxDd != null && maxDd > 0.01 ? "var(--red)" : "var(--dimmer)",
      tip: "Mayor caída desde un pico histórico hasta el siguiente valle (en % sobre el valor de cartera). Mide el peor momento que has vivido antes de recuperarte. Un −20% significa que la cartera llegó a valer un 20% menos que su máximo anterior." },
    { l: "VOLATILIDAD",
      v: vol != null ? `${fmt(vol)}%` : "—",
      s: vol != null ? "Anualizada (×√12)" : "Mín. 3 meses",
      c: vol == null ? "var(--dimmer)" : (vol > 20 ? "var(--red)" : vol > 10 ? "var(--yellow)" : "var(--green)"),
      tip: "Desviación estándar de las rentabilidades mensuales, anualizada (×√12). Cuantifica la dispersión de tus retornos respecto a la media. Mayor volatilidad implica mayor riesgo e incertidumbre sobre el resultado futuro." },
    { l: "SHARPE",
      v: sharpe != null ? fmt(sharpe) : "—",
      s: sharpe != null ? (sharpe >= 2 ? "Excelente" : sharpe >= 1 ? "Bueno" : sharpe >= 0 ? "Moderado" : "Negativo") : "Sin datos",
      c: sharpe == null ? "var(--dimmer)" : (sharpe >= 2 ? "var(--green)" : sharpe >= 1 ? "var(--yellow)" : sharpe >= 0 ? "var(--mute)" : "var(--red)"),
      tip: "Ratio de Sharpe: rentabilidad anual (XIRR) dividida entre la volatilidad anualizada. Mide la rentabilidad obtenida por cada unidad de riesgo asumido. Por encima de 1 se considera bueno; por encima de 2, excelente." },
  ];
  html += `<div class="kpis">${kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${k.l}${k.tip ? `<span class="kpi-info" tabindex="0" role="button" aria-label="Información sobre ${esc(k.l)}" data-tip="${esc(k.tip)}">i</span>` : ""}</div>
      <div class="kpi-value" style="color:${k.c}">${k.v}</div>
      <div class="kpi-sub">${k.s}</div>
    </div>
  `).join("")}</div>`;

  let tirData = null;
  if (esTotal && state.productos.length > 1) {
    tirData = state.productos.map(p => ({ nombre: p.nombre, tir: calcTIR(state.entradas[p.id] || []), color: p.color }));
    if (tirData.filter(t => t.tir != null).length > 1) {
      html += `<div class="panel">
        <div class="panel-title">TIR POR PRODUCTO · COMPARATIVA</div>
        <div class="chart-box" style="height:${Math.max(80, state.productos.length * 38)}px"><canvas id="chartTirComp"></canvas></div>
      </div>`;
    } else {
      tirData = null;
    }
  }

  let pesoData = null;
  if (esTotal && state.productos.length > 1) {
    const pesoItems = state.productos.map(p => {
      const ents = (state.entradas[p.id] || []).sort((a,b) => a.fecha.localeCompare(b.fecha));
      const ult = ents[ents.length - 1];
      return { nombre: p.nombre, valor: ult?.valor || 0, color: p.color };
    }).filter(d => d.valor > 0);
    if (pesoItems.length > 1) {
      pesoData = pesoItems;
      html += `<div class="panel">
        <div class="panel-title">DISTRIBUCIÓN DE CARTERA · VALOR ACTUAL</div>
        <div class="chart-box" style="height:220px"><canvas id="chartPeso"></canvas></div>
      </div>`;
    }
  }

  // Si el filtro de periodo deja menos de 2 entradas, los gráficos de líneas
  // quedan en blanco (pointRadius: 0 + sin línea). Mostramos un placeholder.
  const sparseFilter = filas.length < 2;
  const emptyChart = `<div class="empty" style="padding:36px 0">
    <div class="empty-title">SIN DATOS EN ESTE PERIODO</div>
    <div class="empty-sub">Selecciona "TODO" o un rango más amplio</div>
  </div>`;

  html += `<div class="panel">
    <div class="panel-title">VALOR REAL vs APORTADO</div>
    ${sparseFilter ? emptyChart : `<div class="chart-box"><canvas id="chartValor"></canvas></div>`}
  </div>`;

  html += `<div class="panel">
    <div class="panel-title">HEATMAP RENTABILIDAD MENSUAL (%)</div>
    ${renderHeatmap(filas)}
  </div>`;

  const histRents = filas.filter(f => f.rentMes != null);
  if (histRents.length >= 3) {
    html += `<div class="panel">
      <div class="panel-title">DISTRIBUCIÓN DE RENTABILIDADES MENSUALES</div>
      <div class="chart-box short"><canvas id="chartHist"></canvas></div>
    </div>`;
  }

  html += `<div class="panel">
    <div class="panel-title">RENTABILIDAD ACUMULADA (%)</div>
    ${sparseFilter ? emptyChart : `<div class="chart-box short"><canvas id="chartRent"></canvas></div>`}
  </div>`;

  html += renderObjetivos(esTotal ? null : state.tab, ultima.valor);

  if (state.vistaAno)   html += renderTablaAno(filas, accent);
  else if (esTotal)     html += renderTablaTotal(filas, accent);
  else                  html += renderTablaProd(filas, accent, ultima);

  html += renderResumenFiscal(filas);
  html += renderKpisExtra(filasFull, ultima, tirActual);

  $("#main").innerHTML = html;
  bindCommon();

  if (!sparseFilter) {
    drawChartValor(filas, accent);
    drawChartRent(filas, accent);
  }
  if (histRents.length >= 3) drawChartHistograma(filas);
  if (tirData) drawChartTirComp(tirData);
  if (pesoData) drawChartPeso(pesoData);
}

function renderHeatmap(filas) {
  const datos = {};
  filas.forEach(f => {
    if (f.rentMes == null) return;
    const [y, m] = f.fecha.split("-");
    if (!datos[y]) datos[y] = {};
    datos[y][+m - 1] = f.rentMes;
  });
  const anos = Object.keys(datos).sort().reverse();
  if (!anos.length) {
    return `<p style="font-size:11px;color:var(--dimmest);font-family:monospace;text-align:center;padding:30px 0">Necesitas al menos 2 meses de datos para ver el heatmap</p>`;
  }
  const todos  = Object.values(datos).flatMap(o => Object.values(o));
  const maxAbs = Math.max(...todos.map(Math.abs), 1);
  const colorCelda = (v) => {
    if (v == null) return "transparent";
    const intensity = Math.min(Math.abs(v) / maxAbs, 1);
    const op = 0.12 + intensity * 0.78;
    return v >= 0 ? `rgba(110,231,183,${op})` : `rgba(248,113,113,${op})`;
  };
  let inner = `<div class="heat-row head"><span></span>${MESES.map(m => `<span>${m.toUpperCase()}</span>`).join("")}</div>`;
  anos.forEach(y => {
    let cells = `<span class="heat-year">${y}</span>`;
    for (let m = 0; m < 12; m++) {
      const v = datos[y][m];
      if (v == null) cells += `<div class="heat-cell empty"></div>`;
      else {
        const txtDark = Math.abs(v) / maxAbs > 0.5;
        cells += `<div class="heat-cell" title="${MESES[m]} ${y}: ${v>=0?"+":""}${fmt(v)}%" style="background:${colorCelda(v)};color:${txtDark ? "var(--bg)" : "var(--mute)"}">${v>=0?"+":""}${v.toFixed(0)}</div>`;
      }
    }
    inner += `<div class="heat-row">${cells}</div>`;
  });
  const escalaSpans = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map(t => {
    const bg = t === 0 ? "rgba(255,255,255,0.05)"
             : t < 0   ? `rgba(248,113,113,${0.12 + Math.abs(t) * 0.78})`
                       : `rgba(110,231,183,${0.12 + t * 0.78})`;
    return `<div style="background:${bg}"></div>`;
  }).join("");
  inner += `<div class="heat-legend">
    <span>-${fmt(maxAbs,1)}%</span>
    <div class="heat-scale">${escalaSpans}</div>
    <span>+${fmt(maxAbs,1)}%</span>
  </div>`;
  return `<div class="heatmap-scroll"><div class="heatmap-grid">${inner}</div></div>`;
}

function renderTablaProd(filas, accent, ultima) {
  const head = `<div class="tr head cols-prod">
    <span>MES</span><span class="right">MANUAL</span><span class="right">SAVEBK</span><span class="right">ROUND</span>
    <span class="right">VALOR</span><span class="right">GANANCIA</span><span class="right">RENT %</span><span>NOTA</span><span></span>
  </div>`;

  // Agrupar filas por año
  const porAno = {};
  filas.forEach(f => {
    const y = f.fecha.slice(0, 4);
    if (!porAno[y]) porAno[y] = [];
    porAno[y].push(f);
  });
  const anos = Object.keys(porAno).sort().reverse();
  const anoActual = anos[0]; // El más reciente queda abierto

  const groups = anos.map(y => {
    const gFilas = porAno[y];
    const gManual   = gFilas.reduce((s,f) => s + (f.manual   || 0), 0);
    const gSaveback = gFilas.reduce((s,f) => s + (f.saveback || 0), 0);
    const gRoundup  = gFilas.reduce((s,f) => s + (f.roundup  || 0), 0);
    const gValorFin = gFilas[gFilas.length - 1].valor;
    const gRent = gFilas[gFilas.length - 1].rentPct;
    const rows = [...gFilas].reverse().map(f => `
      <div class="tr cols-prod">
        <span class="bebas" style="color:${accent}">${f.label}</span>
        <span class="mono right" style="color:var(--mute)" data-l="MANUAL">${fmtE(f.manual)}</span>
        <span class="mono-sm right" style="color:var(--dim)" data-l="SAVEBACK">${f.saveback ? fmtE(f.saveback) : "—"}</span>
        <span class="mono-sm right" style="color:var(--dim)" data-l="ROUND-UP">${f.roundup  ? fmtE(f.roundup)  : "—"}</span>
        <span class="mono right bold" style="color:var(--text)" data-l="VALOR">${fmtE(f.valor)}</span>
        <span class="mono right ${f.ganancia>=0?"pos":"neg"}" data-l="GANANCIA">${fmtE(f.ganancia)}</span>
        <span class="mono right bold ${f.rentPct>=0?"pos":"neg"}" data-l="RENT %">${f.rentPct>=0?"+":""}${fmt(f.rentPct)}%</span>
        <span class="mono-sm ellipsis ${f.nota ? "" : "dash"}" title="${esc(f.nota)}" data-l="NOTA">${esc(f.nota || "—")}</span>
        <div class="row-acts">
          <button class="row-act" data-edit="${esc(f.id)}">✎ Editar</button>
          <button class="row-act danger" data-del="${esc(f.id)}">✕ Borrar</button>
        </div>
      </div>
    `).join("");
    return `<details class="year-group" ${y === anoActual ? "open" : ""}>
      <summary class="cols-prod">
        <span class="bebas" style="color:${accent};font-size:15px">${y} <span class="chevron"></span></span>
        <span class="mono right" style="color:var(--mute)" data-l="MANUAL AÑO">${fmtE(gManual)}</span>
        <span class="mono-sm right" style="color:var(--dim)" data-l="SAVEBACK AÑO">${gSaveback ? fmtE(gSaveback) : "—"}</span>
        <span class="mono-sm right" style="color:var(--dim)" data-l="ROUND-UP AÑO">${gRoundup  ? fmtE(gRoundup)  : "—"}</span>
        <span class="mono right bold" style="color:var(--text)" data-l="VALOR">${fmtE(gValorFin)}</span>
        <span></span>
        <span class="mono right bold ${gRent>=0?"pos":"neg"}" data-l="RENT %">${gRent>=0?"+":""}${fmt(gRent)}%</span>
        <span class="mono-sm" style="color:var(--dimmer)">${gFilas.length} meses</span>
        <span></span>
      </summary>
      <div class="year-rows">${rows}</div>
    </details>`;
  }).join("");

  const totM = filas.reduce((s,f) => s + (f.manual||0),   0);
  const totS = filas.reduce((s,f) => s + (f.saveback||0), 0);
  const totR = filas.reduce((s,f) => s + (f.roundup||0),  0);
  const totalRow = `<div class="tr cols-prod total">
    <span class="mono-sm bold" style="color:${accent};letter-spacing:2px">TOTAL</span>
    <span class="mono right bold" style="color:var(--mute)" data-l="MANUAL">${fmtE(totM)}</span>
    <span class="mono-sm right bold" style="color:var(--dim)" data-l="SAVEBACK">${fmtE(totS)}</span>
    <span class="mono-sm right bold" style="color:var(--dim)" data-l="ROUND-UP">${fmtE(totR)}</span>
    <span class="mono right bold" style="color:var(--text)" data-l="VALOR">${fmtE(ultima.valor)}</span>
    <span class="mono right bold ${ultima.ganancia>=0?"pos":"neg"}" data-l="GANANCIA">${fmtE(ultima.ganancia)}</span>
    <span class="mono right bold ${ultima.rentPct>=0?"pos":"neg"}" data-l="RENT %">${ultima.rentPct>=0?"+":""}${fmt(ultima.rentPct)}%</span>
    <span></span><span></span>
  </div>`;
  return `<div class="table">${head}${groups}${totalRow}</div>`;
}

function renderTablaTotal(filas, accent) {
  const head = `<div class="tr head cols-total">
    <span>MES</span><span class="right">APORTACIÓN</span><span class="right">VALOR</span>
    <span class="right">GANANCIA</span><span class="right">RENT %</span>
  </div>`;

  const porAno = {};
  filas.forEach(f => {
    const y = f.fecha.slice(0, 4);
    if (!porAno[y]) porAno[y] = [];
    porAno[y].push(f);
  });
  const anos = Object.keys(porAno).sort().reverse();
  const anoActual = anos[0];

  const groups = anos.map(y => {
    const gFilas = porAno[y];
    const gAportado = gFilas.reduce((s,f) => s + f.aportacion, 0);
    const gValorFin = gFilas[gFilas.length - 1].valor;
    const gRent = gFilas[gFilas.length - 1].rentPct;
    const rows = [...gFilas].reverse().map(f => `
      <div class="tr cols-total">
        <span class="bebas" style="color:${accent}">${f.label}</span>
        <span class="mono right" style="color:var(--mute)" data-l="APORTACIÓN">${fmtE(f.aportacion)}</span>
        <span class="mono right bold" style="color:var(--text)" data-l="VALOR">${fmtE(f.valor)}</span>
        <span class="mono right ${f.ganancia>=0?"pos":"neg"}" data-l="GANANCIA">${fmtE(f.ganancia)}</span>
        <span class="mono right bold ${f.rentPct>=0?"pos":"neg"}" data-l="RENT %">${f.rentPct>=0?"+":""}${fmt(f.rentPct)}%</span>
      </div>
    `).join("");
    return `<details class="year-group" ${y === anoActual ? "open" : ""}>
      <summary class="cols-total">
        <span class="bebas" style="color:${accent};font-size:15px">${y} <span class="chevron"></span></span>
        <span class="mono right" style="color:var(--mute)" data-l="APORT. AÑO">${fmtE(gAportado)}</span>
        <span class="mono right bold" style="color:var(--text)" data-l="VALOR">${fmtE(gValorFin)}</span>
        <span></span>
        <span class="mono right bold ${gRent>=0?"pos":"neg"}" data-l="RENT %">${gRent>=0?"+":""}${fmt(gRent)}% · ${gFilas.length}m</span>
      </summary>
      <div class="year-rows">${rows}</div>
    </details>`;
  }).join("");

  return `<div class="table">${head}${groups}</div>`;
}

function renderTablaAno(filas, accent) {
  const g = agruparPorAno(filas);
  const head = `<div class="tr head cols-year">
    <span>AÑO</span><span class="center">MESES</span><span class="right">APORTADO</span>
    <span class="right">VALOR FIN</span><span class="right">GANANCIA</span>
    <span class="right">RENT TOTAL</span><span class="right">RENT AÑO</span>
  </div>`;
  const rows = [...g].reverse().map(y => `
    <div class="tr cols-year">
      <span class="bebas" style="color:${accent};font-size:17px">${y.ano}</span>
      <span class="mono-sm center" style="color:var(--dim)" data-l="MESES">${y.meses}</span>
      <span class="mono right" style="color:var(--mute)" data-l="APORTADO">${fmtE(y.aportadoAno)}</span>
      <span class="mono right bold" style="color:var(--text)" data-l="VALOR FIN">${fmtE(y.valorFin)}</span>
      <span class="mono right ${y.ganancia>=0?"pos":"neg"}" data-l="GANANCIA">${fmtE(y.ganancia)}</span>
      <span class="mono right bold ${y.rentPct>=0?"pos":"neg"}" data-l="RENT TOTAL">${y.rentPct>=0?"+":""}${fmt(y.rentPct)}%</span>
      <span class="mono right bold ${y.rentAno == null ? "" : (y.rentAno>=0?"pos":"neg")}" style="${y.rentAno == null ? "color:var(--dimmer)" : ""}" data-l="RENT AÑO">${y.rentAno != null ? `${y.rentAno>=0?"+":""}${fmt(y.rentAno)}%` : "—"}</span>
    </div>
  `).join("");
  const footer = `<div style="padding:10px 20px;background:var(--accent-soft);border-top:1px solid var(--accent-line)">
    <p style="font-size:9px;font-family:monospace;color:${accent};letter-spacing:2px">RENT TOTAL = ganancia acumulada / aportado total · RENT AÑO ≈ rentabilidad explicada por mercado en ese año</p>
  </div>`;
  return `<div class="table">${head}${rows}${footer}</div>`;
}

function renderResumenFiscal(filas) {
  const g = agruparPorAno(filas);
  if (!g.length) return "";
  const head = `<div class="tr head cols-fiscal-ex">
    <span>AÑO</span><span class="right">APORTADO</span>
    <span class="right">VALOR CIERRE</span><span class="right">GANANCIA LATENTE</span>
    <span class="right">IMPUESTO EST.</span><span class="right">GANANCIA NETA</span>
    <span class="right">RENT. AÑO</span>
  </div>`;
  const rows = [...g].reverse().map(y => {
    const imp  = calcImpuestoPlusvalia(y.ganancia);
    const neto = y.ganancia - imp;
    const sinImp = imp === 0;
    return `
      <div class="tr cols-fiscal-ex">
        <span class="bebas" style="color:var(--accent);font-size:17px">${y.ano}</span>
        <span class="mono right" style="color:var(--mute)" data-l="APORTADO">${fmtE(y.aportadoAno)}</span>
        <span class="mono right bold" style="color:var(--text)" data-l="VALOR CIERRE">${fmtE(y.valorFin)}</span>
        <span class="mono right ${y.ganancia>=0?"pos":"neg"}" data-l="GANANCIA LATENTE">${fmtE(y.ganancia)}</span>
        <span class="mono right ${sinImp?"":"neg"}" style="${sinImp?"color:var(--dimmer)":""}" data-l="IMPUESTO EST.">${sinImp ? "—" : `-${fmtE(imp)}`}</span>
        <span class="mono right bold ${neto>=0?"pos":"neg"}" data-l="GANANCIA NETA">${fmtE(neto)}</span>
        <span class="mono right bold ${y.rentAno == null ? "" : (y.rentAno>=0?"pos":"neg")}" style="${y.rentAno == null ? "color:var(--dimmer)" : ""}" data-l="RENT. AÑO">${y.rentAno != null ? `${y.rentAno>=0?"+":""}${fmt(y.rentAno)}%` : "—"}</span>
      </div>`;
  }).join("");

  // Simulación venta total hoy
  const ult = filas.at(-1);
  const gananciaTotal = ult ? ult.ganancia : 0;
  const impTotal      = calcImpuestoPlusvalia(gananciaTotal);
  const netoTotal     = gananciaTotal - impTotal;
  const tipoEf        = tipoMedioEfectivo(gananciaTotal);

  const simVenta = gananciaTotal > 0 ? `
    <div class="sim-venta">
      <div class="sim-venta-head">
        <span class="sim-venta-tit">SIMULACIÓN · VENDER HOY</span>
        <span class="sim-venta-info">Aplicando tramos IRPF base del ahorro 2026</span>
      </div>
      <div class="sim-venta-grid">
        <div><div class="sv-l">GANANCIA BRUTA</div> <div class="sv-v pos">${fmtE(gananciaTotal)}</div></div>
        <div><div class="sv-l">IMPUESTO ESTIMADO</div><div class="sv-v neg">-${fmtE(impTotal)}</div></div>
        <div><div class="sv-l">GANANCIA NETA</div>  <div class="sv-v" style="color:var(--accent)">${fmtE(netoTotal)}</div></div>
        <div><div class="sv-l">TIPO MEDIO EFECTIVO</div><div class="sv-v" style="color:var(--mute)">${fmt(tipoEf*100, 1)}%</div></div>
      </div>
    </div>` : "";

  return `<div class="panel" style="margin-top:28px">
    <div class="panel-title">RESUMEN FISCAL ANUAL</div>
    <div class="table">${head}${rows}</div>
    ${simVenta}
  </div>`;
}

// Panel de KPIs avanzados al final de la vista (debajo del Resumen Fiscal).
// Sortino · Aportación mensual media · Racha máx positiva · DCA Automático.
function renderKpisExtra(filasFull, ultima, tirAnual) {
  if (!filasFull?.length) return "";
  const sortino     = calcSortino(filasFull, tirAnual);
  const aportMedia  = calcAportacionMedia(filasFull, 3);
  const racha       = calcRachaMaxPositiva(filasFull);
  const dcaAuto     = calcDCAAutomatico(ultima);

  const items = [
    { l: "SORTINO",
      v: sortino != null ? fmt(sortino) : "—",
      s: sortino != null
        ? (sortino >= 2 ? "Excelente" : sortino >= 1 ? "Bueno" : sortino >= 0 ? "Moderado" : "Negativo")
        : "Mín. 3 meses o sin caídas",
      c: sortino == null ? "var(--dimmer)"
         : (sortino >= 2 ? "var(--green)" : sortino >= 1 ? "var(--yellow)" : sortino >= 0 ? "var(--mute)" : "var(--red)"),
      tip: "Ratio de Sortino: como Sharpe pero solo penaliza la volatilidad negativa (downside deviation). Más justo para activos asimétricos: si el producto sube con saltos grandes y baja con saltos pequeños, Sortino lo refleja mejor." },
    { l: "APORTACIÓN MEDIA",
      v: aportMedia != null ? fmtE(aportMedia) : "—",
      s: aportMedia != null
        ? `Últimos ${Math.min(3, filasFull.length)} meses`
        : "Sin datos",
      c: aportMedia == null ? "var(--dimmer)" : "var(--text)",
      tip: "Aportación total mensual media (manual + saveback + round-up) de los últimos meses. Mide tu ritmo real de DCA." },
    { l: "RACHA POSITIVA",
      v: racha > 0 ? `${racha} ${racha === 1 ? "mes" : "meses"}` : "—",
      s: racha > 0 ? "Máx. meses al alza seguidos" : "Aún no hay rachas",
      c: racha === 0 ? "var(--dimmer)" : (racha >= 6 ? "var(--green)" : racha >= 3 ? "var(--yellow)" : "var(--text)"),
      tip: "Mayor número de meses consecutivos cerrando en positivo. Indicador del 'mejor tramo' que ha tenido el producto." },
    { l: "DCA AUTOMÁTICO",
      v: dcaAuto != null ? `${fmt(dcaAuto)}%` : "—",
      s: dcaAuto != null
        ? `Saveback + Round-up sobre total`
        : "Sin aportaciones",
      c: dcaAuto == null ? "var(--dimmer)" : (dcaAuto >= 30 ? "var(--green)" : dcaAuto >= 10 ? "var(--yellow)" : "var(--mute)"),
      tip: "Porcentaje del total aportado que viene de Saveback + Round-up frente a aportaciones manuales. Mide cuánto de tu inversión es 'esfuerzo cero' (automatizada)." },
  ];

  return `<div class="panel" style="margin-top:28px">
    <div class="panel-title">KPIS AVANZADOS</div>
    <div class="kpis kpis-extra">
      ${items.map(k => `
        <div class="kpi">
          <div class="kpi-label">${k.l}${k.tip ? `<span class="kpi-info" tabindex="0" role="button" aria-label="Información sobre ${esc(k.l)}" data-tip="${esc(k.tip)}">i</span>` : ""}</div>
          <div class="kpi-value" style="color:${k.c}">${k.v}</div>
          <div class="kpi-sub">${k.s}</div>
        </div>`).join("")}
    </div>
  </div>`;
}

function renderProyeccion() {
  const filasTot         = statsTotalCalc();
  const valorActualTotal = filasTot.length ? filasTot.at(-1).valor : 0;
  const ultimos          = filasTot.slice(-3);
  const aportBaseAuto    = ultimos.length
    ? Math.round(ultimos.reduce((s,f) => s + f.aportacion, 0) / ultimos.length)
    : 400;
  const aportBase = state.aportMensual !== null ? state.aportMensual : aportBaseAuto;

  const tirCartera  = filasTot.length >= 2 ? calcTIR(filasTot) : null;
  const conservador = calcProyeccion(valorActualTotal, aportBase, state.horizonte, 0.06);
  const optimista   = calcProyeccion(valorActualTotal, aportBase, state.horizonte, 0.08);
  const realista    = tirCartera != null
    ? calcProyeccion(valorActualTotal, aportBase, state.horizonte, tirCartera)
    : null;
  const finalC  = conservador.at(-1);
  const finalO  = optimista.at(-1);
  const finalR  = realista?.at(-1);
  const totalAp = finalC?.aportado || 0;

  // Inicializar visibilidad de productos (todo ON por defecto)
  if (!state.proyProductos) state.proyProductos = {};
  state.productos.forEach(p => {
    if (state.proyProductos[p.id] === undefined) state.proyProductos[p.id] = true;
  });

  // Proyección individual por producto
  const prodData = state.productos.map(p => {
    const ents    = [...(state.entradas[p.id] || [])].sort((a,b) => a.fecha.localeCompare(b.fecha));
    const lastVal = ents.at(-1)?.valor || 0;
    const tir     = ents.length >= 2 ? calcTIR(ents) : null;
    const ultP    = ents.slice(-3);
    const aportP  = ultP.length
      ? Math.round(ultP.reduce((s,e) => s + aportTotal(e), 0) / ultP.length)
      : 0;
    return { ...p, tir, aportP, lastVal };
  }).filter(p => p.tir != null && p.lastVal > 0);

  const scenarios = [
    { l: "CONSERVADOR", t: "6% anual",
      v: finalC?.valor, g: (finalC?.valor||0) - totalAp,
      cls: "cons", scenCls: "scen-cons" },
    ...(realista ? [{
      l: "REALISTA · TIR HISTÓRICA", t: `${tirCartera>=0?"+":""}${fmt(tirCartera*100)}% anual`,
      v: finalR?.valor, g: (finalR?.valor||0) - totalAp,
      cls: "real", scenCls: "scen-real" }] : []),
    { l: "OPTIMISTA",   t: "8% anual",
      v: finalO?.valor, g: (finalO?.valor||0) - totalAp,
      cls: "opt",  scenCls: "scen-opt" },
  ];

  // ── Monte Carlo (si hay suficientes datos para estimar volatilidad) ──
  const mcStats = { posible: false, cards: [], percs: null, labels: null, aportLine: null };
  const rentMensuales = filasTot.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (rentMensuales.length >= 6 && valorActualTotal > 0) {
    const mediaPct  = rentMensuales.reduce((s,v) => s+v, 0) / rentMensuales.length;
    const variancia = rentMensuales.reduce((s,v) => s + (v - mediaPct)**2, 0) / (rentMensuales.length - 1);
    const stdPct    = Math.sqrt(variancia);
    const meses     = state.horizonte * 12;
    const nSims     = 2000;
    const trays = simulateMonteCarlo({
      valorInicial: valorActualTotal,
      aportMensual: aportBase,
      meses,
      mediaMensual: mediaPct / 100,
      stdMensual:   stdPct / 100,
      nSims,
    });
    const PERC = [5, 25, 50, 75, 95];
    const percsFull = percentilesPorMes(trays, PERC);

    // Muestrear anualmente para que el chart sea ligero
    const labelsMC = [];
    const percsAnual = PERC.map(() => []);
    const aportLine  = [];
    const h = new Date();
    for (let m = 0; m <= meses; m++) {
      const f = new Date(h.getFullYear(), h.getMonth() + m, 1);
      if (m === 0 || f.getMonth() === 0 || m === meses) {
        labelsMC.push(m === 0 ? "Hoy" : `${f.getFullYear()}`);
        PERC.forEach((_, i) => percsAnual[i].push(Math.round(percsFull[i][m])));
        aportLine.push(Math.round(valorActualTotal + aportBase * m));
      }
    }

    const finalP5  = percsAnual[0].at(-1);
    const finalP50 = percsAnual[2].at(-1);
    const finalP95 = percsAnual[4].at(-1);
    mcStats.posible = true;
    mcStats.nSims   = nSims;
    mcStats.labels  = labelsMC;
    mcStats.percs   = percsAnual;
    mcStats.aportLine = aportLine;
    mcStats.mediaMensualPct = mediaPct;
    mcStats.stdMensualPct   = stdPct;
    mcStats.cards   = [
      { l: "P5 · PESIMISTA",  v: finalP5,  s: "5% de los escenarios queda por debajo", cls: "mc-low" },
      { l: "P50 · MEDIANA",   v: finalP50, s: "Resultado más probable",                 cls: "mc-mid" },
      { l: "P95 · OPTIMISTA", v: finalP95, s: "5% de los escenarios queda por encima", cls: "mc-high" },
    ];
  }

  const checkboxesHtml = prodData.length ? `
    <div class="proy-prods">
      <div class="proy-prods-title">PROYECCIÓN INDIVIDUAL DE PRODUCTOS</div>
      <div class="proy-prods-list">
        ${prodData.map(p => `
          <label class="proy-prod-item">
            <input type="checkbox" data-prod-proy="${esc(p.id)}" ${state.proyProductos[p.id] ? "checked" : ""}>
            <span class="proy-prod-dot" style="background:${p.color}"></span>
            <span class="proy-prod-nombre">${esc(p.nombre)}</span>
            <span class="proy-prod-tir">${p.tir>=0?"+":""}${fmt(p.tir*100)}% TIR</span>
          </label>`).join("")}
      </div>
    </div>` : "";

  const html = `
    <div class="title-row">
      <div>
        <h2 style="color:var(--purple)">PROYECCIÓN FUTURA</h2>
        <div class="subtitle">Basada en el valor actual total de la cartera</div>
      </div>
    </div>

    <div class="proy-controls">
      <div>
        <div class="label-row">
          <label>HORIZONTE TEMPORAL</label>
          <span class="val">${state.horizonte} AÑOS</span>
        </div>
        <input type="range" min="1" max="40" value="${state.horizonte}" id="rangeHoriz">
        <div class="range-marks">
          ${[5,10,20,30,40].map(v => `<button class="${state.horizonte===v?"active":""}" data-h="${v}">${v}a</button>`).join("")}
        </div>
      </div>
      <div>
        <div class="label-row">
          <label>APORTACIÓN MENSUAL</label>
          <span class="val">${fmtE(aportBase)}</span>
        </div>
        <input type="range" min="50" max="2000" step="50" value="${aportBase}" id="rangeAport">
        <div class="range-marks">
          <span>50€</span>
          ${state.aportMensual !== null ? `<button class="reset" id="btnResetAport">reset a ${fmtE(aportBaseAuto)}</button>` : ""}
          <span>2.000€</span>
        </div>
      </div>
    </div>

    ${checkboxesHtml}

    <div class="scenarios">
      ${scenarios.map(s => `
        <div class="scenario ${s.scenCls}">
          <div class="scen-head">
            <div>
              <div class="scen-label">${s.l}</div>
              <div class="scen-value">${fmtE(s.v)}</div>
            </div>
            <span class="scen-tag">${s.t}</span>
          </div>
          <div class="scen-grid">
            <div><div class="l">APORTADO</div>   <div class="v" style="color:var(--dim)">${fmtE(totalAp)}</div></div>
            <div><div class="l">GANANCIA</div>   <div class="v">${fmtE(s.g)}</div></div>
            <div><div class="l">MULTIPLICAR</div><div class="v">×${fmt(valorActualTotal > 0 ? s.v/valorActualTotal : 0, 1)}</div></div>
          </div>
        </div>`).join("")}
    </div>

    <div class="panel">
      <div class="panel-title">EVOLUCIÓN PROYECTADA</div>
      <div class="chart-box tall"><canvas id="chartProy"></canvas></div>
    </div>

    ${mcStats.posible ? `
      <div class="panel">
        <div class="panel-title">SIMULACIÓN MONTE CARLO · ${mcStats.nSims} TRAYECTORIAS</div>
        <div class="mc-cards">
          ${mcStats.cards.map(c => `
            <div class="mc-card ${c.cls}">
              <div class="mc-card-label">${c.l}</div>
              <div class="mc-card-value">${fmtE(c.v)}</div>
              <div class="mc-card-sub">${c.s}</div>
            </div>`).join("")}
        </div>
        <div class="chart-box tall"><canvas id="chartMC"></canvas></div>
        <p class="mc-foot">Volatilidad mensual histórica ${fmt(mcStats.stdMensualPct)}% · retorno medio ${fmt(mcStats.mediaMensualPct)}%/mes</p>
      </div>` : ""}

    <p class="disclaimer">Proyección orientativa. No constituye asesoramiento financiero. Rentabilidades pasadas no garantizan resultados futuros.</p>`;

  $("#main").innerHTML = html;

  // Debounce los sliders para evitar re-render completo en cada movimiento del ratón.
  const rerenderProy = debounce(renderProyeccion, 50);
  $("#rangeHoriz").oninput = (e) => { state.horizonte = +e.target.value; updateRangeLabel("HORIZONTE TEMPORAL", `${state.horizonte} AÑOS`); rerenderProy(); };
  $$('[data-h]').forEach(b => b.onclick = () => { state.horizonte = +b.dataset.h; renderProyeccion(); });
  $("#rangeAport").oninput = (e) => { state.aportMensual = +e.target.value; updateRangeLabel("APORTACIÓN MENSUAL", fmtE(state.aportMensual)); rerenderProy(); };
  if ($("#btnResetAport")) $("#btnResetAport").onclick = () => { state.aportMensual = null; renderProyeccion(); };
  $$('[data-prod-proy]').forEach(cb => cb.onchange = () => {
    state.proyProductos[cb.dataset.prodProy] = cb.checked;
    renderProyeccion();
  });

  // Construir datasets del gráfico
  const labels = conservador.map(p => p.label);
  const datasets = [
    { label: "Aportado",
      data: conservador.map(d => d.aportado),
      borderColor: "#4B5563", borderWidth: 1.5, borderDash: [4, 3],
      backgroundColor: (c) => c.chart.chartArea ? makeGradient(c.chart.ctx, "#4B5563", c.chart.chartArea, 0.12) : "transparent",
      tension: 0.3, fill: true, pointRadius: 0 },
    { label: "Conservador 6%",
      data: conservador.map(d => d.valor),
      borderColor: "#6EE7B7", borderWidth: 2,
      backgroundColor: (c) => c.chart.chartArea ? makeGradient(c.chart.ctx, "#6EE7B7", c.chart.chartArea, 0.14) : "transparent",
      tension: 0.3, fill: true, pointRadius: 0 },
    { label: "Optimista 8%",
      data: optimista.map(d => d.valor),
      borderColor: "#FBBF24", borderWidth: 2,
      backgroundColor: (c) => c.chart.chartArea ? makeGradient(c.chart.ctx, "#FBBF24", c.chart.chartArea, 0.18) : "transparent",
      tension: 0.3, fill: true, pointRadius: 0 },
  ];

  if (realista) {
    datasets.push({
      label: `Realista ${tirCartera>=0?"+":""}${fmt(tirCartera*100)}%`,
      data: realista.map(d => d.valor),
      borderColor: "#A78BFA", borderWidth: 2.5, borderDash: [6, 2],
      backgroundColor: "transparent",
      tension: 0.3, fill: false, pointRadius: 0,
    });
  }

  prodData.filter(p => state.proyProductos[p.id]).forEach(p => {
    const proy = calcProyeccion(p.lastVal, p.aportP, state.horizonte, p.tir);
    datasets.push({
      label: p.nombre,
      data: proy.map(pt => pt.valor),
      borderColor: p.color, borderWidth: 1.5, borderDash: [3, 3],
      backgroundColor: "transparent",
      tension: 0.3, fill: false, pointRadius: 0,
    });
  });

  // Líneas horizontales de objetivos de cartera total
  state.objetivos.filter(o => o.productoId == null || o.productoId === "total").forEach(o => {
    datasets.push({
      label: `Meta: ${o.nombre}`,
      data: conservador.map(() => o.meta),
      borderColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderDash: [8, 4],
      backgroundColor: "transparent",
      pointRadius: 0, fill: false, tension: 0,
    });
  });

  // `destroyChart("proy")` no hace falta: render() ya invocó destroyAllCharts().
  drawChartProy(labels, datasets);

  if (mcStats.posible) {
    drawChartMonteCarlo(mcStats.labels, mcStats.percs, mcStats.aportLine);
  }
}

// Actualiza el .val de un label en proyección sin re-render (feedback inmediato del slider).
function updateRangeLabel(labelText, valor) {
  $$('.proy-controls .label-row').forEach(row => {
    if (row.querySelector('label')?.textContent === labelText) {
      const val = row.querySelector('.val');
      if (val) val.textContent = valor;
    }
  });
}

function renderFIRE() {
  const fireColor = "#34D399";
  const filasTot  = statsTotalCalc();
  const valorAct  = filasTot.length ? filasTot.at(-1).valor : 0;
  const tirHist   = filasTot.length >= 2 ? calcTIR(filasTot) : null;

  // Aportación: media últimos 3 meses (igual criterio que proyección)
  const ultimos = filasTot.slice(-3);
  const aportMensual = ultimos.length
    ? Math.round(ultimos.reduce((s,f) => s + f.aportacion, 0) / ultimos.length)
    : 0;

  const gasto      = state.fireGasto || 2000;
  const regla      = state.fireRegla || 0.04;
  const capitalObj = (gasto * 12) / regla;
  const gap        = capitalObj - valorAct;
  const pctCompl   = capitalObj > 0 ? Math.min((valorAct / capitalObj) * 100, 100) : 0;

  // Año estimado FIRE: proyecta con TIR histórica (o 6% fallback) hasta cruzar capitalObj
  const tasaProy = tirHist != null && tirHist > 0 ? tirHist : 0.06;
  let anoFire = null, mesesFire = null;
  if (valorAct < capitalObj) {
    const tasaM = tasaProy / 12;
    let v = valorAct, m = 0;
    const maxMeses = 80 * 12;   // tope 80 años para evitar loop infinito
    while (v < capitalObj && m < maxMeses) {
      v = v * (1 + tasaM) + aportMensual;
      m++;
    }
    if (m < maxMeses) {
      mesesFire = m;
      const f = new Date(); f.setMonth(f.getMonth() + m);
      anoFire = f.getFullYear();
    }
  } else {
    mesesFire = 0;
    anoFire   = new Date().getFullYear();
  }

  // Monte Carlo: probabilidad de alcanzar el objetivo en cada horizonte
  const rentMensuales = filasTot.filter(f => f.rentMes != null).map(f => f.rentMes);
  let mcProbs = null;
  if (rentMensuales.length >= 6 && valorAct > 0) {
    const mediaPct = rentMensuales.reduce((s,v) => s+v, 0) / rentMensuales.length;
    const variancia = rentMensuales.reduce((s,v) => s + (v - mediaPct)**2, 0) / (rentMensuales.length - 1);
    const stdPct    = Math.sqrt(variancia);
    const horizontes = [5, 10, 15, 20, 25, 30];
    const maxMeses   = Math.max(...horizontes) * 12;
    const nSims      = 1500;
    const trays = simulateMonteCarlo({
      valorInicial: valorAct,
      aportMensual,
      meses: maxMeses,
      mediaMensual: mediaPct / 100,
      stdMensual:   stdPct / 100,
      nSims,
    });
    mcProbs = horizontes.map(h => {
      const mIdx = h * 12;
      const exitos = trays.reduce((acc, t) => acc + (t[mIdx] >= capitalObj ? 1 : 0), 0);
      return { ano: h, pct: (exitos / nSims) * 100 };
    });
  }

  const fechaActual = new Date();
  const anosRest    = mesesFire != null ? (mesesFire / 12) : null;

  const REGLAS = [
    { v: 0.03,  l: "3%",   desc: "Muy conservador" },
    { v: 0.035, l: "3.5%", desc: "Conservador"     },
    { v: 0.04,  l: "4%",   desc: "Estándar (Trinity)" },
    { v: 0.05,  l: "5%",   desc: "Agresivo"        },
  ];

  setAccentVars(fireColor);

  const html = `
    <div class="title-row">
      <div>
        <h2 style="color:${fireColor}">PLAN FIRE</h2>
        <div class="subtitle">Financial Independence · Retire Early</div>
      </div>
    </div>

    <div class="fire-controls">
      <div>
        <div class="label-row">
          <label>GASTO MENSUAL DESEADO</label>
          <span class="val">${fmtE(gasto)}</span>
        </div>
        <input type="range" min="500" max="10000" step="100" value="${gasto}" id="rangeFireGasto" style="accent-color:${fireColor}">
        <div class="range-marks">
          <span>500€</span><span>10.000€</span>
        </div>
      </div>
      <div>
        <div class="label-row">
          <label>REGLA DE RETIRADA</label>
          <span class="val">${(regla*100).toFixed(1)}%</span>
        </div>
        <div class="fire-reglas">
          ${REGLAS.map(r => `
            <button class="${Math.abs(r.v - regla) < 0.001 ? "active" : ""}" data-regla="${r.v}">
              <span class="fr-l">${r.l}</span>
              <span class="fr-d">${r.desc}</span>
            </button>`).join("")}
        </div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">CAPITAL OBJETIVO
          <span class="kpi-info" tabindex="0" role="button" aria-label="Información" data-tip="Capital necesario para vivir indefinidamente de las rentas. Calculado como gasto_anual ÷ regla_retirada. Con la regla del 4%, equivale a 25× tu gasto anual.">i</span>
        </div>
        <div class="kpi-value" style="color:${fireColor}">${fmtE(capitalObj)}</div>
        <div class="kpi-sub">${fmtE(gasto)} × 12 ÷ ${(regla*100).toFixed(1)}%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">VALOR ACTUAL</div>
        <div class="kpi-value" style="color:var(--accent)">${fmtE(valorAct)}</div>
        <div class="kpi-sub">${pctCompl.toFixed(1)}% del objetivo</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${gap > 0 ? "GAP RESTANTE" : "EXCEDENTE"}</div>
        <div class="kpi-value" style="color:${gap > 0 ? "var(--red)" : "var(--green)"}">${gap > 0 ? fmtE(gap) : `+${fmtE(-gap)}`}</div>
        <div class="kpi-sub">${gap > 0 ? `Faltan para FIRE` : "Ya puedes parar 🎉"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">AÑO ESTIMADO FIRE
          <span class="kpi-info" tabindex="0" role="button" aria-label="Información" data-tip="Proyección determinista con tu TIR histórica (${tirHist != null ? `${(tirHist*100).toFixed(1)}%` : '6% por defecto'}) y aportación mensual media de los últimos 3 meses (${fmtE(aportMensual)}). El año real puede variar significativamente.">i</span>
        </div>
        <div class="kpi-value" style="color:${anoFire ? fireColor : "var(--dimmer)"}">${anoFire ?? "—"}</div>
        <div class="kpi-sub">${anosRest != null ? `En ${anosRest.toFixed(1)} años` : "Datos insuficientes"}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">PROGRESO HACIA FIRE</div>
      <div class="fire-progress-track">
        <div class="fire-progress-fill" style="width:${pctCompl.toFixed(2)}%;background:${fireColor}"></div>
        <div class="fire-progress-label">${pctCompl.toFixed(1)}%</div>
      </div>
      <div class="fire-progress-foot">
        <span>${fmtE(0)}</span>
        <span style="color:${fireColor}">${fmtE(valorAct)} actual</span>
        <span>${fmtE(capitalObj)} objetivo</span>
      </div>
    </div>

    ${mcProbs ? `
      <div class="panel">
        <div class="panel-title">PROBABILIDAD MONTE CARLO · 1500 TRAYECTORIAS</div>
        <p class="mc-foot" style="margin-bottom:12px;text-align:left">Probabilidad de alcanzar el objetivo de ${fmtE(capitalObj)} en cada horizonte.</p>
        <div class="fire-probs">
          ${mcProbs.map(p => `
            <div class="fire-prob">
              <div class="fp-y">${p.ano} años</div>
              <div class="fp-bar"><div class="fp-fill" style="width:${p.pct.toFixed(1)}%;background:${p.pct >= 75 ? "var(--green)" : p.pct >= 50 ? "var(--yellow)" : p.pct >= 25 ? "var(--gold)" : "var(--red)"}"></div></div>
              <div class="fp-v">${p.pct.toFixed(0)}%</div>
            </div>`).join("")}
        </div>
      </div>` : ""}

    <div class="panel">
      <div class="panel-title">EQUIVALENCIAS</div>
      <div class="fire-eq">
        <div><span class="fe-l">Capital objetivo equivale a</span> <span class="fe-v">${(capitalObj / gasto).toFixed(0)} meses de gasto</span></div>
        <div><span class="fe-l">Con tu TIR histórica de</span> <span class="fe-v">${tirHist != null ? `${(tirHist*100).toFixed(1)}%` : '— (usando 6%)'}</span></div>
        <div><span class="fe-l">Aportación mensual media</span> <span class="fe-v">${fmtE(aportMensual)}</span></div>
        <div><span class="fe-l">Renta pasiva mensual al alcanzar FIRE</span> <span class="fe-v" style="color:${fireColor}">${fmtE(capitalObj * regla / 12)}</span></div>
      </div>
    </div>

    <p class="disclaimer">Cálculo orientativo basado en la regla de retirada constante (Trinity Study). No considera inflación, fiscalidad ni shocks de mercado. La regla del 4% asume un horizonte de 30 años con cartera 60/40.</p>
  `;

  $("#main").innerHTML = html;

  $("#rangeFireGasto").oninput = (e) => {
    state.fireGasto = +e.target.value;
    saveState();
    renderFIRE();
  };
  $$('[data-regla]').forEach(b => b.onclick = () => {
    state.fireRegla = parseFloat(b.dataset.regla);
    saveState();
    renderFIRE();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7b. VISTA · ASIGNACIÓN OBJETIVO + DRIFT
// ═══════════════════════════════════════════════════════════════════════════

// Calcula sugerencia de aportación que minimiza drift. Solo aporta, nunca vende.
// Si la suma de gaps positivos cabe en el aporte, llena cada gap. Si no,
// distribuye proporcionalmente al gap restante.
function sugerirAportacion(productos, aporte) {
  if (aporte <= 0) return productos.map(p => ({ ...p, aportar: 0 }));
  const valorTotalActual = productos.reduce((s, p) => s + p.valorActual, 0);
  const totalNuevo       = valorTotalActual + aporte;
  // Gap por producto contra el target del NUEVO total
  const conGap = productos.map(p => {
    const targetValor = totalNuevo * (p.pctObjetivo / 100);
    const gap         = Math.max(0, targetValor - p.valorActual);
    return { ...p, targetValor, gap };
  });
  const sumGaps = conGap.reduce((s, p) => s + p.gap, 0);
  if (sumGaps === 0) {
    // Sin gaps: reparto proporcional al objetivo
    return conGap.map(p => ({ ...p, aportar: aporte * (p.pctObjetivo / 100) }));
  }
  if (sumGaps <= aporte) {
    // Llena cada gap y el sobrante se distribuye según objetivo entre todos
    const sobra = aporte - sumGaps;
    const sumObj = conGap.reduce((s, p) => s + p.pctObjetivo, 0) || 1;
    return conGap.map(p => ({
      ...p,
      aportar: p.gap + sobra * (p.pctObjetivo / sumObj),
    }));
  }
  // Aporte insuficiente: distribuye proporcionalmente al gap
  return conGap.map(p => ({
    ...p,
    aportar: aporte * (p.gap / sumGaps),
  }));
}

function renderAsignacion() {
  const accent = "#22D3EE";

  // Recolectar productos con valor actual (último valor) y % objetivo
  const items = state.productos.map(p => {
    const ents = (state.entradas[p.id] || []);
    const valorActual = ents.length ? ents.at(-1).valor : 0;
    return {
      id:           p.id,
      nombre:       p.nombre,
      color:        p.color,
      pctObjetivo:  Number.isFinite(+p.asignacionObjetivo) ? +p.asignacionObjetivo : 0,
      valorActual,
    };
  });
  const totalActual = items.reduce((s, p) => s + p.valorActual, 0);
  const sumObjetivo = items.reduce((s, p) => s + p.pctObjetivo, 0);
  const conPct = items.map(p => ({
    ...p,
    pctActual: totalActual > 0 ? (p.valorActual / totalActual) * 100 : 0,
  }));
  // Drift por producto = pctActual - pctObjetivo
  const driftMax = conPct.reduce((m, p) => Math.max(m, Math.abs(p.pctActual - p.pctObjetivo)), 0);

  const aporte = Number.isFinite(+state.asignacionAporte) ? +state.asignacionAporte : 0;
  const sugerencias = sugerirAportacion(conPct, aporte);

  const headerKpis = `
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">VALOR ACTUAL</div>
        <div class="kpi-value" style="color:${accent}">${fmtE(totalActual)}</div>
        <div class="kpi-sub">${items.length} producto(s)</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">SUMA % OBJETIVO</div>
        <div class="kpi-value" style="color:${Math.abs(sumObjetivo - 100) < 0.5 ? 'var(--green)' : 'var(--yellow)'}">${fmt(sumObjetivo)}%</div>
        <div class="kpi-sub">${Math.abs(sumObjetivo - 100) < 0.5 ? '✓ Suma 100%' : 'Ajusta hasta llegar a 100%'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">DRIFT MÁX</div>
        <div class="kpi-value" style="color:${driftMax > 5 ? 'var(--red)' : driftMax > 2 ? 'var(--yellow)' : 'var(--green)'}">${fmt(driftMax)}%</div>
        <div class="kpi-sub">Mayor desviación absoluta</div>
      </div>
    </div>`;

  const sinObjetivos = sumObjetivo === 0;

  let tablaActualHTML;
  if (sinObjetivos) {
    tablaActualHTML = `<div class="panel"><div class="empty" style="padding:36px 0">
      <div class="empty-title">SIN ASIGNACIÓN CONFIGURADA</div>
      <div class="empty-sub">Edita cada producto y define un "% OBJETIVO EN CARTERA"</div>
    </div></div>`;
  } else {
    tablaActualHTML = `
      <div class="panel">
        <div class="panel-title">DRIFT ACTUAL VS OBJETIVO</div>
        <div class="asig-table">
          <div class="asig-row asig-head">
            <span>PRODUCTO</span><span>VALOR</span><span>ACTUAL %</span><span>OBJETIVO %</span><span>DRIFT</span>
          </div>
          ${conPct.map(p => {
            const drift = p.pctActual - p.pctObjetivo;
            const driftCls = Math.abs(drift) > 5 ? "asig-drift-high" : Math.abs(drift) > 2 ? "asig-drift-mid" : "asig-drift-ok";
            return `
              <div class="asig-row">
                <span data-l="PRODUCTO"><span class="asig-dot" style="background:${p.color}"></span>${esc(p.nombre)}</span>
                <span data-l="VALOR">${fmtE(p.valorActual)}</span>
                <span data-l="ACTUAL">${fmt(p.pctActual)}%</span>
                <span data-l="OBJETIVO">${fmt(p.pctObjetivo)}%</span>
                <span data-l="DRIFT" class="${driftCls}">${drift>=0?"+":""}${fmt(drift)}%</span>
                <div class="asig-bar">
                  <div class="asig-bar-actual" style="width:${Math.min(p.pctActual, 100)}%;background:${p.color}"></div>
                  <div class="asig-bar-target" style="left:${Math.min(p.pctObjetivo, 100)}%"></div>
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  // Simulador de aportación
  const sumSug = sugerencias.reduce((s, p) => s + p.aportar, 0);
  const simuladorHTML = sinObjetivos ? "" : `
    <div class="panel">
      <div class="panel-title">SIMULADOR · ¿CUÁNTO APORTAR Y A DÓNDE?</div>
      <div class="asig-sim-input">
        <label>Voy a aportar (€)</label>
        <input type="number" min="0" step="50" id="asigAporte" value="${aporte || ''}" placeholder="500">
        <div class="asig-sim-presets">
          <button data-aporte="100">100</button>
          <button data-aporte="250">250</button>
          <button data-aporte="500">500</button>
          <button data-aporte="1000">1000</button>
        </div>
      </div>
      ${aporte > 0 ? `
      <div class="asig-table">
        <div class="asig-row asig-head">
          <span>PRODUCTO</span><span>APORTAR</span><span>% NUEVO</span><span>DRIFT NUEVO</span>
        </div>
        ${sugerencias.map(p => {
          const valorNuevo = p.valorActual + p.aportar;
          const totalNuevo = totalActual + aporte;
          const pctNuevo   = totalNuevo > 0 ? (valorNuevo / totalNuevo) * 100 : 0;
          const driftNuevo = pctNuevo - p.pctObjetivo;
          const driftCls = Math.abs(driftNuevo) > 5 ? "asig-drift-high" : Math.abs(driftNuevo) > 2 ? "asig-drift-mid" : "asig-drift-ok";
          return `
            <div class="asig-row">
              <span data-l="PRODUCTO"><span class="asig-dot" style="background:${p.color}"></span>${esc(p.nombre)}</span>
              <span data-l="APORTAR" class="asig-aporte" style="color:${accent}">${fmtE(p.aportar)}</span>
              <span data-l="% NUEVO">${fmt(pctNuevo)}%</span>
              <span data-l="DRIFT NUEVO" class="${driftCls}">${driftNuevo>=0?"+":""}${fmt(driftNuevo)}%</span>
            </div>`;
        }).join("")}
        <div class="asig-row asig-total">
          <span data-l="TOTAL">TOTAL</span>
          <span data-l="APORTAR" style="color:${accent}">${fmtE(sumSug)}</span>
          <span></span>
          <span></span>
        </div>
      </div>` : `<div class="asig-empty">Introduce una cantidad para ver la distribución sugerida</div>`}
    </div>`;

  const html = `
    <div class="title-row">
      <div>
        <h2 style="color:${accent}">ASIGNACIÓN DE CARTERA</h2>
        <div class="subtitle">Drift y sugerencia de aportación que minimiza la desviación</div>
      </div>
    </div>
    ${headerKpis}
    ${tablaActualHTML}
    ${simuladorHTML}
  `;
  $("#main").innerHTML = html;

  // Bindings
  if ($("#asigAporte")) {
    $("#asigAporte").oninput = debounce((e) => {
      state.asignacionAporte = parseFloat(e.target.value) || 0;
      renderAsignacion();
    }, 200);
  }
  $$('[data-aporte]').forEach(b => b.onclick = () => {
    state.asignacionAporte = +b.dataset.aporte;
    renderAsignacion();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7c. VISTA · DIFF ENTRE SNAPSHOTS
// ═══════════════════════════════════════════════════════════════════════════

function snapshotEstadoActual() {
  return {
    id:       "current",
    fecha:    new Date().toISOString(),
    productos: state.productos,
    entradas:  state.entradas,
  };
}

function resumenSnapshot(snap) {
  // Suma de valor actual + aportado por producto. Devuelve { porProd: [...], totalValor, totalAportado }
  const porProd = (snap.productos || []).map(p => {
    const ents = (snap.entradas?.[p.id] || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const valorActual  = ents.length ? ents.at(-1).valor : 0;
    const aportado     = ents.reduce((s, e) => s + (e.manual || 0) + (e.saveback || 0) + (e.roundup || 0), 0);
    return {
      id: p.id, nombre: p.nombre, color: p.color,
      valorActual, aportado,
      ganancia: valorActual - aportado,
      nEntradas: ents.length,
    };
  });
  return {
    porProd,
    totalValor:    porProd.reduce((s, p) => s + p.valorActual, 0),
    totalAportado: porProd.reduce((s, p) => s + p.aportado, 0),
  };
}

function renderDiff() {
  const accent = "#FB923C";
  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2 style="color:${accent}">COMPARAR SNAPSHOTS</h2>
        <div class="subtitle">Evolución entre dos puntos guardados</div>
      </div>
    </div>
    <div class="panel"><div class="diff-loading">Cargando snapshots…</div></div>
  `;
  listarSnapshots().then(snaps => renderDiffSync(snaps));
}

function renderDiffSync(snaps) {
  const accent = "#FB923C";
  const opciones = [
    { id: "current", label: "Estado actual" },
    ...snaps.map(s => ({ id: String(s.id), label: formatSnapDate(s.fecha) })),
  ];

  if (snaps.length === 0) {
    $("#main").innerHTML = `
      <div class="title-row">
        <div>
          <h2 style="color:${accent}">COMPARAR SNAPSHOTS</h2>
          <div class="subtitle">Evolución entre dos puntos guardados</div>
        </div>
      </div>
      <div class="panel"><div class="empty" style="padding:60px 0">
        <div class="empty-title">SIN SNAPSHOTS GUARDADOS</div>
        <div class="empty-sub">Crea al menos uno desde el menú lateral · <kbd>S</kbd></div>
      </div></div>
    `;
    return;
  }

  // Defaults si no hay selección o IDs huérfanos
  const validIds = new Set(opciones.map(o => o.id));
  if (!state.diffSnapA || !validIds.has(String(state.diffSnapA))) {
    state.diffSnapA = String(snaps[snaps.length - 1].id);   // el más antiguo
  }
  if (!state.diffSnapB || !validIds.has(String(state.diffSnapB))) {
    state.diffSnapB = "current";
  }

  const snapById = (id) => id === "current"
    ? snapshotEstadoActual()
    : snaps.find(s => String(s.id) === String(id));
  const snapA = snapById(state.diffSnapA);
  const snapB = snapById(state.diffSnapB);

  const resA = resumenSnapshot(snapA);
  const resB = resumenSnapshot(snapB);

  // Unión de productos (puede haber ID que solo está en uno)
  const ids = new Set([...resA.porProd.map(p => p.id), ...resB.porProd.map(p => p.id)]);
  const filas = [...ids].map(id => {
    const a = resA.porProd.find(p => p.id === id);
    const b = resB.porProd.find(p => p.id === id);
    const ref = b || a;
    return {
      id,
      nombre: ref.nombre,
      color:  ref.color,
      valorA:    a?.valorActual || 0,
      valorB:    b?.valorActual || 0,
      aportadoA: a?.aportado    || 0,
      aportadoB: b?.aportado    || 0,
      gananciaA: a?.ganancia    || 0,
      gananciaB: b?.ganancia    || 0,
      soloEnA:   !!a && !b,
      soloEnB:   !a && !!b,
    };
  });

  const dValor   = resB.totalValor    - resA.totalValor;
  const dAport   = resB.totalAportado - resA.totalAportado;
  const gananciaA = resA.totalValor - resA.totalAportado;
  const gananciaB = resB.totalValor - resB.totalAportado;
  const dGanancia = gananciaB - gananciaA;
  const colorD = (v) => v >= 0 ? "var(--green)" : "var(--red)";
  const signo  = (v) => v >= 0 ? "+" : "";

  // Tiempo transcurrido
  const tA = new Date(snapA.fecha).getTime();
  const tB = new Date(snapB.fecha).getTime();
  const dias = Math.abs((tB - tA) / 86400000);
  let lapso;
  if (dias < 1) lapso = "Menos de 1 día";
  else if (dias < 60) lapso = `${Math.round(dias)} días`;
  else if (dias < 730) lapso = `${(dias/30).toFixed(1)} meses`;
  else lapso = `${(dias/365).toFixed(1)} años`;

  const selectorHTML = `
    <div class="panel">
      <div class="diff-selectors">
        <div class="diff-sel">
          <label>SNAPSHOT A</label>
          <select id="diffA">
            ${opciones.map(o => `<option value="${esc(o.id)}" ${String(o.id)===String(state.diffSnapA)?"selected":""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <div class="diff-vs">vs</div>
        <div class="diff-sel">
          <label>SNAPSHOT B</label>
          <select id="diffB">
            ${opciones.map(o => `<option value="${esc(o.id)}" ${String(o.id)===String(state.diffSnapB)?"selected":""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <div class="diff-lapso">${lapso}</div>
      </div>
    </div>`;

  const kpisHTML = `
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">VALOR</div>
        <div class="kpi-value">${fmtE(resA.totalValor)} → ${fmtE(resB.totalValor)}</div>
        <div class="kpi-sub" style="color:${colorD(dValor)}">${signo(dValor)}${fmtE(dValor)} · ${signo(dValor)}${fmt(resA.totalValor > 0 ? (dValor/resA.totalValor)*100 : 0)}%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">APORTADO</div>
        <div class="kpi-value">${fmtE(resA.totalAportado)} → ${fmtE(resB.totalAportado)}</div>
        <div class="kpi-sub" style="color:${colorD(dAport)}">${signo(dAport)}${fmtE(dAport)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">GANANCIA</div>
        <div class="kpi-value" style="color:${colorD(gananciaB)}">${fmtE(gananciaA)} → ${fmtE(gananciaB)}</div>
        <div class="kpi-sub" style="color:${colorD(dGanancia)}">${signo(dGanancia)}${fmtE(dGanancia)}</div>
      </div>
    </div>`;

  const tablaHTML = `
    <div class="panel">
      <div class="panel-title">DETALLE POR PRODUCTO</div>
      <div class="diff-table">
        <div class="diff-row diff-head">
          <span>PRODUCTO</span><span>VALOR A</span><span>VALOR B</span><span>Δ VALOR</span><span>Δ GANANCIA</span>
        </div>
        ${filas.map(f => {
          const d = f.valorB - f.valorA;
          const dG = f.gananciaB - f.gananciaA;
          const cls = f.soloEnA ? "diff-removed" : f.soloEnB ? "diff-new" : "";
          return `
            <div class="diff-row ${cls}">
              <span data-l="PRODUCTO"><span class="asig-dot" style="background:${f.color}"></span>${esc(f.nombre)}${f.soloEnA?' <em>(eliminado)</em>':f.soloEnB?' <em>(nuevo)</em>':''}</span>
              <span data-l="VALOR A">${fmtE(f.valorA)}</span>
              <span data-l="VALOR B">${fmtE(f.valorB)}</span>
              <span data-l="Δ VALOR" style="color:${colorD(d)}">${signo(d)}${fmtE(d)}</span>
              <span data-l="Δ GANANCIA" style="color:${colorD(dG)}">${signo(dG)}${fmtE(dG)}</span>
            </div>`;
        }).join("")}
      </div>
    </div>`;

  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2 style="color:${accent}">COMPARAR SNAPSHOTS</h2>
        <div class="subtitle">${formatSnapDate(snapA.fecha)} → ${formatSnapDate(snapB.fecha)}</div>
      </div>
    </div>
    ${selectorHTML}
    ${kpisHTML}
    ${tablaHTML}
  `;

  $("#diffA").onchange = (e) => { state.diffSnapA = e.target.value; renderDiff(); };
  $("#diffB").onchange = (e) => { state.diffSnapB = e.target.value; renderDiff(); };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7d. VISTA · FISCALIDAD (simulador D-100, plusvalías 2026)
// ═══════════════════════════════════════════════════════════════════════════

// Aplica los tramos progresivos del ahorro a una base positiva.
function calcImpuestoTramos(baseEur) {
  if (!Number.isFinite(baseEur) || baseEur <= 0) return 0;
  let restante = baseEur;
  let total = 0, prev = 0;
  for (const t of FISCAL_TRAMOS_2026) {
    if (restante <= 0) break;
    const ancho = Math.min(restante, t.hasta - prev);
    total += ancho * t.tipo;
    restante -= ancho;
    prev = t.hasta;
    if (!Number.isFinite(t.hasta)) break;
  }
  return total;
}

// Calcula tipo marginal de un importe en los tramos.
function tipoMarginal(baseEur) {
  if (!Number.isFinite(baseEur) || baseEur <= 0) return 0;
  let prev = 0;
  for (const t of FISCAL_TRAMOS_2026) {
    if (baseEur <= t.hasta) return t.tipo;
    prev = t.hasta;
  }
  return FISCAL_TRAMOS_2026.at(-1).tipo;
}

function renderFiscal() {
  const accent = "#F87171";

  // Por producto: aportado acumulado = coste base, valor actual = valor final
  const filas = state.productos.map(p => {
    const ents = (state.entradas[p.id] || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const valorActual = ents.length ? ents.at(-1).valor : 0;
    const aportado    = ents.reduce((s, e) => s + (e.manual || 0) + (e.saveback || 0) + (e.roundup || 0), 0);
    const ganancia    = valorActual - aportado;
    return {
      id: p.id, nombre: p.nombre, color: p.color,
      valorActual, aportado, ganancia,
      pctGanancia: aportado > 0 ? (ganancia / aportado) * 100 : 0,
    };
  });

  // Estado del simulador: cuánto vende de cada producto
  if (!state.fiscalSim || typeof state.fiscalSim !== "object") state.fiscalSim = {};
  filas.forEach(f => {
    if (!Number.isFinite(state.fiscalSim[f.id])) state.fiscalSim[f.id] = 0;
    // si vende más del valor actual, recortar
    if (state.fiscalSim[f.id] > f.valorActual) state.fiscalSim[f.id] = f.valorActual;
  });

  // Plusvalía hipotética por producto (proporcional al valor vendido)
  const conPlus = filas.map(f => {
    const vender = state.fiscalSim[f.id] || 0;
    const plusvalia = f.valorActual > 0 ? vender * (f.ganancia / f.valorActual) : 0;
    return { ...f, vender, plusvalia };
  });

  // Ventas totales
  const totalVender    = conPlus.reduce((s, f) => s + f.vender, 0);
  const ganadores      = conPlus.filter(f => f.plusvalia > 0);
  const perdedores     = conPlus.filter(f => f.plusvalia < 0);
  const sumGanancias   = ganadores.reduce((s, f) => s + f.plusvalia, 0);
  const sumPerdidas    = Math.abs(perdedores.reduce((s, f) => s + f.plusvalia, 0));
  // Compensación con tope LIRPF: pérdidas pueden compensar 100% de la base del ahorro
  // (a partir de 2023 el tope inter-grupos es 25%, pero dentro del propio grupo es libre).
  const baseImponible  = Math.max(0, sumGanancias - sumPerdidas);
  const ahorroFiscal   = sumGanancias > 0 ? (calcImpuestoTramos(sumGanancias) - calcImpuestoTramos(baseImponible)) : 0;
  const impuesto       = calcImpuestoTramos(baseImponible);
  const tasaMarginal   = tipoMarginal(baseImponible);

  // ─── Resumen "si vendieras TODO hoy" ───
  const totVal     = filas.reduce((s, f) => s + f.valorActual, 0);
  const totApor    = filas.reduce((s, f) => s + f.aportado, 0);
  const totGanan   = totVal - totApor;
  const totBaseImp = Math.max(0, totGanan);
  const totImp     = calcImpuestoTramos(totBaseImp);

  const colorG = (v) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--mute)";

  const tramosHTML = `
    <div class="panel">
      <div class="panel-title">TRAMOS RENTA DEL AHORRO · 2026</div>
      <div class="fiscal-tramos">
        ${FISCAL_TRAMOS_2026.map((t, i) => {
          const prev = i === 0 ? 0 : FISCAL_TRAMOS_2026[i-1].hasta;
          const desde = i === 0 ? "0€" : fmtE(prev);
          const hasta = Number.isFinite(t.hasta) ? `${fmtE(t.hasta)}` : "∞";
          return `<div class="fiscal-tramo">
            <div class="ft-range">${desde} – ${hasta}</div>
            <div class="ft-tipo">${(t.tipo*100).toFixed(0)}%</div>
          </div>`;
        }).join("")}
      </div>
    </div>`;

  const kpisHTML = `
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">VALOR ACTUAL</div>
        <div class="kpi-value" style="color:${accent}">${fmtE(totVal)}</div>
        <div class="kpi-sub">Aportado: ${fmtE(totApor)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">PLUSVALÍA LATENTE</div>
        <div class="kpi-value" style="color:${colorG(totGanan)}">${totGanan>=0?"+":""}${fmtE(totGanan)}</div>
        <div class="kpi-sub">No tributa hasta venta</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">SI VENDIERAS TODO HOY</div>
        <div class="kpi-value" style="color:var(--red)">-${fmtE(totImp)}</div>
        <div class="kpi-sub">Impuesto · base ${fmtE(totBaseImp)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">NETO TRAS IMPUESTOS</div>
        <div class="kpi-value" style="color:var(--green)">${fmtE(totVal - totImp)}</div>
        <div class="kpi-sub">Si vendieras todo</div>
      </div>
    </div>`;

  // Simulador interactivo
  const simHTML = `
    <div class="panel">
      <div class="panel-title">SIMULADOR · ¿CUÁNTO PAGARÍA SI VENDIERA?</div>
      <div class="fiscal-sim-toolbar">
        <button class="fiscal-preset" data-pct="0">RESET</button>
        <button class="fiscal-preset" data-pct="25">25% de cada</button>
        <button class="fiscal-preset" data-pct="50">50% de cada</button>
        <button class="fiscal-preset" data-pct="100">100% de cada</button>
      </div>
      <div class="fiscal-table">
        <div class="fiscal-row fiscal-head">
          <span>PRODUCTO</span><span>VALOR</span><span>VENDER €</span><span>PLUSVALÍA</span>
        </div>
        ${conPlus.map(f => `
          <div class="fiscal-row">
            <span data-l="PRODUCTO"><span class="asig-dot" style="background:${f.color}"></span>${esc(f.nombre)}</span>
            <span data-l="VALOR">${fmtE(f.valorActual)}</span>
            <span data-l="VENDER €">
              <input type="number" min="0" max="${f.valorActual}" step="50" data-fiscal-vender="${esc(f.id)}" value="${f.vender || ""}" placeholder="0">
            </span>
            <span data-l="PLUSVALÍA" style="color:${colorG(f.plusvalia)}">${f.plusvalia>=0?"+":""}${fmtE(f.plusvalia)}</span>
          </div>`).join("")}
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">RESULTADO FISCAL DE LA SIMULACIÓN</div>
      <div class="fiscal-result">
        <div class="fr-row"><span>Ventas totales</span><strong>${fmtE(totalVender)}</strong></div>
        <div class="fr-row"><span>Ganancias brutas</span><strong style="color:var(--green)">+${fmtE(sumGanancias)}</strong></div>
        <div class="fr-row"><span>Pérdidas (compensan)</span><strong style="color:var(--red)">-${fmtE(sumPerdidas)}</strong></div>
        <div class="fr-row fr-sep"><span>Base imponible</span><strong>${fmtE(baseImponible)}</strong></div>
        <div class="fr-row"><span>Cuota a pagar</span><strong style="color:var(--red)">-${fmtE(impuesto)}</strong></div>
        ${ahorroFiscal > 0 ? `<div class="fr-row"><span>Ahorro por compensación</span><strong style="color:var(--green)">+${fmtE(ahorroFiscal)}</strong></div>` : ""}
        <div class="fr-row fr-final"><span>Líquido tras impuestos</span><strong style="color:${accent}">${fmtE(totalVender - impuesto)}</strong></div>
        <div class="fr-marg">Tipo marginal aplicado: ${(tasaMarginal*100).toFixed(0)}%</div>
      </div>
    </div>
  `;

  // Tax-loss harvesting
  const tlhHTML = (perdedores.length && ganadores.length && totalVender === 0) ? `
    <div class="panel">
      <div class="panel-title">💡 SUGERENCIA · TAX-LOSS HARVESTING</div>
      <div class="fiscal-tlh">
        <p>Tienes ${perdedores.length} producto(s) con pérdidas latentes que podrían compensar futuras ganancias:</p>
        <ul>
          ${perdedores.map(p => `<li><strong>${esc(p.nombre)}</strong>: <span style="color:var(--red)">${fmtE(p.ganancia)}</span></li>`).join("")}
        </ul>
        <p class="fiscal-tlh-info">Si materializas estas pérdidas vendiéndolas, podrás compensar hasta ${fmtE(Math.abs(perdedores.reduce((s,p)=>s+p.ganancia,0)))} de ganancias futuras (4 años) y ahorrar impuestos.</p>
      </div>
    </div>` : "";

  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2 style="color:${accent}">FISCALIDAD · D-100 SIMULADO</h2>
        <div class="subtitle">Estimación informativa de plusvalías · No es asesoramiento fiscal</div>
      </div>
    </div>
    ${kpisHTML}
    ${tramosHTML}
    ${simHTML}
    ${tlhHTML}
  `;

  // Bindings de los inputs por producto
  $$('[data-fiscal-vender]').forEach(inp => {
    inp.oninput = debounce((e) => {
      const id = e.target.dataset.fiscalVender;
      const v  = parseFloat(e.target.value) || 0;
      state.fiscalSim[id] = Math.max(0, v);
      renderFiscal();
    }, 200);
  });
  $$('[data-pct]').forEach(b => b.onclick = () => {
    const pct = parseFloat(b.dataset.pct) / 100;
    filas.forEach(f => { state.fiscalSim[f.id] = f.valorActual * pct; });
    renderFiscal();
  });
}

function renderObjetivos(productoId, valorActual) {
  const norm = v => (v == null || v === "total") ? null : v;
  const target = norm(productoId);
  const rel = state.objetivos.filter(o => norm(o.productoId) === target);
  if (!rel.length) return "";
  const items = rel.map(o => {
    const pct   = o.meta > 0 ? Math.min((valorActual / o.meta) * 100, 100) : 0;
    const done  = pct >= 100;
    const color = done ? "var(--green)" : "var(--accent)";
    return `
      <div class="obj-item">
        <div class="obj-item-head">
          <span class="obj-nombre">${esc(o.nombre)}</span>
          <span class="obj-meta">${fmtE(valorActual)} / ${fmtE(o.meta)}</span>
        </div>
        <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
        <div class="obj-item-foot">
          <span style="font-size:10px;font-family:monospace;color:${color}">${done ? "✓ COMPLETADO" : `${pct.toFixed(1)}%`}</span>
          ${!done ? `<span class="obj-rest">Faltan ${fmtE(o.meta - valorActual)}</span>` : ""}
        </div>
      </div>`;
  }).join("");
  return `<div class="panel"><div class="panel-title">OBJETIVOS</div><div class="obj-panel">${items}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. MODALS
// ═══════════════════════════════════════════════════════════════════════════

function openEntryModal(entry = null) {
  if (state.tab === "total" || state.tab === "proyeccion" || state.tab === "fire"
      || state.tab === "asignacion" || state.tab === "diff" || state.tab === "fiscal") return;
  state.editEntradaId = entry?.id || null;
  const prod   = state.productos.find(p => p.id === state.tab);
  const accent = getAccentColor();

  $("#meTitle").textContent     = entry ? "EDITAR ENTRADA" : "NUEVA ENTRADA";
  $("#meTitle").style.color     = accent;
  $("#meSub").textContent       = prod?.nombre || "";
  $("#meFecha").value           = entry?.fecha    ?? hoy();
  $("#meManual").value          = entry?.manual   ?? "";
  $("#meSaveback").value        = entry?.saveback ?? "";
  $("#meRoundup").value         = entry?.roundup  ?? "";
  $("#meValor").value           = entry?.valor    ?? "";
  $("#meNota").value            = entry?.nota     ?? "";
  recalcMETotal();
  setupCalcHelper(prod);
  $("#meSave").style.background = accent;
  $(".modal", $("#modalEntrada")).style.border = `1px solid ${accent}25`;
  $("#modalEntrada").classList.add("open");
}

// Configura la calculadora "unidades × precio" en el modal de entrada
function setupCalcHelper(prod) {
  const helper = $("#calcHelper");
  if (!prod) { helper.style.display = "none"; return; }
  const tieneUnidades = Number.isFinite(+prod.unidades) && +prod.unidades > 0;
  const tieneCripto   = !!prod.coingeckoId;
  const tienePrecMan  = Number.isFinite(+prod.precioManual) && +prod.precioManual > 0;
  if (!tieneUnidades && !tieneCripto && !tienePrecMan) {
    helper.style.display = "none";
    return;
  }
  helper.style.display = "block";
  $("#calcUnidades").value = tieneUnidades ? +prod.unidades : "";
  const price = getProductPriceSync(prod);
  if (price) {
    $("#calcPrecio").value = price.eur;
    $("#calcSource").textContent = price.source === "coingecko"
      ? `CoinGecko · ${priceAgeLabel(price.ts)}`
      : "Precio manual del producto";
  } else {
    $("#calcPrecio").value = "";
    $("#calcSource").textContent = "Introduce un precio";
  }
  // Si tiene coingeckoId pero la caché está fría, dispara refresh y actualiza
  if (tieneCripto && (!priceCache[prod.coingeckoId] ||
      Date.now() - priceCache[prod.coingeckoId].ts >= COINGECKO_TTL)) {
    fetchCoinGeckoPrice(prod.coingeckoId).then(res => {
      if (res && $("#modalEntrada").classList.contains("open")) {
        $("#calcPrecio").value = res.eur;
        $("#calcSource").textContent = `CoinGecko · ${priceAgeLabel(res.ts)}`;
        recalcCalcResult();
      }
    });
  }
  recalcCalcResult();
}

function recalcCalcResult() {
  const u = parseFloat($("#calcUnidades").value);
  const p = parseFloat($("#calcPrecio").value);
  const r = $("#calcResult");
  if (Number.isFinite(u) && Number.isFinite(p) && u > 0 && p > 0) {
    r.textContent = fmtE(u * p);
    r.classList.add("ready");
  } else {
    r.textContent = "—";
    r.classList.remove("ready");
  }
}

function recalcMETotal() {
  const t = (parseFloat($("#meManual").value)   || 0)
          + (parseFloat($("#meSaveback").value) || 0)
          + (parseFloat($("#meRoundup").value)  || 0);
  $("#meTotal").textContent = `Total: ${fmtE(t)}`;
}

function saveEntry() {
  const e = {
    id:       state.editEntradaId || Date.now(),
    fecha:    $("#meFecha").value,
    manual:   parseFloat($("#meManual").value)   || 0,
    saveback: parseFloat($("#meSaveback").value) || 0,
    roundup:  parseFloat($("#meRoundup").value)  || 0,
    valor:    parseFloat($("#meValor").value)    || 0,
    nota:     ($("#meNota").value || "").trim(),
  };
  const pid   = state.tab;
  const lista = state.entradas[pid] || [];
  const base  = state.editEntradaId ? lista.filter(x => x.id !== state.editEntradaId) : lista;
  state.entradas[pid] = [...base, e].sort((a,b) => a.fecha.localeCompare(b.fecha));
  saveState();
  $("#modalEntrada").classList.remove("open");
  state.editEntradaId = null;
  render();
  flash();
}

function openProdModal(prod = null) {
  state.editProdId = prod?.id || null;
  $("#mpNombre").value      = prod?.nombre || "";
  $("#mpRef").value         = prod?.referencia || "";
  $("#mpTipologia").value   = prod?.tipologia || "";
  $("#mpDivisa").value      = prod?.divisa || (prod ? "" : "EUR");
  $("#mpComentarios").value = prod?.comentarios || "";
  $("#mpUnidades").value      = prod?.unidades      ?? "";
  $("#mpPrecioManual").value  = prod?.precioManual  ?? "";
  $("#mpCoingeckoId").value   = prod?.coingeckoId   || "";
  $("#mpAsignacion").value    = prod?.asignacionObjetivo ?? "";
  $("#mpCoinGeckoStatus").textContent = "";
  $("#mpTipologiaList").innerHTML = TIPOLOGIAS.map(t => `<option value="${esc(t)}"></option>`).join("");
  $("#mpDivisaList").innerHTML    = DIVISAS.map(d => `<option value="${esc(d)}"></option>`).join("");
  state.productoColor       = prod?.color || COLORES[0];
  $("#mpTitle").textContent = prod ? "EDITAR PRODUCTO" : "NUEVO PRODUCTO";
  $("#mpSave").textContent  = prod ? "GUARDAR CAMBIOS" : "CREAR PRODUCTO";
  renderColorPicker();
  refreshProdSaveBtn();
  if (prod?.coingeckoId) verifyCoinGeckoId(prod.coingeckoId);
  $("#modalProd").classList.add("open");
  closeDrawer();
}

async function verifyCoinGeckoId(id) {
  const el = $("#mpCoinGeckoStatus");
  if (!el) return;
  if (!id) { el.textContent = ""; el.className = "field-hint"; return; }
  el.textContent = "Verificando…";
  el.className = "field-hint";
  const res = await fetchCoinGeckoPrice(id);
  if (res && Number.isFinite(res.eur)) {
    el.textContent = `✓ ${fmtE(res.eur)} · CoinGecko`;
    el.className = "field-hint ok";
  } else {
    el.textContent = `✗ ID no encontrado en CoinGecko`;
    el.className = "field-hint err";
  }
}

function renderColorPicker() {
  $("#mpColors").innerHTML = COLORES.map(c =>
    `<button class="color-btn ${state.productoColor===c?"active":""}" style="background:${c}" data-c="${c}"></button>`
  ).join("");
  $$('#mpColors .color-btn').forEach(b => b.onclick = () => {
    state.productoColor = b.dataset.c;
    renderColorPicker();
    refreshProdSaveBtn();
  });
}

function refreshProdSaveBtn() {
  const nom = $("#mpNombre").value.trim();
  const btn = $("#mpSave");
  btn.disabled         = !nom;
  btn.style.background = nom ? state.productoColor : "";
}

function saveProd() {
  const nombre = $("#mpNombre").value.trim();
  if (!nombre) return;
  const referencia  = $("#mpRef").value.trim();
  const tipologia   = $("#mpTipologia").value.trim();
  const divisa      = $("#mpDivisa").value.trim().toUpperCase();
  const comentarios = $("#mpComentarios").value.trim();
  const numOrZero = (id) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const unidades     = numOrZero("#mpUnidades");
  const precioManual = numOrZero("#mpPrecioManual");
  const coingeckoId  = $("#mpCoingeckoId").value.trim().toLowerCase();
  const asignRaw     = parseFloat($("#mpAsignacion").value);
  const asignacion   = Number.isFinite(asignRaw) ? Math.max(0, Math.min(100, asignRaw)) : 0;
  if (state.editProdId) {
    const prod = state.productos.find(p => p.id === state.editProdId);
    if (prod) {
      prod.nombre             = nombre;
      prod.referencia         = referencia;
      prod.tipologia          = tipologia;
      prod.divisa             = divisa;
      prod.comentarios        = comentarios;
      prod.color              = state.productoColor;
      prod.unidades           = unidades;
      prod.precioManual       = precioManual;
      prod.coingeckoId        = coingeckoId;
      prod.asignacionObjetivo = asignacion;
    }
  } else {
    const id = `prod_${Date.now()}`;
    state.productos.push({
      id, nombre, referencia, tipologia, divisa, comentarios,
      color: state.productoColor,
      unidades, precioManual, coingeckoId,
      asignacionObjetivo: asignacion,
    });
    state.entradas[id] = [];
    state.tab          = id;
    state.vistaAno     = false;
  }
  state.editProdId = null;
  if (coingeckoId) fetchCoinGeckoPrice(coingeckoId);
  saveState();
  $("#modalProd").classList.remove("open");
  render();
  flash();
}

function openObjetivosModal() {
  const sel = $("#objProducto");
  sel.innerHTML = [
    { id: "total", nombre: "Cartera Total" },
    ...state.productos,
  ].map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
  const ctx = (state.tab === "proyeccion" || state.tab === "fire") ? "total" : state.tab;
  sel.value = ctx;
  $("#objNombre").value = "";
  $("#objMeta").value   = "";
  refreshObjSaveBtn();
  renderObjetivosList();
  closeDrawer();
  $("#modalObjetivos").classList.add("open");
}

function renderObjetivosList() {
  const el = $("#objList");
  if (!state.objetivos.length) {
    el.innerHTML = `<p class="obj-empty">Sin objetivos aún. Añade tu primera meta.</p>`;
    return;
  }

  // Precalcular valor actual de cada contexto una sola vez (antes era O(n_obj × n_entradas))
  const valByPid = { total: statsTotalCalc().at(-1)?.valor || 0 };
  state.productos.forEach(p => {
    valByPid[p.id] = calcStats(state.entradas[p.id] || []).at(-1)?.valor || 0;
  });

  const groups = {};
  state.objetivos.forEach(o => {
    const k = (o.productoId == null || o.productoId === "total") ? "total" : o.productoId;
    (groups[k] = groups[k] || []).push(o);
  });
  let html = "";
  Object.entries(groups).forEach(([pid, objs]) => {
    const nom = pid === "total" ? "Cartera Total" : (state.productos.find(p => p.id === pid)?.nombre || pid);
    html += `<div class="obj-group-label">${esc(nom.toUpperCase())}</div>`;
    objs.forEach(o => {
      const val   = valByPid[pid] ?? 0;
      const pct   = o.meta > 0 ? Math.min((val / o.meta) * 100, 100) : 0;
      const done  = pct >= 100;
      html += `
        <div class="obj-modal-item">
          <div>
            <div class="obj-modal-nombre">${esc(o.nombre)}</div>
            <div class="obj-modal-meta">${fmtE(val)} / ${fmtE(o.meta)} · ${pct.toFixed(0)}%</div>
          </div>
          <button class="obj-del-btn" data-obj-del="${esc(o.id)}">✕</button>
        </div>
        <div class="obj-bar-track" style="margin-bottom:10px">
          <div class="obj-bar-fill" style="width:${pct.toFixed(1)}%;background:${done ? "var(--green)" : "var(--accent)"}"></div>
        </div>`;
    });
  });
  el.innerHTML = html;
  $$("[data-obj-del]").forEach(b => b.onclick = () => {
    if (!confirm("¿Eliminar este objetivo?")) return;
    state.objetivos = state.objetivos.filter(o => o.id !== b.dataset.objDel);
    saveState();
    renderObjetivosList();
    render();
  });
}

function refreshObjSaveBtn() {
  const nom  = $("#objNombre")?.value.trim();
  const meta = parseFloat($("#objMeta")?.value);
  const btn  = $("#objSave");
  btn.disabled = !nom || !(meta > 0);
}

function saveObjetivo() {
  const nombre     = $("#objNombre").value.trim();
  const meta       = parseFloat($("#objMeta").value);
  const productoId = $("#objProducto").value;
  if (!nombre || !(meta > 0)) return;
  state.objetivos.push({ id: `obj_${Date.now()}`, nombre, meta, productoId: productoId === "total" ? null : productoId });
  saveState();
  $("#objNombre").value = "";
  $("#objMeta").value   = "";
  refreshObjSaveBtn();
  renderObjetivosList();
  render();
  flash();
}

function fmtBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1048576)     return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

async function renderStorageBar() {
  const el = $("#storageInfo");
  if (!el) return;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const pct      = quota > 0 ? (usage / quota) * 100 : 0;
    const fillColor = pct > 75 ? "var(--red)" : pct > 40 ? "var(--yellow)" : "var(--green)";
    el.innerHTML = `
      <div class="storage-label">
        <span>INDEXEDDB · ESPACIO OCUPADO</span>
        <span class="storage-sizes">${fmtBytes(usage)} <span class="storage-sep">/</span> ${fmtBytes(quota)}</span>
      </div>
      <div class="storage-track">
        <div class="storage-fill" style="width:${Math.min(pct,100).toFixed(3)}%;background:${fillColor}"></div>
      </div>
      <div class="storage-sub">${pct.toFixed(3)}% del almacenamiento de origen utilizado</div>`;
  } catch {
    el.innerHTML = `<p class="storage-na">Estimación de almacenamiento no disponible en este navegador</p>`;
  }
}

function openChangelog() {
  closeDrawer();
  renderStorageBar();
  $("#modalChangelog").classList.add("open");
}

// ── Modal de SEGURIDAD (cifrado local) ───────────────────────────────────

async function openSeguridadModal() {
  const encMeta = await dbGet(DB_KV, "encMeta");
  const enabled = !!encMeta?.enabled;
  const body = $("#seg-body");
  body.innerHTML = enabled ? `
    <div class="seg-status seg-on">
      <span class="seg-dot"></span> CIFRADO ACTIVO
    </div>
    <p class="seg-info">Tus datos están cifrados con AES-256. Necesitarás la passphrase cada vez que abras la app.</p>
    <button class="save-btn" id="segChange">CAMBIAR PASSPHRASE</button>
    <button class="seg-btn-danger" id="segDisable">DESACTIVAR CIFRADO</button>
  ` : `
    <div class="seg-status seg-off">
      <span class="seg-dot"></span> SIN CIFRADO
    </div>
    <p class="seg-info">Activa el cifrado para proteger tus datos en este dispositivo. Tus datos solo serán accesibles introduciendo tu passphrase.</p>
    <div class="seg-warn">
      ⚠ Si olvidas la passphrase, <strong>no hay forma de recuperar los datos</strong>. Anótala en un sitio seguro antes de activar.
    </div>
    <div class="field">
      <label>NUEVA PASSPHRASE (mín. 8 caracteres)</label>
      <input type="password" id="segPass1" placeholder="••••••••" autocomplete="new-password">
    </div>
    <div class="field" style="margin-bottom:24px">
      <label>CONFIRMAR PASSPHRASE</label>
      <input type="password" id="segPass2" placeholder="••••••••" autocomplete="new-password">
    </div>
    <button class="save-btn" id="segEnable" disabled>ACTIVAR CIFRADO</button>
  `;
  closeDrawer();
  $("#modalSeguridad").classList.add("open");

  if (enabled) {
    $("#segChange").onclick  = changePassphrase;
    $("#segDisable").onclick = disableEncryption;
  } else {
    const refresh = () => {
      const p1 = $("#segPass1").value;
      const p2 = $("#segPass2").value;
      $("#segEnable").disabled = !(p1.length >= 8 && p1 === p2);
    };
    $("#segPass1").oninput = refresh;
    $("#segPass2").oninput = refresh;
    $("#segEnable").onclick = enableEncryption;
  }
}

async function enableEncryption() {
  const pass = $("#segPass1").value;
  if (pass.length < 8) return;
  if (!confirm("¿Activar cifrado AES-256?\n\nLa passphrase no se puede recuperar. Guárdala en un sitio seguro.")) return;
  try {
    await awaitSave();
    const salt = genSalt();
    _cryptoKey = await deriveKey(pass, salt);
    await dbPut(DB_KV, { enabled: true, salt: Array.from(salt) }, "encMeta");
    // Re-escribir todo el estado cifrado
    await writeField("productos", state.productos);
    await writeField("entradas",  state.entradas);
    await writeField("objetivos", state.objetivos);
    await writeField("firePrefs", { gasto: state.fireGasto, regla: state.fireRegla });
    $("#modalSeguridad").classList.remove("open");
    flash();
    alert("✓ Cifrado activado. La próxima vez que abras la app se te pedirá la passphrase.");
  } catch (err) {
    console.error("[Cartera] Error activando cifrado", err);
    alert("Error al activar cifrado: " + (err?.message || err));
  }
}

async function disableEncryption() {
  if (!confirm("¿Desactivar cifrado?\n\nLos datos volverán a guardarse en claro.")) return;
  try {
    await awaitSave();
    _cryptoKey = null;
    await dbDelete(DB_KV, "encMeta");
    // Re-escribir todo el estado sin cifrar
    await dbPut(DB_KV, state.productos, "productos");
    await dbPut(DB_KV, state.entradas,  "entradas");
    await dbPut(DB_KV, state.objetivos, "objetivos");
    await dbPut(DB_KV, { gasto: state.fireGasto, regla: state.fireRegla }, "firePrefs");
    $("#modalSeguridad").classList.remove("open");
    flash();
    alert("✓ Cifrado desactivado.");
  } catch (err) {
    console.error("[Cartera] Error desactivando cifrado", err);
    alert("Error al desactivar: " + (err?.message || err));
  }
}

async function changePassphrase() {
  const actual = prompt("Introduce la passphrase ACTUAL:");
  if (!actual) return;
  // Verificar passphrase actual descifrando productos
  try {
    const encMeta = await dbGet(DB_KV, "encMeta");
    const salt    = new Uint8Array(encMeta.salt);
    const key     = await deriveKey(actual, salt);
    const blob    = await dbGet(DB_KV, "productos");
    await decryptValue(blob, key);   // si falla, lanza
  } catch {
    alert("Passphrase incorrecta.");
    return;
  }
  const nueva = prompt("Nueva passphrase (mín. 8 caracteres):");
  if (!nueva || nueva.length < 8) { alert("Passphrase demasiado corta."); return; }
  const confirma = prompt("Confirma la nueva passphrase:");
  if (nueva !== confirma) { alert("Las passphrases no coinciden."); return; }
  try {
    await awaitSave();
    const newSalt = genSalt();
    _cryptoKey    = await deriveKey(nueva, newSalt);
    await dbPut(DB_KV, { enabled: true, salt: Array.from(newSalt) }, "encMeta");
    await writeField("productos", state.productos);
    await writeField("entradas",  state.entradas);
    await writeField("objetivos", state.objetivos);
    await writeField("firePrefs", { gasto: state.fireGasto, regla: state.fireRegla });
    $("#modalSeguridad").classList.remove("open");
    flash();
    alert("✓ Passphrase cambiada.");
  } catch (err) {
    alert("Error al cambiar passphrase: " + (err?.message || err));
  }
}

// Llamada al inicio si la BD está cifrada. Pide passphrase hasta 3 intentos.
async function promptUnlock(encMeta) {
  const salt = new Uint8Array(encMeta.salt);
  for (let intento = 1; intento <= 3; intento++) {
    const pass = prompt(intento === 1
      ? "🔒 MI CARTERA · Cifrado activo\n\nIntroduce tu passphrase:"
      : `Passphrase incorrecta (intento ${intento}/3):`);
    if (pass == null) return false;     // usuario canceló
    try {
      const key  = await deriveKey(pass, salt);
      // Verificar descifrando productos
      const blob = await dbGet(DB_KV, "productos");
      if (blob) await decryptValue(blob, key);
      _cryptoKey = key;
      return true;
    } catch {
      if (intento === 3) {
        alert("3 intentos fallidos. Recarga la página para volver a intentarlo.");
        return false;
      }
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. DRAWER
// ═══════════════════════════════════════════════════════════════════════════

function openDrawer() {
  updateSnapSub();
  renderSnapshots();
  $("#drawer").classList.add("open");
  $("#drawerOverlay").classList.add("open");
}
function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawerOverlay").classList.remove("open");
}
function toggleDrawer() {
  if ($("#drawer").classList.contains("open")) closeDrawer();
  else openDrawer();
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. SHORTCUTS · atajos de teclado
// ═══════════════════════════════════════════════════════════════════════════

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function anyModalOpen() {
  return $$('.modal-bg.open').length > 0;
}

function handleShortcut(e) {
  // ESC siempre funciona, también cerrando inputs
  if (e.key === "Escape") {
    $$('.modal-bg.open').forEach(m => m.classList.remove("open"));
    closeDrawer();
    hideSnapToast();
    return;
  }
  // No actuar si el usuario está tecleando en un campo
  if (isTypingTarget(e.target)) return;
  // Modificadores → no es nuestro atajo
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // Si hay modal abierto, sólo ESC funciona
  if (anyModalOpen()) return;

  const k = e.key.toLowerCase();

  const _reservadosShortcut = new Set(["total", "proyeccion", "fire", "asignacion", "diff", "fiscal"]);
  switch (k) {
    case "n":
      if (!_reservadosShortcut.has(state.tab)) {
        e.preventDefault(); openEntryModal();
      }
      break;
    case "e":
      e.preventDefault(); exportarCSV();
      break;
    case "i":
      e.preventDefault(); $("#fileImport").click();
      break;
    case "s":
      e.preventDefault(); crearSnapshot();
      break;
    case "m":
      e.preventDefault(); toggleDrawer();
      break;
    case "p":
      e.preventDefault();
      state.tab = "proyeccion";
      state.vistaAno = false;
      closeDrawer();
      render();
      break;
    case "v":
      if (!_reservadosShortcut.has(state.tab) || state.tab === "total") {
        e.preventDefault();
        state.vistaAno = !state.vistaAno;
        render();
      }
      break;
    case "f":
      e.preventDefault();
      state.tab = "fire";
      state.vistaAno = false;
      closeDrawer();
      render();
      break;
    case "a":
      e.preventDefault();
      state.tab = "asignacion";
      state.vistaAno = false;
      closeDrawer();
      render();
      break;
    case "c":
      e.preventDefault();
      state.tab = "diff";
      state.vistaAno = false;
      closeDrawer();
      render();
      break;
    case "t":
      e.preventDefault();
      state.tab = "fiscal";
      state.vistaAno = false;
      closeDrawer();
      render();
      break;
    case "?":
      e.preventDefault(); openDrawer();
      break;
    default:
      // Números 1-9 → pestañas
      if (/^[1-9]$/.test(k)) {
        const ids = tabIds();
        const i = parseInt(k, 10) - 1;
        if (ids[i]) {
          e.preventDefault();
          state.tab = ids[i];
          state.vistaAno = false;
          render();
        }
      }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. BINDINGS
// ═══════════════════════════════════════════════════════════════════════════

function bindCommon() {
  $$('[data-vista]').forEach(b => b.onclick = () => { state.vistaAno = b.dataset.vista === "ano"; render(); });
  $$('[data-period]').forEach(b => b.onclick = () => { state.filtroPeriodo = b.dataset.period; render(); });
  $$('[data-edit]').forEach(b => b.onclick = () => {
    const id = b.dataset.edit;
    const f  = state.entradas[state.tab]?.find(x => String(x.id) === String(id));
    if (f) openEntryModal(f);
  });
  $$('[data-del]').forEach(b => b.onclick = () => {
    const id = b.dataset.del;
    if (!confirm("¿Eliminar esta entrada?")) return;
    state.entradas[state.tab] = state.entradas[state.tab].filter(x => String(x.id) !== String(id));
    saveState();
    render();
    flash();
  });
  const btnEdit = $("#btnEditProd");
  if (btnEdit) btnEdit.onclick = () => {
    const prod = state.productos.find(p => p.id === state.tab);
    if (prod) openProdModal(prod);
  };
  const btnDel = $("#btnDelProd");
  if (btnDel) btnDel.onclick = () => {
    const pid     = state.tab;
    const nEnts   = (state.entradas[pid] || []).length;
    const prod    = state.productos.find(p => p.id === pid);
    const nObjRel = state.objetivos.filter(o => o.productoId === pid).length;
    const msg = `¿Eliminar "${prod?.nombre || pid}" y todos sus datos?\n\n` +
                `Se borrarán ${nEnts} entrada(s)` +
                (nObjRel ? ` y ${nObjRel} objetivo(s) asociado(s)` : "") + ".";
    if (!confirm(msg)) return;
    state.productos = state.productos.filter(p => p.id !== pid);
    delete state.entradas[pid];
    // Limpiar referencias huérfanas
    if (state.proyProductos) delete state.proyProductos[pid];
    state.objetivos = state.objetivos.filter(o => o.productoId !== pid);
    state.tab = state.productos[0]?.id || "total";
    saveState();
    render();
    flash();
  };
}

function bindGlobals() {
  // Drawer
  $("#btnDrawer").onclick        = toggleDrawer;
  $("#btnDrawerClose").onclick   = closeDrawer;
  $("#drawerOverlay").onclick    = closeDrawer;

  // Drawer items
  $("#btnExport").onclick        = exportarCSV;
  $("#btnImport").onclick        = () => $("#fileImport").click();
  $("#fileImport").onchange      = (e) => {
    const f = e.target.files?.[0];
    if (f) handleImport(f);
    e.target.value = "";
  };
  $("#btnExportJSON").onclick    = exportarJSON;
  $("#btnImportJSON").onclick    = () => $("#fileImportJSON").click();
  $("#fileImportJSON").onchange  = (e) => {
    const f = e.target.files?.[0];
    if (f) handleImportJSON(f);
    e.target.value = "";
  };
  $("#btnSnapshot").onclick      = crearSnapshot;
  $("#btnProyeccion").onclick    = () => { state.tab = "proyeccion"; state.vistaAno = false; closeDrawer(); render(); };
  $("#btnObjetivos").onclick     = openObjetivosModal;
  $("#btnFire").onclick          = () => { state.tab = "fire"; state.vistaAno = false; closeDrawer(); render(); };
  $("#btnAsignacion").onclick    = () => { state.tab = "asignacion"; state.vistaAno = false; closeDrawer(); render(); };
  $("#btnDiff").onclick          = () => { state.tab = "diff"; state.vistaAno = false; closeDrawer(); render(); };
  $("#btnFiscal").onclick        = () => { state.tab = "fiscal"; state.vistaAno = false; closeDrawer(); render(); };
  $("#btnChangelog").onclick     = openChangelog;
  $("#btnNewProdDrawer").onclick = openProdModal;

  // Toast
  $("#snapToastClose").onclick   = hideSnapToast;

  // Modales
  $("#meSave").onclick   = saveEntry;
  $("#mpSave").onclick   = saveProd;
  $("#mpNombre").oninput = refreshProdSaveBtn;
  $("#objSave").onclick  = saveObjetivo;
  $("#objNombre").oninput = refreshObjSaveBtn;
  $("#objMeta").oninput   = refreshObjSaveBtn;
  ["meManual","meSaveback","meRoundup"].forEach(id => $("#" + id).oninput = recalcMETotal);

  // Calculadora de unidades × precio en modal entrada
  ["calcUnidades","calcPrecio"].forEach(id => {
    const el = $("#" + id);
    if (el) el.oninput = recalcCalcResult;
  });
  if ($("#calcApply")) $("#calcApply").onclick = () => {
    const u = parseFloat($("#calcUnidades").value);
    const p = parseFloat($("#calcPrecio").value);
    if (Number.isFinite(u) && Number.isFinite(p) && u > 0 && p > 0) {
      $("#meValor").value = (u * p).toFixed(2);
    }
  };

  // Validación CoinGecko ID al perder foco / pulsar Enter
  if ($("#mpCoingeckoId")) {
    let coinTimer = null;
    $("#mpCoingeckoId").oninput = () => {
      clearTimeout(coinTimer);
      const v = $("#mpCoingeckoId").value.trim().toLowerCase();
      $("#mpCoinGeckoStatus").textContent = v ? "…" : "";
      $("#mpCoinGeckoStatus").className = "field-hint";
      coinTimer = setTimeout(() => verifyCoinGeckoId(v), 600);
    };
  }

  $$('[data-close]').forEach(b => b.onclick = () => $("#" + b.dataset.close).classList.remove("open"));
  $$('.modal-bg').forEach(bg => bg.onclick = (e) => { if (e.target === bg) bg.classList.remove("open"); });

  // Tema
  $("#btnTheme").onclick = toggleTheme;

  // PDF export (lazy-load de libs)
  $("#btnPDF").onclick = exportarPDF;
  $("#btnSeguridad").onclick = openSeguridadModal;

  // Atajos
  document.addEventListener("keydown", handleShortcut);
}

// ── Tema claro/oscuro ─────────────────────────────────────────────────────
function applyTheme(tema) {
  const root = document.documentElement;
  if (tema === "light") root.classList.add("light");
  else                  root.classList.remove("light");
  const btn = $("#btnTheme");
  if (btn) btn.textContent = tema === "light" ? "☾" : "☀";
  // Chart.js: actualizar colores de ejes/tooltip
  const isLight = tema === "light";
  Chart.defaults.color       = isLight ? "#6B7280" : "#374151";
  Chart.defaults.borderColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle("light");
  const tema    = isLight ? "light" : "dark";
  localStorage.setItem("tema", tema);
  applyTheme(tema);
  render();   // los charts deben recrearse con los nuevos colores
}

// ── PDF export (lazy-load) ───────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

let _pdfLibsLoaded = false;
async function ensurePDFLibs() {
  if (_pdfLibsLoaded) return;
  await Promise.all([
    loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"),
  ]);
  _pdfLibsLoaded = true;
}

async function exportarPDF() {
  const btn = $("#btnPDF");
  const orig = btn?.querySelector(".di-title")?.textContent;
  try {
    if (btn) btn.querySelector(".di-title").textContent = "GENERANDO…";
    await ensurePDFLibs();
    const main = $("#main");
    const bg = getComputedStyle(document.body).backgroundColor || "#080C12";
    const canvas = await html2canvas(main, { backgroundColor: bg, scale: 1.5, logging: false, useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pdfW = 210, pdfH = 297;
    const imgH = canvas.height * pdfW / canvas.width;
    let heightLeft = imgH, position = 0;
    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, position, pdfW, imgH);
    heightLeft -= pdfH;
    while (heightLeft > 0) {
      position -= pdfH;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfW, imgH);
      heightLeft -= pdfH;
    }
    const fecha = new Date().toISOString().slice(0, 10);
    pdf.save(`mi-cartera-${fecha}.pdf`);
    flash();
    closeDrawer();
  } catch (err) {
    console.error("[Cartera] Error generando PDF", err);
    alert("No se pudo generar el PDF: " + (err?.message || err));
  } finally {
    if (btn && orig) btn.querySelector(".di-title").textContent = orig;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. INIT
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  // Aplicar tema antes de cualquier render para evitar parpadeo
  applyTheme(localStorage.getItem("tema") || "dark");

  await loadState();
  render();
  bindGlobals();
  updateSnapSub();
  checkSnapReminder();
  renderSnapshots();   // pre-llena la lista para cuando se abra el drawer

  // Service Worker (sólo HTTP/HTTPS; file:// no soporta SW)
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js")
      .catch(err => console.warn("[Cartera] SW no registrado:", err));
  }
})();

})();
