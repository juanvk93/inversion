import { BENCHMARK_TTL, COINGECKO_BASE, COINGECKO_TTL, TWELVEDATA_BASE, TWELVEDATA_TTL, YAHOO_API, YAHOO_PROXIES, YAHOO_TTL } from "./config.js";
import { isTypingTarget } from "./shortcuts.js";
import { benchmarkCache, benchmarkFetching, priceCache, priceFetching, state, twelveDataCache, twelveDataFetching, yahooCache, yahooFetching } from "./state.js";
import { $, fetchWithTimeout, fmt } from "./utils.js";
import { render } from "./views/render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 5c. PRECIOS · CoinGecko (cripto) + Twelve Data/Yahoo (ETFs) + precio manual
// ═══════════════════════════════════════════════════════════════════════════

// Devuelve la caché y función de fetch para el proveedor activo.
function activeEtfProvider() {
  return state.etfProvider === "yahoo"
    ? { source: "yahoo",       cache: yahooCache,      fetch: fetchYahooPrice }
    : { source: "twelvedata",  cache: twelveDataCache, fetch: fetchTwelveDataPrice };
}

// Devuelve precio en EUR para un producto. Prioridad:
//   1. coingeckoId  (cripto, vía CoinGecko)
//   2. etfTicker    (ETF/acción cotizado en EUR, vía el provider activo)
//   3. precioManual (fallback estático)
export function getProductPriceSync(prod) {
  if (!prod) return null;
  if (prod.coingeckoId) {
    const c = priceCache[prod.coingeckoId];
    if (c && Number.isFinite(c.eur)) {
      return { eur: c.eur, ts: c.ts, source: "coingecko", id: prod.coingeckoId };
    }
  }
  if (prod.etfTicker) {
    const { source, cache } = activeEtfProvider();
    const c = cache[prod.etfTicker];
    if (c && Number.isFinite(c.eur)) {
      return { eur: c.eur, ts: c.ts, source, id: prod.etfTicker };
    }
  }
  if (Number.isFinite(+prod.precioManual) && +prod.precioManual > 0) {
    return { eur: +prod.precioManual, ts: null, source: "manual" };
  }
  return null;
}

// Fetch (deduplicado) — devuelve Promise con el precio actualizado.
export async function fetchCoinGeckoPrice(id) {
  if (!id) return null;
  const cached = priceCache[id];
  // Respeta el TTL incluso para entradas de error (negative-cache): un id
  // inválido no debe reintentar en cada render.
  if (cached && Date.now() - cached.ts < COINGECKO_TTL) return Number.isFinite(cached.eur) ? cached : null;
  if (priceFetching[id]) return priceFetching[id];
  priceFetching[id] = (async () => {
    try {
      const url = `${COINGECKO_BASE}?ids=${encodeURIComponent(id)}&vs_currencies=eur`;
      const r = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const eur = data?.[id]?.eur;
      if (!Number.isFinite(eur)) throw new Error("Sin precio en respuesta");
      priceCache[id] = { eur, ts: Date.now() };
      return priceCache[id];
    } catch (err) {
      console.warn("[Cartera] CoinGecko falló para", id, err);
      priceCache[id] = { error: err?.message || "error", ts: Date.now() };   // negative-cache
      return null;
    } finally {
      delete priceFetching[id];
    }
  })();
  return priceFetching[id];
}

// Varios ids de CoinGecko en UNA petición (la API pública limita a ~30 req/min:
// pedirlos uno a uno daba 429 con varias criptos).
async function fetchCoinGeckoBatch(ids) {
  ids = [...new Set(ids.filter(Boolean))].filter(id => !priceFetching[id]);
  if (!ids.length) return;
  if (ids.length === 1) { await fetchCoinGeckoPrice(ids[0]); return; }
  const run = (async () => {
    try {
      const url = `${COINGECKO_BASE}?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=eur`;
      const r = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      ids.forEach(id => {
        const eur = data?.[id]?.eur;
        priceCache[id] = Number.isFinite(eur)
          ? { eur, ts: Date.now() }
          : { error: "Sin precio en respuesta", ts: Date.now() };   // negative-cache
      });
    } catch (err) {
      console.warn("[Cartera] CoinGecko falló para", ids.join(","), err);
      ids.forEach(id => { priceCache[id] = { error: err?.message || "error", ts: Date.now() }; });
    } finally {
      ids.forEach(id => delete priceFetching[id]);
    }
  })();
  ids.forEach(id => { priceFetching[id] = run.then(() => Number.isFinite(priceCache[id]?.eur) ? priceCache[id] : null); });
  await run;
}

