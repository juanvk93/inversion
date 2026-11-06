import { confirmar, elegir } from "../dialog.js";
import { LS_BACKUP_ENTRADA, descargarBackup } from "../io/backup.js";
import { normalizarFechaCSV } from "../io/csv.js";
import { tipoCambio } from "../calc.js";
import { getProductPriceSync } from "../precios.js";
import { bloqueado, flash, lsGet, lsSet, saveState, state } from "../state.js";
import { $, $$, RESERVED_IDS, RE_FECHA, fmt, fmtDiv, hoy, labelMes, parseNum } from "../utils.js";
import { render } from "../views/render.js";
import { openProdModal } from "./producto.js";

// ═══════════════════════════════════════════════════════════════════════════
// 8. MODALS
// ═══════════════════════════════════════════════════════════════════════════

// Última entrada del producto ANTERIOR a `fecha`: sus aportaciones sirven de
// propuesta para el mes nuevo (casi siempre se repiten). También la usa el
// cierre de mes (views/cierre.js).
export function entradaPrevia(pid, fecha) {
  const lista = state.entradas[pid] || [];
  for (let i = lista.length - 1; i >= 0; i--) if (lista[i].fecha < fecha) return lista[i];
  return null;
}

// Valor estimado = unidades × precio (cotización o precio manual), o null si
// el producto no tiene alguno de los dos. En la divisa del producto: las
// cotizaciones llegan en euros y se pasan al tipo de cambio actual; el precio
// manual ya está en su divisa.
export function valorEstimado(prod) {
  const u = +prod?.unidades;
  const p = getProductPriceSync(prod);
  if (!(Number.isFinite(u) && u > 0 && p)) return null;
  const t = p.source === "manual" ? 1 : tipoCambio(state.tiposCambio, prod.divisa, hoy());
  if (!t) return null;   // sin tipo de cambio no se puede proponer
  const precio = p.eur / t;
  return { valor: Math.round(u * precio * 100) / 100, unidades: u, precio, divisa: prod.divisa };
}

// Número para rellenar un input: coma decimal y sin separador de miles ni ",00"
// (parseNum lo vuelve a leer igual); 0 o vacío → "" para que se vea el placeholder.
export const numInput = (v) => v ? String(v).replace(".", ",") : "";

// Texto del botón "= u × precio" (compartido con el cierre de mes)
export function textoEstimado(est) {
  return `= ${est.unidades.toLocaleString("es-ES", { maximumFractionDigits: 6 })} u × ${fmtDiv(est.precio, est.divisa)}`;
}

// Botón + de la barra inferior: en un producto abre su entrada; en el Total u
// otra vista pregunta de qué producto (sin productos, propone crear uno).
export async function nuevaEntrada() {
  if (bloqueado()) return;
  if (!RESERVED_IDS.has(state.tab) && state.productos.some(p => p.id === state.tab)) return openEntryModal();
  if (!state.productos.length) return openProdModal();
  const pid = await elegir("Nueva entrada", "¿De qué producto?",
    [...state.productos.map(p => ({ valor: p.id, texto: p.nombre })), { valor: null, texto: "Cancelar" }]);
  if (!pid || !state.productos.some(p => p.id === pid)) return;
  state.tab = pid;
  render();
  openEntryModal();
}

export function openEntryModal(entry = null) {
  if (RESERVED_IDS.has(state.tab) || bloqueado()) return;
  const prod = state.productos.find(p => p.id === state.tab);
  if (!prod) return;   // tab huérfano: no crear entradas sin producto
  state.editEntradaId = entry?.id || null;
  const fecha  = entry?.fecha ?? hoy();
  // Entrada nueva: proponer las aportaciones del último mes registrado
  const previa = entry ? null : entradaPrevia(prod.id, fecha);

  limpiarErrores();
  $("#meTitle").textContent     = entry ? "Editar entrada" : "Nueva entrada";
  $("#meSub").textContent       = prod?.nombre || "";
  // Importes en la divisa del producto
  $$("#modalEntrada .me-div").forEach(el => { el.textContent = prod.divisa && prod.divisa !== "EUR" ? prod.divisa : "€"; });
  $("#meFecha").value           = fecha;
  // numInput (coma decimal) también al editar: String(12.345) = "12.345" se
  // releía como miles (12345) y guardar sin tocar nada multiplicaba el importe
  const base = entry || previa;
  $("#meManual").value          = numInput(base?.manual);
  $("#meSaveback").value        = numInput(base?.saveback);
  $("#meRoundup").value         = numInput(base?.roundup);
  $("#meValor").value           = entry ? (numInput(entry.valor) || (entry.valor === 0 ? "0" : "")) : "";
  $("#meValor").placeholder     = previa ? `Último: ${fmt(previa.valor)}` : "4450";
  $("#meDividendo").value       = numInput(entry?.dividendo);
  $("#meNota").value            = entry?.nota     ?? "";
  $("#meBackup").checked        = lsGet(LS_BACKUP_ENTRADA) !== "0";   // activado por defecto
  $("#mePrefill").textContent   = previa && (previa.manual || previa.saveback || previa.roundup)
    ? `Aportaciones copiadas de ${labelMes(previa.fecha)}: cámbialas si este mes son distintas` : "";

  const est = valorEstimado(prod);
  const btnCalc = $("#meCalcValor");
  btnCalc.hidden = !est;
  if (est) {
    btnCalc.textContent = textoEstimado(est);
    btnCalc.onclick = () => { $("#meValor").value = numInput(est.valor); limpiarErrores(); };
  }

  recalcMETotal();
  $("#meSave").style.background = "var(--accent)";
  $("#modalEntrada").classList.add("open");
}

