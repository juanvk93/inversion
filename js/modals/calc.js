import { getProductPriceSync, priceAgeLabel } from "../precios.js";
import { state } from "../state.js";
import { $, fmtE } from "../utils.js";

export function openCalcModal(prodId) {
  const prod = state.productos.find(p => p.id === prodId);
  if (!prod) return;
  $("#mcTitle").textContent = `Calculadora · ${prod.nombre}`;
  $("#mcTitle").style.color = prod.color || "var(--accent)";
  const price = getProductPriceSync(prod);
  $("#mcUnidades").value = (Number.isFinite(+prod.unidades) && +prod.unidades > 0) ? +prod.unidades : "";
  $("#mcPrecio").value   = price ? price.eur : "";
  if (price) {
    const fuente = price.source === "manual"
      ? "Precio manual del producto"
      : price.source === "coingecko"  ? `CoinGecko · ${priceAgeLabel(price.ts)}`
      : price.source === "yahoo"      ? `Yahoo Finance · ${priceAgeLabel(price.ts)}`
                                      : `Twelve Data · ${priceAgeLabel(price.ts)}`;
    $("#mcSource").textContent = fuente;
    $("#mcSub").textContent    = `Precio actual · ${fuente}`;
  } else {
    $("#mcSource").textContent = "Sin precio en caché — introduce manualmente";
    $("#mcSub").textContent    = "";
  }
  recalcMcResult();
  $("#modalCalc").classList.add("open");
}

export function recalcMcResult() {
  const u = parseFloat($("#mcUnidades").value);
  const p = parseFloat($("#mcPrecio").value);
  const r = $("#mcResult");
  if (Number.isFinite(u) && Number.isFinite(p) && u > 0 && p > 0) {
    r.textContent = fmtE(u * p);
    r.classList.add("ready");
  } else {
    r.textContent = "—";
    r.classList.remove("ready");
  }
}
