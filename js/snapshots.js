import { invalidateStatsCache } from "./calc.js";
import { DB_KV, DB_SNAP, SNAP_MAX, SNAP_REMINDER_DAYS } from "./config.js";
import { _cryptoKey, _locked, decryptValue, encryptValue } from "./crypto.js";
import { ConflictoError, dbAll, dbDelete, dbGet, dbKeys, dbPut, dbWriteRev } from "./db.js";
import { avisar, confirmar } from "./dialog.js";
import { closeDrawer } from "./drawer.js";
import { compartirBackup, diasSinBackup } from "./io/backup.js";
import { bloqueado, encodePairs, enqueueWrite, flash, saveState, state, stateFieldPairs } from "./state.js";
import { anunciarGuardado, marcarDesfasada, revActual } from "./sincro.js";
import { $, $$, esc } from "./utils.js";
import { render } from "./views/render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 5b. SNAPSHOTS · puntos de restauración in-app (IndexedDB)
// ═══════════════════════════════════════════════════════════════════════════

const clone = (obj) => (typeof structuredClone === "function") ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

// Sin `motivo`: snapshot manual (botón / tecla S). Con `motivo` ("antes de
// importar"…): automático antes de una operación destructiva; no cuenta como
// copia del usuario (no reinicia el recordatorio) y devuelve si se pudo crear
// para que el llamador no siga sin red de seguridad.
export async function crearSnapshot(motivo = null) {
  if (typeof motivo !== "string") motivo = null;   // como handler recibe el evento
  if (bloqueado()) return false;   // datos bloqueados o ventana desfasada
  if (motivo && !state.productos.length) return true;   // nada que proteger
  // Esperar a que se hayan persistido todas las escrituras pendientes antes de
  // clonar el estado, evitando capturar una versión obsoleta.
  const fecha = new Date();
  const iso   = fecha.toISOString();
  try {
    // Dentro de la cola de escritura: espera a los guardados pendientes y no
    // puede intercalarse con un cambio de clave de cifrado.
    await enqueueWrite(async () => {
      // Si el cifrado está activo, el snapshot guarda el payload cifrado (igual que
      // el resto del estado en el KV) en lugar de productos/entradas en claro.
      const payload = { productos: clone(state.productos), entradas: clone(state.entradas), objetivos: clone(state.objetivos || []) };
      const snap = _cryptoKey
        ? { id: fecha.getTime(), fecha: iso, enc: await encryptValue(payload, _cryptoKey) }
        : { id: fecha.getTime(), fecha: iso, ...payload };
      if (motivo) snap.motivo = motivo;   // etiqueta genérica, en claro
      await dbPut(DB_SNAP, snap);
      if (!motivo) await dbPut(DB_KV, iso, "lastSnapshot");
      // Limitar a SNAP_MAX: descartar los más antiguos. Dentro de la cola para no
      // cruzarse con un cambio de clave; basta con los ids, sin descifrar.
      const ids = (await dbKeys(DB_SNAP)).sort((a, b) => b - a);
      for (let i = SNAP_MAX; i < ids.length; i++) await dbDelete(DB_SNAP, ids[i]);
    });
    if (!motivo) {
      state.lastSnapshot = iso;
      updateSnapSub();
      hideSnapToast();
      flash();
    }
    await renderSnapshots();
    return true;
  } catch (err) {
    console.warn("[Cartera] Error creando snapshot", err);
    avisar("No se pudo crear el punto de restauración: " + err.message +
      (motivo ? "\n\nLa operación se ha cancelado para no perder datos." : ""));
    return false;
  }
}

export async function listarSnapshots() {
  try {
    const all = await dbAll(DB_SNAP);
    all.sort((a, b) => b.id - a.id);   // más recientes primero
    return await Promise.all(all.map(decodeSnapshot));   // descifra los cifrados
  } catch {
    return [];
  }
}

