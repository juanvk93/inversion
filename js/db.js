import { DB_KV, DB_NAME, DB_SNAP, DB_VER } from "./config.js";

// ═══════════════════════════════════════════════════════════════════════════
// 2b. INDEXEDDB · capa de persistencia
// ═══════════════════════════════════════════════════════════════════════════

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_KV))   db.createObjectStore(DB_KV);
      if (!db.objectStoreNames.contains(DB_SNAP)) db.createObjectStore(DB_SNAP, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

export async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbPut(store, value, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readwrite");
    const os  = tx.objectStore(store);
    const req = key !== undefined ? os.put(value, key) : os.put(value);
    // Resolver en oncomplete: hasta entonces la escritura no está confirmada
    tx.oncomplete = () => resolve(req.result);
    tx.onerror    = () => reject(tx.error || req.error);
    tx.onabort    = () => reject(tx.error || new Error("Transacción abortada"));
  });
}

// Otra ventana (la PWA y una pestaña del navegador, por ejemplo) ha guardado
// desde la última lectura de esta: escribir pisaría sus cambios.
export class ConflictoError extends Error {
  constructor() { super("Hay cambios guardados desde otra ventana"); this.name = "ConflictoError"; }
}

// Escribe varios pares [clave, valor] del KV (undefined = borrar) y, opcional,
// registros de snapshots, en UNA transacción con control de concurrencia: la
// clave "rev" del KV debe valer `revEsperada` (si no, ConflictoError y no se
// escribe nada) y se incrementa. Devuelve la revisión nueva.
export async function dbWriteRev(kvPairs, revEsperada, snapRecords = []) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(snapRecords.length ? [DB_KV, DB_SNAP] : [DB_KV], "readwrite");
    const kv = tx.objectStore(DB_KV);
    let nueva, conflicto = false;
    const req = kv.get("rev");
    req.onsuccess = () => {
      const actual = req.result ?? 0;
      if (actual !== revEsperada) { conflicto = true; tx.abort(); return; }
      nueva = actual + 1;
      for (const [key, value] of kvPairs) {
        if (value === undefined) kv.delete(key);
        else kv.put(value, key);
      }
      kv.put(nueva, "rev");
      if (snapRecords.length) {
        const snap = tx.objectStore(DB_SNAP);
        for (const r of snapRecords) snap.put(r);
      }
    };
    tx.oncomplete = () => resolve(nueva);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(conflicto ? new ConflictoError() : (tx.error || new Error("Transacción abortada")));
  });
}

export async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error || new Error("Transacción abortada"));
  });
}

export async function dbAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

// ── Almacenamiento persistente ─────────────────────────────────────────────
// Por defecto IndexedDB es "best-effort": el navegador puede vaciarlo bajo
// presión de espacio o tras un largo periodo de inactividad. Con persistencia
// concedida, los datos solo se borran si el usuario lo hace explícitamente.
export async function isStoragePersisted() {
  if (!navigator.storage?.persisted) return false;
  try { return await navigator.storage.persisted(); }
  catch { return false; }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}
