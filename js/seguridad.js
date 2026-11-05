import { DB_KV, DB_SNAP } from "./config.js";
import { _cryptoKey, cryptoDisponible, decryptValue, deriveKey, encryptValue, genSalt, setCryptoKey } from "./crypto.js";
import { dbAll, dbGet, dbPut } from "./db.js";
import { avisar, confirmar } from "./dialog.js";
import { ENC_CHECK, rekeyAll } from "./snapshots.js";
import { bloqueado, enqueueWrite, flash, stateFieldPairs } from "./state.js";
import { $, frase } from "./utils.js";
import { renderSegBody } from "./views/config.js";

// ── Modal de SEGURIDAD (cifrado local) ───────────────────────────────────

// Pide una passphrase en un modal propio con <input type=password> (prompt()
// la mostraba en claro). Resuelve con el texto o null si se cancela.
function askPassphrase(msg, titulo = "Passphrase") {
  return new Promise(resolve => {
    const bg = $("#modalPass"), input = $("#ppInput"), form = $("#ppForm");
    $("#ppTitle").textContent = frase(titulo);
    $("#ppMsg").textContent   = msg;
    input.value = "";
    bg.classList.add("open");
    setTimeout(() => input.focus(), 30);
    // Botón atrás de Android (js/atras.js) = cancelar
    const onCerrar = () => done(null);
    const done = (val) => {
      bg.classList.remove("open");
      form.onsubmit = null; $("#ppCancel").onclick = null; input.onkeydown = null;
      bg.removeEventListener("cerrar", onCerrar);
      resolve(val);
    };
    bg.addEventListener("cerrar", onCerrar);
    form.onsubmit = (e) => { e.preventDefault(); done(input.value); };
    $("#ppCancel").onclick = () => done(null);
    input.onkeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
    };
  });
}

// Deriva la clave y comprueba que la passphrase es correcta. Usa el testigo
// cifrado `encMeta.check`; en BDs antiguas sin testigo, cualquier campo cifrado.
// Lanza si la passphrase es incorrecta.
// info.verificada indica si la passphrase se ha comprobado de verdad contra algún dato.
async function verifyPassphrase(encMeta, pass, info = {}) {
  const key = await deriveKey(pass, new Uint8Array(encMeta.salt));
  info.verificada = false;
  if (encMeta.check) {
    if (await decryptValue(encMeta.check, key) !== ENC_CHECK) throw new Error("Passphrase incorrecta");
    info.verificada = true;
    return key;
  }
  for (const [k] of stateFieldPairs()) {
    const blob = await dbGet(DB_KV, k);
    if (blob?.__enc) { await decryptValue(blob, key); info.verificada = true; return key; }   // lanza si no cuadra
  }
  // Sin campos cifrados en el KV: probar con un snapshot cifrado
  const snap = (await dbAll(DB_SNAP)).find(sn => sn?.enc);
  if (snap) { await decryptValue(snap.enc, key); info.verificada = true; }
  return key;   // si no hay nada cifrado, no se puede verificar
}

function cifradoNoPermitido() {
  if (bloqueado()) return true;   // datos bloqueados o ventana desfasada (sincro.js)
  if (!cryptoDisponible()) {
    avisar("El cifrado necesita un contexto seguro (https o localhost). Abre la app desde su URL, no como archivo local.");
    return true;
  }
  return false;
}

export async function enableEncryption() {
  if (cifradoNoPermitido()) return;
  const pass = $("#segPass1").value;
  if (pass.length < 8) return;
  if (!(await confirmar("La passphrase no se puede recuperar. Guárdala en un sitio seguro.", { titulo: "¿Activar cifrado AES-256?", si: "Activar cifrado" }))) return;
  try {
    // En la cola de escritura y en una sola transacción: ni un saveState
    // concurrente ni un cierre a mitad pueden dejar campos con claves mezcladas.
    await enqueueWrite(async () => {
      const salt = genSalt();
      const key  = await deriveKey(pass, salt);
      await rekeyAll(null, key, salt);
      setCryptoKey(key);   // solo tras confirmar la transacción
    });
    renderSegBody();
    flash();
    avisar("✓ Cifrado activado. La próxima vez que abras la app se te pedirá la passphrase.");
  } catch (err) {
    console.error("[Cartera] Error activando cifrado", err);
    avisar("Error al activar cifrado (no se ha modificado nada): " + (err?.message || err));
  }
}