// Devuelve el snapshot con productos/entradas en claro (descifra si procede).
// Si no se puede descifrar (sin clave o cifrado con otra clave) lo marca como
// `undecryptable` para que la UI no permita restaurarlo (vaciaría la cartera).
async function decodeSnapshot(snap) {
  if (!snap || !snap.enc) return snap;
  if (!_cryptoKey) return { ...snap, productos: [], entradas: {}, undecryptable: true };
  try {
    const payload = await decryptValue(snap.enc, _cryptoKey);
    return { ...snap, productos: payload.productos || [], entradas: payload.entradas || {}, objetivos: payload.objetivos };
  } catch {
    return { ...snap, productos: [], entradas: {}, undecryptable: true };
  }
}

// Prepara los snapshots re-cifrados (o descifrados) para un cambio de clave.
// oldKey: clave con la que están cifrados (null si están en claro).
// newKey: clave de destino (null para dejarlos en claro).
// Los que no se pueden descifrar con oldKey se dejan intactos.
async function buildRekeyedSnapshots(oldKey, newKey) {
  const out = [];
  for (const s of await dbAll(DB_SNAP)) {
    let payload;
    if (s.enc) {
      if (!oldKey) continue;
      try { payload = await decryptValue(s.enc, oldKey); } catch { continue; }
    } else {
      payload = s;
    }
    const base = { productos: payload.productos || [], entradas: payload.entradas || {} };
    if (payload.objetivos) base.objetivos = payload.objetivos;
    const meta = { id: s.id, fecha: s.fecha, ...(s.motivo ? { motivo: s.motivo } : {}) };
    out.push(newKey
      ? { ...meta, enc: await encryptValue(base, newKey) }
      : { ...meta, ...base });
  }
  return out;
}

// Cambia la clave de TODO lo persistido (estado + snapshots + encMeta) en una
// única transacción. Si algo falla no se escribe nada y la clave en memoria
// no cambia (la asigna el llamador solo tras el éxito).
export const ENC_CHECK = "mi-cartera-ok";
export async function rekeyAll(oldKey, newKey, newSalt) {
  const snaps = await buildRekeyedSnapshots(oldKey, newKey);
  const kv    = await encodePairs(stateFieldPairs(), newKey);
  kv.push(["encMeta", newKey
    ? { enabled: true, salt: Array.from(newSalt), check: await encryptValue(ENC_CHECK, newKey) }
    : undefined]);
  // Con control de revisión: otra ventana abierta seguiría cifrando con la clave vieja
  try {
    anunciarGuardado(await dbWriteRev(kv, revActual(), snaps));
  } catch (err) {
    if (err instanceof ConflictoError) marcarDesfasada();
    throw err;
  }
}

async function restaurarSnapshot(id) {
  if (bloqueado()) return;
  const raw = await dbGet(DB_SNAP, id);
  if (!raw) return;
  const snap = await decodeSnapshot(raw);
  if (snap.undecryptable) {
    avisar("Este punto de restauración está cifrado con otra passphrase y no se puede descifrar.");
    return;
  }
  if (!Array.isArray(snap.productos) || !snap.productos.length) {
    avisar("Este punto de restauración no contiene productos; no se restaura para no vaciar la cartera.");
    return;
  }
  const cuando = formatSnapDate(snap.fecha);
  if (!(await confirmar(`Los datos actuales se reemplazarán por completo por los del ${cuando} (antes se guarda un punto con el estado actual).`, { titulo: "¿Restaurar este punto?", si: "Restaurar" }))) return;
  if (!(await crearSnapshot("antes de restaurar"))) return;
  state.productos = clone(snap.productos);
  state.entradas  = clone(snap.entradas);
  // Snapshots nuevos incluyen objetivos; en los antiguos se descartan los que
  // apuntan a productos que ya no existen.
  const ids = new Set(state.productos.map(p => p.id));
  state.objetivos = (Array.isArray(snap.objetivos) ? clone(snap.objetivos) : (state.objetivos || []))
    .filter(o => o.productoId == null || ids.has(o.productoId));
  state.tab       = state.productos[0]?.id || "total";
  invalidateStatsCache();
  saveState();
  render();
  await renderSnapshots();
  flash();
  closeDrawer();
}

async function eliminarSnapshot(id) {
  if (bloqueado()) return;
  if (!(await confirmar("El punto de restauración se borrará definitivamente.", { titulo: "¿Eliminar este punto?", si: "Eliminar", peligro: true }))) return;
  await enqueueWrite(() => dbDelete(DB_SNAP, id));
  await renderSnapshots();
}

