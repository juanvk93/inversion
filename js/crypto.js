// ═══════════════════════════════════════════════════════════════════════════
// 2a. CRYPTO · cifrado local AES-GCM con clave derivada por PBKDF2
// ═══════════════════════════════════════════════════════════════════════════

const PBKDF2_ITER = 200_000;
export let _cryptoKey = null;   // CryptoKey activa en memoria (null = sin cifrado)
export let _locked    = false;  // true si la BD está cifrada y el usuario canceló el desbloqueo
// Los módulos que importan estas variables no pueden reasignarlas: usan los setters.
export function setCryptoKey(k) { _cryptoKey = k; }
export function setLocked(v)    { _locked = v; }

// crypto.subtle solo existe en contextos seguros (https / localhost), no en file://
export const cryptoDisponible = () => !!(window.isSecureContext && window.crypto?.subtle);

export async function deriveKey(passphrase, salt) {
  if (!cryptoDisponible()) throw new Error("Cifrado no disponible: abre la app por https o localhost");
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptValue(value, key) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const buf = new TextEncoder().encode(JSON.stringify(value));
  const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf);
  return { __enc: true, iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

export async function decryptValue(blob, key) {
  if (!blob?.__enc) return blob;
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

export function genSalt() { return crypto.getRandomValues(new Uint8Array(16)); }