export async function disableEncryption() {
  if (cifradoNoPermitido()) return;
  if (!_cryptoKey) { avisar("El cifrado no está activo en esta sesión."); return; }
  if (!(await confirmar("Los datos volverán a guardarse en claro.", { titulo: "¿Desactivar cifrado?", si: "Desactivar", peligro: true }))) return;
  try {
    await enqueueWrite(async () => {
      await rekeyAll(_cryptoKey, null);
      setCryptoKey(null);
    });
    renderSegBody();
    flash();
    avisar("✓ Cifrado desactivado.");
  } catch (err) {
    console.error("[Cartera] Error desactivando cifrado", err);
    avisar("Error al desactivar (no se ha modificado nada): " + (err?.message || err));
  }
}

export async function changePassphrase() {
  if (cifradoNoPermitido()) return;
  const actual = await askPassphrase("Introduce la passphrase actual:", "CAMBIAR PASSPHRASE");
  if (!actual) return;
  try {
    const encMeta = await dbGet(DB_KV, "encMeta");
    if (!encMeta?.enabled) throw new Error("sin cifrado");
    await verifyPassphrase(encMeta, actual);
  } catch {
    avisar("Passphrase incorrecta.");
    return;
  }
  const nueva = await askPassphrase("Nueva passphrase (mín. 8 caracteres):", "CAMBIAR PASSPHRASE");
  if (!nueva || nueva.length < 8) { if (nueva != null) avisar("Passphrase demasiado corta."); return; }
  const confirma = await askPassphrase("Confirma la nueva passphrase:", "CAMBIAR PASSPHRASE");
  if (confirma == null) return;
  if (nueva !== confirma) { avisar("Las passphrases no coinciden."); return; }
  try {
    await enqueueWrite(async () => {
      const newSalt = genSalt();
      const newKey  = await deriveKey(nueva, newSalt);
      await rekeyAll(_cryptoKey, newKey, newSalt);
      setCryptoKey(newKey);
    });
    renderSegBody();
    flash();
    avisar("✓ Passphrase cambiada.");
  } catch (err) {
    console.error("[Cartera] Error cambiando passphrase", err);
    avisar("Error al cambiar passphrase (no se ha modificado nada): " + (err?.message || err));
  }
}

// Llamada al inicio si la BD está cifrada. Pide passphrase hasta 3 intentos.
export async function promptUnlock(encMeta) {
  if (!cryptoDisponible()) {
    avisar("Los datos están cifrados y este navegador no permite descifrarlos aquí (hace falta https o localhost). Abre la app desde su URL.");
    return false;
  }
  for (let intento = 1; intento <= 3; intento++) {
    const pass = await askPassphrase(intento === 1
      ? "🔒 Cifrado activo\n\nIntroduce tu passphrase:"
      : `Passphrase incorrecta (intento ${intento}/3):`, "Mi Cartera");
    if (pass == null) return false;     // usuario canceló
    try {
      const info = {};
      const key = await verifyPassphrase(encMeta, pass, info);
      setCryptoKey(key);
      // BDs antiguas sin testigo: añadirlo para verificar correctamente en adelante,
      // pero solo si la passphrase se ha comprobado contra datos reales (si no, una
      // passphrase mal tecleada quedaría fijada como buena para siempre).
      if (!encMeta.check && info.verificada) {
        try {
          const check = await encryptValue(ENC_CHECK, key);
          await enqueueWrite(() => dbPut(DB_KV, { ...encMeta, check }, "encMeta"));
        } catch (err) { console.warn("[Cartera] No se pudo guardar el testigo de passphrase", err); }
      }
      return true;
    } catch {
      if (intento === 3) {
        avisar("3 intentos fallidos. Recarga la página para volver a intentarlo.");
        return false;
      }
    }
  }
  return false;
}
