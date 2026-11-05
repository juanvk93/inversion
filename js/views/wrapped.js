import { statsTotalCalc } from "../calc.js";
import { BENCHMARKS } from "../config.js";
import { avisar } from "../dialog.js";
import { closeDrawer } from "../drawer.js";
import { ensurePDFLibs } from "../pdf.js";
import { fetchYahooSeries } from "../precios.js";
import { flash, state } from "../state.js";
import { $, $$, esc, fmt, fmtE, labelMes } from "../utils.js";

// ── Informe anual "wrapped" ────────────────────────────────────────────────
// Tarjeta-resumen del año (aportado, ganancia, rentabilidad, mejor mes, alpha
// vs índice) exportable como imagen PNG vía html2canvas.

function calcWrapped(year) {
  const todas = statsTotalCalc(state);
  const filas = todas.filter(f => f.fecha.startsWith(year));
  if (!filas.length) return null;
  const prev     = todas.filter(f => f.fecha < `${year}-01`).at(-1) || null;
  const aportado = filas.reduce((s, f) => s + f.aportacion, 0);
  const valorIni = prev?.valor || 0;
  const valorFin = filas.at(-1).valor;
  const ganancia = valorFin - valorIni - aportado;   // ganancia de mercado del año
  const conRent  = filas.filter(f => f.rentMes != null);
  const mejor    = conRent.length ? conRent.reduce((a, b) => (b.rentMes > a.rentMes ? b : a)) : null;
  const rentAno  = conRent.length
    ? (conRent.reduce((acc, f) => acc * (1 + f.rentMes / 100), 1) - 1) * 100
    : null;
  const mesesAportando = filas.filter(f => f.aportacion > 0).length;
  const dividendos     = filas.reduce((s, f) => s + (f.dividendo || 0), 0);
  return { year, filas, prev, aportado, valorIni, valorFin, ganancia, mejor, rentAno, mesesAportando, dividendos };
}

export function abrirWrapped() {
  const years = [...new Set(statsTotalCalc(state).map(f => f.fecha.slice(0, 4)))].sort().reverse();
  if (!years.length) { avisar("Aún no hay datos para generar el informe anual."); return; }
  closeDrawer();
  renderWrapped(years, years[0]);
  $("#modalWrapped").classList.add("open");
}

let _wrappedYear = null;   // año actualmente pintado (descarta respuestas obsoletas del índice)