// ── Twelve Data ──
// La API key va en la cabecera "Authorization: apikey …" y no en la URL (que
// acaba en historiales, logs de proxies y Referer). Si el navegador no la deja
// pasar (CORS), se repite una vez con ?apikey= y se recuerda para la sesión.
let _tdSinCabecera = false;
export async function pedirTwelveData(url, apiKey) {
  if (!_tdSinCabecera) {
    try {
      return await fetchWithTimeout(url, { headers: { accept: "application/json", authorization: `apikey ${apiKey}` } });
    } catch (err) {
      if (/tiempo de espera/i.test(err?.message || "")) throw err;   // lento, no un bloqueo CORS
      _tdSinCabecera = true;
    }
  }
  const u = new URL(url);
  u.searchParams.set("apikey", apiKey);
  return fetchWithTimeout(u.toString(), { headers: { accept: "application/json" } });
}

// ── Precios que llegan por proxies públicos ──
// Un proxy puede devolver datos de otro ticker o basura: se descarta un precio
// no positivo o que multiplica/divide por más de 5 el último conocido.
const SALTO_MAX = 5;
export function precioSospechoso(nuevo, anterior) {
  if (!Number.isFinite(nuevo) || nuevo <= 0 || nuevo > 1e7) return "precio no válido";
  if (Number.isFinite(anterior) && anterior > 0) {
    const r = nuevo / anterior;
    if (r > SALTO_MAX || r < 1 / SALTO_MAX) return `precio sospechoso (${fmt(nuevo)} frente a ${fmt(anterior)} antes)`;
  }
  return null;
}

// ── Yahoo Finance (vía proxies CORS públicos) ──
// Error de Yahoo (ticker inexistente, otra divisa…): no se reintenta con otro proxy
export class ErrorYahoo extends Error {}

