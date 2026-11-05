import { calcStats, calcTIR, entradasEUR, statsTotalCalc } from "../calc.js";
import { state } from "../state.js";
import { $, $$, esc, fmt, fmtE } from "../utils.js";
import { render, setAccentVars } from "./render.js";

export function renderResumen() {
  const accent = "#FBBF24";
  setAccentVars(accent);

  const items = state.productos.map(p => {
    const ents = entradasEUR(state, p);   // comparativa en euros
    const filas = calcStats(ents);
    const ult  = filas[filas.length - 1] || null;
    const tir  = ents.length ? calcTIR(ents) : null;
    return {
      id:           p.id,
      nombre:       p.nombre,
      color:        p.color,
      aportado:     ult ? ult.acumAportado : 0,
      valor:        ult ? ult.valor        : 0,
      ganancia:     ult ? ult.ganancia     : 0,
      rentPct:      ult ? ult.rentPct      : 0,
      tir:          tir,
      tieneDatos:   !!ult,
    };
  });

  const totalValor    = items.reduce((s, p) => s + p.valor,    0);
  const totalAportado = items.reduce((s, p) => s + p.aportado, 0);
  const totalGanancia = totalValor - totalAportado;
  const totalRentPct  = totalAportado > 0 ? (totalGanancia / totalAportado) * 100 : 0;

  // TIR global de la cartera
  const filasTot = statsTotalCalc(state);
  const tirTotal = filasTot.length
    ? calcTIR(filasTot)
    : null;

  // Variación del valor total respecto al mes anterior
  const ultTot   = filasTot[filasTot.length - 1] || null;
  const prevTot  = filasTot.length > 1 ? filasTot[filasTot.length - 2] : null;
  const varMes   = ultTot && prevTot ? ultTot.valor - prevTot.valor : null;
  const varMesP  = varMes != null && prevTot.valor > 0 ? (varMes / prevTot.valor) * 100 : null;

  // Añadir peso en cartera y ordenar por valor desc
  const itemsConPeso = items
    .map(p => ({ ...p, peso: totalValor > 0 ? (p.valor / totalValor) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);

  let html = `
    <div class="title-row">
      <div>
        <h2>Resumen de productos</h2>
        <div class="subtitle">Vista comparada · ${items.length} producto${items.length===1?"":"s"} · ordenados por valor</div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">Valor total</div>
        <div class="kpi-value" style="color:${accent}">${fmtE(totalValor)}</div>
        <div class="kpi-sub">Aportado: ${fmtE(totalAportado)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Ganancia total</div>
        <div class="kpi-value" style="color:${totalGanancia>=0?'var(--green)':'var(--red)'}">${fmtE(totalGanancia)}</div>
        <div class="kpi-sub">${totalGanancia>=0?"+":""}${fmt(totalRentPct)}% sobre aportado</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">TIR anualizada</div>
        <div class="kpi-value" style="color:${tirTotal!=null && tirTotal>=0?'var(--green)':tirTotal!=null?'var(--red)':'var(--mute)'}">${tirTotal!=null?fmt(tirTotal*100)+"%":"—"}</div>
        <div class="kpi-sub">XIRR cartera completa</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Este mes</div>
        <div class="kpi-value" style="color:${varMes==null?'var(--mute)':varMes>=0?'var(--green)':'var(--red)'}">${varMes!=null?(varMes>=0?"+":"")+fmtE(varMes):"—"}</div>
        <div class="kpi-sub">${varMesP!=null?(varMesP>=0?"+":"")+fmt(varMesP)+"% vs mes anterior":"Sin mes anterior"}</div>
      </div>
    </div>
  `;

  if (!items.length) {
    html += `<div class="empty" style="margin-top:18px">
      <div class="empty-title">Sin productos</div>
      <div class="empty-sub">Crea un producto desde el menú lateral</div>
    </div>`;
    $("#main").innerHTML = html;
    return;
  }

  html += `
    <div class="panel" style="margin-top:18px">
      <div class="panel-title">Detalle por producto</div>
      <div class="asig-table resumen-table">
        <div class="asig-row asig-head resumen-row">
          <span>Producto</span>
          <span>Aportado</span>
          <span>Valor</span>
          <span>Ganancia</span>
          <span>TIR</span>
          <span>Peso</span>
        </div>
        ${itemsConPeso.map(p => {
          const gCol = p.ganancia >= 0 ? "var(--green)" : "var(--red)";
          const tirTxt = p.tir != null ? `${fmt(p.tir*100)}%` : "—";
          const tirCol = p.tir == null ? "var(--mute)" : p.tir >= 0 ? "var(--green)" : "var(--red)";
          return `
            <div class="asig-row resumen-row resumen-clickable" data-resumen-prod="${esc(p.id)}" role="button" tabindex="0" title="Abrir ${esc(p.nombre)}">
              <span data-l="Producto"><span class="asig-dot" style="background:${p.color}"></span>${esc(p.nombre)}</span>
              <span data-l="Aportado">${fmtE(p.aportado)}</span>
              <span data-l="Valor">${fmtE(p.valor)}</span>
              <span data-l="Ganancia"><span class="resumen-val" style="color:${gCol}">${fmtE(p.ganancia)}<span class="resumen-pct">${p.ganancia>=0?"+":""}${fmt(p.rentPct)}%</span></span></span>
              <span data-l="TIR"><span class="resumen-val" style="color:${tirCol}">${tirTxt}</span></span>
              <span data-l="Peso">${fmt(p.peso)}%</span>
            </div>`;
        }).join("")}
        <div class="asig-row asig-total resumen-row">
          <span data-l="Producto"><strong>Total</strong></span>
          <span data-l="Aportado">${fmtE(totalAportado)}</span>
          <span data-l="Valor">${fmtE(totalValor)}</span>
          <span data-l="Ganancia"><span class="resumen-val" style="color:${totalGanancia>=0?'var(--green)':'var(--red)'}">${fmtE(totalGanancia)}<span class="resumen-pct">${totalGanancia>=0?"+":""}${fmt(totalRentPct)}%</span></span></span>
          <span data-l="TIR"><span class="resumen-val" style="color:${tirTotal!=null && tirTotal>=0?'var(--green)':tirTotal!=null?'var(--red)':'var(--mute)'}">${tirTotal!=null?fmt(tirTotal*100)+"%":"—"}</span></span>
          <span data-l="Peso">100%</span>
        </div>
      </div>
    </div>
  `;

  $("#main").innerHTML = html;

  // Cada fila lleva al tab del producto
  $$('[data-resumen-prod]').forEach(el => {
    const go = () => { state.tab = el.dataset.resumenProd; render(); };
    el.onclick = go;
    el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
}
