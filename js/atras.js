import { closeDrawer } from "./drawer.js";
import { $, $$ } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// BOTÓN ATRÁS · cierra modales y drawer en lugar de salir de la PWA
// ═══════════════════════════════════════════════════════════════════════════

// En una PWA standalone, "atrás" sin historial propio cierra la app y se pierde
// lo que se estaba escribiendo. Mientras haya alguna capa abierta (modal o
// drawer) se mantiene UNA entrada "guarda" en el historial: atrás la consume y
// cierra la capa superior. Las capas se detectan observando la clase .open, así
// que no hace falta tocar cada función que abre o cierra un modal.

const abiertas = [];          // ids de las capas abiertas, en orden de apertura
let guardaActiva = false;     // hay una entrada nuestra en el historial
let ignorarPop   = 0;         // popstate provocados por nuestro history.back()
let retirarTimer = null;      // retirada de la guarda pendiente

function capas() {
  return [...$$(".modal-bg"), $("#drawer")].filter(Boolean);
}

function sincronizar() {
  const ahora = new Set(capas().filter(el => el.classList.contains("open")).map(el => el.id));
  for (let i = abiertas.length - 1; i >= 0; i--) if (!ahora.has(abiertas[i])) abiertas.splice(i, 1);
  ahora.forEach(id => { if (!abiertas.includes(id)) abiertas.push(id); });

  if (abiertas.length) {
    // Se ha vuelto a abrir algo antes de retirar la guarda: se reutiliza
    clearTimeout(retirarTimer); retirarTimer = null;
    // Con un history.back() nuestro en vuelo no se apila otra guarda: back() es
    // asíncrono y, cruzado con un pushState, retrocedía una entrada de más y
    // salía de la app. La pone el popstate de ese back (abajo).
    if (!guardaActiva && !ignorarPop) { history.pushState({ capa: true }, ""); guardaActiva = true; }
  } else if (guardaActiva && !retirarTimer) {
    // Cerrada desde la UI (✕, fondo, guardar…): retirar la guarda del historial,
    // con un margen por si se abre otra capa justo después (diálogos encadenados,
    // drawer → modal) y así no hacer back() + pushState seguidos.
    retirarTimer = setTimeout(() => {
      retirarTimer = null;
      if (abiertas.length || !guardaActiva) return;
      guardaActiva = false;
      ignorarPop++;
      history.back();
    }, 150);
  }
}

function cerrarCapa(id) {
  if (id === "drawer") { closeDrawer(); return; }
  const el = document.getElementById(id);
  // Los modales con promesa (data-propio) resuelven su flujo al recibir "cerrar"
  if (el.hasAttribute("data-propio")) el.dispatchEvent(new Event("cerrar"));
  else el.classList.remove("open");
}

export function initAtras() {
  const obs = new MutationObserver(sincronizar);
  capas().forEach(el => obs.observe(el, { attributes: true, attributeFilter: ["class"] }));
  sincronizar();   // un aviso puede haberse abierto ya durante loadState()

  window.addEventListener("popstate", () => {
    if (ignorarPop > 0) {
      ignorarPop--;
      // Se abrió otra capa mientras se retiraba la guarda: volver a ponerla
      if (abiertas.length && !guardaActiva && !ignorarPop) { history.pushState({ capa: true }, ""); guardaActiva = true; }
      return;
    }
    // El navegador ya ha consumido la guarda (también si su retirada estaba pendiente)
    guardaActiva = false;
    clearTimeout(retirarTimer); retirarTimer = null;
    if (!abiertas.length) return;   // sin capas: atrás normal (sale de la app)
    cerrarCapa(abiertas.at(-1));
    // Si quedan capas debajo, sincronizar() volverá a poner la guarda
  });
}
