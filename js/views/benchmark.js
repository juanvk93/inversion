import { statsTotalCalc } from "../calc.js";
import { FUENTE, TOOLTIP_BASE, crearGrafico, fmtTickEUR, gridConfig, makeGradient } from "../charts.js";
import { BENCHMARKS } from "../config.js";
import { fetchYahooSeries } from "../precios.js";
import { benchmarkCache, saveState, state } from "../state.js";
import { $, $$, esc, fmt, fmtE } from "../utils.js";
import { setAccentVars } from "./render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 7e. VISTA · BENCHMARK (¿bates al índice?)
// ═══════════════════════════════════════════════════════════════════════════

// Simula invertir tus MISMAS aportaciones, en las MISMAS fechas, en el índice.
// Las retiradas (aportación negativa) y las rentas cobradas venden participaciones
// del índice: el dinero sale de las dos carteras igual. Si tu historial empieza
// antes que la serie del índice, la comparación arranca en el primer mes con
// precio, invirtiendo en el índice lo que valía tu cartera el mes anterior.
// Devuelve la curva del índice (null antes de arrancar), el valor final a precio
// actual y, para la ventana comparada: inicio, capital aportado y rentas cobradas.
function simularBenchmark(filasTot, data) {
  const serie  = data.serie;
  const ymsOrd = Object.keys(serie).sort();
  // Precio del índice en un mes: exacto, o el último cierre conocido anterior (cubre huecos).
  const precioEn = (ym) => {
    if (serie[ym] != null) return serie[ym];
    let best = null;
    for (const k of ymsOrd) { if (k <= ym) best = serie[k]; else break; }
    return best;
  };
  const i0 = filasTot.findIndex(f => precioEn(f.fecha));
  if (i0 < 0) return null;
  const inicial = i0 > 0 ? filasTot[i0 - 1].valor : 0;
  let unidades = inicial > 0 ? inicial / precioEn(filasTot[i0].fecha) : 0;
  let aportado = inicial, dividendos = 0;
  const puntos = filasTot.map((f, i) => {
    if (i < i0) return { label: f.label, indice: null };
    const precio = precioEn(f.fecha);
    // La posición previa de un producto también se invierte en el índice
    const neto = f.aportacion + (f.flujoExtra || 0) - (f.dividendo || 0);
    if (neto > 0) unidades += neto / precio;
    else if (neto < 0) unidades = Math.max(0, unidades + neto / precio);
    aportado   += f.aportacion + (f.flujoExtra || 0);
    dividendos += f.dividendo || 0;
    return { label: f.label, indice: unidades * precio };
  });
  const valorFinal = unidades * data.last;   // a precio actual del índice
  puntos.at(-1).indice = valorFinal;
  return { puntos, valorFinal, i0, aportado, dividendos };
}