export function recalcMETotal() {
  const n = (sel) => { const v = parseNum($(sel).value, true); return Number.isFinite(v) ? v : 0; };
  const t = n("#meManual") + n("#meSaveback") + n("#meRoundup");
  $("#meTotal").textContent = `Total: ${fmtDiv(t, state.productos.find(p => p.id === state.tab)?.divisa)}`;
}

// Errores de validación junto al campo (antes con alert(), que en Android tapa
// el formulario y obliga a buscar después qué campo era).
export function marcarError(input, msg) {
  input.classList.add("invalido");
  const field = input.closest(".field") || input.parentElement;
  let el = field.querySelector(".field-err");
  if (!el) { el = document.createElement("div"); el.className = "field-err"; el.setAttribute("role", "alert"); field.appendChild(el); }
  el.textContent = msg;
  input.focus();
  input.scrollIntoView({ block: "center" });
}

export function limpiarErrores(raiz = $("#modalEntrada")) {
  raiz.querySelectorAll(".invalido").forEach(el => el.classList.remove("invalido"));
  raiz.querySelectorAll(".field-err").forEach(el => el.remove());
}

// Lee un importe: vacío → 0; texto no numérico → null (el llamador marca el error)
export function leerImporte(raw) {
  raw = (raw || "").trim();
  if (!raw) return 0;
  const v = parseNum(raw, true);
  return Number.isFinite(v) ? v : null;
}

export async function saveEntry() {
  // Ventana desfasada (sincro.js) o datos bloqueados: avisar y dejar el modal
  // abierto (antes se añadía en memoria, saveState no guardaba y se perdía)
  if (bloqueado()) return;
  limpiarErrores();
  // Acepta también MM/AAAA o "ene-24" donde type=month se muestra como texto
  const fecha = normalizarFechaCSV($("#meFecha").value);
  if (!RE_FECHA.test(fecha)) { marcarError($("#meFecha"), "Introduce un mes válido (AAAA-MM, p. ej. 2026-10)."); return; }
  // Importes: vacío → 0; texto no numérico → error (antes se guardaba 0 en silencio)
  const leer = (sel, nombre) => {
    const v = leerImporte($(sel).value);
    if (v == null) marcarError($(sel), `${nombre}: "${$(sel).value.trim()}" no es un número válido.`);
    return v;
  };
  if (!($("#meValor").value || "").trim()) { marcarError($("#meValor"), "Introduce el valor actual de la posición."); return; }
  const manual    = leer("#meManual", "Manual");        if (manual    == null) return;
  const saveback  = leer("#meSaveback", "Saveback");    if (saveback  == null) return;
  const roundup   = leer("#meRoundup", "Round-up");     if (roundup   == null) return;
  const valor     = leer("#meValor", "Valor");          if (valor     == null) return;
  const dividendo = leer("#meDividendo", "Renta");      if (dividendo == null) return;
  if (valor < 0)     { marcarError($("#meValor"), "El valor de la posición no puede ser negativo."); return; }
  if (dividendo < 0) { marcarError($("#meDividendo"), "La renta cobrada no puede ser negativa."); return; }
  const e = {
    id:       state.editEntradaId || Date.now(),
    fecha,
    manual, saveback, roundup, valor, dividendo,
    nota:      ($("#meNota").value || "").trim(),
  };
  const pid   = state.tab;
  // Nunca guardar entradas bajo un id de vista interna o de producto inexistente
  if (RESERVED_IDS.has(pid) || !state.productos.some(p => p.id === pid)) {
    $("#modalEntrada").classList.remove("open");
    return;
  }
  const lista = state.entradas[pid] || [];
  let base    = state.editEntradaId ? lista.filter(x => x.id !== state.editEntradaId) : lista;
  // Evitar dos entradas del mismo mes (rompe el cálculo total y el heatmap, que
  // indexan por fecha). Si ya existe, ofrecemos reemplazarla.
  const dup = base.find(x => x.fecha === e.fecha);
  if (dup) {
    if (!(await confirmar(`Ya existe una entrada para ${labelMes(e.fecha)} (valor ${fmtDiv(dup.valor, state.productos.find(p => p.id === pid)?.divisa)}).`,
      { titulo: "¿Reemplazar entrada?", si: "Reemplazar" }))) return;
    base = base.filter(x => x.id !== dup.id);
  }
  state.entradas[pid] = [...base, e].sort((a,b) => a.fecha.localeCompare(b.fecha));
  saveState();
  const backup = $("#meBackup").checked;
  lsSet(LS_BACKUP_ENTRADA, backup ? "1" : "0");
  if (backup) descargarBackup();   // dentro del clic: Chrome no la trata como descarga automática
  $("#modalEntrada").classList.remove("open");
  state.editEntradaId = null;
  render();
  flash();
}

// Al corregir un campo marcado, quitar su error
export function bindEntradaErrores() {
  $$("#modalEntrada input, #modalEntrada textarea").forEach(el => el.addEventListener("input", () => {
    if (!el.classList.contains("invalido")) return;
    el.classList.remove("invalido");
    (el.closest(".field") || el.parentElement).querySelector(".field-err")?.remove();
  }));
}
