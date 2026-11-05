import { avisoDeshacer } from "../dialog.js";
import { LS_BACKUP_ENTRADA, descargarBackup } from "../io/backup.js";
import { normalizarFechaCSV } from "../io/csv.js";
import { entradaPrevia, leerImporte, limpiarErrores, marcarError, numInput, textoEstimado, valorEstimado } from "../modals/entrada.js";
import { bloqueado, flash, lsGet, lsSet, saveState, state } from "../state.js";
import { $, $$, RE_FECHA, esc, fmt, fmtDiv, hoy, iniciales, labelMes } from "../utils.js";
import { render, setAccentVars } from "./render.js";

// ═══════════════════════════════════════════════════════════════════════════
// CIERRE DE MES · registrar el mes de todos los productos en una pantalla
// ═══════════════════════════════════════════════════════════════════════════

// En vez de abrir el modal de entrada producto a producto: una tarjeta por
// producto, un único GUARDAR y una sola copia JSON. Lo tecleado vive en
// state.cierre (borrador en memoria) porque render() regenera todo el DOM, por
// ejemplo al llegar una cotización.
// Aportaciones: las del mes si ya está registrado; si no, las del último mes
// (casi siempre se repiten). El VALOR va vacío salvo que el mes ya exista: el
// producto con VALOR vacío no se registra.

const CAMPOS = ["manual", "saveback", "roundup", "valor"];
export const ACCENT_CIERRE = "#E879F9";

function nuevoBorrador(mes) {
  const filas = {};
  state.productos.forEach(p => {
    const actual = (state.entradas[p.id] || []).find(e => e.fecha === mes);
    const base   = actual || entradaPrevia(p.id, mes);
    filas[p.id] = {
      manual:   numInput(base?.manual),
      saveback: numInput(base?.saveback),
      roundup:  numInput(base?.roundup),
      valor:    actual ? numInput(actual.valor) || "0" : "",
    };
  });
  return { mes, filas };
}

// Al entrar desde la barra: borrador nuevo del mes actual (o del mes pendiente
// que se pida desde el aviso del Total)
export function abrirCierre(mes = hoy()) {
  state.cierre = nuevoBorrador(RE_FECHA.test(mes) ? mes : hoy());
  state.tab = "cierre";
  render();
}

export function renderCierre() {
  setAccentVars(ACCENT_CIERRE);
  if (!state.cierre) state.cierre = nuevoBorrador(hoy());
  const { mes, filas } = state.cierre;
  // Productos creados después de abrir el borrador
  state.productos.forEach(p => { if (!filas[p.id]) filas[p.id] = nuevoBorrador(mes).filas[p.id]; });

  const registrados = state.productos.filter(p => (state.entradas[p.id] || []).some(e => e.fecha === mes)).length;
  const tarjetas = state.productos.map(p => {
    const f      = filas[p.id];
    const actual = (state.entradas[p.id] || []).find(e => e.fecha === mes);
    const previa = entradaPrevia(p.id, mes);
    const est    = valorEstimado(p);
    const estado = actual
      ? `<span class="ci-estado ok">✓ Registrado</span>`
      : `<span class="ci-estado">Pendiente</span>`;
    const ultimo = previa ? `${labelMes(previa.fecha)}: ${fmtDiv(previa.valor, p.divisa)}` : "Sin entradas anteriores";
    const input = (campo, ph, etiqueta) => `<label class="ci-in">
        <input type="text" inputmode="decimal" data-ci="${esc(p.id)}" data-campo="${campo}"
          value="${esc(f[campo])}" placeholder="${esc(ph)}" aria-label="${esc(p.nombre)} · ${etiqueta}">
        ${campo === "valor" ? "" : `<span class="sublabel">${etiqueta}</span>`}
      </label>`;
    return `<div class="ci-card">
      <div class="ci-head">
        <span class="avatar" style="background:${p.color}26;color:${p.color}">${esc(iniciales(p.nombre))}</span>
        <span class="ci-tit"><span class="ci-nombre">${esc(p.nombre)}</span><span class="ci-ultimo">${ultimo}</span></span>
        ${estado}
      </div>
      <div class="ci-valor">
        <div class="ci-label">Valor actual${actual ? " · se actualizará" : ""}</div>
        <div class="input-con-btn">
          ${input("valor", previa ? `Último: ${fmt(previa.valor)}` : "Vacío = no registrar", "Valor actual")}
          ${est ? `<button type="button" class="btn-calc-valor" data-ci-est="${esc(p.id)}">${esc(textoEstimado(est))}</button>` : ""}
        </div>
      </div>
      <details class="ci-aport-det">
        <summary><span>Aportado <b data-ci-total="${esc(p.id)}">${textoAportado(f, p.divisa)}</b></span><span class="ci-cambiar">Cambiar</span></summary>
        <div class="ci-aport">
          ${input("manual", "0", "Manual")}
          ${input("saveback", "0", "Saveback")}
          ${input("roundup", "0", "Round-up")}
        </div>
      </details>
    </div>`;
  }).join("");
  const n = state.productos.length;

  $("#main").innerHTML = `
    <div class="title-row">
      <div>
        <h2>Cierre de mes</h2>
      </div>
    </div>
    <div class="ci-cabecera">
      <div class="field ci-mes">
        <label for="ciMes">Mes</label>
        <input type="month" id="ciMes" value="${esc(mes)}" placeholder="AAAA-MM">
      </div>
      <span class="ci-progreso-txt">${registrados} de ${n} registrados</span>
    </div>
    <div class="ci-progreso" aria-hidden="true"><div style="width:${n ? registrados / n * 100 : 0}%"></div></div>
    <p class="ci-ayuda">Aportaciones copiadas del último mes. Escribe el valor de cada producto; los que dejes vacíos no se registran.</p>
    <div class="ci-lista">
      ${n ? tarjetas : `<p class="ci-ayuda">Aún no hay productos. Créalos desde Más.</p>`}
    </div>
    <div class="ci-footer">
      <label class="chk-row" for="ciBackup">
        <input type="checkbox" id="ciBackup" ${lsGet(LS_BACKUP_ENTRADA) !== "0" ? "checked" : ""}>
        <span>Descargar copia (.json) al guardar</span>
      </label>
      <button class="save-btn" id="ciGuardar" style="background:${ACCENT_CIERRE}">Guardar cierre</button>
    </div>`;

  $$("[data-ci]").forEach(el => el.addEventListener("input", () => {
    filas[el.dataset.ci][el.dataset.campo] = el.value;
    if (el.dataset.campo !== "valor") {
      const t = $(`[data-ci-total="${CSS.escape(el.dataset.ci)}"]`);
      if (t) t.textContent = textoAportado(filas[el.dataset.ci], state.productos.find(p => p.id === el.dataset.ci)?.divisa);
    }
    if (el.classList.contains("invalido")) { el.classList.remove("invalido"); el.parentElement.querySelector(".field-err")?.remove(); }
  }));
  $$("[data-ci-est]").forEach(b => b.onclick = () => {
    const pid = b.dataset.ciEst;
    const est = valorEstimado(state.productos.find(p => p.id === pid));
    if (!est) return;
    filas[pid].valor = numInput(est.valor);
    const el = $(`[data-ci="${CSS.escape(pid)}"][data-campo="valor"]`);
    el.value = filas[pid].valor;
    el.dispatchEvent(new Event("input"));
  });
  $("#ciMes").onchange = () => {
    const nuevo = normalizarFechaCSV($("#ciMes").value);
    if (!RE_FECHA.test(nuevo)) return;
    state.cierre = nuevoBorrador(nuevo);
    render();
  };
  $("#ciGuardar").onclick = guardarCierre;
}

