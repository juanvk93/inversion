import { _locked } from "./crypto.js";
import { avisoDeshacer, confirmar } from "./dialog.js";
import { closeDrawer, toggleDrawer } from "./drawer.js";
import { compartirBackup } from "./io/backup.js";
import { exportarCSV, handleImport } from "./io/csv.js";
import { exportarJSON, handleImportJSON } from "./io/json.js";
import { abrirLogros } from "./logros.js";
import { openCalcModal, recalcMcResult } from "./modals/calc.js";
import { openChangelog } from "./modals/changelog.js";
import { bindEntradaErrores, openEntryModal, recalcMETotal, saveEntry } from "./modals/entrada.js";
import { openObjetivosModal, refreshObjSaveBtn, saveObjetivo } from "./modals/objetivos.js";
import { openProdModal, refreshProdSaveBtn, renderTickerResults, saveProd, searchTickers, toggleProdPriceField, verifyCoinGeckoId, verifyEtfTicker } from "./modals/producto.js";
import { exportarPDF } from "./pdf.js";
import { SIN_TECLADO, handleShortcut } from "./shortcuts.js";
import { crearSnapshot, hideBackupToast, hideSnapToast } from "./snapshots.js";
import { bloqueado, flash, saveState, state } from "./state.js";
import { $, $$, labelMes } from "./utils.js";
import { abrirCierre } from "./views/cierre.js";
import { render } from "./views/render.js";
import { abrirWrapped } from "./views/wrapped.js";

// ═══════════════════════════════════════════════════════════════════════════
// 11. BINDINGS
// ═══════════════════════════════════════════════════════════════════════════

export function bindCommon() {
  $$('[data-period]').forEach(b => b.onclick = () => { state.filtroPeriodo = b.dataset.period; render(); });
  $$('[data-edit]').forEach(b => b.onclick = () => {
    const id = b.dataset.edit;
    const f  = state.entradas[state.tab]?.find(x => String(x.id) === String(id));
    if (f) openEntryModal(f);
  });
  $$('[data-del]').forEach(b => b.onclick = () => {
    const id = b.dataset.del;
    if (bloqueado()) return;
    // Sin confirmación previa: se borra y se ofrece DESHACER durante unos segundos
    const pid   = state.tab;
    const lista = state.entradas[pid] || [];
    const borrada = lista.find(x => String(x.id) === String(id));
    if (!borrada) return;
    state.entradas[pid] = lista.filter(x => x !== borrada);
    saveState();
    render();
    flash();
    avisoDeshacer(`Entrada de ${labelMes(borrada.fecha)} borrada`, () => {
      if (_locked || !state.productos.some(p => p.id === pid)) return;
      const actual = state.entradas[pid] || [];
      if (actual.some(x => x.fecha === borrada.fecha)) return;   // ya se ha vuelto a registrar ese mes
      state.entradas[pid] = [...actual, borrada].sort((a, b) => a.fecha.localeCompare(b.fecha));
      saveState();
      render();
      flash();
    });
  });
  // Filas de "Posiciones" (Total) → pestaña del producto
  $$('[data-ir]').forEach(b => b.onclick = () => { state.tab = b.dataset.ir; render(); window.scrollTo(0, 0); });
  const btnNueva = $("#btnNuevaEntradaProd");
  if (btnNueva) btnNueva.onclick = () => openEntryModal();
  const btnCalc = $("#btnCalcProd");
  if (btnCalc) btnCalc.onclick = () => openCalcModal(state.tab);
  const btnEdit = $("#btnEditProd");
  if (btnEdit) btnEdit.onclick = () => {
    const prod = state.productos.find(p => p.id === state.tab);
    if (prod) openProdModal(prod);
  };
  const btnDel = $("#btnDelProd");
  if (btnDel) btnDel.onclick = async () => {
    if (bloqueado()) return;
    const pid     = state.tab;
    const nEnts   = (state.entradas[pid] || []).length;
    const prod    = state.productos.find(p => p.id === pid);
    const nObjRel = state.objetivos.filter(o => o.productoId === pid).length;
    const msg = `Se borrarán "${prod?.nombre || pid}" y sus ${nEnts} entrada(s)` +
                (nObjRel ? ` y ${nObjRel} objetivo(s) asociado(s)` : "") +
                ".\n\nAntes se guarda un punto de restauración automático.";
    if (!(await confirmar(msg, { titulo: "¿ELIMINAR PRODUCTO?", si: "ELIMINAR", peligro: true }))) return;
    if (!(await crearSnapshot(`antes de eliminar "${prod?.nombre || pid}"`))) return;
    state.productos = state.productos.filter(p => p.id !== pid);
    delete state.entradas[pid];
    // Limpiar referencias huérfanas
    if (state.proyProductos) delete state.proyProductos[pid];
    state.objetivos = state.objetivos.filter(o => o.productoId !== pid);
    state.tab = state.productos[0]?.id || "total";
    saveState();
    render();
    flash();
  };
}

