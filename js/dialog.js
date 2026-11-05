import { $, esc, frase } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// DIÁLOGOS PROPIOS · sustituyen a alert() / confirm()
// ═══════════════════════════════════════════════════════════════════════════

// confirm() solo ofrece Aceptar/Cancelar y no deja nombrar las acciones: en la
// importación "Cancelar" significaba FUSIONAR. elegir() muestra un botón por
// opción y resuelve con su `valor`, o con null si se cierra (Esc / atrás).
// opciones: [{ valor, texto, tipo: "primary" | "danger" | "ghost" }]
// Los diálogos se encolan: si se pide uno con otro abierto, espera su turno
// (antes el segundo pisaba al primero y su promesa no se resolvía nunca).
let _cola = Promise.resolve();
export function elegir(titulo, mensaje, opciones) {
  const turno = _cola.then(() => mostrar(titulo, mensaje, opciones));
  _cola = turno.catch(() => {});
  return turno;
}

function mostrar(titulo, mensaje, opciones) {
  return new Promise(resolve => {
    const bg = $("#modalElegir"), acciones = $("#elActions");
    $("#elTitle").textContent = frase(titulo);
    $("#elMsg").textContent   = mensaje;
    const clase = { primary: "save-btn", danger: "save-btn el-danger" };
    acciones.innerHTML = opciones.map((o, i) =>
      `<button type="button" class="${clase[o.tipo] || "btn-ghost"}" data-i="${i}">${esc(frase(o.texto))}</button>`
    ).join("");
    const done = (valor) => {
      bg.classList.remove("open");
      document.removeEventListener("keydown", onKey, true);
      bg.removeEventListener("cerrar", onCerrar);
      resolve(valor);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
    };
    // El botón atrás de Android cierra la capa superior emitiendo "cerrar"
    const onCerrar = () => done(null);
    acciones.querySelectorAll("button").forEach(b => b.onclick = () => done(opciones[+b.dataset.i].valor));
    document.addEventListener("keydown", onKey, true);
    bg.addEventListener("cerrar", onCerrar);
    bg.classList.add("open");
    setTimeout(() => acciones.querySelector("button")?.focus(), 30);
  });
}

// Equivalente a alert(): no bloquea, así que el llamador sigue (o hace return)
// sin esperar; devuelve la promesa por si quiere esperar a que se cierre.
export function avisar(mensaje, titulo = "Aviso") {
  return elegir(titulo, mensaje, [{ valor: true, texto: "Entendido", tipo: "primary" }]);
}

// Equivalente a confirm(): resuelve true solo si se pulsa la acción. `si` nombra
// la acción ("ELIMINAR") en vez de un "Aceptar" genérico; peligro → botón rojo.
export async function confirmar(mensaje, { titulo = "Confirmar", si = "Aceptar", no = "Cancelar", peligro = false } = {}) {
  const r = await elegir(titulo, mensaje, [
    { valor: true,  texto: si, tipo: peligro ? "danger" : "primary" },
    { valor: false, texto: no },
  ]);
  return r === true;
}

// Aviso breve con acción "DESHACER" (p. ej. tras borrar una entrada): sustituye
// a la confirmación previa. Un aviso nuevo descarta el anterior sin deshacerlo.
let _deshacerTimer = null;
export function avisoDeshacer(texto, deshacer, ms = 6000) {
  const el = $("#undoToast");
  if (!el) return;
  clearTimeout(_deshacerTimer);
  $("#undoToastText").textContent = texto;
  const cerrar = () => { clearTimeout(_deshacerTimer); el.classList.remove("show"); };
  $("#undoToastBtn").onclick = () => { cerrar(); deshacer(); };
  el.classList.add("show");
  _deshacerTimer = setTimeout(cerrar, ms);
}
