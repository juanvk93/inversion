import { FETCH_TIMEOUT, MESES } from "./config.js";

// ═══════════════════════════════════════════════════════════════════════════
// 2. UTILS
// ═══════════════════════════════════════════════════════════════════════════

// Crear un Intl.NumberFormat es caro (sobre todo en móvil) y fmt/fmtE se llaman
// cientos de veces por render: se crean una vez y se reutilizan.
const _nf   = new Map();   // decimales → formateador
// useGrouping "always": en es-ES los números de 4 cifras salen sin punto de
// miles ("5213,62 €") y quedaban desalineados junto a "21.603,87 €"
const _nfE  = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
const nfDec = (d) => {
  if (!_nf.has(d)) _nf.set(d, new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" }));
  return _nf.get(d);
};
export const fmt        = (n, d = 2) => nfDec(d).format(n);
export const fmtE       = (n)        => _nfE.format(n);
// Importe en la divisa de un producto (USD → "1.234,56 US$"); EUR o desconocida → fmtE
const _nfDiv = new Map();
export function fmtDiv(n, divisa) {
  const d = String(divisa || "EUR").toUpperCase();
  if (d === "EUR") return fmtE(n);
  if (!_nfDiv.has(d)) {
    try { _nfDiv.set(d, new Intl.NumberFormat("es-ES", { style: "currency", currency: d, useGrouping: "always" })); }
    catch { _nfDiv.set(d, _nfE); }   // código no ISO 4217
  }
  return _nfDiv.get(d).format(n);
}
export const labelMes   = (ym)       => { const [y, m] = String(ym).split("-"); return `${MESES[+m-1] ?? m} ${(y || "").slice(2)}`; };
export const hoy        = ()         => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
// Fecha local YYYY-MM-DD (toISOString usa UTC y entre 00:00 y 02:00 en España da el día anterior)
export const hoyDia     = ()         => { const d = new Date(); return `${hoy()}-${String(d.getDate()).padStart(2,"0")}`; };
// Formato de mes válido: YYYY-MM con mes 01-12
export const RE_FECHA   = /^\d{4}-(0[1-9]|1[0-2])$/;
export const aportTotal = (e)        => (e.manual || 0) + (e.saveback || 0) + (e.roundup || 0);
export const esc        = (s)        => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
// IDs reservados para las vistas internas: un producto importado no puede usarlos
// (colisionaría con la pestaña/vista del mismo nombre y quedaría inaccesible).
export const RESERVED_IDS = new Set(["total", "resumen", "proyeccion", "fire", "asignacion", "diff", "fiscal", "benchmark", "config", "cierre"]);
export const sanitizeId = (s) => {
  let out = String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  if (!out) out = `id_${Date.now()}`;
  // Las claves de Object.prototype (__proto__, constructor, toString…) romperían
  // los mapas {} indexados por id (prototype pollution / colisiones).
  if (RESERVED_IDS.has(out) || out in Object.prototype) out = `prod_${out}`;
  return out;
};
// Texto en MAYÚSCULAS → "Frase normal", conservando siglas (TIR, ETF, JSON…).
// Para títulos y botones que llegan de muchos sitios (diálogos de dialog.js).
const SIGLAS = new Set(["AES-256", "API", "CSV", "DCA", "ETF", "FIRE", "ID", "IRPF", "JSON", "PDF", "TER", "TIR", "XIRR", "YTD"]);
export function frase(t) {
  const s = String(t ?? "");
  if (s !== s.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]{2}/.test(s)) return s;   // ya está en minúsculas o es una sigla suelta
  const r = s.split(/(\s+)/).map(w => SIGLAS.has(w.replace(/[^\wÁÉÍÓÚÑ-]/g, "")) ? w : w.toLowerCase()).join("");
  return r.replace(/[a-záéíóúñü]/, c => c.toUpperCase());
}
// Oscurece un color #RRGGBB hasta tener `minimo`:1 de contraste sobre blanco
// (WCAG). Los colores de producto son claros: en el tema claro, como texto o
// como fondo de un botón con texto blanco, no se leían (≈2:1).
export function oscurecerHasta(hex, minimo = 4.5) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const lum = () => {
    const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (let i = 0; i < 40 && 1.05 / (lum() + 0.05) < minimo; i++) [r, g, b] = [r, g, b].map(v => Math.round(v * 0.94));
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Iniciales de un nombre para su círculo de color ("ETF World" → "EW")
export const iniciales  = (n)        => (String(n).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("") || "?").toUpperCase();
export const $          = (sel)      => document.querySelector(sel);
export const $$         = (sel)      => Array.from(document.querySelectorAll(sel));

// Re-render tras confirmar un input (change) sin romper la interacción siguiente:
// - Si el change lo dispara un clic (blur por pointerdown), espera a que el clic
//   termine; si no, el botón pulsado desaparecía del DOM y el clic se perdía.
// - Tras el render devuelve el foco al campo al que se movió el usuario (Tab).
let _pointerActivo = false;
// Sin document = Node (tests de calc.js, que importa este módulo)
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => { _pointerActivo = true; }, true);
  ["pointerup", "pointercancel"].forEach(ev =>
    document.addEventListener(ev, () => { _pointerActivo = false; }, true));
}

export function rerenderTrasEdicion(renderFn) {
  const run = () => {
    const a = document.activeElement;
    let sel = null;
    if (a && a !== document.body && $("#main")?.contains(a)) {
      if (a.id) sel = `#${CSS.escape(a.id)}`;
      else if (a.dataset.fiscalVender != null) sel = `[data-fiscal-vender="${CSS.escape(a.dataset.fiscalVender)}"]`;
    }
    renderFn();
    if (sel) $(sel)?.focus();
  };
  if (!_pointerActivo) { setTimeout(run, 0); return; }
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    document.removeEventListener("pointerup", fin, true);
    document.removeEventListener("pointercancel", fin, true);
    setTimeout(run, 0);   // después del click que sigue a pointerup
  };
  document.addEventListener("pointerup", fin, true);
  document.addEventListener("pointercancel", fin, true);
}

// fetch con timeout (AbortController: AbortSignal.timeout no existe en Safari < 16).
// El límite cubre también la lectura del cuerpo: la Response devuelta trae el
// cuerpo ya descargado, así que r.json()/r.text() no pueden quedarse colgados.
export function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .then(async (r) => {
      const body = [204, 205, 304].includes(r.status) ? null : await r.arrayBuffer();
      return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
    })
    .catch((err) => {
      throw err?.name === "AbortError" ? new Error("Tiempo de espera agotado") : err;
    })
    .finally(() => clearTimeout(t));
}

// Convierte un número escrito por el usuario o importado ("1.234,56", "1234.56",
// "1234,5") a Number. Devuelve NaN si no es numérico (nunca 0 en silencio).
// miles=true (importes en formato español): un único punto seguido de exactamente
// 3 cifras es separador de miles ("12.500" → 12500, no 12,5).
export function parseNum(v, miles = false) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/\s|€/g, "");
  if (!s) return NaN;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Ambos separadores: el último es el decimal ("1.234,56" / "1,234.56")
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // Solo comas: una → decimal ("1234,56"); varias → miles ("1,234,567")
    s = (s.match(/,/g).length === 1) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");   // "1.234.567" → miles
  } else if (miles && /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) {
    s = s.replace(".", "");     // "12.500" → miles ("0.125" sigue siendo decimal)
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
}
