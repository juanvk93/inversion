import { calcPendientes, invalidateStatsCache } from "../calc.js";
import { destroyAllCharts } from "../charts.js";
import { cargarTiposCambio } from "../divisas.js";
import { checkLogros } from "../logros.js";
import { nuevaEntrada } from "../modals/entrada.js";
import { refreshAllPricesAsync } from "../precios.js";
import { bloqueado, saveState, state } from "../state.js";
import { $, $$, RESERVED_IDS, esc, hoy } from "../utils.js";
import { renderAsignacion } from "./asignacion.js";
import { renderBenchmark } from "./benchmark.js";
import { ACCENT_CIERRE, renderCierre } from "./cierre.js";
import { renderConfig } from "./config.js";
import { renderDiff } from "./diff.js";
import { renderFIRE } from "./fire.js";
import { renderFiscal } from "./fiscal.js";
import { renderTabActual } from "./producto.js";
import { renderProyeccion } from "./proyeccion.js";
import { renderResumen } from "./resumen.js";

// ═══════════════════════════════════════════════════════════════════════════
// 7. RENDER
// ═══════════════════════════════════════════════════════════════════════════

export function getAccentColor() {
  if (state.tab === "proyeccion") return "#A78BFA";
  if (state.tab === "fire")       return "#34D399";
  if (state.tab === "asignacion") return "#22D3EE";
  if (state.tab === "diff")       return "#FB923C";
  if (state.tab === "fiscal")     return "#F87171";
  if (state.tab === "benchmark")  return "#38BDF8";
  if (state.tab === "config")     return "#94A3B8";
  if (state.tab === "cierre")     return ACCENT_CIERRE;
  if (state.tab === "total")      return "#FBBF24";
  return state.productos.find(p => p.id === state.tab)?.color || "#FBBF24";
}

export function setAccentVars(color) {
  document.documentElement.style.setProperty("--accent",      color);
  document.documentElement.style.setProperty("--accent-soft", color + "0F");
  document.documentElement.style.setProperty("--accent-line", color + "18");
  document.documentElement.style.setProperty("--accent-glow", color + "09");
}

let _dragId = null;
let _touchDragHappened = false;

function renderTabs() {
  const tabs = [
    { id: "total", nombre: "Total", color: "#FBBF24" },
    ...state.productos,
  ];
  const html = tabs.map(t => {
    const active = state.tab === t.id ? "active" : "";
    const drag   = t.id !== "total" ? 'draggable="true"' : '';
    return `<button class="tab ${active}" ${drag} data-tab="${esc(t.id)}" ${active ? 'aria-current="page"' : ""}>${esc(t.nombre)}</button>`;
  }).join("");
  $("#tabs").innerHTML = html;
  $$("#tabs .tab[data-tab]").forEach(b => {
    b.onclick = () => {
      if (_touchDragHappened) { _touchDragHappened = false; return; }
      state.tab = b.dataset.tab;
      render();
    };
  });
  bindTabDrag();
}

function reorderProductos(srcId, dstId) {
  if (bloqueado()) return;
  const si = state.productos.findIndex(p => p.id === srcId);
  const di = state.productos.findIndex(p => p.id === dstId);
  if (si === -1 || di === -1) return;
  const arr = [...state.productos];
  arr.splice(di, 0, arr.splice(si, 1)[0]);
  state.productos = arr;
  saveState();
  render();
}