// "206,50 € (200 + 5 + 1,50)" con lo que hay escrito; un texto no numérico cuenta como 0
function textoAportado(f, divisa) {
  const n = (k) => leerImporte(f[k]) ?? 0;
  const m = n("manual"), sb = n("saveback"), r = n("roundup");
  return `${fmtDiv(m + sb + r, divisa)}${sb || r ? ` (${fmt(m)} + ${fmt(sb)} + ${fmt(r)})` : ""}`;
}
function guardarCierre() {
  if (bloqueado()) return;
  const raiz = $("#main");
  limpiarErrores(raiz);
  const { mes, filas } = state.cierre;
  if (!RE_FECHA.test(mes)) { marcarError($("#ciMes"), "Mes no válido (AAAA-MM)."); return; }

  // Validar todo antes de tocar nada
  const nuevas = [];
  for (const p of state.productos) {
    const f = filas[p.id];
    if (!f || !String(f.valor).trim()) continue;   // sin VALOR → no se registra
    const v = {};
    for (const campo of CAMPOS) {
      v[campo] = leerImporte(f[campo]);
      const el = $(`[data-ci="${CSS.escape(p.id)}"][data-campo="${campo}"]`);
      if (v[campo] == null) {
        const det = el.closest("details");
        if (det) det.open = true;   // aportación plegada: mostrarla antes de marcar el error
        marcarError(el, `"${String(f[campo]).trim()}" no es un número válido.`);
        return;
      }
      if (campo === "valor" && v.valor < 0) { marcarError(el, "El valor no puede ser negativo."); return; }
    }
    nuevas.push({ pid: p.id, ...v });
  }
  if (!nuevas.length) {
    const primero = $('[data-ci][data-campo="valor"]');
    if (primero) marcarError(primero, "Rellena el valor de al menos un producto.");
    return;
  }

  // Copia de las listas afectadas para poder DESHACER el cierre completo
  const antes = Object.fromEntries(nuevas.map(n => [n.pid, state.entradas[n.pid]]));
  const base  = Date.now();
  nuevas.forEach((n, i) => {
    const lista  = state.entradas[n.pid] || [];
    const actual = lista.find(e => e.fecha === mes);
    // Al actualizar un mes ya registrado se conservan su id, renta y nota
    const e = {
      id: actual?.id ?? base + i, fecha: mes,
      manual: n.manual, saveback: n.saveback, roundup: n.roundup, valor: n.valor,
      dividendo: actual?.dividendo || 0, nota: actual?.nota || "",
    };
    state.entradas[n.pid] = [...lista.filter(x => x !== actual), e].sort((a, b) => a.fecha.localeCompare(b.fecha));
  });
  saveState();
  const backup = $("#ciBackup").checked;
  lsSet(LS_BACKUP_ENTRADA, backup ? "1" : "0");
  if (backup) descargarBackup();   // una sola copia para todo el cierre
  render();
  flash();
  avisoDeshacer(`Cierre de ${labelMes(mes)} guardado · ${nuevas.length} producto${nuevas.length === 1 ? "" : "s"}`, () => {
    if (bloqueado()) return;
    Object.entries(antes).forEach(([pid, lista]) => {
      if (!state.productos.some(p => p.id === pid)) return;
      if (lista) state.entradas[pid] = lista; else delete state.entradas[pid];
    });
    state.cierre = nuevoBorrador(mes);
    saveState();
    render();
    flash();
  }, 8000);
}
