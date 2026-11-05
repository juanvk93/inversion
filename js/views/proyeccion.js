import { PROY_MESES_MIN, acotarMediaMensual, calcProyeccion, entradasEUR, memoMonteCarlo, mesesHistorial, percentilesPorMes, simulateMonteCarlo, statsTotalCalc, tasaProyeccion } from "../calc.js";
import { drawChartMonteCarlo, drawChartProy, makeGradient } from "../charts.js";
import { saveState, state } from "../state.js";
import { $, $$, aportTotal, esc, fmt, fmtE } from "../utils.js";

export function renderProyeccion() {
  const filasTot         = statsTotalCalc(state);
  const valorActualTotal = filasTot.length ? filasTot.at(-1).valor : 0;
  const ultimos          = filasTot.slice(-3);
  const aportBaseAuto    = ultimos.length
    ? Math.round(ultimos.reduce((s,f) => s + f.aportacion, 0) / ultimos.length)
    : 400;
  const aportBase = state.aportMensual !== null ? state.aportMensual : aportBaseAuto;

  // Tasa del escenario realista: TIR histórica acotada; null con poco historial
  const tpCartera   = tasaProyeccion(filasTot);
  const tirCartera  = tpCartera.tasa;
  const conservador = calcProyeccion(valorActualTotal, aportBase, state.horizonte, 0.06);
  const optimista   = calcProyeccion(valorActualTotal, aportBase, state.horizonte, 0.08);
  const realista    = tirCartera != null
    ? calcProyeccion(valorActualTotal, aportBase, state.horizonte, tirCartera)
    : null;
  const finalC  = conservador.at(-1);
  const finalO  = optimista.at(-1);
  const finalR  = realista?.at(-1);
  const totalAp = finalC?.aportado || 0;

  // Inflación: factor para deflactar valores nominales a € de hoy (poder adquisitivo).
  const infl       = state.inflacion || 0;
  const factorReal = Math.pow(1 + infl, state.horizonte);
  const aReal      = (v) => (v || 0) / factorReal;

  // Inicializar visibilidad de productos (todo ON por defecto)
  if (!state.proyProductos) state.proyProductos = {};
  state.productos.forEach(p => {
    if (state.proyProductos[p.id] === undefined) state.proyProductos[p.id] = true;
  });

  // Proyección individual por producto
  let prodData = state.productos.map(p => {
    const ents    = [...entradasEUR(state, p)].sort((a,b) => a.fecha.localeCompare(b.fecha));   // en euros, como el total
    const lastVal = ents.at(-1)?.valor || 0;
    const tp      = tasaProyeccion(ents);
    const ultP    = ents.slice(-3);
    const aportP  = ultP.length
      ? Math.round(ultP.reduce((s,e) => s + aportTotal(e), 0) / ultP.length)
      : 0;
    return { ...p, tir: tp.tasa, acotada: tp.acotada, insuficiente: tp.insuficiente && ents.length > 0, aportP, lastVal };
  });
  const prodCortos = prodData.filter(p => p.insuficiente).map(p => p.nombre);
  prodData = prodData.filter(p => p.tir != null && p.lastVal > 0);

  const scenarios = [
    { l: "Conservador", t: "6% anual",
      v: finalC?.valor, g: (finalC?.valor||0) - totalAp,
      cls: "cons", scenCls: "scen-cons" },
    ...(realista ? [{
      l: tpCartera.acotada ? "Realista · TIR acotada" : "Realista · TIR histórica", t: `${tirCartera>=0?"+":""}${fmt(tirCartera*100)}% anual`,
      v: finalR?.valor, g: (finalR?.valor||0) - totalAp,
      cls: "real", scenCls: "scen-real" }] : []),
    { l: "Optimista",   t: "8% anual",
      v: finalO?.valor, g: (finalO?.valor||0) - totalAp,
      cls: "opt",  scenCls: "scen-opt" },
  ];

  // ── Monte Carlo (si hay suficientes datos para estimar volatilidad) ──
  const mcStats = { posible: false, cards: [], percs: null, labels: null, aportLine: null };
  const rentMensuales = filasTot.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (mesesHistorial(filasTot) >= PROY_MESES_MIN && rentMensuales.length >= 6 && valorActualTotal > 0) {
    const mediaHist = rentMensuales.reduce((s,v) => s+v, 0) / rentMensuales.length;
    const mediaPct  = acotarMediaMensual(mediaHist / 100) * 100;
    const variancia = rentMensuales.reduce((s,v) => s + (v - mediaHist)**2, 0) / (rentMensuales.length - 1);
    const stdPct    = Math.sqrt(variancia);
    const meses     = state.horizonte * 12;
    const nSims     = 2000;
    const params = {
      valorInicial: valorActualTotal,
      aportMensual: aportBase,
      meses,
      mediaMensual: mediaPct / 100,
      stdMensual:   stdPct / 100,
      nSims,
    };
    const PERC = [5, 25, 50, 75, 95];
    const percsFull = memoMonteCarlo(`proy|${JSON.stringify(params)}`,
      () => percentilesPorMes(simulateMonteCarlo(params), PERC));

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
    mcStats.mediaAcotada    = Math.abs(mediaPct - mediaHist) > 1e-9;
    mcStats.stdMensualPct   = stdPct;
    mcStats.cards   = [
      { l: "P5 · pesimista",  v: finalP5,  s: "5% de los escenarios queda por debajo", cls: "mc-low" },
      { l: "P50 · mediana",   v: finalP50, s: "Resultado más probable",                 cls: "mc-mid" },
      { l: "P95 · optimista", v: finalP95, s: "5% de los escenarios queda por encima", cls: "mc-high" },
    ];
  }

  // Con poco historial la TIR no es una base fiable: se dice qué falta
  const avisos = [];
  if (tpCartera.insuficiente && filasTot.length)
    avisos.push(`El escenario realista y el Monte Carlo necesitan ${PROY_MESES_MIN} meses de historial (tienes ${tpCartera.meses}): con menos, la rentabilidad pasada es sobre todo ruido.`);
  if (tpCartera.acotada)
    avisos.push(`Tu TIR histórica (${fmt(tpCartera.tir*100)}%) se acota a ${fmt(tirCartera*100)}% en el escenario realista: es poco probable sostenerla durante décadas.`);
  if (prodCortos.length)
    avisos.push(`Sin proyección individual por tener menos de ${PROY_MESES_MIN} meses: ${prodCortos.map(esc).join(", ")}.`);
  const avisoHistorial = avisos.map(a => `<p class="disclaimer">⚠ ${a}</p>`).join("");

  const checkboxesHtml = prodData.length ? `
    <div class="proy-prods">
      <div class="proy-prods-title">Proyección individual de productos</div>
      <div class="proy-prods-list">
        ${prodData.map(p => `
          <label class="proy-prod-item">
            <input type="checkbox" data-prod-proy="${esc(p.id)}" ${state.proyProductos[p.id] ? "checked" : ""}>
            <span class="proy-prod-dot" style="background:${p.color}"></span>
            <span class="proy-prod-nombre">${esc(p.nombre)}</span>
            <span class="proy-prod-tir">${p.tir>=0?"+":""}${fmt(p.tir*100)}% TIR${p.acotada ? " (acotada)" : ""}</span>
          </label>`).join("")}
      </div>
    </div>` : "";

  const html = `
    <div class="title-row">
      <div>
        <h2>Proyección futura</h2>
        <div class="subtitle">Basada en el valor actual total de la cartera</div>
      </div>
    </div>

    <div class="proy-controls">
      <div>
        <div class="label-row">
          <label>Horizonte temporal</label>
          <span class="val">${state.horizonte} años</span>
        </div>
        <input type="range" min="1" max="40" value="${state.horizonte}" id="rangeHoriz">
        <div class="range-marks">
          ${[5,10,20,30,40].map(v => `<button class="${state.horizonte===v?"active":""}" data-h="${v}">${v}a</button>`).join("")}
        </div>
      </div>
      <div>
        <div class="label-row">
          <label>Aportación mensual</label>
          <span class="val">${fmtE(aportBase)}</span>
        </div>
        <input type="range" min="50" max="2000" step="50" value="${aportBase}" id="rangeAport">
        <div class="range-marks">
          <span>50€</span>
          ${state.aportMensual !== null ? `<button class="reset" id="btnResetAport">reset a ${fmtE(aportBaseAuto)}</button>` : ""}
          <span>2.000€</span>
        </div>
      </div>
      <div>
        <div class="label-row">
          <label>Inflación anual</label>
          <span class="val">${fmt(infl*100, 1)}%</span>
        </div>
        <input type="range" min="0" max="6" step="0.1" value="${(infl*100).toFixed(1)}" id="rangeInfl">
        <div class="range-marks">
          ${[0, 2, 3, 5].map(v => `<button class="${Math.abs(infl*100 - v) < 0.05 ? "active" : ""}" data-infl="${v}">${v}%</button>`).join("")}
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
              ${infl > 0 ? `<div class="scen-real-eur">≈ ${fmtE(aReal(s.v))} en € de hoy</div>` : ""}
            </div>
            <span class="scen-tag">${s.t}</span>
          </div>
          <div class="scen-grid">
            <div><div class="l">Aportado</div>   <div class="v" style="color:var(--dim)">${fmtE(totalAp)}</div></div>
            <div><div class="l">Ganancia</div>   <div class="v">${fmtE(s.g)}</div></div>
            <div><div class="l">Multiplicar</div><div class="v">×${fmt(valorActualTotal > 0 ? s.v/valorActualTotal : 0, 1)}</div></div>
          </div>
        </div>`).join("")}
    </div>

    <div class="panel">
      <div class="panel-title">Evolución proyectada</div>
      <div class="chart-box tall"><canvas id="chartProy"></canvas></div>
    </div>

    ${mcStats.posible ? `
      <div class="panel">
        <div class="panel-title">Simulación Monte Carlo · ${mcStats.nSims} Trayectorias</div>
        <div class="mc-cards">
          ${mcStats.cards.map(c => `
            <div class="mc-card ${c.cls}">
              <div class="mc-card-label">${c.l}</div>
              <div class="mc-card-value">${fmtE(c.v)}</div>
              <div class="mc-card-sub">${c.s}</div>
            </div>`).join("")}
        </div>
        <div class="chart-box tall"><canvas id="chartMC"></canvas></div>
        <p class="mc-foot">Volatilidad mensual histórica ${fmt(mcStats.stdMensualPct)}% · retorno medio ${fmt(mcStats.mediaMensualPct)}%/mes${mcStats.mediaAcotada ? " (acotado)" : ""}</p>
      </div>` : ""}

    ${avisoHistorial}
    ${infl > 0 ? `<p class="disclaimer">Los importes «en € de hoy» descuentan una inflación anual del ${fmt(infl*100,1)}% para reflejar el poder adquisitivo actual. Las líneas del gráfico son valores nominales.</p>` : ""}
    <p class="disclaimer">Proyección orientativa. No constituye asesoramiento financiero. Rentabilidades pasadas no garantizan resultados futuros.</p>`;

  $("#main").innerHTML = html;

  // Sliders: durante el arrastre solo se actualiza la etiqueta; el re-render
  // (que recrea el <input range> y cortaba el arrastre) se hace al soltar.
  $("#rangeHoriz").oninput  = (e) => { state.horizonte = +e.target.value; updateRangeLabel("Horizonte temporal", `${state.horizonte} años`); };
  $("#rangeHoriz").onchange = () => renderProyeccion();
  $$('[data-h]').forEach(b => b.onclick = () => { state.horizonte = +b.dataset.h; renderProyeccion(); });
  $("#rangeAport").oninput  = (e) => { state.aportMensual = +e.target.value; updateRangeLabel("Aportación mensual", fmtE(state.aportMensual)); };
  $("#rangeAport").onchange = () => renderProyeccion();
  if ($("#btnResetAport")) $("#btnResetAport").onclick = () => { state.aportMensual = null; renderProyeccion(); };
  const rangeInfl = $("#rangeInfl");
  rangeInfl.oninput  = (e) => { state.inflacion = +e.target.value / 100; updateRangeLabel("Inflación anual", `${fmt(state.inflacion*100,1)}%`); };
  rangeInfl.onchange = () => { saveState(); renderProyeccion(); };   // persistir y recalcular al soltar
  $$('[data-infl]').forEach(b => b.onclick = () => { state.inflacion = +b.dataset.infl / 100; saveState(); renderProyeccion(); });
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

  // drawChartProy/drawChartMonteCarlo destruyen la instancia previa (este
  // re-render no pasa por render() → destroyAllCharts()).
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
