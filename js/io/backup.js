import { DB_KV } from "../config.js";
import { dbPut } from "../db.js";
import { closeDrawer } from "../drawer.js";
import { descargarArchivo, generarJSON } from "./json.js";
import { hideBackupToast } from "../snapshots.js";
import { bloqueado, flash, state } from "../state.js";
import { hoyDia } from "../utils.js";

// ── Copia de seguridad externa ─────────────────────────────────────────────
// Los snapshots viven en el mismo IndexedDB: si se borran los datos del
// navegador desaparecen con todo lo demás. Estas copias salen del navegador
// (descarga o menú Compartir del sistema) y son las que sobreviven al borrado.
export const LS_BACKUP_ENTRADA = "cartera_backup_al_guardar";   // último estado del check del modal de entrada

// Con hora para que varias copias del mismo día no se pisen ni queden como "(1)"
function nombreBackup() {
  const d = new Date();
  return `mi-cartera-${hoyDia()}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
}

export function marcarBackupExterno() {
  // Una copia sin productos no protege nada: no debe silenciar el recordatorio
  if (!state.productos.length) return;
  const iso = new Date().toISOString();
  state.lastExport = iso;
  hideBackupToast();
  // Marca de tiempo en claro (como lastSnapshot): no pisa ningún blob cifrado
  dbPut(DB_KV, iso, "lastExport").catch(() => { /* no crítico */ });
}

export function diasSinBackup() {
  if (!state.lastExport) return Infinity;
  return (Date.now() - new Date(state.lastExport).getTime()) / 86400000;
}

export function descargarBackup() {
  if (bloqueado()) return;
  descargarArchivo(`${nombreBackup()}.json`, generarJSON(), "application/json;charset=utf-8");
  marcarBackupExterno();
}

// Abre el menú Compartir de Android/iOS con el JSON adjunto (Drive, correo,
// Telegram…). Si el navegador no puede compartir archivos, se descarga.
export async function compartirBackup() {
  if (bloqueado()) return;   // bloqueado el estado en memoria está vacío: no compartir una copia vacía
  closeDrawer();
  const json = generarJSON();
  const base = nombreBackup();
  // Chrome Android solo comparte una lista cerrada de tipos: si rechaza .json,
  // se envía como texto plano (IMPORTAR JSON acepta ambos).
  const file = [
    new File([json], `${base}.json`,     { type: "application/json" }),
    new File([json], `${base}.json.txt`, { type: "text/plain" }),
  ].find(f => navigator.canShare?.({ files: [f] }));
  if (!file) { descargarBackup(); flash(); return; }
  try {
    await navigator.share({ files: [file], title: "Copia de seguridad · MI CARTERA" });
    marcarBackupExterno();
    flash();
  } catch (err) {
    if (err?.name === "AbortError") return;   // el usuario cerró el menú
    console.warn("[Cartera] Compartir falló; se descarga la copia", err);
    descargarBackup();
    flash();
  }
}