export function renderBenchmark() {
  const accent = "#38BDF8";
  setAccentVars(accent);
  const bench = BENCHMARKS.find(b => b.id === state.benchmarkSymbol) || BENCHMARKS[0];

  const selectorHTML = `
    <div class="panel bench-sel-panel">
      <label class="bench-sel-label">Índice de referencia</label>
      <div class="bench-sel-chips">
        ${BENCHMARKS.map(b => `
          <button class="bench-chip ${b.id===state.benchmarkSymbol?"active":""}" data-bench="${esc(b.id)}" title="${esc(b.desc)}">
            ${esc(b.nombre)}
          </button>`).join("")}
      </div>
    </div>`;

  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2>Vs. índice de referencia</h2>
        <div class="subtitle">¿Tu cartera bate al índice con tus mismas aportaciones?</div>
      </div>
    </div>
    ${selectorHTML}
    <div class="panel"><div class="diff-loading">Cargando ${esc(bench.nombre)}…</div></div>`;

  bindBenchChips();
  fetchYahooSeries(bench.id).then(data => {
    // Evita pisar el DOM si el usuario navegó fuera o cambió de índice mientras cargaba.
    if (state.tab !== "benchmark" || bench.id !== state.benchmarkSymbol) return;
    renderBenchmarkSync(data, bench);
  });
}

function bindBenchChips() {
  $$('[data-bench]').forEach(b => b.onclick = () => {
    if (b.dataset.bench === state.benchmarkSymbol) return;
    state.benchmarkSymbol = b.dataset.bench;
    saveState();
    renderBenchmark();
  });
}

function renderBenchmarkSync(data, bench) {
  const accent   = "#38BDF8";
  const filasTot = statsTotalCalc(state);

  const selectorHTML = `
    <div class="panel bench-sel-panel">
      <label class="bench-sel-label">Índice de referencia</label>
      <div class="bench-sel-chips">
        ${BENCHMARKS.map(b => `
          <button class="bench-chip ${b.id===state.benchmarkSymbol?"active":""}" data-bench="${esc(b.id)}" title="${esc(b.desc)}">
            ${esc(b.nombre)}
          </button>`).join("")}
      </div>
    </div>`;

  const head = `
    <div class="title-row">
      <div>
        <h2>Vs. índice de referencia</h2>
        <div class="subtitle">¿Tu cartera bate al índice con tus mismas aportaciones?</div>
      </div>
    </div>
    ${selectorHTML}`;

  // Casos sin datos
  if (filasTot.length < 2) {
    $("#main").innerHTML = head + `<div class="panel"><div class="empty" style="padding:48px 0">
      <div class="empty-title">Sin datos suficientes</div>
      <div class="empty-sub">Registra al menos dos meses para comparar con el índice</div>
    </div></div>`;
    bindBenchChips();
    return;
  }
  if (!data) {
    const err = benchmarkCache[bench.id]?.error || "No se pudo obtener la serie del índice";
    $("#main").innerHTML = head + `<div class="panel"><div class="empty" style="padding:48px 0">
      <div class="empty-title">Índice no disponible</div>
      <div class="empty-sub">${esc(err)}. Reintenta en unos segundos (proxies públicos).</div>
    </div></div>`;
    bindBenchChips();
    return;
  }
  if (data.currency && data.currency !== "EUR") {
    $("#main").innerHTML = head + `<div class="panel"><div class="empty" style="padding:48px 0">
      <div class="empty-title">Divisa no compatible</div>
      <div class="empty-sub">El índice cotiza en ${esc(data.currency)}, no en EUR. Elige otro.</div>
    </div></div>`;
    bindBenchChips();
    return;
  }

  const sim = simularBenchmark(filasTot, data);
  if (!sim) {
    $("#main").innerHTML = head + `<div class="panel"><div class="empty" style="padding:48px 0">
      <div class="empty-title">Sin datos del índice</div>
      <div class="empty-sub">La serie de ${esc(bench.nombre)} no cubre ninguno de tus meses registrados.</div>
    </div></div>`;
    bindBenchChips();
    return;
  }
  const { puntos, valorFinal, i0, aportado, dividendos } = sim;
  const ultima      = filasTot.at(-1);
  const valorCart   = ultima.valor;
  // Rentabilidad total sobre lo aportado en la ventana: las rentas cobradas
  // cuentan en las dos (el índice vendió participaciones por el mismo importe)
  const rentCart    = aportado > 0 ? (valorCart  + dividendos - aportado) / aportado * 100 : 0;
  const rentIdx     = aportado > 0 ? (valorFinal + dividendos - aportado) / aportado * 100 : 0;
  const alpha       = rentCart - rentIdx;
  const diffEur     = valorCart - valorFinal;
  const gana        = alpha >= 0;
  const col         = (v) => v >= 0 ? "var(--green)" : "var(--red)";

  const kpisHTML = `
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">Tu cartera</div>
        <div class="kpi-value" style="color:var(--accent)">${fmtE(valorCart)}</div>
        <div class="kpi-sub">${rentCart>=0?"+":""}${fmt(rentCart)}% sobre aportado</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">En ${esc(bench.nombre)}</div>
        <div class="kpi-value">${fmtE(valorFinal)}</div>
        <div class="kpi-sub">${rentIdx>=0?"+":""}${fmt(rentIdx)}% sobre aportado</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Diferencia</div>
        <div class="kpi-value" style="color:${col(diffEur)}">${diffEur>=0?"+":""}${fmtE(diffEur)}</div>
        <div class="kpi-sub">${gana ? "a favor de tu cartera" : "a favor del índice"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Alpha
          <span class="kpi-info" tabindex="0" role="button" aria-label="Información" data-tip="Diferencia de rentabilidad entre tu cartera y el índice, invirtiendo tus mismas aportaciones en las mismas fechas (comparación money-weighted). Positivo = bates al índice.">i</span>
        </div>
        <div class="kpi-value" style="color:${col(alpha)}">${alpha>=0?"+":""}${fmt(alpha)} pp</div>
        <div class="kpi-sub">${gana ? "🎉 bates al mercado" : "por debajo del índice"}</div>
      </div>
    </div>`;

  $("#main").innerHTML = head + kpisHTML + `
    <div class="panel">
      <div class="panel-title">Tu cartera vs ${esc(bench.nombre)}</div>
      <div class="chart-box tall"><canvas id="chartBench"></canvas></div>
    </div>
    ${i0 > 0 ? `<p class="disclaimer">⚠ La serie de ${esc(bench.nombre)} empieza en ${esc(filasTot[i0].label)}: la comparación arranca ahí, invirtiendo en el índice lo que valía tu cartera el mes anterior (${fmtE(filasTot[i0 - 1].valor)}).</p>` : ""}
    <p class="disclaimer">Simulación: se invierten tus aportaciones reales (manual + saveback + round-up) en el ETF ${esc(bench.desc)} a su cierre de cada mes, sin comisiones; las retiradas y las rentas cobradas venden participaciones. Datos de Yahoo Finance vía proxy público; pueden diferir ligeramente del índice oficial.</p>`;

  bindBenchChips();

  const labels = filasTot.map(f => f.label);
  drawChartBenchmark(labels, filasTot.map(f => f.valor), puntos.map(p => p.indice == null ? null : Math.round(p.indice)), bench.nombre, accent);
}

function drawChartBenchmark(labels, cartera, indice, nombreIdx, accent) {
  crearGrafico("bench", "chartBench", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Tu cartera", data: cartera,
          borderColor: accent, borderWidth: 2.5,
          backgroundColor: (c) => c.chart.chartArea ? makeGradient(c.chart.ctx, accent, c.chart.chartArea, 0.18) : "transparent",
          tension: 0.3, fill: true, pointRadius: 0, pointHoverRadius: 4 },
        { label: nombreIdx, data: indice,
          borderColor: "#FBBF24", borderWidth: 2, borderDash: [6, 3],
          backgroundColor: "transparent",
          tension: 0.3, fill: false, pointRadius: 0, pointHoverRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#9CA3AF", font: { family: FUENTE, size: 12 }, boxWidth: 12, padding: 12 } },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtE(c.parsed.y)}` } },
      },
      scales: gridConfig(fmtTickEUR),
    }
  });
}