// Pide `target` a Yahoo a través de los proxies, uno tras otro, hasta obtener
// JSON. `extraer(data)` saca el dato o lanza ErrorYahoo. Si ningún proxy
// responde, lanza Error("Servicio no disponible (…)").
export async function pedirYahoo(target, extraer) {
  let lastErr = null;
  for (const proxy of YAHOO_PROXIES) {
    let data;
    try {
      const r = await fetchWithTimeout(proxy(target), { headers: { accept: "application/json" } });
      if (!r.ok) { lastErr = new Error(`Proxy saturado (HTTP ${r.status})`); continue; }
      const text = await r.text();
      // Algunos proxies devuelven 200 con texto de error (ej. "Edge: Too Many Requests")
      if (!/^\s*[{[]/.test(text)) { lastErr = new Error("Proxy no devolvió JSON"); continue; }
      data = JSON.parse(text);
    } catch (err) { lastErr = err; continue; }   // red, CORS o JSON roto → siguiente proxy
    return extraer(data);   // un ErrorYahoo sale tal cual: es de Yahoo, no del proxy
  }
  throw new Error(`Servicio no disponible (${lastErr?.message || "sin respuesta"})`);
}

// Twelve Data · llama al endpoint /quote (precio + divisa). Requiere API key
// del usuario almacenada en state.twelveDataApiKey. Solo aceptamos EUR.
// Acepta tickers en formato "SYMBOL", "SYMBOL.EXCHANGE" o "SYMBOL:EXCHANGE";
// el sufijo se envía como parámetro 'exchange' separado (Twelve Data no acepta
// el formato combinado).
export async function fetchTwelveDataPrice(ticker) {
  ticker = (ticker || "").trim();
  if (!ticker) return null;
  const apiKey = (state.twelveDataApiKey || "").trim();
  if (!apiKey) {
    twelveDataCache[ticker] = { error: "Falta API key (Configuración)", ts: Date.now() };
    return null;
  }
  const cached = twelveDataCache[ticker];
  if (cached && Number.isFinite(cached.eur) && Date.now() - cached.ts < TWELVEDATA_TTL) return cached;
  if (twelveDataFetching[ticker]) return twelveDataFetching[ticker];
  twelveDataFetching[ticker] = (async () => {
    try {
      // Separar SYMBOL.SUFFIX o SYMBOL:SUFFIX. Twelve Data distingue entre
      // `mic_code` (ISO 10383, 4 letras tipo XAMS/XETR) y `exchange` (nombre
      // como "XETRA" o "NASDAQ"). Detectamos el formato del sufijo.
      let symbol = ticker, suffix = null;
      const m = ticker.match(/^([A-Z0-9-]+)[.:](.+)$/);
      if (m) { symbol = m[1]; suffix = m[2]; }
      const params = new URLSearchParams({ symbol });
      if (suffix) {
        if (/^X[A-Z]{3}$/.test(suffix)) {
          params.set("mic_code", suffix);   // MIC ISO: XAMS, XETR, XMIL, XPAR, ...
        } else {
          params.set("exchange", suffix);   // Nombre: XETRA, NASDAQ, Borsa Italiana, ...
        }
      }
      const r = await pedirTwelveData(`${TWELVEDATA_BASE}?${params}`, apiKey);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data?.status === "error" || data?.code >= 400) {
        throw new Error(data.message || "Error de la API");
      }
      const price    = parseFloat(data?.close);
      const currency = data?.currency;
      if (!Number.isFinite(price)) throw new Error("Sin precio en respuesta");
      if (currency && currency !== "EUR") {
        throw new Error(`Cotiza en ${currency}, no en EUR`);
      }
      const sospecha = precioSospechoso(price, cached?.eur);
      if (sospecha) throw new Error(sospecha);
      twelveDataCache[ticker] = { eur: price, ts: Date.now(), currency: currency || "EUR" };
      return twelveDataCache[ticker];
    } catch (err) {
      console.warn("[Cartera] Twelve Data falló para", ticker, err);
      twelveDataCache[ticker] = { error: err.message, ts: Date.now() };
      return null;
    } finally {
      delete twelveDataFetching[ticker];
    }
  })();
  return twelveDataFetching[ticker];
}

// Yahoo Finance · llama al chart endpoint vía proxy CORS público. No requiere
// clave. Formato típico de ticker: IWDA.AS, EUNL.DE, VWCE.DE. Valida que la
// cotización esté en EUR (rechaza otras divisas).
export async function fetchYahooPrice(ticker) {
  ticker = (ticker || "").trim();
  if (!ticker) return null;
  const cached = yahooCache[ticker];
  if (cached && Number.isFinite(cached.eur) && Date.now() - cached.ts < YAHOO_TTL) return cached;
  if (yahooFetching[ticker]) return yahooFetching[ticker];
  yahooFetching[ticker] = (async () => {
    try {
      const r = await pedirYahoo(`${YAHOO_API}${encodeURIComponent(ticker)}`, (data) => {
        const result = data?.chart?.result?.[0];
        if (!result) {
          const ye = data?.chart?.error;
          throw new ErrorYahoo(ye ? `${ye.description || ye.code}` : "Ticker no encontrado");
        }
        const price    = result.meta?.regularMarketPrice;
        const currency = result.meta?.currency;
        if (!Number.isFinite(price)) throw new ErrorYahoo("Sin precio en respuesta");
        if (currency && currency !== "EUR") throw new ErrorYahoo(`Cotiza en ${currency}, no en EUR`);
        const sospecha = precioSospechoso(price, cached?.eur);
        if (sospecha) throw new ErrorYahoo(sospecha);
        return { eur: price, currency: currency || "EUR" };
      });
      yahooCache[ticker] = { ...r, ts: Date.now() };
      return yahooCache[ticker];
    } catch (err) {
      const msg = err instanceof ErrorYahoo ? err.message : `Yahoo: ${err.message}`;
      console.warn("[Cartera] Yahoo:", ticker, msg);
      yahooCache[ticker] = { error: msg, ts: Date.now() };
      return null;
    } finally {
      delete yahooFetching[ticker];
    }
  })();
  return yahooFetching[ticker];
}

// Serie mensual de cierres de un símbolo Yahoo (para el benchmark). Reutiliza los
// mismos proxies CORS que fetchYahooPrice. Devuelve { serie:{YYYY-MM:close}, currency, last }
// o null si falla (cachea el error con TTL para no martillear los proxies).
export async function fetchYahooSeries(symbol) {
  symbol = (symbol || "").trim();
  if (!symbol) return null;
  const cached = benchmarkCache[symbol];
  if (cached?.serie && Date.now() - cached.ts < BENCHMARK_TTL) return cached;
  if (benchmarkFetching[symbol]) return benchmarkFetching[symbol];
  benchmarkFetching[symbol] = (async () => {
    try {
      benchmarkCache[symbol] = await pedirYahoo(`${YAHOO_API}${encodeURIComponent(symbol)}?interval=1mo&range=15y`, (data) => {
        const result = data?.chart?.result?.[0];
        if (!result) {
          const ye = data?.chart?.error;
          throw new ErrorYahoo(ye ? `${ye.description || ye.code}` : "Índice no encontrado");
        }
        const tstamps  = result.timestamp || [];
        const closes   = result.indicators?.quote?.[0]?.close || [];
        const currency = result.meta?.currency;
        if (!tstamps.length || !closes.length) throw new ErrorYahoo("Sin serie histórica");
        const serie = {};
        let last = null;
        // Los timestamps mensuales caen a medianoche hora de la bolsa (22-23h UTC
        // del día anterior para .DE): se pasan a la hora de la bolsa con gmtoffset
        // y se leen en UTC para que el mes no dependa de la zona del usuario.
        const gmtoff = Number.isFinite(result.meta?.gmtoffset) ? result.meta.gmtoffset : 0;
        for (let k = 0; k < tstamps.length; k++) {
          const c = closes[k];
          if (!Number.isFinite(c) || c <= 0) continue;
          // +12 h: gmtoffset es el desfase ACTUAL (invierno/verano); con medio día de
          // margen la vela de medianoche local cae siempre en su mes, sea cual sea el horario.
          const d = new Date((tstamps[k] + gmtoff + 12 * 3600) * 1000);
          serie[`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`] = c;
          last = c;
        }
        const liveLast = result.meta?.regularMarketPrice;
        // El precio en vivo solo si es coherente con el último cierre mensual
        if (Number.isFinite(liveLast) && !precioSospechoso(liveLast, last)) last = liveLast;
        if (last == null) throw new ErrorYahoo("Sin precios válidos");
        return { serie, currency: currency || "EUR", last, ts: Date.now() };
      });
      return benchmarkCache[symbol];
    } catch (err) {
      const msg = err.message;
      console.warn("[Cartera] Benchmark:", msg);
      benchmarkCache[symbol] = { error: msg, ts: Date.now() };
      return null;
    } finally {
      delete benchmarkFetching[symbol];
    }
  })();
  return benchmarkFetching[symbol];
}

// Refresca en background los precios (CoinGecko + ETF provider activo) de todos
// los productos y vuelve a renderizar si llega algo nuevo. Llamado tras cada render.
export async function refreshAllPricesAsync() {
  const cgIds = state.productos
    .map(p => p.coingeckoId)
    .filter(id => id && (!priceCache[id] || Date.now() - priceCache[id].ts >= COINGECKO_TTL));
  // ETF provider activo (Twelve Data o Yahoo)
  const provider = activeEtfProvider();
  const ttl  = provider.source === "yahoo" ? YAHOO_TTL : TWELVEDATA_TTL;
  // Twelve Data necesita API key; Yahoo no requiere clave.
  const etfHabilitado = provider.source === "yahoo" || (state.twelveDataApiKey || "").trim();
  const etfIds = etfHabilitado
    ? state.productos
        .map(p => p.etfTicker)
        // Respetamos el TTL también para entradas con error (negative-cache):
        // sin esto, un ticker inválido reintentaba en cada render y agotaba la cuota.
        .filter(id => { const c = provider.cache[id]; return id && (!c || Date.now() - c.ts >= ttl); })
    : [];
  if (!cgIds.length && !etfIds.length) return;

  const cgBefore  = cgIds.map(id => priceCache[id]?.eur);
  const etfBefore = etfIds.map(id => provider.cache[id]?.eur);
  await Promise.all([
    fetchCoinGeckoBatch(cgIds),
    ...[...new Set(etfIds)].map(provider.fetch),
  ]);
  const changedCg  = cgIds.some((id, i) => priceCache[id]?.eur !== cgBefore[i]);
  const changedEtf = etfIds.some((id, i) => provider.cache[id]?.eur !== etfBefore[i]);
  if ((changedCg || changedEtf) && needsPriceRender()) render();
}

function needsPriceRender() {
  // No re-renderizar mientras el usuario escribe en un campo de la vista
  // (se perdería lo tecleado y el foco, p. ej. la API key o la passphrase).
  const act = document.activeElement;
  if (act && isTypingTarget(act) && $("#main")?.contains(act)) return false;
  return state.tab === "asignacion" ||
         state.tab === "fiscal" ||
         (state.tab !== "total" && state.tab !== "proyeccion" &&
          state.tab !== "fire" && state.tab !== "diff" && state.tab !== "benchmark" &&
          state.tab !== "config" && state.tab !== "resumen");
}

export function priceAgeLabel(ts) {
  if (!ts) return "manual";
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min === 0) return "ahora";
  if (min === 1) return "hace 1 min";
  if (min < 60)  return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}

// Etiqueta corta de la fuente para los badges
export function priceSourceLabel(source) {
  if (source === "coingecko") return "CG";
  if (source === "twelvedata") return "TD";
  if (source === "yahoo")      return "YH";
  return "manual";
}
