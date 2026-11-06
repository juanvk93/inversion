import { calcStats, entradasEUR, statsTotalCalc } from "../calc.js";
import { avisoDeshacer } from "../dialog.js";
import { closeDrawer } from "../drawer.js";
import { bloqueado, flash, saveState, state } from "../state.js";
import { $, $$, RESERVED_IDS, esc, fmtE } from "../utils.js";
import { render } from "../views/render.js";

export function openObjetivosModal() {
  if (bloqueado()) return;
  const sel = $("#objProducto");
  sel.innerHTML = [
    { id: "total", nombre: "Cartera Total" },
    ...state.productos,
  ].map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("");
  const ctx = RESERVED_IDS.has(state.tab) && state.tab !== "total" ? "total" : state.tab;
  sel.value = ctx;
  $("#objNombre").value = "";
  $("#objMeta").value   = "";
  refreshObjSaveBtn();
  renderObjetivosList();
  closeDrawer();
  $("#modalObjetivos").classList.add("open");
}

function renderObjetivosList() {
  const el = $("#objList");
  if (!state.objetivos.length) {
    el.innerHTML = `<p class="obj-empty">Sin objetivos aún. Añade tu primera meta.</p>`;
    return;
  }

  // Precalcular valor actual de cada contexto una sola vez (antes era O(n_obj × n_entradas))
  const valByPid = { total: statsTotalCalc(state).at(-1)?.valor || 0 };
  state.productos.forEach(p => {
    valByPid[p.id] = calcStats(entradasEUR(state, p)).at(-1)?.valor || 0;   // las metas están en €
  });

  const groups = {};
  state.objetivos.forEach(o => {
    const k = (o.productoId == null || o.productoId === "total") ? "total" : o.productoId;
    (groups[k] = groups[k] || []).push(o);
  });
  let html = "";
  Object.entries(groups).forEach(([pid, objs]) => {
    const nom = pid === "total" ? "Cartera Total" : (state.productos.find(p => p.id === pid)?.nombre || pid);
    html += `<div class="obj-group-label">${esc(nom)}</div>`;
    objs.forEach(o => {
      const val   = valByPid[pid] ?? 0;
      const pct   = o.meta > 0 ? Math.min((val / o.meta) * 100, 100) : 0;
      const done  = pct >= 100;
      html += `
        <div class="obj-modal-item">
          <div>
            <div class="obj-modal-nombre">${esc(o.nombre)}</div>
            <div class="obj-modal-meta">${fmtE(val)} / ${fmtE(o.meta)} · ${pct.toFixed(0)}%</div>
          </div>
          <button class="obj-del-btn" data-obj-del="${esc(o.id)}">✕</button>
        </div>
        <div class="obj-bar-track" style="margin-bottom:10px">
          <div class="obj-bar-fill" style="width:${pct.toFixed(1)}%;background:${done ? "var(--green)" : "var(--accent)"}"></div>
        </div>`;
    });
  });
  el.innerHTML = html;
  $$("[data-obj-del]").forEach(b => b.onclick = () => {
    // Sin confirmación previa: se borra y se ofrece DESHACER
    const i = state.objetivos.findIndex(o => String(o.id) === b.dataset.objDel);   // ids numéricos de imports antiguos
    if (i === -1) return;
    const [quitado] = state.objetivos.splice(i, 1);
    const aplicar = () => { saveState(); renderObjetivosList(); render(); };
    aplicar();
    avisoDeshacer(`Objetivo "${quitado.nombre}" eliminado`, () => {
      state.objetivos.splice(Math.min(i, state.objetivos.length), 0, quitado);
      aplicar();
    });
  });
}

export function refreshObjSaveBtn() {
  const nom  = $("#objNombre")?.value.trim();
  const meta = parseFloat($("#objMeta")?.value);
  const btn  = $("#objSave");
  btn.disabled = !nom || !(meta > 0);
}

export function saveObjetivo() {
  const nombre     = $("#objNombre").value.trim();
  const meta       = parseFloat($("#objMeta").value);
  const productoId = $("#objProducto").value;
  if (!nombre || !(meta > 0)) return;
  state.objetivos.push({ id: `obj_${Date.now()}`, nombre, meta, productoId: productoId === "total" ? null : productoId });
  saveState();
  $("#objNombre").value = "";
  $("#objMeta").value   = "";
  refreshObjSaveBtn();
  renderObjetivosList();
  render();
  flash();
}
