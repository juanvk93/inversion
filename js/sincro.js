import { DB_KV } from "./config.js";
import { dbGet } from "./db.js";
import { $ } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// SINCRO · la app abierta en varias ventanas a la vez
// ═══════════════════════════════════════════════════════════════════════════

// Con la PWA y una pestaña del navegador abiertas, cada una guardaba su estado
// en memoria y ganaba la última: los cambios de la otra se perdían (y un cambio
// de passphrase en una dejaba a la otra cifrando con la clave vieja).
// Cada guardado lleva una revisión ("rev" en el KV, comprobada e incrementada
// en la misma transacción: dbWriteRev). Si otra ventana guardó después de
// nuestra última lectura, esta queda "desfasada": no guarda nada más y se
// recarga (o lo pide si hay un formulario abierto).

let _rev = 0;
let _desfasada = false;
const canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mi-cartera") : null;

export const revActual = () => _rev;
export const desfasada = () => _desfasada;
export function setRev(rev) { _rev = rev ?? 0; }

// Tras un guardado propio: avisar a las demás ventanas
export function anunciarGuardado(rev) {
  _rev = rev;
  canal?.postMessage({ tipo: "guardado", rev });
}

// Sin modales ni menú abiertos y a la vista, se recarga sin preguntar (no se
// pierde nada); si no, queda el aviso con RECARGAR y se reintenta al volver a ella.
function recargarSiLibre() {
  const ocupada = document.querySelector(".modal-bg.open, #drawer.open");
  if (ocupada || document.visibilityState !== "visible") return;
  location.reload();
}

export function marcarDesfasada() {
  if (!_desfasada) {
    _desfasada = true;
    const t = $("#syncToast");
    if (t) {
      $("#syncToastBtn").onclick = () => location.reload();
      t.style.display = "flex";
    }
  }
  recargarSiLibre();
}

async function comprobar() {
  if (_desfasada) return;
  try {
    const rev = (await dbGet(DB_KV, "rev")) ?? 0;
    if (rev !== _rev) marcarDesfasada();
  } catch { /* sin IndexedDB: nada que comparar */ }
}

export function initSincro() {
  canal?.addEventListener("message", (e) => {
    if (e.data?.tipo === "guardado" && e.data.rev !== _rev) marcarDesfasada();
  });
  // Una ventana en segundo plano (Android la congela) puede perderse el mensaje:
  // al volver a ella se compara la revisión guardada
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (_desfasada) recargarSiLibre();
    else comprobar();
  });
}
