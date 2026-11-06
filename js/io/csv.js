import { COLORES } from "../config.js";
import { avisar, elegir } from "../dialog.js";
import { closeDrawer } from "../drawer.js";
import { crearSnapshot, hideBackupToast } from "../snapshots.js";
import { bloqueado, flash, saveState, state } from "../state.js";
import { hoyDia, parseNum, sanitizeId } from "../utils.js";
import { descargarArchivo } from "./json.js";
import { render } from "../views/render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 5. CSV
// ═══════════════════════════════════════════════════════════════════════════

const CSV_HEADERS = [
  "producto_id","producto_nombre","fecha","manual","saveback","roundup","valor","dividendo","nota",
  // Metadatos de producto (se repiten en cada fila del producto; en import basta la 1ª)
  "producto_referencia","producto_tipologia","producto_divisa","producto_color",
  "producto_unidades","producto_precio_manual","producto_coingecko","producto_etf_ticker",
  "producto_asignacion","producto_ter","producto_comision","producto_comentarios",
];

function escCSV(v) {
  if (v == null) return "";
  let s = String(v);
  // CSV injection: si empieza por =, +, -, @, tab o CR, prefijar con ' para que Excel/LibreOffice
  // no la interpreten como fórmula.
  // También si ya empieza por ' + uno de esos caracteres: unescCSV quita un solo '
  // al importar, así el texto original vuelve intacto.
  if (/^'*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Parser CSV que respeta comillas y saltos de línea DENTRO de campos
// entrecomillados. Devuelve un array de registros; cada registro un array de
// campos. Imprescindible para round-trip de notas multilínea (la versión por
// línea las rompía al hacer split("\n") antes de parsear). El texto debe venir
// ya normalizado a LF. `sep`: separador de campos ("," o ";" de Excel en español).
function parseCSVRecords(texto, sep = ",") {
  const records = [];
  let row = [], field = "", inQ = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow   = () => { endField(); records.push(row); row = []; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (inQ) {
      if (c === '"') {
        if (texto[i+1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === sep) {
      endField();
    } else if (c === "\n") {
      endRow();
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) endRow();
  return records.filter(r => r.some(f => f.trim() !== ""));   // descartar filas vacías
}

function generarCSV() {
  const lineas = [CSV_HEADERS.join(",")];
  state.productos.forEach(p => {
    const meta = [
      escCSV(p.referencia || ""), escCSV(p.tipologia || ""), escCSV(p.divisa || ""),
      escCSV(p.color || ""), p.unidades || 0, p.precioManual || 0,
      escCSV(p.coingeckoId || ""), escCSV(p.etfTicker || ""), p.asignacionObjetivo || 0,
      p.ter || 0, p.comisionCompra || 0, escCSV(p.comentarios || ""),
    ];
    const lista = state.entradas[p.id] || [];
    if (lista.length) {
      lista.forEach(e => {
        lineas.push([
          escCSV(p.id), escCSV(p.nombre), escCSV(e.fecha),
          e.manual || 0, e.saveback || 0, e.roundup || 0,
          e.valor || 0, e.dividendo || 0, escCSV(e.nota || ""),
          ...meta,
        ].join(","));
      });
    } else {
      // Producto sin entradas: una fila con metadatos para no perderlo en el export
      lineas.push([escCSV(p.id), escCSV(p.nombre), "", 0, 0, 0, 0, 0, "", ...meta].join(","));
    }
  });
  return lineas.join("\n");
}

export function exportarCSV() {
  if (bloqueado()) return;   // bloqueado: el estado en memoria está vacío
  const fecha = hoyDia();
  descargarArchivo(`mi-cartera-${fecha}.csv`, generarCSV(), "text/csv;charset=utf-8");
  flash();
  closeDrawer();
}

// Detecta el separador mirando la cabecera (Excel en español guarda con ";").
function detectarSeparadorCSV(texto) {
  const cab = texto.split("\n", 1)[0] || "";
  const n = (ch) => cab.split(ch).length - 1;
  return n(";") > n(",") ? ";" : ",";
}

// Quita el prefijo ' que escCSV añade contra la inyección de fórmulas.
const unescCSV = (v) => /^''*[=+\-@\t\r]/.test(v) ? v.slice(1) : v;

// Normaliza la fecha de una fila a YYYY-MM. Acepta YYYY-MM, YYYY-MM-DD,
// YYYY/MM, MM/YYYY, MM-YYYY y "ene-24"/"ene 2024" (Excel en español). "" si no es válida.
const MESES_ABBR = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
export function normalizarFechaCSV(v) {
  const t = String(v || "").trim().toLowerCase().replace(/\.$/, "");
  let y, m, r;
  if ((r = t.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/)))      { y = +r[1]; m = +r[2]; }
  else if ((r = t.match(/^(?:\d{1,2}[-/])?(\d{1,2})[-/](\d{4})$/))) { y = +r[2]; m = +r[1]; }
  else if ((r = t.match(/^([a-zñ]{3})[a-zñ]*\.?[-/ ](\d{2}|\d{4})$/))) {
    m = MESES_ABBR.indexOf(r[1]) + 1;
    y = r[2].length === 2 ? 2000 + +r[2] : +r[2];
  }
  else return "";
  if (!(m >= 1 && m <= 12)) return "";
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Deja una entrada por mes (la última del fichero gana). Devuelve cuántas quitó.
export function dedupFechas(lista) {
  const porFecha = new Map();
  lista.forEach(e => porFecha.set(e.fecha, e));
  const quitadas = lista.length - porFecha.size;
  return { lista: [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)), quitadas };
}

function importarCSV(texto) {
  texto = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const sep = detectarSeparadorCSV(texto);
  const records = parseCSVRecords(texto, sep).map(r => r.map(unescCSV));
  // Excel en español (separador ";") usa coma decimal: ahí "12.500" son miles
  const miles = sep === ";";
  if (!records.length) return null;
  const cab = records[0].map(h => h.trim().toLowerCase());
  const idx = (n) => cab.indexOf(n);
  const iPid = idx("producto_id"), iPnom = idx("producto_nombre"), iF = idx("fecha"),
        iM   = idx("manual"),      iS    = idx("saveback"),        iR = idx("roundup"),
        iV   = idx("valor"),       iN    = idx("nota"),            iA = idx("aportacion"),
        iDvd = idx("dividendo");
  // Columnas de metadatos de producto (opcionales)
  const iRef  = idx("producto_referencia"), iTip = idx("producto_tipologia"),
        iDiv  = idx("producto_divisa"),      iCol = idx("producto_color"),
        iUni  = idx("producto_unidades"),    iPrM = idx("producto_precio_manual"),
        iCg   = idx("producto_coingecko"),   iEtf = idx("producto_etf_ticker"),
        iAsg  = idx("producto_asignacion"),  iTer = idx("producto_ter"),
        iCom  = idx("producto_comision"),    iCmt = idx("producto_comentarios");
  const num = (v) => { const n = parseNum(v, miles); return Number.isFinite(n) && n >= 0 ? n : 0; };
  // Importe de una entrada: vacío → 0; texto no numérico → NaN (la fila se descarta)
  const imp = (v) => (v == null || String(v).trim() === "") ? 0 : parseNum(v, miles);
  // ID original → ID saneado único ("a b" y "a_b" no deben fusionarse)
  const idMap = new Map(), usadosId = new Set();
  const idUnico = (raw) => {
    if (!idMap.has(raw)) {
      const base = sanitizeId(raw);
      let id = base, k = 2;
      while (usadosId.has(id)) id = `${base}_${k++}`;
      usadosId.add(id);
      idMap.set(raw, id);
    }
    return idMap.get(raw);
  };

  const prodMap = {};
  const ents = {};
  let descartadas = 0;
  for (let i = 1; i < records.length; i++) {
    const c = records[i];
    if (!c[iPid] && !c[iPnom]) continue;
    const rawPid = (c[iPid] || `prod_${c[iPnom] || ""}`).trim();
    const pid    = idUnico(rawPid);      // sanea (bloquea caracteres peligrosos) y desambigua
    const pnom   = (c[iPnom] || pid).trim();
    if (!prodMap[pid]) {
      // Reconstruir producto con metadatos (primera fila que lo menciona)
      const colorVal = iCol >= 0 && /^#[0-9a-fA-F]{6}$/.test((c[iCol]||"").trim()) ? c[iCol].trim() : COLORES[Object.keys(prodMap).length % COLORES.length];
      prodMap[pid] = {
        id: pid, nombre: pnom,
        referencia:         iRef >= 0 ? (c[iRef] || "").trim() : "",
        tipologia:          iTip >= 0 ? (c[iTip] || "").trim() : "",
        divisa:             iDiv >= 0 ? (c[iDiv] || "").trim().toUpperCase() : "",
        color:              colorVal,
        unidades:           iUni >= 0 ? num(c[iUni]) : 0,
        precioManual:       iPrM >= 0 ? num(c[iPrM]) : 0,
        coingeckoId:        iCg  >= 0 ? (c[iCg]  || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") : "",
        etfTicker:          iEtf >= 0 ? (c[iEtf] || "").trim().toUpperCase().replace(/[^A-Z0-9.:^-]/g, "") : "",
        asignacionObjetivo: iAsg >= 0 ? Math.max(0, Math.min(100, num(c[iAsg]))) : 0,
        ter:                iTer >= 0 ? Math.max(0, Math.min(10, num(c[iTer]))) : 0,
        comisionCompra:     iCom >= 0 ? num(c[iCom]) : 0,
        comentarios:        iCmt >= 0 ? (c[iCmt] || "").trim() : "",
      };
      ents[pid] = [];
    }
    // Filas sin fecha solo aportan metadatos del producto (no entrada)
    if (!(c[iF] || "").trim()) continue;
    const fecha = normalizarFechaCSV(c[iF]);
    let manual = 0, saveback = 0, roundup = 0;
    if (iM >= 0) manual   = imp(c[iM]);
    if (iS >= 0) saveback = imp(c[iS]);
    if (iR >= 0) roundup  = imp(c[iR]);
    if (iM < 0 && iA >= 0) manual = imp(c[iA]);
    const valor     = iV >= 0 ? parseNum(c[iV], miles) : NaN;
    const dividendo = iDvd >= 0 ? imp(c[iDvd]) : 0;
    // Fecha o importes no válidos → se descarta la fila (antes se ponían a 0 en silencio)
    if (!fecha || ![manual, saveback, roundup, valor, dividendo].every(Number.isFinite) || valor < 0) {
      descartadas++;
      continue;
    }
    ents[pid].push({
      id:    Date.now() + Math.random(),
      fecha,
      manual, saveback, roundup, valor, dividendo,
      nota:  (iN >= 0 ? c[iN] : "") || "",
    });
  }
  let duplicadas = 0;
  Object.keys(ents).forEach(pid => {
    const r = dedupFechas(ents[pid]);
    ents[pid] = r.lista;
    duplicadas += r.quitadas;
  });
  return { productos: Object.values(prodMap), entradas: ents, descartadas, duplicadas };
}

export function handleImport(file) {
  if (bloqueado()) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = importarCSV(reader.result); }
    catch (err) { avisar("Error al leer CSV: " + err.message); return; }
    if (!data || !data.productos.length) { avisar("No se encontraron datos válidos en el CSV"); return; }
    const total = Object.values(data.entradas).flat().length;
    let avisoDesc = data.descartadas
      ? `\n⚠ ${data.descartadas} fila(s) descartadas por fecha o importe inválidos (fecha esperada: AAAA-MM).`
      : "";
    if (data.duplicadas) avisoDesc += `\n⚠ ${data.duplicadas} fila(s) con mes repetido en el mismo producto: se conserva la última.`;
    // Antes "Cancelar" de confirm() significaba FUSIONAR: ahora cada acción tiene su botón
    const modo = await elegir("IMPORTAR CSV",
      `Encontrados ${data.productos.length} productos y ${total} entradas.${avisoDesc}\n\n¿Qué quieres hacer con tus datos actuales?`,
      [
      { valor: "reemplazar", texto: "REEMPLAZAR TODO", tipo: "primary" },
      { valor: "fusionar",   texto: "FUSIONAR CON LOS ACTUALES" },
      { valor: null,         texto: "CANCELAR" },
    ]);
    if (!modo) return;
    if (!(await crearSnapshot("antes de importar CSV"))) return;
    hideBackupToast();   // el aviso "¿Tienes una copia?" ya no aplica
    if (modo === "reemplazar") {
      state.productos = data.productos;
      state.entradas  = data.entradas;
      // El CSV no lleva objetivos: se conservan solo los que siguen teniendo producto
      const ids = new Set(state.productos.map(p => p.id));
      state.objetivos = (state.objetivos || []).filter(o => o.productoId == null || ids.has(o.productoId));
      state.tab       = state.productos[0]?.id || "total";
    } else {
      const ids = new Set(state.productos.map(p => p.id));
      data.productos.forEach(p => { if (!ids.has(p.id)) state.productos.push(p); });
      Object.entries(data.entradas).forEach(([pid, list]) => {
        const ya = state.entradas[pid] || [];
        const fechasYa = new Set(ya.map(x => x.fecha));
        const nuevas   = list.filter(x => !fechasYa.has(x.fecha));
        state.entradas[pid] = [...ya, ...nuevas].sort((a,b) => a.fecha.localeCompare(b.fecha));
      });
    }
    saveState();
    render();
    flash();
    closeDrawer();
  };
  reader.readAsText(file);
}

// ── JSON · backup completo ────────────────────────────────────────────────
// Exporta TODO el estado relevante (productos con metadatos, entradas,
// objetivos, preferencias FIRE) en un único archivo JSON portable.