function renderWrapped(years, year) {
  _wrappedYear = year;
  $("#wrappedYears").innerHTML = years.map(y =>
    `<button class="wrapped-year ${y === year ? "active" : ""}" data-wyear="${esc(y)}">${esc(y)}</button>`
  ).join("");
  $$("[data-wyear]").forEach(b => b.onclick = () => renderWrapped(years, b.dataset.wyear));

  const w = calcWrapped(year);
  if (!w) { $("#wrappedCard").innerHTML = ""; return; }
  const gCol = w.ganancia >= 0 ? "#34D399" : "#F87171";
  const bench = BENCHMARKS.find(b => b.id === state.benchmarkSymbol) || BENCHMARKS[0];
  $("#wrappedCard").innerHTML = `
    <div class="wrapped">
      <div class="wrapped-head">
        <div class="wrapped-brand">Mi Cartera</div>
        <div class="wrapped-year-big">${esc(year)}</div>
        <div class="wrapped-tagline">Tu año inversor</div>
      </div>
      <div class="wrapped-grid">
        <div class="wrapped-stat">
          <div class="ws-l">Aportado</div>
          <div class="ws-v">${fmtE(w.aportado)}</div>
          <div class="ws-s">${w.mesesAportando} ${w.mesesAportando === 1 ? "mes" : "meses"} aportando</div>
        </div>
        <div class="wrapped-stat">
          <div class="ws-l">Ganancia del año</div>
          <div class="ws-v" style="color:${gCol}">${w.ganancia >= 0 ? "+" : ""}${fmtE(w.ganancia)}</div>
          <div class="ws-s">${w.rentAno != null ? `${w.rentAno >= 0 ? "+" : ""}${fmt(w.rentAno)}% de rentabilidad` : "revalorización de mercado"}</div>
        </div>
        <div class="wrapped-stat">
          <div class="ws-l">Valor final</div>
          <div class="ws-v">${fmtE(w.valorFin)}</div>
          <div class="ws-s">${w.valorIni > 0 ? `desde ${fmtE(w.valorIni)}` : "primer año"}</div>
        </div>
        <div class="wrapped-stat">
          <div class="ws-l">Mejor mes</div>
          <div class="ws-v" style="color:#34D399">${w.mejor ? `${w.mejor.rentMes >= 0 ? "+" : ""}${fmt(w.mejor.rentMes)}%` : "—"}</div>
          <div class="ws-s">${w.mejor ? esc(labelMes(w.mejor.fecha)) : "sin datos suficientes"}</div>
        </div>
        <div class="wrapped-stat">
          <div class="ws-l">Alpha vs índice</div>
          <div class="ws-v" id="wrappedAlpha">…</div>
          <div class="ws-s" id="wrappedAlphaSub">vs ${esc(bench.nombre)} · calculando</div>
        </div>
        ${w.dividendos > 0 ? `
        <div class="wrapped-stat">
          <div class="ws-l">Rentas cobradas</div>
          <div class="ws-v" style="color:#34D399">${fmtE(w.dividendos)}</div>
          <div class="ws-s">dividendos y cupones</div>
        </div>` : ""}
      </div>
      <div class="wrapped-foot">Generado con Mi Cartera · ${esc(new Date().toLocaleDateString("es-ES"))}</div>
    </div>`;
  $("#wrappedDownload").onclick = () => descargarWrappedPNG(year);

  // Alpha vs índice: rentabilidad del año de la cartera (composición de rentMes,
  // time-weighted) menos la del índice en los mismos meses.
  fetchYahooSeries(bench.id).then(data => {
    if (_wrappedYear !== year) return;   // el usuario cambió de año mientras cargaba
    const el = $("#wrappedAlpha");
    const sub = $("#wrappedAlphaSub");
    if (!el) return;   // usuario cerró el modal
    if (!data?.serie || w.rentAno == null) {
      el.textContent = "—";
      if (sub) sub.textContent = `vs ${bench.nombre} · no disponible`;
      return;
    }
    const yms = Object.keys(data.serie).sort();
    const precioEn = (ym) => { let best = null; for (const k of yms) { if (k <= ym) best = data.serie[k]; else break; } return best; };
    const primerMes = w.filas[0].fecha;
    const mesAnterior = (() => { let [y, m] = primerMes.split("-").map(Number); m--; if (m < 1) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; })();
    const ini = precioEn(w.prev ? w.prev.fecha : mesAnterior) ?? precioEn(primerMes);
    const fin = precioEn(w.filas.at(-1).fecha);
    if (!ini || !fin) {
      el.textContent = "—";
      if (sub) sub.textContent = `vs ${bench.nombre} · sin serie del año`;
      return;
    }
    const rentIdx = (fin / ini - 1) * 100;
    const alpha   = w.rentAno - rentIdx;
    el.textContent  = `${alpha >= 0 ? "+" : ""}${fmt(alpha)} pp`;
    el.style.color  = alpha >= 0 ? "#34D399" : "#F87171";
    if (sub) sub.textContent = `vs ${bench.nombre} (${rentIdx >= 0 ? "+" : ""}${fmt(rentIdx)}%)`;
  });
}

async function descargarWrappedPNG(year) {
  const card = $("#wrappedCard .wrapped");
  if (!card) return;
  const btn = $("#wrappedDownload");
  const orig = btn.textContent;
  try {
    btn.textContent = "Generando…";
    await ensurePDFLibs();   // incluye html2canvas
    const canvas = await html2canvas(card, { backgroundColor: null, scale: 2, logging: false });
    canvas.toBlob(blob => {
      if (!blob) { avisar("No se pudo generar la imagen."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mi-cartera-wrapped-${year}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      flash();
    }, "image/png");
  } catch (err) {
    console.error("[Cartera] Error generando wrapped", err);
    avisar("No se pudo generar la imagen: " + (err?.message || err));
  } finally {
    btn.textContent = orig;
  }
}
