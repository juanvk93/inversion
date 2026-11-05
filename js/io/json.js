import { BENCHMARKS, COLORES, ETF_PROVIDERS } from "../config.js";
import { _cryptoKey } from "../crypto.js";
import { avisar, elegir } from "../dialog.js";
import { closeDrawer } from "../drawer.js";
import { marcarBackupExterno } from "./backup.js";
import { dedupFechas } from "./csv.js";
import { crearSnapshot, hideBackupToast } from "../snapshots.js";
import { bloqueado, flash, lsSet, saveState, state } from "../state.js";
import { applyTheme } from "../tema.js";
import { RE_FECHA, hoyDia, sanitizeId } from "../utils.js";
import { render } from "../views/render.js";

const JSON_EXPORT_VERSION = 1;

export function generarJSON() {
  const payload = {
    app:        "MI CARTERA",
    version:    JSON_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    productos:  state.productos.map(p => ({
      id:                 p.id,
      nombre:             p.nombre || "",
      referencia:         p.referencia  || "",
      tipologia:          p.tipologia   || "",
      divisa:             p.divisa      || "",
      comentarios:        p.comentarios || "",
      color:              p.color       || COLORES[0],
      unidades:           Number.isFinite(+p.unidades) ? +p.unidades : 0,
      precioManual:       Number.isFinite(+p.precioManual) ? +p.precioManual : 0,
      coingeckoId:        p.coingeckoId || "",
      etfTicker:          p.etfTicker || "",
      asignacionObjetivo: Number.isFinite(+p.asignacionObjetivo) ? +p.asignacionObjetivo : 0,
      ter:                Number.isFinite(+p.ter) ? +p.ter : 0,
      comisionCompra:     Number.isFinite(+p.comisionCompra) ? +p.comisionCompra : 0,
    })),
    entradas: Object.fromEntries(
      Object.entries(state.entradas).map(([pid, list]) => [
        pid,
        (list || []).map(e => ({
          id:        e.id,
          fecha:     e.fecha,
          manual:    e.manual    || 0,
          saveback:  e.saveback  || 0,
          roundup:   e.roundup   || 0,
          valor:     e.valor     || 0,
          dividendo: e.dividendo || 0,
          nota:      e.nota      || "",
        })),
      ])
    ),
    objetivos: (state.objetivos || []).map(o => ({
      id:         o.id,
      nombre:     o.nombre || "",
      meta:       o.meta   || 0,
      productoId: o.productoId ?? null,
    })),
    firePrefs: {
      gasto: state.fireGasto,
      regla: state.fireRegla,
      inflacion: state.inflacion,
    },
    logros: state.logros || {},
    config: {
      etfProvider:      state.etfProvider || "twelvedata",
      // Con el cifrado activo la API key no sale en claro en el backup
      twelveDataApiKey: _cryptoKey ? "" : (state.twelveDataApiKey || ""),
      benchmarkSymbol:  state.benchmarkSymbol || "EUNL.DE",
      theme:            document.documentElement.classList.contains("light") ? "light" : "dark",
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function descargarArchivo(nombre, contenido, mime) {
  const blob = new Blob([contenido], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

export function exportarJSON() {
  // Bloqueado, el estado en memoria está vacío: se descargaría una copia vacía
  if (bloqueado()) return;
  const fecha = hoyDia();
  descargarArchivo(`mi-cartera-${fecha}.json`, generarJSON(), "application/json;charset=utf-8");
  marcarBackupExterno();
  flash();
  closeDrawer();
}

function importarJSON(texto) {
  let raw;
  try { raw = JSON.parse(texto); }
  catch (err) { throw new Error("JSON inválido: " + err.message); }
  if (!raw || typeof raw !== "object") throw new Error("El archivo no contiene un objeto JSON");

  // Productos
  if (!Array.isArray(raw.productos)) throw new Error("Falta 'productos' (debe ser un array)");
  const usadosId = new Set();
  // id original → id final: si dos ids colisionan tras sanitizar, las entradas y
  // objetivos deben ir al producto correcto (no al primero con ese id saneado).
  const idMap = new Map();
  const productos = raw.productos.map((p, i) => {
    if (!p || typeof p !== "object") throw new Error(`productos[${i}]: entrada no válida`);
    const rawId = String(p.id || p.nombre || `prod_${i}`);
    let id = sanitizeId(rawId);
    while (usadosId.has(id)) id = `${id}_${i}`;
    usadosId.add(id);
    if (!idMap.has(rawId)) idMap.set(rawId, id);
    const num = (v) => (Number.isFinite(+v) && +v >= 0) ? +v : 0;
    return {
      id,
      nombre:             String(p.nombre || id),
      referencia:         String(p.referencia  || ""),
      tipologia:          String(p.tipologia   || ""),
      divisa:             String(p.divisa      || "").toUpperCase(),
      comentarios:        String(p.comentarios || ""),
      color:              /^#[0-9a-fA-F]{6}$/.test(p.color || "")
        ? p.color
        : COLORES[i % COLORES.length],
      unidades:           num(p.unidades),
      precioManual:       num(p.precioManual),
      coingeckoId:        String(p.coingeckoId || "").toLowerCase().replace(/[^a-z0-9-]/g, ""),
      etfTicker:          String(p.etfTicker || p.twelveDataTicker || "").toUpperCase().replace(/[^A-Z0-9.:^-]/g, ""),
      asignacionObjetivo: Math.max(0, Math.min(100, num(p.asignacionObjetivo))),
      ter:                Math.max(0, Math.min(10, num(p.ter))),
      comisionCompra:     num(p.comisionCompra),
    };
  });
  const idsValidos = new Set(productos.map(p => p.id));

  // Entradas
  if (raw.entradas != null && typeof raw.entradas !== "object")
    throw new Error("'entradas' debe ser un objeto { productoId: [...] }");
  const entradas = {};
  let descartadas = 0, duplicadas = 0;
  productos.forEach(p => { entradas[p.id] = []; });
  const resolverId = (raw) => idMap.get(String(raw)) ?? sanitizeId(raw);
  Object.entries(raw.entradas || {}).forEach(([pidRaw, list]) => {
    const pid = resolverId(pidRaw);
    if (!idsValidos.has(pid) || !Array.isArray(list)) return;
    list.forEach(e => {
      if (!e || typeof e !== "object") { descartadas++; return; }
      const fecha = String(e.fecha || "").trim();
      if (!RE_FECHA.test(fecha)) { descartadas++; return; }
      const num = (v) => Number.isFinite(+v) ? +v : 0;
      if (!Number.isFinite(+e.valor) || +e.valor < 0) { descartadas++; return; }
      entradas[pid].push({
        id:        (typeof e.id === "string" || typeof e.id === "number") ? e.id : (Date.now() + Math.random()),
        fecha,
        manual:    num(e.manual),
        saveback:  num(e.saveback),
        roundup:   num(e.roundup),
        valor:     num(e.valor),
        dividendo: num(e.dividendo),
        nota:      String(e.nota || ""),
      });
    });
    const r = dedupFechas(entradas[pid]);
    entradas[pid] = r.lista;
    duplicadas += r.quitadas;
  });

  // Objetivos (opcional). Se descartan los de meta no positiva y los que apuntan
  // a un producto inexistente (antes se convertían en objetivos de cartera total).
  let objDescartados = 0;
  const objetivos = Array.isArray(raw.objetivos)
    ? raw.objetivos
        .filter(o => {
          const ok = o && typeof o === "object" && o.nombre && Number.isFinite(+o.meta) && +o.meta > 0
            && (o.productoId == null || o.productoId === "total" || idsValidos.has(resolverId(o.productoId)));
          if (!ok) objDescartados++;
          return ok;
        })
        .map((o, i) => ({
          id:         String(o.id ?? `obj_${Date.now()}_${i}`),
          nombre:     String(o.nombre),
          meta:       +o.meta,
          productoId: (o.productoId == null || o.productoId === "total") ? null : resolverId(o.productoId),
        }))
    : [];

  // Preferencias FIRE (opcional)
  let firePrefs = null;
  if (raw.firePrefs && typeof raw.firePrefs === "object") {
    const g = +raw.firePrefs.gasto;
    const r = +raw.firePrefs.regla;
    const inf = +raw.firePrefs.inflacion;
    firePrefs = {
      gasto: Number.isFinite(g) && g > 0 ? g : null,
      regla: Number.isFinite(r) && r > 0 ? r : null,
      inflacion: Number.isFinite(inf) && inf >= 0 && inf < 1 ? inf : null,
    };
  }

  // Configuración (opcional)
  let config = null;
  if (raw.config && typeof raw.config === "object") {
    config = {
      etfProvider:      ETF_PROVIDERS.includes(raw.config.etfProvider) ? raw.config.etfProvider : null,
      twelveDataApiKey: typeof raw.config.twelveDataApiKey === "string" ? raw.config.twelveDataApiKey : null,
      benchmarkSymbol:  BENCHMARKS.some(b => b.id === raw.config.benchmarkSymbol) ? raw.config.benchmarkSymbol : null,
      theme:            raw.config.theme === "light" || raw.config.theme === "dark" ? raw.config.theme : null,
    };
  }

  // Logros (opcional)
  const logros = {};
  if (raw.logros && typeof raw.logros === "object") {
    Object.entries(raw.logros).forEach(([k, v]) => {
      if (typeof v === "string" && /^[a-z0-9_-]{1,40}$/i.test(k)) logros[k] = v.slice(0, 10);
    });
  }

  return { productos, entradas, objetivos, firePrefs, config, logros, descartadas, duplicadas, objDescartados };
}

export function handleImportJSON(file) {
  if (bloqueado()) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try { data = importarJSON(reader.result); }
    catch (err) { avisar("Error al leer JSON: " + err.message); return; }
    if (!data.productos.length) { avisar("No se encontraron productos válidos en el JSON"); return; }
    const total = Object.values(data.entradas).flat().length;
    const partes = [`${data.productos.length} productos`, `${total} entradas`];
    if (data.objetivos.length) partes.push(`${data.objetivos.length} objetivos`);
    let avisoDesc = data.descartadas
      ? `\n⚠ ${data.descartadas} entrada(s) descartadas por fecha o valor inválidos.`
      : "";
    if (data.duplicadas)     avisoDesc += `\n⚠ ${data.duplicadas} entrada(s) con mes repetido: se conserva la última.`;
    if (data.objDescartados) avisoDesc += `\n⚠ ${data.objDescartados} objetivo(s) descartados (meta no válida o producto inexistente).`;
    // Antes "Cancelar" de confirm() significaba FUSIONAR: ahora cada acción tiene su botón
    const modo = await elegir("IMPORTAR JSON",
      `Encontrados: ${partes.join(", ")}.${avisoDesc}\n\n¿Qué quieres hacer con tus datos actuales?`,
      [
      { valor: "reemplazar", texto: "REEMPLAZAR TODO", tipo: "primary" },
      { valor: "fusionar",   texto: "FUSIONAR CON LOS ACTUALES" },
      { valor: null,         texto: "CANCELAR" },
    ]);
    if (!modo) return;
    if (!(await crearSnapshot("antes de importar JSON"))) return;
    hideBackupToast();   // el aviso "¿Tienes una copia?" ya no aplica
    if (modo === "reemplazar") {
      state.productos = data.productos;
      state.entradas  = data.entradas;
      state.objetivos = data.objetivos;
      if (data.firePrefs) {
        if (data.firePrefs.gasto != null) state.fireGasto = data.firePrefs.gasto;
        if (data.firePrefs.regla != null) state.fireRegla = data.firePrefs.regla;
        if (data.firePrefs.inflacion != null) state.inflacion = data.firePrefs.inflacion;
      }
      state.logros = data.logros || {};
      state.tab = state.productos[0]?.id || "total";
    } else {
      const ids = new Set(state.productos.map(p => p.id));
      data.productos.forEach(p => { if (!ids.has(p.id)) state.productos.push(p); });
      Object.entries(data.entradas).forEach(([pid, list]) => {
        const ya = state.entradas[pid] || [];
        const fechasYa = new Set(ya.map(x => x.fecha));
        const nuevas   = list.filter(x => !fechasYa.has(x.fecha));
        state.entradas[pid] = [...ya, ...nuevas].sort((a, b) => a.fecha.localeCompare(b.fecha));
      });
      const objIds = new Set((state.objetivos || []).map(o => String(o.id)));
      data.objetivos.forEach(o => { if (!objIds.has(o.id)) state.objetivos.push(o); });
      Object.entries(data.logros || {}).forEach(([k, v]) => {
        if (!state.logros[k]) state.logros[k] = v;
      });
    }
    // Configuración: se aplica en ambos modos (reemplazar y fusionar)
    if (data.config) {
      if (data.config.etfProvider)      state.etfProvider     = data.config.etfProvider;
      // Una clave vacía en el backup no debe borrar la que ya hay configurada
      if (data.config.twelveDataApiKey) state.twelveDataApiKey = data.config.twelveDataApiKey;
      if (data.config.benchmarkSymbol)  state.benchmarkSymbol = data.config.benchmarkSymbol;
      if (data.config.theme)            { lsSet("tema", data.config.theme); applyTheme(data.config.theme); }
    }
    saveState();
    render();
    flash();
    closeDrawer();
  };
  reader.readAsText(file);
}
