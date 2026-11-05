import { COLORES, DIVISAS, TIPOLOGIAS } from "../config.js";
import { closeDrawer } from "../drawer.js";
import { fetchCoinGeckoPrice, fetchTwelveDataPrice, fetchYahooPrice, pedirTwelveData, pedirYahoo } from "../precios.js";
import { bloqueado, flash, saveState, state, twelveDataCache, yahooCache } from "../state.js";
import { $, $$, esc, fmtE } from "../utils.js";
import { render } from "../views/render.js";

export function openProdModal(prod = null) {
  if (bloqueado()) return;
  state.editProdId = prod?.id || null;
  $("#mpNombre").value      = prod?.nombre || "";
  $("#mpRef").value         = prod?.referencia || "";
  $("#mpTipologia").value   = prod?.tipologia || "";
  $("#mpDivisa").value      = prod?.divisa || (prod ? "" : "EUR");
  $("#mpComentarios").value = prod?.comentarios || "";
  $("#mpUnidades").value      = prod?.unidades      ?? "";
  $("#mpPrecioManual").value  = prod?.precioManual  ?? "";
  $("#mpCoingeckoId").value   = prod?.coingeckoId   || "";
  $("#mpEtfTicker").value     = prod?.etfTicker || "";
  $("#mpAsignacion").value    = prod?.asignacionObjetivo ?? "";
  $("#mpTer").value           = prod?.ter || "";
  $("#mpComision").value      = prod?.comisionCompra || "";
  renderTickerResults([]);
  $("#mpCoinGeckoStatus").textContent = "";
  $("#mpEtfStatus").textContent       = "";
  $("#mpTipologiaList").innerHTML = TIPOLOGIAS.map(t => `<option value="${esc(t)}"></option>`).join("");
  $("#mpDivisaList").innerHTML    = DIVISAS.map(d => `<option value="${esc(d)}"></option>`).join("");
  state.productoColor       = prod?.color || COLORES[0];
  $("#mpTitle").textContent = prod ? "Editar producto" : "Nuevo producto";
  $("#mpSave").textContent  = prod ? "Guardar cambios" : "Crear producto";
  renderColorPicker();
  refreshProdSaveBtn();
  toggleProdPriceField();   // muestra CoinGecko o ETF según tipología
  if (prod?.coingeckoId) verifyCoinGeckoId(prod.coingeckoId);
  if (prod?.etfTicker)    verifyEtfTicker(prod.etfTicker);
  $("#modalProd").classList.add("open");
  closeDrawer();
}

// Muestra el campo de precio relevante según la tipología:
// criptomoneda → CoinGecko ID; cualquier otra (ETF, acción…) → ETF Ticker.
export function toggleProdPriceField() {
  const tip = $("#mpTipologia").value.trim().toLowerCase();
  const esCripto = /cripto|crypto|bitcoin|moneda/.test(tip);
  $("#mpCoinGeckoField").style.display = esCripto ? "" : "none";
  $("#mpEtfField").style.display       = esCripto ? "none" : "";
}

