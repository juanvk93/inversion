import { entradasEUR, posicionPrevia } from "../calc.js";
import { _locked } from "../crypto.js";
import { formatSnapDate, listarSnapshots } from "../snapshots.js";
import { state } from "../state.js";
import { $, aportTotal, esc, fmt, fmtE } from "../utils.js";

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
    // En euros con los tipos de cambio actuales (los snapshots no los guardan)
    const ents = entradasEUR({ entradas: snap.entradas || {}, tiposCambio: state.tiposCambio }, p).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const valorActual  = ents.length ? ents.at(-1).valor : 0;
    // Con la posición previa del primer mes como capital, igual que en el resto de la app
    const aportado     = ents.reduce((s, e, i) => s + aportTotal(e) + posicionPrevia(e, i), 0);
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

export function renderDiff() {
  const accent = "#FB923C";
  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2>Comparar snapshots</h2>
        <div class="subtitle">Evolución entre dos puntos guardados</div>
      </div>
    </div>
    <div class="panel"><div class="diff-loading">Cargando snapshots…</div></div>
  `;
  // Token de petición: si el usuario cambia de vista (o de selección) mientras
  // se descifran los snapshots, la respuesta obsoleta se descarta y no pisa #main.
  const req = ++_diffReq;
  listarSnapshots()
    .then(snaps => {
      if (req !== _diffReq || state.tab !== "diff") return;
      // Los que no se pueden descifrar no son comparables
      const legibles = snaps.filter(sn => !sn.undecryptable);
      renderDiffSync(legibles, snaps.length - legibles.length);
    })
    .catch(err => {
      console.error("[Cartera] Error cargando snapshots", err);
      if (req === _diffReq && state.tab === "diff") {
        const box = $("#main .diff-loading");
        if (box) box.textContent = "No se pudieron cargar los snapshots.";
      }
    });
}
let _diffReq = 0;

function renderDiffSync(snaps, ilegibles = 0) {
  const accent = "#FB923C";
  const opciones = [
    { id: "current", label: "Estado actual" },
    ...snaps.map(s => ({ id: String(s.id), label: formatSnapDate(s.fecha) })),
  ];

  if (snaps.length === 0) {
    $("#main").innerHTML = `
      <div class="title-row">
        <div>
          <h2>Comparar snapshots</h2>
          <div class="subtitle">Evolución entre dos puntos guardados</div>
        </div>
      </div>
      <div class="panel"><div class="empty" style="padding:60px 0">
        ${ilegibles
          ? `<div class="empty-title">Snapshots no legibles</div>
        <div class="empty-sub">${ilegibles} snapshot(s) ${_locked ? "cifrados: desbloquea los datos para compararlos" : "cifrados con otra passphrase"}</div>`
          : `<div class="empty-title">Sin snapshots guardados</div>
        <div class="empty-sub">Crea al menos uno desde el menú lateral<span class="kbd-hint"> · <kbd>S</kbd></span></div>`}
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
  // Rentabilidad (ROI = ganancia / aportado): mide la eficiencia relativa,
  // complementa la GANANCIA absoluta. Δ se expresa en puntos porcentuales.
  const rentA = resA.totalAportado > 0 ? (gananciaA / resA.totalAportado) * 100 : 0;
  const rentB = resB.totalAportado > 0 ? (gananciaB / resB.totalAportado) * 100 : 0;
  const dRent = rentB - rentA;
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
          <label>Snapshot A</label>
          <select id="diffA">
            ${opciones.map(o => `<option value="${esc(o.id)}" ${String(o.id)===String(state.diffSnapA)?"selected":""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <div class="diff-vs">vs</div>
        <div class="diff-sel">
          <label>Snapshot B</label>
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
        <div class="kpi-label">Valor</div>
        <div class="kpi-value">${fmtE(resA.totalValor)} → ${fmtE(resB.totalValor)}</div>
        <div class="kpi-sub" style="color:${colorD(dValor)}">${signo(dValor)}${fmtE(dValor)} · ${signo(dValor)}${fmt(resA.totalValor > 0 ? (dValor/resA.totalValor)*100 : 0)}%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Aportado</div>
        <div class="kpi-value">${fmtE(resA.totalAportado)} → ${fmtE(resB.totalAportado)}</div>
        <div class="kpi-sub" style="color:${colorD(dAport)}">${signo(dAport)}${fmtE(dAport)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Ganancia</div>
        <div class="kpi-value" style="color:${colorD(gananciaB)}">${fmtE(gananciaA)} → ${fmtE(gananciaB)}</div>
        <div class="kpi-sub" style="color:${colorD(dGanancia)}">${signo(dGanancia)}${fmtE(dGanancia)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Rentabilidad</div>
        <div class="kpi-value" style="color:${colorD(rentB)}">${signo(rentA)}${fmt(rentA)}% → ${signo(rentB)}${fmt(rentB)}%</div>
        <div class="kpi-sub" style="color:${colorD(dRent)}">${signo(dRent)}${fmt(dRent)} pp</div>
      </div>
    </div>`;

  const tablaHTML = `
    <div class="panel">
      <div class="panel-title">Detalle por producto</div>
      <div class="diff-table">
        <div class="diff-row diff-head">
          <span>Producto</span><span>Valor A</span><span>Valor B</span><span>Δ Valor</span><span>Δ Ganancia</span>
        </div>
        ${filas.map(f => {
          const d = f.valorB - f.valorA;
          const dG = f.gananciaB - f.gananciaA;
          const cls = f.soloEnA ? "diff-removed" : f.soloEnB ? "diff-new" : "";
          return `
            <div class="diff-row ${cls}">
              <span data-l="Producto"><span class="asig-dot" style="background:${f.color}"></span>${esc(f.nombre)}${f.soloEnA?' <em>(eliminado)</em>':f.soloEnB?' <em>(nuevo)</em>':''}</span>
              <span data-l="Valor A">${fmtE(f.valorA)}</span>
              <span data-l="Valor B">${fmtE(f.valorB)}</span>
              <span data-l="Δ Valor" style="color:${colorD(d)}">${signo(d)}${fmtE(d)}</span>
              <span data-l="Δ Ganancia" style="color:${colorD(dG)}">${signo(dG)}${fmtE(dG)}</span>
            </div>`;
        }).join("")}
      </div>
    </div>`;

  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2>Comparar snapshots</h2>
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
