/* ============================================================
   db.js — Capa de acceso a IndexedDB
   Promisifica IndexedDB y expone CRUD genérico por store.
   ============================================================ */

const DB_NAME = 'gym-tracker';
const DB_VERSION = 1;

export const STORES = {
  EXERCISES: 'exercises',   // ejercicios genéricos
  GROUPS: 'groups',         // grupos de ejercicios
  SESSIONS: 'sessions',     // sesiones de entrenamiento
  BODYWEIGHT: 'bodyweight', // registros de peso corporal
};

let _dbPromise = null;

/** Abre (o crea) la base de datos. Singleton. */
export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.EXERCISES)) {
        const s = db.createObjectStore(STORES.EXERCISES, { keyPath: 'id' });
        s.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.GROUPS)) {
        db.createObjectStore(STORES.GROUPS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const s = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('startedAt', 'startedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.BODYWEIGHT)) {
        const s = db.createObjectStore(STORES.BODYWEIGHT, { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/** Ejecuta una transacción y devuelve el resultado de la request. */
async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    try {
      request = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function getAll(storeName) {
  return tx(storeName, 'readonly', (s) => s.getAll());
}

export function get(storeName, id) {
  return tx(storeName, 'readonly', (s) => s.get(id));
}

export function put(storeName, value) {
  return tx(storeName, 'readwrite', (s) => s.put(value)).then(() => value);
}

export function remove(storeName, id) {
  return tx(storeName, 'readwrite', (s) => s.delete(id));
}

export function clear(storeName) {
  return tx(storeName, 'readwrite', (s) => s.clear());
}

/** Devuelve todas las sesiones con un estado dado, usando el índice. */
export function getSessionsByStatus(status) {
  return tx(STORES.SESSIONS, 'readonly', (s) => s.index('status').getAll(status));
}

/** Exporta toda la base de datos como objeto plano (para backup). */
export async function exportAll() {
  const [exercises, groups, sessions, bodyweight] = await Promise.all([
    getAll(STORES.EXERCISES),
    getAll(STORES.GROUPS),
    getAll(STORES.SESSIONS),
    getAll(STORES.BODYWEIGHT),
  ]);
  return { version: DB_VERSION, exportedAt: new Date().toISOString(), exercises, groups, sessions, bodyweight };
}

/** Importa un backup (reemplaza el contenido actual). */
export async function importAll(data) {
  const db = await openDB();
  const names = [STORES.EXERCISES, STORES.GROUPS, STORES.SESSIONS, STORES.BODYWEIGHT];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    t.oncomplete = () => resolve(true);
    t.onerror = () => reject(t.error);
    // Solo filas que sean objetos con `id` (keyPath). Sin esto, una fila
    // malformada haría que `put` lanzara DataError y el `clear()` ya encolado
    // podría confirmarse igualmente → pérdida de datos con error.
    const arr = (v) => (Array.isArray(v) ? v.filter((r) => r && typeof r === 'object' && r.id != null) : []);
    const map = {
      [STORES.EXERCISES]: arr(data.exercises),
      [STORES.GROUPS]: arr(data.groups),
      [STORES.SESSIONS]: arr(data.sessions),
      [STORES.BODYWEIGHT]: arr(data.bodyweight),
    };
    names.forEach((name) => {
      const store = t.objectStore(name);
      store.clear();
      map[name].forEach((row) => store.put(row));
    });
  });
}