export async function verifyCoinGeckoId(id) {
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

export async function verifyEtfTicker(ticker) {
  const el = $("#mpEtfStatus");
  if (!el) return;
  if (!ticker) { el.textContent = ""; el.className = "field-hint"; return; }
  const isYahoo = state.etfProvider === "yahoo";
  const providerName = isYahoo ? "Yahoo Finance" : "Twelve Data";
  if (!isYahoo && !(state.twelveDataApiKey || "").trim()) {
    el.textContent = "⚠ Configura primero tu API key en Configuración";
    el.className = "field-hint err";
    return;
  }
  el.textContent = "Verificando…";
  el.className = "field-hint";
  const res = isYahoo
    ? await fetchYahooPrice(ticker)
    : await fetchTwelveDataPrice(ticker);
  if (res && Number.isFinite(res.eur)) {
    el.textContent = `✓ ${fmtE(res.eur)} · ${providerName}`;
    el.className = "field-hint ok";
  } else {
    const cached = isYahoo ? yahooCache[ticker] : twelveDataCache[ticker];
    const msg = cached?.error || `Ticker desconocido en ${providerName}`;
    el.textContent = `✗ ${msg}`;
    el.className = "field-hint err";
  }
}

// ── Búsqueda de tickers (autocompletado en el modal de producto) ───────────
// Con provider Twelve Data (y API key) usa /symbol_search y construye el ticker
// en formato SYMBOL.MIC; con Yahoo usa su endpoint de búsqueda vía los mismos
// proxies CORS que los precios. Devuelve [{ticker, nombre, detalle}].
export async function searchTickers(q) {
  q = (q || "").trim();
  if (q.length < 2) return [];
  const apiKey = (state.twelveDataApiKey || "").trim();
  if (state.etfProvider !== "yahoo" && apiKey) {
    try {
      const r = await pedirTwelveData(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=12`, apiKey);
      if (!r.ok) return [];
      const data = await r.json();
      return (data?.data || []).slice(0, 8).map(d => ({
        ticker:  d.mic_code ? `${d.symbol}.${d.mic_code}` : (d.symbol || ""),
        nombre:  d.instrument_name || "",
        detalle: [d.exchange || d.mic_code, d.currency].filter(Boolean).join(" · "),
      })).filter(i => i.ticker);
    } catch { return []; }
  }
  // Yahoo Finance search (sin clave, vía proxy)
  const target = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
  try {
    return await pedirYahoo(target, (data) => (data?.quotes || []).filter(x => x.symbol).slice(0, 8).map(x => ({
      ticker:  x.symbol,
      nombre:  x.shortname || x.longname || "",
      detalle: [x.exchDisp || x.exchange, x.quoteTypeDisp || x.quoteType].filter(Boolean).join(" · "),
    })));
  } catch { return []; }
}

export function renderTickerResults(items) {
  const box = $("#mpEtfResults");
  if (!box) return;
  if (!items || !items.length) { box.innerHTML = ""; box.style.display = "none"; return; }
  box.innerHTML = items.map(i => `
    <button type="button" class="ticker-item" data-ticker="${esc(i.ticker)}">
      <span class="ti-sym">${esc(i.ticker)}</span>
      <span class="ti-name">${esc(i.nombre)}</span>
      <span class="ti-meta">${esc(i.detalle)}</span>
    </button>`).join("");
  box.style.display = "block";
  $$("#mpEtfResults .ticker-item").forEach(b => b.onclick = () => {
    $("#mpEtfTicker").value = b.dataset.ticker;
    renderTickerResults([]);
    verifyEtfTicker(b.dataset.ticker);
  });
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

export function refreshProdSaveBtn() {
  const nom = $("#mpNombre").value.trim();
  const btn = $("#mpSave");
  btn.disabled         = !nom;
  btn.style.background = nom ? state.productoColor : "";
}

export function saveProd() {
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
  const etfTicker    = $("#mpEtfTicker").value.trim().toUpperCase();
  const asignRaw     = parseFloat($("#mpAsignacion").value);
  const asignacion   = Number.isFinite(asignRaw) ? Math.max(0, Math.min(100, asignRaw)) : 0;
  const terRaw       = parseFloat($("#mpTer").value);
  const ter          = Number.isFinite(terRaw) ? Math.max(0, Math.min(10, terRaw)) : 0;
  const comisionCompra = numOrZero("#mpComision");
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
      prod.etfTicker          = etfTicker;
      prod.asignacionObjetivo = asignacion;
      prod.ter                = ter;
      prod.comisionCompra     = comisionCompra;
    }
  } else {
    const id = `prod_${Date.now()}`;
    state.productos.push({
      id, nombre, referencia, tipologia, divisa, comentarios,
      color: state.productoColor,
      unidades, precioManual, coingeckoId, etfTicker,
      asignacionObjetivo: asignacion,
      ter, comisionCompra,
    });
    state.entradas[id] = [];
    state.tab          = id;
  }
  state.editProdId = null;
  if (coingeckoId) fetchCoinGeckoPrice(coingeckoId);
  if (etfTicker)   (state.etfProvider === "yahoo" ? fetchYahooPrice : fetchTwelveDataPrice)(etfTicker);
  saveState();
  $("#modalProd").classList.remove("open");
  render();
  flash();
}
