/* ═══════════════════════════════════════════════════════════════════════════
   MI CARTERA · main.js — punto de entrada (módulos ES nativos, sin build)
   Aplicación de seguimiento de cartera personal de inversiones.
   Se carga con <script type="module"> → requiere servir por HTTP (no file://).
   Estructura de js/:
     config.js      — constantes, paleta, datos iniciales, proveedores
     utils.js       — formato, fechas, DOM ($, $$), esc(), sanitizeId()
     crypto.js      — AES-GCM + PBKDF2; _cryptoKey/_locked (con setters)
     db.js          — IndexedDB y almacenamiento persistente
     state.js       — estado global, loadState/saveState y cola de escritura
     calc.js        — stats, TIR/XIRR, proyección, riesgo, Monte Carlo, rachas
     logros.js      — logros y su modal
     io/            — csv.js, json.js (export/import), backup.js (copias externas)
     snapshots.js   — puntos de restauración y recordatorios
     precios.js     — CoinGecko, Twelve Data, Yahoo
     charts.js      — gráficos Chart.js
     views/         — render.js (render() y pestañas) y una vista por archivo (cierre = cierre de mes)
     modals/        — entrada, producto, objetivos, changelog, calculadora
     seguridad.js   — activar/desactivar cifrado, cambiar passphrase, desbloqueo
     dialog.js      — diálogos propios (elegir/avisar/confirmar) y aviso DESHACER
     atras.js       — botón atrás de Android (cierra modales/drawer)
     sincro.js      — varias ventanas abiertas: revisión de guardado y aviso
     version.js     — registro del SW y aviso "Nueva versión · RECARGAR"
     drawer.js · shortcuts.js · bindings.js · tema.js · pdf.js
   ═══════════════════════════════════════════════════════════════════════════ */

import { initAtras } from "./atras.js";
import { bindGlobals } from "./bindings.js";
import { _locked, setLocked } from "./crypto.js";
import { requestPersistentStorage } from "./db.js";
import { checkSnapReminder, showBackupToast } from "./snapshots.js";
import { LOCKED_MSG, _arranqueVacio, loadState, lsGet, showSaveError, state } from "./state.js";
import { applyTheme } from "./tema.js";
import { $, esc } from "./utils.js";
import { nuevaEntrada } from "./modals/entrada.js";
import { initSincro } from "./sincro.js";
import { initActualizaciones } from "./version.js";
import { abrirCierre } from "./views/cierre.js";
import { render } from "./views/render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 12. INIT
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  // Aplicar tema antes de cualquier render para evitar parpadeo
  applyTheme(lsGet("tema") || "dark");

  try {
    await loadState();
  } catch (err) {
    // loadState ya captura sus errores; esto cubre fallos inesperados
    console.error("[Cartera] Error inesperado al cargar", err);
    setLocked(true);
  }
  // Los listeners globales primero: si un render falla, el drawer, los modales
  // y los atajos deben seguir funcionando.
  try { bindGlobals(); } catch (err) { console.error("[Cartera] Error enlazando eventos", err); }
  try { initAtras(); } catch (err) { console.error("[Cartera] Error con el botón atrás", err); }
  try { initSincro(); } catch (err) { console.error("[Cartera] Error con la sincronización entre ventanas", err); }
  try {
    render();
  } catch (err) {
    console.error("[Cartera] Error renderizando", err);
    const main = $("#main");
    if (main) main.innerHTML = `<div class="panel"><div class="panel-title">ERROR</div>
      <p class="seg-info">No se pudo mostrar esta vista: ${esc(err?.message || err)}. Prueba otra pestaña desde el menú o restaura un punto de guardado.</p></div>`;
  }
  if (_locked) showSaveError(LOCKED_MSG);

  // Accesos directos del icono de la app (manifest.json → "shortcuts"):
  // ./?accion=entrada | ./?accion=cierre. Se quita el parámetro para que una
  // recarga no repita la acción.
  const accion = new URLSearchParams(location.search).get("accion");
  if (accion) {
    history.replaceState(history.state, "", location.pathname);
    try {
      if (!_locked && accion === "entrada") {
        // La app arranca en el primer producto: con varios, preguntar de cuál
        if (state.productos.length > 1) { state.tab = "total"; render(); }
        nuevaEntrada();
      }
      else if (!_locked && accion === "cierre") abrirCierre();
    } catch (err) { console.error("[Cartera] Error con el acceso directo", err); }
  }
  try {
    if (_arranqueVacio && !_locked) showBackupToast("restaurar");
    else checkSnapReminder();
  } catch { /* no crítico */ }   // el toast de recordatorio sigue activo

  // Solicitar almacenamiento persistente: evita que el navegador borre
  // IndexedDB por falta de espacio o inactividad (fire-and-forget).
  requestPersistentStorage().catch(() => {});

  // Service Worker y aviso de nueva versión
  initActualizaciones();
})();
