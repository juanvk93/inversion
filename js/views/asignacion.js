import { entradasEUR } from "../calc.js";
import { state } from "../state.js";
import { $, $$, esc, fmt, fmtE, parseNum, rerenderTrasEdicion } from "../utils.js";

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
    // Sin gaps: reparto proporcional al objetivo, normalizado por la suma de
    // objetivos (si no suman 100% se repartía de menos o de más)
    const sumObj = conGap.reduce((s, p) => s + p.pctObjetivo, 0);
    return conGap.map(p => ({ ...p, aportar: sumObj > 0 ? aporte * (p.pctObjetivo / sumObj) : 0 }));
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

export function renderAsignacion() {
  const accent = "#22D3EE";

  // Recolectar productos con valor actual (último valor) y % objetivo
  const items = state.productos.map(p => {
    const ents = [...entradasEUR(state, p)].sort((a, b) => a.fecha.localeCompare(b.fecha));
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
  const sinObjetivos = sumObjetivo === 0;

  const aporte = Number.isFinite(+state.asignacionAporte) ? +state.asignacionAporte : 0;
  const sugerencias = sugerirAportacion(conPct, aporte);

  const headerKpis = `
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">Valor actual</div>
        <div class="kpi-value" style="color:var(--accent)">${fmtE(totalActual)}</div>
        <div class="kpi-sub">${items.length} producto(s)</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Suma % objetivo</div>
        <div class="kpi-value" style="color:${Math.abs(sumObjetivo - 100) < 0.5 ? 'var(--green)' : 'var(--yellow)'}">${fmt(sumObjetivo)}%</div>
        <div class="kpi-sub">${Math.abs(sumObjetivo - 100) < 0.5 ? '✓ Suma 100%' : 'Ajusta hasta llegar a 100%'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Drift máx</div>
        ${sinObjetivos
          ? `<div class="kpi-value" style="color:var(--dimmer)">—</div>
        <div class="kpi-sub">Sin objetivos definidos</div>`
          : `<div class="kpi-value" style="color:${driftMax > 5 ? 'var(--red)' : driftMax > 2 ? 'var(--yellow)' : 'var(--green)'}">${fmt(driftMax)}%</div>
        <div class="kpi-sub">Mayor desviación absoluta</div>`}
      </div>
    </div>`;

  let tablaActualHTML;
  if (sinObjetivos) {
    tablaActualHTML = `<div class="panel"><div class="empty" style="padding:36px 0">
      <div class="empty-title">Sin asignación configurada</div>
      <div class="empty-sub">Edita cada producto y define un "% objetivo en cartera"</div>
    </div></div>`;
  } else {
    tablaActualHTML = `
      <div class="panel">
        <div class="panel-title">Drift actual vs objetivo</div>
        <div class="asig-table">
          <div class="asig-row asig-head">
            <span>Producto</span><span>Valor</span><span>Actual %</span><span>Objetivo %</span><span>Drift</span>
          </div>
          ${conPct.map(p => {
            const drift = p.pctActual - p.pctObjetivo;
            const driftCls = Math.abs(drift) > 5 ? "asig-drift-high" : Math.abs(drift) > 2 ? "asig-drift-mid" : "asig-drift-ok";
            return `
              <div class="asig-row">
                <span data-l="Producto"><span class="asig-dot" style="background:${p.color}"></span>${esc(p.nombre)}</span>
                <span data-l="Valor">${fmtE(p.valorActual)}</span>
                <span data-l="Actual">${fmt(p.pctActual)}%</span>
                <span data-l="Objetivo">${fmt(p.pctObjetivo)}%</span>
                <span data-l="Drift" class="${driftCls}">${drift>=0?"+":""}${fmt(drift)}%</span>
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
      <div class="panel-title">Simulador · ¿cuánto aportar y a dónde?</div>
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
          <span>Producto</span><span>Aportar</span><span>% Nuevo</span><span>Drift nuevo</span>
        </div>
        ${sugerencias.map(p => {
          const valorNuevo = p.valorActual + p.aportar;
          const totalNuevo = totalActual + aporte;
          const pctNuevo   = totalNuevo > 0 ? (valorNuevo / totalNuevo) * 100 : 0;
          const driftNuevo = pctNuevo - p.pctObjetivo;
          const driftCls = Math.abs(driftNuevo) > 5 ? "asig-drift-high" : Math.abs(driftNuevo) > 2 ? "asig-drift-mid" : "asig-drift-ok";
          return `
            <div class="asig-row">
              <span data-l="Producto"><span class="asig-dot" style="background:${p.color}"></span>${esc(p.nombre)}</span>
              <span data-l="Aportar" class="asig-aporte" style="color:var(--accent)">${fmtE(p.aportar)}</span>
              <span data-l="% Nuevo">${fmt(pctNuevo)}%</span>
              <span data-l="Drift nuevo" class="${driftCls}">${driftNuevo>=0?"+":""}${fmt(driftNuevo)}%</span>
            </div>`;
        }).join("")}
        <div class="asig-row asig-total">
          <span data-l="Total">Total</span>
          <span data-l="Aportar" style="color:var(--accent)">${fmtE(sumSug)}</span>
          <span></span>
          <span></span>
        </div>
      </div>` : `<div class="asig-empty">Introduce una cantidad para ver la distribución sugerida</div>`}
    </div>`;

  const html = `
    <div class="title-row">
      <div>
        <h2>Asignación de cartera</h2>
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
    // Recalcular al confirmar (Enter o salir del campo): re-renderizar mientras
    // se teclea sustituía el input, perdía el foco y cerraba el teclado en iOS.
    $("#asigAporte").onchange = (e) => {
      const v = parseNum(e.target.value, true);
      state.asignacionAporte = Number.isFinite(v) && v > 0 ? v : 0;
      rerenderTrasEdicion(() => { if (state.tab === "asignacion") renderAsignacion(); });
    };
  }
  $$('[data-aporte]').forEach(b => b.onclick = () => {
    state.asignacionAporte = +b.dataset.aporte;
    renderAsignacion();
  });
}