function bindTabDrag() {
  const btns = $$("#tabs .tab[draggable='true']");
  if (!btns.length) return;

  btns.forEach(btn => {
    // HTML5 drag (escritorio)
    btn.addEventListener("dragstart", e => {
      _dragId = btn.dataset.tab;
      btn.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    btn.addEventListener("dragend", () => {
      _dragId = null;
      btn.classList.remove("dragging");
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
    });
    btn.addEventListener("dragover", e => {
      if (!_dragId || btn.dataset.tab === _dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
      btn.classList.add("drag-over");
    });
    btn.addEventListener("dragleave", () => btn.classList.remove("drag-over"));
    btn.addEventListener("drop", e => {
      e.preventDefault();
      if (!_dragId || _dragId === btn.dataset.tab) return;
      reorderProductos(_dragId, btn.dataset.tab);
    });

    // Touch drag (móvil) — long-press para iniciar drag, así el scroll
    // horizontal nativo funciona en toques cortos (tap o swipe).
    let _tsrc = null;
    let _tStartX = 0, _tStartY = 0;
    let _tLongPress = null;
    let _tDragging = false;
    const _tCancel = () => {
      if (_tLongPress) { clearTimeout(_tLongPress); _tLongPress = null; }
      _tsrc = null;
      _tDragging = false;
      btn.classList.remove("dragging");
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
    };
    btn.addEventListener("touchstart", e => {
      _tsrc = btn.dataset.tab;
      _tDragging = false;
      _tStartX = e.touches[0].clientX;
      _tStartY = e.touches[0].clientY;
      _tLongPress = setTimeout(() => {
        _tDragging = true;
        btn.classList.add("dragging");
        if (navigator.vibrate) navigator.vibrate(15);
      }, 400);
    }, { passive: true });
    btn.addEventListener("touchmove", e => {
      if (!_tsrc) return;
      const pt = e.touches[0];
      if (!_tDragging) {
        const dx = Math.abs(pt.clientX - _tStartX);
        const dy = Math.abs(pt.clientY - _tStartY);
        if (dx > 8 || dy > 8) {
          if (_tLongPress) { clearTimeout(_tLongPress); _tLongPress = null; }
          _tsrc = null;
        }
        return;
      }
      e.preventDefault();
      const el  = document.elementFromPoint(pt.clientX, pt.clientY);
      const tgt = el?.closest?.(".tab[draggable='true']");
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
      if (tgt && tgt.dataset.tab !== _tsrc) tgt.classList.add("drag-over");
    }, { passive: false });
    btn.addEventListener("touchend", e => {
      if (_tLongPress) { clearTimeout(_tLongPress); _tLongPress = null; }
      btn.classList.remove("dragging");
      $$("#tabs .tab").forEach(b => b.classList.remove("drag-over"));
      if (!_tsrc || !_tDragging) { _tsrc = null; _tDragging = false; return; }
      const pt  = e.changedTouches[0];
      const el  = document.elementFromPoint(pt.clientX, pt.clientY);
      const tgt = el?.closest?.(".tab[draggable='true']");
      if (tgt && tgt.dataset.tab !== _tsrc) {
        // Suprime solo el click sintético inmediato: render() sustituye los
        // botones y ese click puede no llegar nunca, dejando el flag colgado y
        // haciendo ignorar el siguiente toque legítimo.
        _touchDragHappened = true;
        setTimeout(() => { _touchDragHappened = false; }, 400);
        reorderProductos(_tsrc, tgt.dataset.tab);
      }
      _tsrc = null;
      _tDragging = false;
    });
    btn.addEventListener("touchcancel", _tCancel);
  });
}

// Lista plana de IDs de pestaña (para atajos 1-9)
export function tabIds() {
  return ["total", ...state.productos.map(p => p.id)];
}

// Barra inferior: qué sección está activa y a qué pestaña vuelve "Cartera"
const VISTAS_ANALISIS = new Set(["resumen", "proyeccion", "fire", "asignacion", "diff", "fiscal", "benchmark"]);
function marcarNavegacion(esCartera) {
  if (esCartera) state.ultimaCartera = state.tab;
  const activa = esCartera ? "cartera"
    : state.tab === "cierre" ? "cierre"
    : VISTAS_ANALISIS.has(state.tab) ? "analisis"
    : state.tab === "config" ? "mas" : "";
  $$("#bottomNav [data-nav]").forEach(b => {
    const on = b.dataset.nav === activa;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  // Punto en "Cierre" si hay meses sin registrar (mismo criterio que el aviso del Total)
  $("#btnCierre")?.classList.toggle("pendiente", calcPendientes(state, hoy(), new Date().getDate()).length > 0);
  const add = $("#fabAddEntry");
  if (add) add.onclick = () => nuevaEntrada();
}

export function render() {
  invalidateStatsCache();
  destroyAllCharts();
  const accent = getAccentColor();
  setAccentVars(accent);
  renderTabs();

  marcarNavegacion(!RESERVED_IDS.has(state.tab) || state.tab === "total");

  let result;
  if      (state.tab === "resumen")    result = renderResumen();
  else if (state.tab === "proyeccion") result = renderProyeccion();
  else if (state.tab === "fire")       result = renderFIRE();
  else if (state.tab === "asignacion") result = renderAsignacion();
  else if (state.tab === "diff")       result = renderDiff();
  else if (state.tab === "fiscal")     result = renderFiscal();
  else if (state.tab === "benchmark")  result = renderBenchmark();
  else if (state.tab === "config")     result = renderConfig();
  else if (state.tab === "cierre")     result = renderCierre();
  else                                  result = renderTabActual();
  // Hitos automáticos: se evalúan tras cada render (barato, stats cacheadas)
  checkLogros();
  // Fetch async de precios CoinGecko + re-render si llega algo
  refreshAllPricesAsync();
  // Tipos de cambio de los productos en otra divisa (async; repinta si llegan)
  cargarTiposCambio();
  return result;
}