function ultimoSnapshot() {
  return state.lastSnapshot ? new Date(state.lastSnapshot) : null;
}

function diasSinSnapshot() {
  const last = ultimoSnapshot();
  if (!last) return Infinity;
  return (Date.now() - last.getTime()) / 86400000;
}

export function updateSnapSub() {
  const el = $("#snapSub");
  if (!el) return;
  const last = ultimoSnapshot();
  if (!last) { el.textContent = "Sin guardado reciente"; return; }
  const d = diasSinSnapshot();
  if (d < 1) el.textContent = `Hoy · ${last.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  else if (d < 2) el.textContent = "Hace 1 día";
  else el.textContent = `Hace ${Math.floor(d)} días`;
}

export function formatSnapDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function renderSnapshots() {
  const el = $("#snapList");
  if (!el) return;
  const all = await listarSnapshots();
  if (!all.length) {
    el.innerHTML = `<div class="snap-empty">Sin puntos guardados aún</div>`;
    return;
  }
  el.innerHTML = all.map(s => {
    const nEnt = Object.values(s.entradas || {}).reduce((n, l) => n + (l?.length || 0), 0);
    const meta = s.undecryptable
      ? (_locked ? "🔒 cifrado · desbloquea para verlo" : "🔒 cifrado con otra passphrase")
      : `${(s.productos || []).length} producto(s) · ${nEnt} entrada(s)`;
    const motivo = s.motivo ? `<div class="snap-meta">Automático · ${esc(s.motivo)}</div>` : "";
    return `<div class="snap-item">
      <div class="snap-info">
        <div class="snap-date">${formatSnapDate(s.fecha)}</div>
        <div class="snap-meta">${meta}</div>
        ${motivo}
      </div>
      <div class="snap-actions">
        ${s.undecryptable ? "" : `<button class="snap-btn" data-restore="${esc(s.id)}" title="Restaurar">↻</button>`}
        ${_locked ? "" : `<button class="snap-btn danger" data-snapdel="${esc(s.id)}" title="Eliminar">✕</button>`}
      </div>
    </div>`;
  }).join("");
  $$('[data-restore]').forEach(b => b.onclick = () => restaurarSnapshot(+b.dataset.restore));
  $$('[data-snapdel]').forEach(b => b.onclick = () => eliminarSnapshot(+b.dataset.snapdel));
}

function showSnapToast() { $("#snapToast").style.display = "flex"; }
export function hideSnapToast() { $("#snapToast").style.display = "none"; }
export function checkSnapReminder() {
  // Solo tiene sentido recordar el backup si hay algo que respaldar
  const hayDatos = state.productos.some(p => (state.entradas[p.id] || []).length);
  if (!hayDatos) return;
  // La copia externa tiene prioridad: es la única que sobrevive a borrar el navegador
  if (diasSinBackup() >= SNAP_REMINDER_DAYS) showBackupToast("copia");
  else if (diasSinSnapshot() >= SNAP_REMINDER_DAYS) showSnapToast();
}

// Toast de copia externa: "copia" recuerda compartir el backup; "restaurar"
// aparece al arrancar con la base vacía para importar el último JSON.
export function showBackupToast(modo) {
  const restaurar = modo === "restaurar";
  const d = diasSinBackup();
  $("#backupToastTitle").textContent = restaurar ? "¿Tienes una copia de seguridad?" : "Haz una copia fuera del navegador";
  $("#backupToastSub").textContent = restaurar
    ? "No hay datos guardados en este navegador. Restaura tu último .json"
    : (d === Infinity ? "Aún no has guardado ninguna copia externa" : `Última copia externa hace ${Math.floor(d)} días`);
  $("#backupToastBtn").textContent = restaurar ? "Restaurar" : "Compartir";
  $("#backupToastBtn").onclick = () => {
    hideBackupToast();
    if (restaurar) $("#fileImportJSON").click();
    else compartirBackup();
  };
  hideSnapToast();
  $("#backupToast").style.display = "flex";
}
export function hideBackupToast() { $("#backupToast").style.display = "none"; }
