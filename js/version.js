import { hideBackupToast, hideSnapToast } from "./snapshots.js";
import { enqueueWrite } from "./state.js";
import { $ } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONES · registro del Service Worker y aviso "Nueva versión · RECARGAR"
// ═══════════════════════════════════════════════════════════════════════════

// El SW nuevo se instala en segundo plano y queda en espera (sw.js no hace
// skipWaiting). Antes se activaba solo y la versión nueva no se veía hasta el
// segundo arranque, a veces mezclando archivos de las dos. Ahora se avisa y,
// al pulsar RECARGAR, se activa y la página se recarga una sola vez.
export function initActualizaciones() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;   // file:// no soporta SW
  const sw = navigator.serviceWorker;
  // Sin controlador = primera instalación: no hay versión anterior que sustituir
  const habiaVersion = !!sw.controller;

  sw.register("./sw.js").then(reg => {
    if (reg.waiting && sw.controller) mostrarAviso(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener("statechange", () => {
        if (nuevo.state === "installed" && sw.controller) mostrarAviso(nuevo);
      });
    });
    // La PWA puede quedarse abierta días en segundo plano: buscar versión al volver
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(err => console.warn("[Cartera] SW no registrado:", err));

  let recargando = false;
  sw.addEventListener("controllerchange", () => {
    if (!habiaVersion || recargando) return;
    recargando = true;
    location.reload();
  });
}

function mostrarAviso(nuevo) {
  const btn = $("#updateToastBtn");
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true;
    // Que termine cualquier guardado pendiente antes de recargar
    try { await enqueueWrite(async () => {}); } catch { /* el error ya se muestra aparte */ }
    nuevo.postMessage({ tipo: "activar" });
  };
  $("#updateToastClose").onclick = () => { $("#updateToast").style.display = "none"; };
  hideSnapToast();
  hideBackupToast();
  $("#updateToast").style.display = "flex";
}
