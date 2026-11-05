import { closeDrawer, openDrawer, toggleDrawer } from "./drawer.js";
import { exportarCSV } from "./io/csv.js";
import { openEntryModal } from "./modals/entrada.js";
import { crearSnapshot, hideSnapToast } from "./snapshots.js";
import { state } from "./state.js";
import { $, $$, RESERVED_IDS } from "./utils.js";
import { render, tabIds } from "./views/render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 10. SHORTCUTS · atajos de teclado
// ═══════════════════════════════════════════════════════════════════════════

// Móvil/tablet táctil (sin teclado físico): los atajos no aplican y se ocultan sus
// indicaciones vía la misma media query en style.css (.drawer-section-kbd, .kbd-hint).
export const SIN_TECLADO = window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ?? false;

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function anyModalOpen() {
  return $$('.modal-bg.open').length > 0;
}

export function handleShortcut(e) {
  // Composición IME en curso (acentos, CJK…): la tecla no es un atajo
  if (e.isComposing || e.keyCode === 229) return;
  // ESC siempre funciona, también cerrando inputs. Cierra solo el modal de más
  // arriba (el último abierto en el DOM); los modales con promesa (data-propio:
  // passphrase, elegir) gestionan su propio Esc.
  if (e.key === "Escape") {
    const abiertos = $$('.modal-bg.open').filter(m => !m.hasAttribute("data-propio"));
    if (abiertos.length) { abiertos.at(-1).classList.remove("open"); return; }
    closeDrawer();
    hideSnapToast();
    return;
  }
  // No actuar si el usuario está tecleando en un campo
  if (isTypingTarget(e.target)) return;
  // Modificadores → no es nuestro atajo
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Tecla mantenida pulsada: no repetir acciones (S creaba decenas de snapshots)
  if (e.repeat) return;

  // Si hay modal abierto, sólo ESC funciona
  if (anyModalOpen()) return;

  const k = e.key.toLowerCase();

  switch (k) {
    case "n":
      if (!RESERVED_IDS.has(state.tab)) {
        e.preventDefault(); openEntryModal();
      }
      break;
    case "e":
      e.preventDefault(); exportarCSV();
      break;
    case "i":
      e.preventDefault(); $("#fileImport").click();
      break;
    case "s":
      e.preventDefault(); crearSnapshot();
      break;
    case "m":
      e.preventDefault(); toggleDrawer();
      break;
    case "p":
      e.preventDefault();
      state.tab = "proyeccion";
      closeDrawer();
      render();
      break;
    case "f":
      e.preventDefault();
      state.tab = "fire";
      closeDrawer();
      render();
      break;
    case "a":
      e.preventDefault();
      state.tab = "asignacion";
      closeDrawer();
      render();
      break;
    case "c":
      e.preventDefault();
      state.tab = "diff";
      closeDrawer();
      render();
      break;
    case "t":
      e.preventDefault();
      state.tab = "fiscal";
      closeDrawer();
      render();
      break;
    case "b":
      e.preventDefault();
      state.tab = "benchmark";
      closeDrawer();
      render();
      break;
    case "?":
      e.preventDefault(); openDrawer();
      break;
    default:
      // Números 1-9 → pestañas
      if (/^[1-9]$/.test(k)) {
        const ids = tabIds();
        const i = parseInt(k, 10) - 1;
        if (ids[i]) {
          e.preventDefault();
          state.tab = ids[i];
          closeDrawer();
          render();
        }
      }
  }
}
