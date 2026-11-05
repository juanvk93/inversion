// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export const MESES   = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
export const COLORES = [
  "#60A5FA","#818CF8","#A78BFA","#C084FC","#F472B6","#FB7185","#F87171","#FB923C","#F97316",
  "#FBBF24","#FACC15","#A3E635","#4ADE80","#34D399","#6EE7B7","#2DD4BF","#22D3EE","#38BDF8"
];
export const TIPOLOGIAS = ["ETF", "Fondo Indexado", "Fondo de Inversión", "Criptomoneda", "Acción", "Bono", "Materia Prima", "Inmobiliario", "Cuenta Remunerada", "Otro"];
export const DIVISAS    = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD"];

// Claves de localStorage (legado — se migran a IndexedDB en el primer arranque)
export const STORE_K_P     = "cartera_html_productos";
export const STORE_K_E     = "cartera_html_entradas";
export const STORE_K_SNAP  = "cartera_html_last_snapshot";  // timestamp ISO

// IndexedDB
export const DB_NAME = "cartera-db";
export const DB_VER  = 1;
export const DB_KV   = "kv";          // clave→valor (productos, entradas, lastSnapshot, …)
export const DB_SNAP = "snapshots";   // snapshots por timestamp

export const SNAP_REMINDER_DAYS = 7;
export const SNAP_MAX           = 20;   // máximo de snapshots in-app (los más antiguos se descartan)

// CoinGecko
export const COINGECKO_BASE = "https://api.coingecko.com/api/v3/simple/price";
export const COINGECKO_TTL  = 5 * 60 * 1000;   // 5 minutos de caché

// Twelve Data · API pública con CORS abierto (sin proxy). Requiere API key
// gratis (registro en twelvedata.com — 800 req/día). Cobertura excelente
// para ETFs/acciones internacionales. Devuelve precio + divisa.
export const TWELVEDATA_BASE = "https://api.twelvedata.com/quote";
export const TWELVEDATA_TTL  = 10 * 60 * 1000;   // 10 min

// Yahoo Finance · API pública del chart endpoint. Yahoo no expone CORS,
// pasamos el request por un proxy público. Sin clave, formato de ticker tipo
// IWDA.AS, EUNL.DE, VWCE.DE.
// Nota: corsproxy.io (403 fuera de localhost), thingproxy.freeboard.io y
// cors-proxy.htmldriven.com están fuera de servicio y se retiraron de la lista.
// Usamos allorigins.win como primario con codetabs como fallback.
export const YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart/";
// Lista de proxies CORS públicos. Se prueban en orden hasta que uno responda
// con JSON válido. Si todos fallan (saturados/caídos), no se puede usar Yahoo.
export const YAHOO_PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];
export const FETCH_TIMEOUT = 8000;   // ms máximo por petición de precio/serie
export const YAHOO_TTL = 10 * 60 * 1000;   // 10 min

// Proveedores de precio ETF soportados
export const ETF_PROVIDERS = ["twelvedata", "yahoo"];

// Índices de referencia (benchmark). Se usan ETFs UCITS cotizados en EUR para que
// la comparación sea limpia, sin ruido de tipo de cambio. Series vía Yahoo (mismo
// chart endpoint y proxies que los precios spot, sin clave).
export const BENCHMARKS = [
  { id: "EUNL.DE", nombre: "MSCI World",  desc: "iShares Core MSCI World (EUR)" },
  { id: "SXR8.DE", nombre: "S&P 500",     desc: "iShares Core S&P 500 (EUR)" },
  { id: "SXRV.DE", nombre: "Nasdaq 100",  desc: "iShares Nasdaq 100 (EUR)" },
  { id: "IS3N.DE", nombre: "MSCI EM",     desc: "iShares Core MSCI EM IMI (EUR)" },
];
export const BENCHMARK_TTL = 6 * 60 * 60 * 1000;   // 6 h (los cierres mensuales no cambian rápido)

// Tramos IRPF de la base del ahorro (España, modelo D-100). Desde 2025 (Ley 7/2024)
// la parte que excede de 300.000 € tributa al 30%. Tabla única para toda la app.
export const FISCAL_TRAMOS_2026 = [
  { hasta:    6000, tipo: 0.19 },
  { hasta:   50000, tipo: 0.21 },
  { hasta:  200000, tipo: 0.23 },
  { hasta:  300000, tipo: 0.27 },
  { hasta: Infinity, tipo: 0.30 },
];

// La app arranca vacía: sin productos ni entradas de ejemplo.
export const PRODUCTOS_INIT = [];
export const ENTRADAS_INIT  = {};
