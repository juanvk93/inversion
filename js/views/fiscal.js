import { calcCosteMedio, calcImpuestoTramos, entradasEUR } from "../calc.js";
import { FISCAL_TRAMOS_2026 } from "../config.js";
import { state } from "../state.js";
import { $, $$, esc, fmt, fmtE, parseNum, rerenderTrasEdicion } from "../utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// 7d. VISTA · FISCALIDAD (simulador D-100, plusvalías 2026)
// ═══════════════════════════════════════════════════════════════════════════

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

export function renderFiscal() {
  const accent = "#F87171";

  // Por producto: coste medio de lo que sigue invertido (las ventas registradas
  // restan su parte proporcional) y plusvalía ya realizada en esas ventas
  const anoActual = String(new Date().getFullYear());
  const filas = state.productos.map(p => {
    // En euros: Hacienda calcula la plusvalía en euros al tipo de cada operación
    const ents = entradasEUR(state, p).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const valorActual = ents.length ? ents.at(-1).valor : 0;
    const { coste, realizadaPorAno } = calcCosteMedio(ents);
    const aportado    = coste;
    const ganancia    = valorActual - aportado;
    return {
      id: p.id, nombre: p.nombre, color: p.color,
      valorActual, aportado, ganancia,
      realizadaAno: realizadaPorAno[anoActual] || 0,
      pctGanancia: aportado > 0 ? (ganancia / aportado) * 100 : 0,
    };
  });
  // Ventas ya registradas este año: tributan en la misma declaración que lo
  // que se simule vender, así que se suman a la base (los tramos son progresivos)
  const realizadaAno = filas.reduce((s, f) => s + f.realizadaAno, 0);

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
  const sumGanancias   = ganadores.reduce((s, f) => s + f.plusvalia, 0) + Math.max(0, realizadaAno);
  const sumPerdidas    = Math.abs(perdedores.reduce((s, f) => s + f.plusvalia, 0)) + Math.max(0, -realizadaAno);
  // Compensación con tope LIRPF: pérdidas pueden compensar 100% de la base del ahorro
  // (a partir de 2023 el tope inter-grupos es 25%, pero dentro del propio grupo es libre).
  const baseImponible  = Math.max(0, sumGanancias - sumPerdidas);
  const ahorroFiscal   = sumGanancias > 0 ? (calcImpuestoTramos(sumGanancias) - calcImpuestoTramos(baseImponible)) : 0;
  const impuesto       = calcImpuestoTramos(baseImponible);
  const tasaMarginal   = tipoMarginal(baseImponible);
  // Cuota de lo ya vendido este año: se paga igual, no resta del líquido de la venta simulada
  const impRealizada   = calcImpuestoTramos(realizadaAno);
  const impVenta       = Math.max(0, impuesto - impRealizada);

  // ─── Resumen "si vendieras TODO hoy" ───
  const totVal     = filas.reduce((s, f) => s + f.valorActual, 0);
  const totApor    = filas.reduce((s, f) => s + f.aportado, 0);
  const totGanan   = totVal - totApor;
  const totBaseImp = Math.max(0, totGanan + realizadaAno);
  const totImp     = Math.max(0, calcImpuestoTramos(totBaseImp) - impRealizada);

  const colorG = (v) => v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--mute)";

  const tramosHTML = `
    <div class="panel">
      <div class="panel-title">Tramos renta del ahorro · 2026</div>
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
        <div class="kpi-label">Valor actual</div>
        <div class="kpi-value" style="color:var(--accent)">${fmtE(totVal)}</div>
        <div class="kpi-sub">Coste de lo invertido: ${fmtE(totApor)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Plusvalía latente</div>
        <div class="kpi-value" style="color:${colorG(totGanan)}">${totGanan>=0?"+":""}${fmtE(totGanan)}</div>
        <div class="kpi-sub">${realizadaAno ? `Ya realizada en ${anoActual}: ${realizadaAno>0?"+":""}${fmtE(realizadaAno)}` : "No tributa hasta venta"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Si vendieras todo hoy</div>
        <div class="kpi-value" style="color:var(--red)">-${fmtE(totImp)}</div>
        <div class="kpi-sub">Impuesto · base ${fmtE(totBaseImp)}${realizadaAno ? ` (con lo ya realizado en ${anoActual})` : ""}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Neto tras impuestos</div>
        <div class="kpi-value" style="color:var(--green)">${fmtE(totVal - totImp)}</div>
        <div class="kpi-sub">Si vendieras todo</div>
      </div>
    </div>`;

  // Simulador interactivo
  const simHTML = `
    <div class="panel">
      <div class="panel-title">Simulador · ¿cuánto pagaría si vendiera?</div>
      <div class="fiscal-sim-toolbar">
        <button class="fiscal-preset" data-pct="0">Reset</button>
        <button class="fiscal-preset" data-pct="25">25% de cada</button>
        <button class="fiscal-preset" data-pct="50">50% de cada</button>
        <button class="fiscal-preset" data-pct="100">100% de cada</button>
      </div>
      <div class="fiscal-table">
        <div class="fiscal-row fiscal-head">
          <span>Producto</span><span>Valor</span><span>Vender €</span><span>Plusvalía</span>
        </div>
        ${conPlus.map(f => `
          <div class="fiscal-row">
            <span data-l="Producto"><span class="asig-dot" style="background:${f.color}"></span>${esc(f.nombre)}</span>
            <span data-l="Valor">${fmtE(f.valorActual)}</span>
            <span data-l="Vender €">
              <input type="number" min="0" max="${f.valorActual}" step="50" data-fiscal-vender="${esc(f.id)}" value="${f.vender || ""}" placeholder="0">
            </span>
            <span data-l="Plusvalía" style="color:${colorG(f.plusvalia)}">${f.plusvalia>=0?"+":""}${fmtE(f.plusvalia)}</span>
          </div>`).join("")}
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Resultado fiscal de la simulación</div>
      <div class="fiscal-result">
        <div class="fr-row"><span>Ventas totales</span><strong>${fmtE(totalVender)}</strong></div>
        ${realizadaAno ? `<div class="fr-row"><span>Plusvalía ya realizada en ${anoActual} (incluida)</span><strong style="color:${colorG(realizadaAno)}">${realizadaAno>0?"+":""}${fmtE(realizadaAno)}</strong></div>` : ""}
        <div class="fr-row"><span>Ganancias brutas</span><strong style="color:var(--green)">+${fmtE(sumGanancias)}</strong></div>
        <div class="fr-row"><span>Pérdidas (compensan)</span><strong style="color:var(--red)">-${fmtE(sumPerdidas)}</strong></div>
        <div class="fr-row fr-sep"><span>Base imponible</span><strong>${fmtE(baseImponible)}</strong></div>
        <div class="fr-row"><span>Cuota a pagar${realizadaAno ? ` (${anoActual})` : ""}</span><strong style="color:var(--red)">-${fmtE(impuesto)}</strong></div>
        ${realizadaAno > 0 ? `<div class="fr-row"><span>De ella, por esta venta</span><strong style="color:var(--red)">-${fmtE(impVenta)}</strong></div>` : ""}
        ${ahorroFiscal > 0 ? `<div class="fr-row"><span>Ahorro por compensación</span><strong style="color:var(--green)">+${fmtE(ahorroFiscal)}</strong></div>` : ""}
        <div class="fr-row fr-final"><span>Líquido tras impuestos</span><strong style="color:var(--accent)">${fmtE(totalVender - impVenta)}</strong></div>
        <div class="fr-marg">Tipo marginal aplicado: ${(tasaMarginal*100).toFixed(0)}%</div>
      </div>
    </div>
  `;

  // Tax-loss harvesting: sobre las ganancias/pérdidas LATENTES de cada producto.
  // (Antes se filtraba por la plusvalía simulada, que vale 0 cuando no se simula
  // ninguna venta → el panel no aparecía nunca.)
  const latPerdedores = filas.filter(f => f.ganancia < 0);
  const latGanadores  = filas.filter(f => f.ganancia > 0);
  const tlhHTML = (latPerdedores.length && latGanadores.length && totalVender === 0) ? `
    <div class="panel">
      <div class="panel-title">💡 Sugerencia · tax-loss harvesting</div>
      <div class="fiscal-tlh">
        <p>Tienes ${latPerdedores.length} producto(s) con pérdidas latentes que podrían compensar ganancias:</p>
        <ul>
          ${latPerdedores.map(p => `<li><strong>${esc(p.nombre)}</strong>: <span style="color:var(--red)">${fmtE(p.ganancia)}</span></li>`).join("")}
        </ul>
        <p class="fiscal-tlh-info">Si materializas estas pérdidas vendiéndolas, podrás compensar hasta ${fmtE(Math.abs(latPerdedores.reduce((s,p)=>s+p.ganancia,0)))} de ganancias del mismo año o de los 4 siguientes.</p>
        <p class="fiscal-tlh-info">⚠ Regla antiaplicación (art. 33.5 LIRPF): si recompras valores homogéneos en los 2 meses anteriores o posteriores a la venta, la pérdida no se computa hasta que vendas esos nuevos valores.</p>
      </div>
    </div>` : "";

  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2>Fiscalidad · D-100 simulado</h2>
        <div class="subtitle">Estimación informativa de plusvalías · No es asesoramiento fiscal</div>
        <div class="subtitle">Las ventas registradas (MANUAL en negativo) restan su parte proporcional del coste (coste medio); Hacienda aplica FIFO (las participaciones más antiguas se venden primero), por lo que la plusvalía real puede diferir.</div>
      </div>
    </div>
    ${kpisHTML}
    ${tramosHTML}
    ${simHTML}
    ${tlhHTML}
  `;

  // Bindings de los inputs por producto
  // Recalcular al confirmar (Enter o salir del campo): re-renderizar mientras se
  // teclea sustituía el input, perdía el foco y cerraba el teclado en iOS.
  $$('[data-fiscal-vender]').forEach(inp => {
    inp.onchange = (e) => {
      const id = e.target.dataset.fiscalVender;
      const v  = parseNum(e.target.value, true);
      state.fiscalSim[id] = Number.isFinite(v) ? Math.max(0, v) : 0;
      rerenderTrasEdicion(() => { if (state.tab === "fiscal") renderFiscal(); });
    };
  });
  $$('[data-pct]').forEach(b => b.onclick = () => {
    const pct = parseFloat(b.dataset.pct) / 100;
    filas.forEach(f => { state.fiscalSim[f.id] = f.valorActual * pct; });
    renderFiscal();
  });
}

export function renderObjetivos(productoId, valorActual) {
  const norm = v => (v == null || v === "total") ? null : v;
  const target = norm(productoId);
  const rel = state.objetivos.filter(o => norm(o.productoId) === target && +o.meta > 0);
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
          <span class="obj-pct" style="color:${color}">${done ? "✓ Completado" : `${fmt(pct, 1)} %`}</span>
          ${!done ? `<span class="obj-rest">Faltan ${fmtE(o.meta - valorActual)}</span>` : ""}
        </div>
      </div>`;
  }).join("");
  return `<section class="panel"><div class="panel-title">Objetivos</div><div class="obj-panel">${items}</div></section>`;
}