export function bindGlobals() {
  // Drawer
  $("#btnDrawer").onclick        = toggleDrawer;
  $("#btnDrawerClose").onclick   = closeDrawer;
  $("#drawerOverlay").onclick    = closeDrawer;

  // Barra inferior (el + lo asigna render(); Cierre y Más usan #btnCierre y #btnDrawer)
  $("#navCartera").onclick  = () => {
    const t = state.ultimaCartera;
    state.tab = t === "total" || state.productos.some(p => p.id === t) ? t : "total";
    closeDrawer();
    render();
  };
  $("#navAnalisis").onclick = () => { closeDrawer(); $("#modalAnalisis").classList.add("open"); };
  // Elegir una vista en la hoja Análisis la cierra (cada botón conserva su onclick)
  $$("#modalAnalisis .drawer-item").forEach(b =>
    b.addEventListener("click", () => $("#modalAnalisis").classList.remove("open")));

  // Drawer items
  $("#btnExport").onclick        = exportarCSV;
  $("#btnImport").onclick        = () => $("#fileImport").click();
  $("#fileImport").onchange      = (e) => {
    const f = e.target.files?.[0];
    if (f) handleImport(f);
    e.target.value = "";
  };
  $("#btnExportJSON").onclick    = exportarJSON;
  $("#btnShareJSON").onclick     = compartirBackup;
  $("#btnImportJSON").onclick    = () => $("#fileImportJSON").click();
  $("#fileImportJSON").onchange  = (e) => {
    const f = e.target.files?.[0];
    if (f) handleImportJSON(f);
    e.target.value = "";
  };
  $("#btnCierre").onclick        = () => { closeDrawer(); abrirCierre(); };
  // Aviso "Pendiente" del Total (se crea en cada render): abre el cierre de ese mes
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-cierre-mes]");
    if (b) abrirCierre(b.dataset.cierreMes);
  });
  $("#btnResumen").onclick       = () => { state.tab = "resumen"; closeDrawer(); render(); };
  $("#btnProyeccion").onclick    = () => { state.tab = "proyeccion"; closeDrawer(); render(); };
  $("#btnObjetivos").onclick     = openObjetivosModal;
  $("#btnFire").onclick          = () => { state.tab = "fire"; closeDrawer(); render(); };
  $("#btnAsignacion").onclick    = () => { state.tab = "asignacion"; closeDrawer(); render(); };
  $("#btnDiff").onclick          = () => { state.tab = "diff"; closeDrawer(); render(); };
  $("#btnFiscal").onclick        = () => { state.tab = "fiscal"; closeDrawer(); render(); };
  $("#btnBenchmark").onclick     = () => { state.tab = "benchmark"; closeDrawer(); render(); };
  $("#btnLogros").onclick        = abrirLogros;
  $("#btnChangelog").onclick     = openChangelog;
  // Envolver: pasar la función directamente le daba el MouseEvent como `prod`
  // y abría el modal en modo "EDITAR PRODUCTO" con la divisa vacía.
  $("#btnNewProdDrawer").onclick = () => openProdModal();

  // Toast
  $("#snapToastClose").onclick   = hideSnapToast;
  $("#backupToastClose").onclick = hideBackupToast;

  // Modales
  $("#meSave").onclick   = saveEntry;
  $("#mpSave").onclick   = saveProd;
  $("#mpNombre").oninput = refreshProdSaveBtn;
  $("#objSave").onclick  = saveObjetivo;
  $("#objNombre").oninput = refreshObjSaveBtn;
  $("#objMeta").oninput   = refreshObjSaveBtn;
  ["meManual","meSaveback","meRoundup"].forEach(id => $("#" + id).oninput = recalcMETotal);
  bindEntradaErrores();

  // Calculadora standalone (modal independiente accesible desde el title-row)
  ["mcUnidades","mcPrecio"].forEach(id => {
    const el = $("#" + id);
    if (el) el.oninput = recalcMcResult;
  });

  // Tipología cambia → alternar campo CoinGecko / ETF Ticker
  if ($("#mpTipologia")) {
    $("#mpTipologia").addEventListener("input", toggleProdPriceField);
    $("#mpTipologia").addEventListener("change", toggleProdPriceField);
  }

  // Validación CoinGecko ID al perder foco / pulsar Enter
  if ($("#mpCoingeckoId")) {
    let coinTimer = null;
    $("#mpCoingeckoId").oninput = () => {
      clearTimeout(coinTimer);
      const v = $("#mpCoingeckoId").value.trim().toLowerCase();
      $("#mpCoinGeckoStatus").textContent = v ? "…" : "";
      $("#mpCoinGeckoStatus").className = "field-hint";
      coinTimer = setTimeout(() => verifyCoinGeckoId(v), 600);
    };
  }
  // Validación ETF ticker (provider activo · Yahoo o Twelve Data) + búsqueda
  if ($("#mpEtfTicker")) {
    let etfTimer = null;
    let searchSeq = 0;   // descarta respuestas de búsqueda llegadas fuera de orden
    $("#mpEtfTicker").oninput = () => {
      clearTimeout(etfTimer);
      const raw = $("#mpEtfTicker").value.trim();
      const v   = raw.toUpperCase();
      $("#mpEtfStatus").textContent = v ? "…" : "";
      $("#mpEtfStatus").className = "field-hint";
      if (!raw) renderTickerResults([]);
      etfTimer = setTimeout(async () => {
        verifyEtfTicker(v);
        const seq = ++searchSeq;
        const res = await searchTickers(raw);
        if (seq === searchSeq && $("#modalProd").classList.contains("open")) renderTickerResults(res);
      }, 600);
    };
  }

  $$('[data-close]').forEach(b => b.onclick = () => $("#" + b.dataset.close).classList.remove("open"));
  // Cerrar al pulsar el fondo solo si el gesto EMPEZÓ en el fondo: seleccionar
  // texto en un input y soltar fuera cerraba el modal y perdía lo escrito.
  $$('.modal-bg').forEach(bg => {
    if (bg.hasAttribute("data-propio")) return;   // se resuelve con sus propios botones
    let downEnFondo = false;
    bg.addEventListener("pointerdown", (e) => { downEnFondo = e.target === bg; });
    bg.onclick = (e) => {
      if (e.target === bg && downEnFondo) bg.classList.remove("open");
      downEnFondo = false;
    };
  });

  // PDF export (lazy-load de libs)
  $("#btnPDF").onclick = exportarPDF;

  // Informe anual "wrapped"
  $("#btnWrapped").onclick = abrirWrapped;

  // Configuración (página · tema, proveedor, seguridad, snapshots)
  $("#btnConfig").onclick = () => { state.tab = "config"; closeDrawer(); render(); };

  // Atajos (solo con teclado físico)
  if (!SIN_TECLADO) document.addEventListener("keydown", handleShortcut);
}
