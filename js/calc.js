import { FISCAL_TRAMOS_2026 } from "./config.js";
import { aportTotal, labelMes } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// 4. CALCS
// ═══════════════════════════════════════════════════════════════════════════

// Módulo PURO: no lee el estado global ni toca el DOM, para poder probarlo con
// `node --test` (tests/calc.test.js). Las funciones de cartera reciben
// `cartera` = { productos, entradas, tiposCambio? }; desde la app se les pasa `state`.

// ── Divisas ──
// Cada producto registra sus importes en su divisa. Lo que suma productos
// (Total, fiscalidad, resúmenes) los pasa a euros con el tipo de cambio del mes
// de cada entrada: tiposCambio = { USD: { "2025-01": 0,92, … } } (EUR por unidad,
// cargado por divisas.js).
const CAMPOS_IMPORTE = ["manual", "saveback", "roundup", "valor", "dividendo"];

// EUR por unidad de `divisa` en el mes `ym`: el del mes, o el del último mes
// anterior con dato (o el primero disponible). EUR o sin divisa → 1; sin datos → null.
export function tipoCambio(tipos, divisa, ym) {
  if (!divisa || divisa === "EUR") return 1;
  const serie = tipos?.[divisa];
  if (!serie) return null;
  if (serie[ym] != null) return serie[ym];
  const meses = Object.keys(serie).sort();
  if (!meses.length) return null;
  let previo = null;
  for (const m of meses) { if (m <= ym) previo = m; else break; }
  return serie[previo ?? meses[0]];
}

// Entradas de un producto en euros. Sin tipo de cambio se quedan como están
// (la vista lo avisa con divisasSinTipo).
export function entradasEUR(cartera, p) {
  const ents = cartera.entradas[p.id] || [];
  if (!p.divisa || p.divisa === "EUR") return ents;
  return ents.map(e => {
    const t = tipoCambio(cartera.tiposCambio, p.divisa, e.fecha);
    if (t == null) return e;
    const o = { ...e };
    CAMPOS_IMPORTE.forEach(k => { if (Number.isFinite(o[k])) o[k] *= t; });
    return o;
  });
}

// Divisas de productos con entradas para las que no hay tipo de cambio
export function divisasSinTipo(cartera) {
  return [...new Set(cartera.productos
    .filter(p => p.divisa && p.divisa !== "EUR" && (cartera.entradas[p.id] || []).length && !cartera.tiposCambio?.[p.divisa])
    .map(p => p.divisa))];
}

// Posición previa de una entrada: lo que vale el PRIMER mes registrado por encima
// de su aportación (un producto que ya tenía dinero al empezar a registrarlo) es
// capital que entra, no rentabilidad. En el Total viene calculada en `flujoExtra`
// (statsTotalCalc); en un producto se deduce de su primera entrada.
export const posicionPrevia = (e, i) => e.flujoExtra ?? (i === 0 ? (e.valor || 0) - aportTotal(e) : 0);

export function calcStats(entradas) {
  if (!entradas?.length) return [];
  let acum = 0, acumManual = 0, acumSaveback = 0, acumRoundup = 0, acumDividendos = 0, acumPrevia = 0, prevValor = null;
  return [...entradas].sort((a,b) => a.fecha.localeCompare(b.fecha)).map((e, i) => {
    const ap = aportTotal(e);
    // La posición previa cuenta como aportado para que no infle la ganancia
    // (ni la TIR, ver calcTIR)
    const previa = posicionPrevia(e, i);
    acum         += ap + previa;
    acumPrevia   += previa;
    acumManual   += (e.manual    || 0);
    acumSaveback += (e.saveback  || 0);
    acumRoundup  += (e.roundup   || 0);
    // Los dividendos cobrados NO son aportación propia: se acumulan aparte para no
    // inflar el coste base ni la ganancia por revalorización. Sí cuentan como
    // rendimiento en rentMes y en la TIR (calcTIR).
    const div = e.dividendo || 0;
    acumDividendos += div;
    const ganancia = e.valor - acum;
    const rentPct  = acum > 0 ? (ganancia / acum) * 100 : 0;
    let rentMes = null;
    if (prevValor !== null && prevValor > 0) {
      // Modified Dietz: ganancia / (valorInicial + flujo × 0,5)
      // Asume aportaciones a mediados del período → denominador más preciso.
      // La renta cobrada sale de la posición (flujo negativo): sin restarla, el
      // mes del dividendo aparecía como pérdida (el valor cae lo que se reparte).
      const flujo = ap + previa - div;
      const base  = prevValor + flujo * 0.5;
      if (base > 0) rentMes = ((e.valor - flujo - prevValor) / base) * 100;
    }
    prevValor = e.valor;
    return { ...e, aportacion: ap, acumAportado: acum, acumManual, acumSaveback, acumRoundup, acumPrevia, acumDividendos, ganancia, rentPct, rentMes, label: labelMes(e.fecha) };
  });
}

// Caché para statsTotalCalc — invalidada en saveState, render y restauración de snapshot.
let _statsTotalCache = null;
export function invalidateStatsCache() { _statsTotalCache = null; }

export function statsTotalCalc(cartera) {
  const { productos } = cartera;
  if (_statsTotalCache?.cartera === cartera) return _statsTotalCache.filas;
  // Todo en euros (productos en otra divisa, al tipo de cambio de cada mes)
  const entradas = Object.fromEntries(productos.map(p => [p.id, entradasEUR(cartera, p)]));

  // 1. Recopilar todas las fechas únicas y ordenarlas
  const fechasSet = new Set();
  productos.forEach(p => (entradas[p.id] || []).forEach(e => fechasSet.add(e.fecha)));
  const fechasOrd = [...fechasSet].sort();

  // 2. Indexar entradas por producto y fecha para acceso O(1)
  const idxPorProd = {};
  productos.forEach(p => {
    idxPorProd[p.id] = {};
    (entradas[p.id] || []).forEach(e => { idxPorProd[p.id][e.fecha] = e; });
  });

  // 3. Para cada fecha: sumar aportaciones del mes (solo si hay entrada ese mes)
  //    y valor de cartera usando CARRY-FORWARD del último valor conocido por producto.
  const lastValor = {};
  const filas = fechasOrd.map(fecha => {
    let manual = 0, saveback = 0, roundup = 0, dividendo = 0, valor = 0, flujoExtra = 0;
    productos.forEach(p => {
      const e = idxPorProd[p.id][fecha];
      if (e) {
        manual    += e.manual    || 0;
        saveback  += e.saveback  || 0;
        roundup   += e.roundup   || 0;
        dividendo += e.dividendo || 0;
        // Primera entrada de un producto: lo que vale por encima de su aportación
        // es una posición previa que se incorpora, no una revalorización del mes.
        if (!(p.id in lastValor)) flujoExtra += (e.valor || 0) - aportTotal(e);
        lastValor[p.id] = e.valor || 0;
      }
      valor += lastValor[p.id] || 0;
    });
    return { id: fecha, fecha, manual, saveback, roundup, dividendo, valor, flujoExtra };
  });

  const res = calcStats(filas);
  _statsTotalCache = { cartera, filas: res };
  return res;
}

// Newton-Raphson XIRR para un guess inicial; null si no converge o no es razonable.
function _xirrSingle(days, amts, guess) {
  let r = guess;
  for (let i = 0; i < 80; i++) {
    let f = 0, df = 0;
    for (let j = 0; j < amts.length; j++) {
      const exp  = days[j] / 365;
      const base = 1 + r;
      if (base <= 0) { r = -0.999; break; }
      const v = amts[j] / Math.pow(base, exp);
      f  += v;
      df += -exp * v / base;
    }
    if (Math.abs(df) < 1e-12) return null;
    const rNew = r - f / df;
    if (!isFinite(rNew)) return null;
    if (Math.abs(rNew - r) < 1e-7) return rNew;
    r = rNew;
    if (r < -0.9999) r = -0.9999;
  }
  return null;
}

// Prueba varios guesses iniciales para robustez y filtra resultados absurdos.
function xirr(flows) {
  if (!flows || flows.length < 2) return null;
  const t0   = flows[0].date.getTime();
  const days = flows.map(f => (f.date.getTime() - t0) / 86400000);
  const amts = flows.map(f => f.amount);
  if (!amts.some(a => a > 0) || !amts.some(a => a < 0)) return null;

  const guesses = [0.1, 0.0, -0.1, 0.05, 0.3, -0.3, 0.5];
  for (const g of guesses) {
    const r = _xirrSingle(days, amts, g);
    // Cotas razonables: TIR entre −99% y +1000% anual (los valores fuera de aquí casi
    // siempre son artefactos numéricos, no realidades financieras).
    if (r != null && r > -0.999 && r < 10) return r;
  }
  return null;
}

export function calcTIR(entradas) {
  if (!entradas?.length) return null;
  const entradasOrd = [...entradas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const flows = entradasOrd.map((e, i) => {
    const [y, m] = e.fecha.split("-").map(Number);
    // La posición previa es una entrada de capital más: sin ella la TIR la
    // contaba como rentabilidad. La renta cobrada es dinero que vuelve al
    // inversor: TIR de rentabilidad total.
    return { date: new Date(y, m - 1, 1), amount: -(aportTotal(e) + posicionPrevia(e, i)) + (e.dividendo || 0) };
  });
  const ult = entradasOrd[entradasOrd.length - 1];
  const [y, m] = ult.fecha.split("-").map(Number);
  flows.push({ date: new Date(y, m - 1, 1), amount: ult.valor });
  return xirr(flows);
}

// Tasa mensual equivalente a una tasa anual EFECTIVA (como la que da XIRR).
// tasa/12 capitalizaría de más: 10% anual → 10,47% efectivo.
export const tasaMensualEq = (tasaAnual) => tasaAnual > -1 ? Math.pow(1 + tasaAnual, 1 / 12) - 1 : -1;

// Proyecciones con la rentabilidad histórica: con pocos meses la TIR es ruido
// (2 meses al +5% → un 80% anual proyectado a 40 años). Se exige un historial
// mínimo y la tasa se acota a un rango creíble para el largo plazo.
export const PROY_MESES_MIN = 12;
export const PROY_TASA_MAX  = 0.15;
export const PROY_TASA_MIN  = -0.10;

// Meses entre la primera y la última fecha (ambas incluidas)
export function mesesHistorial(filas) {
  if (!filas?.length) return 0;
  const [y0, m0] = filas[0].fecha.split("-").map(Number);
  const [y1, m1] = filas.at(-1).fecha.split("-").map(Number);
  return (y1 - y0) * 12 + (m1 - m0) + 1;
}

// { tasa, tir, meses, acotada, insuficiente }: tasa = null si el historial no basta
export function tasaProyeccion(filas, tir = calcTIR(filas)) {
  const meses = mesesHistorial(filas);
  if (tir == null || meses < PROY_MESES_MIN) return { tasa: null, tir, meses, acotada: false, insuficiente: true };
  const tasa = Math.min(PROY_TASA_MAX, Math.max(PROY_TASA_MIN, tir));
  return { tasa, tir, meses, acotada: tasa !== tir, insuficiente: false };
}

// Media mensual del Monte Carlo acotada al mismo rango anual que tasaProyeccion
export function acotarMediaMensual(media) {
  return Math.min(tasaMensualEq(PROY_TASA_MAX), Math.max(tasaMensualEq(PROY_TASA_MIN), media));
}

export function calcProyeccion(valorInicial, aportacionMensual, anos, tasaAnual) {
  const tasaMensual = tasaMensualEq(tasaAnual);
  const meses       = anos * 12;
  const puntos      = [];
  let valor    = valorInicial;
  let aportado = valorInicial;
  const h = new Date();
  for (let m = 0; m <= meses; m++) {
    const fecha = new Date(h.getFullYear(), h.getMonth() + m, 1);
    if (m === 0 || fecha.getMonth() === 0 || m === meses) {
      puntos.push({
        label:    m === 0 ? "Hoy" : `${fecha.getFullYear()}`,
        valor:    Math.round(valor),
        aportado: Math.round(aportado)
      });
    }
    if (m < meses) {
      valor    = valor * (1 + tasaMensual) + aportacionMensual;
      aportado += aportacionMensual;
    }
  }
  return puntos;
}

export function agruparPorAno(filas) {
  if (!filas?.length) return [];
  const map = {};
  filas.forEach(f => {
    const y = f.fecha.slice(0, 4);
    if (!map[y]) map[y] = { ano: y, aportadoAno: 0, valorFin: 0, ultimoAcum: 0, fechas: [] };
    map[y].aportadoAno += f.aportacion;
    map[y].valorFin     = f.valor;
    map[y].ultimoAcum   = f.acumAportado;
    map[y].fechas.push(f);
  });
  return Object.values(map).map(g => {
    const ganancia = g.valorFin - g.ultimoAcum;
    const rentPct  = g.ultimoAcum > 0 ? (ganancia / g.ultimoAcum) * 100 : 0;
    // Rentabilidad del año time-weighted: encadena las rentabilidades mensuales
    // (Modified Dietz), que ya descuentan las aportaciones de cada mes.
    const conRent  = g.fechas.filter(f => f.rentMes != null);
    const rentAno  = conRent.length
      ? (conRent.reduce((acc, f) => acc * (1 + f.rentMes / 100), 1) - 1) * 100
      : null;
    return { ...g, ganancia, rentPct, rentAno, meses: g.fechas.length };
  });
}

export function calcMaxDrawdown(filas) {
  if (!filas || filas.length < 2) return null;
  let peak = -Infinity, maxDd = 0;
  for (const f of filas) {
    if (f.valor > peak) peak = f.valor;
    if (peak > 0) {
      const dd = (peak - f.valor) / peak * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function calcVolatilidad(filas) {
  const rents = filas.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (rents.length < 3) return null;
  const mean = rents.reduce((s, v) => s + v, 0) / rents.length;
  const variance = rents.reduce((s, v) => s + (v - mean) ** 2, 0) / (rents.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

export function calcSharpe(filas, tirAnual) {
  if (tirAnual == null) return null;
  const vol = calcVolatilidad(filas);
  if (!vol) return null;
  return (tirAnual * 100) / vol;
}

// Sortino: como Sharpe pero solo penaliza la desviación negativa.
// downside-deviation = sqrt(mean(min(r, 0)^2)) sobre rentabilidades mensuales (%).
export function calcSortino(filas, tirAnual) {
  if (tirAnual == null) return null;
  const rents = filas.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (rents.length < 3) return null;
  const downsq = rents.map(r => r < 0 ? r * r : 0).reduce((s, v) => s + v, 0);
  const downDev = Math.sqrt(downsq / rents.length) * Math.sqrt(12);   // anualizada
  if (downDev === 0) return null;   // no hay meses negativos → indefinido
  return (tirAnual * 100) / downDev;
}

// Encuentra el mes con mayor rentabilidad positiva. Devuelve { rent, fecha } o null.
export function calcMejorMes(filas) {
  let best = null;
  for (const f of filas) {
    if (f.rentMes == null) continue;
    if (!best || f.rentMes > best.rentMes) best = { rentMes: f.rentMes, fecha: f.fecha };
  }
  return best;   // puede ser <= 0; la UI decide cómo mostrarlo
}

// Racha máxima de meses consecutivos con rentabilidad positiva (rentMes > 0).
export function calcRachaMaxPositiva(filas) {
  let max = 0, cur = 0;
  for (const f of filas) {
    if (f.rentMes == null) continue;
    if (f.rentMes > 0) { cur++; if (cur > max) max = cur; }
    else cur = 0;
  }
  return max;
}

// Media de la aportación total mensual (manual + saveback + roundup).
// Por defecto sobre los últimos N meses con dato; si N <= 0 usa toda la serie.
export function calcAportacionMedia(filas, n = 3) {
  if (!filas.length) return null;
  const subset = n > 0 ? filas.slice(-n) : filas;
  if (!subset.length) return null;
  const total = subset.reduce((s, f) => s + (f.aportacion || 0), 0);
  return total / subset.length;
}

// % de la aportación acumulada que viene de Saveback + Round-up (vs Manual).
export function calcDCAAutomatico(ultima) {
  if (!ultima) return null;
  const auto = (ultima.acumSaveback || 0) + (ultima.acumRoundup || 0);
  // Sobre lo aportado mes a mes (sin la posición previa de los productos)
  const tot  = (ultima.acumManual || 0) + auto;
  if (tot <= 0) return null;
  return (auto / tot) * 100;
}

// Series normalizadas base 100 por producto. Cada punto = valor / aportado_acumulado × 100.
// 100 = empate (valor = aportado). >100 ganancia, <100 pérdida.
// Esta normalización es la correcta para DCA: aísla la rentabilidad real del
// "tamaño de la posición". El acumulado de aportes se calcula desde el inicio
// del historial del producto; el `periodo` solo filtra los meses visibles.
export function calcCrecimientoNormalizado(cartera, periodo) {
  const { productos } = cartera;
  const entradas = Object.fromEntries(productos.map(p => [p.id, entradasEUR(cartera, p)]));
  const allMonths = new Set();
  productos.forEach(p => {
    (entradas[p.id] || []).forEach(e => allMonths.add(e.fecha));
  });
  let labels = [...allMonths].sort();
  if (labels.length) {
    const cutoff = calcCutoff(labels.at(-1), periodo);
    if (cutoff) labels = labels.filter(m => m >= cutoff);
  }
  if (!labels.length) return { labels: [], datasets: [] };

  const datasets = productos.map(p => {
    const ents = (entradas[p.id] || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!ents.length) return null;
    let acumAport = 0;
    const byMonth = {};
    // Acumulamos desde el principio para no falsear el ratio al filtrar
    ents.forEach((e, i) => {
      acumAport += aportTotal(e) + posicionPrevia(e, i);
      if (acumAport > 0 && Number.isFinite(e.valor)) {
        byMonth[e.fecha] = (e.valor / acumAport) * 100;
      }
    });
    if (!Object.keys(byMonth).length) return null;
    const data = labels.map(m => byMonth[m] ?? null);
    if (data.every(v => v == null)) return null;   // producto sin datos en el rango filtrado
    return {
      label: p.nombre,
      data,
      borderColor: p.color,
      backgroundColor: p.color + "1A",
      tension: 0.25,
      spanGaps: true,
      pointRadius: 0,
      borderWidth: 2,
      fill: false,
    };
  }).filter(Boolean);
  return { labels: labels.map(labelMes), datasets };
}

// Contribución de cada producto a la ganancia (€). Aísla la ganancia de mercado:
//   • periodo "all": ganancia lifetime = valor_actual - aportado_total
//   • periodo filtrado: ganancia_periodo = valor_fin - valor_inicio - aportes_durante
// Orden descendente (más a más).
export function calcContribucionGanancia(cartera, periodo) {
  const { productos } = cartera;
  const entradas = Object.fromEntries(productos.map(p => [p.id, entradasEUR(cartera, p)]));
  return productos.map(p => {
    const ents = (entradas[p.id] || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!ents.length) return null;
    let aportado, valor, ganancia;
    const cutoff = calcCutoff(ents.at(-1).fecha, periodo);
    if (!cutoff) {
      // Lifetime
      aportado = ents.reduce((s, e, i) => s + aportTotal(e) + posicionPrevia(e, i), 0);
      valor    = ents.at(-1).valor;
      ganancia = valor - aportado;
    } else {
      const inPeriod = ents.filter(e => e.fecha >= cutoff);
      if (!inPeriod.length) return null;
      const before = ents.filter(e => e.fecha < cutoff);
      const valorInicial = before.length ? before.at(-1).valor : 0;
      valor    = inPeriod.at(-1).valor;
      // Si el producto empieza dentro del periodo, su posición previa es capital
      aportado = inPeriod.reduce((s, e) => s + aportTotal(e), 0) + (before.length ? 0 : posicionPrevia(ents[0], 0));
      // Ganancia de mercado en el periodo (revalorización, excluye aportes nuevos)
      ganancia = valor - valorInicial - aportado;
    }
    return {
      id: p.id, nombre: p.nombre, color: p.color,
      aportado, valor, ganancia,
    };
  }).filter(Boolean).sort((a, b) => b.ganancia - a.ganancia);
}

// Aportaciones agregadas por año (Manual + Saveback + Round-up). Orden
// descendente: año más reciente primero (para que aparezca arriba en bar horizontal).
export function calcAportacionesPorAno(cartera) {
  const { productos } = cartera;
  const entradas = Object.fromEntries(productos.map(p => [p.id, entradasEUR(cartera, p)]));
  const byYear = {};
  productos.forEach(p => {
    (entradas[p.id] || []).forEach(e => {
      const year = (e.fecha || "").slice(0, 4);
      if (!year) return;
      if (!byYear[year]) byYear[year] = { manual: 0, saveback: 0, roundup: 0 };
      byYear[year].manual   += +e.manual   || 0;
      byYear[year].saveback += +e.saveback || 0;
      byYear[year].roundup  += +e.roundup  || 0;
    });
  });
  return Object.entries(byYear)
    .sort((a, b) => b[0].localeCompare(a[0]))   // descendente: 2026, 2025, ...
    .map(([year, d]) => ({ year, ...d, total: d.manual + d.saveback + d.roundup }));
}

// PRNG determinista (mulberry32): con la misma semilla el Monte Carlo da las
// mismas cifras en cada render, en lugar de P5/P50/P95 que "bailan".
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: muestra de N(0,1)
function randomNormal(rnd = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Simula `nSims` trayectorias con retornos normales N(mediaMensual, stdMensual).
// Devuelve array de trayectorias (cada una tiene meses+1 valores).
export function simulateMonteCarlo({ valorInicial, aportMensual, meses, mediaMensual, stdMensual, nSims, seed = 20240601 }) {
  const rnd = mulberry32(seed);
  const trayectorias = new Array(nSims);
  for (let s = 0; s < nSims; s++) {
    const path = new Float64Array(meses + 1);
    path[0] = valorInicial;
    let v = valorInicial;
    for (let m = 1; m <= meses; m++) {
      const ret = mediaMensual + stdMensual * randomNormal(rnd);
      v = v * (1 + ret) + aportMensual;
      if (v < 0) v = 0;   // cartera no puede ir bajo cero
      path[m] = v;
    }
    trayectorias[s] = path;
  }
  return trayectorias;
}

// Memoria de los últimos resultados del Monte Carlo: son ~1 millón de pasos
// aleatorios más la ordenación de percentiles, y se repetían en cada render
// (llegada de un precio, marcar un producto…) aunque sus parámetros no cambiasen.
// `clave` debe incluir TODOS los parámetros del cálculo.
const _memoMC = new Map();
export function memoMonteCarlo(clave, calcular) {
  if (_memoMC.has(clave)) return _memoMC.get(clave);
  const v = calcular();
  _memoMC.set(clave, v);
  if (_memoMC.size > 6) _memoMC.delete(_memoMC.keys().next().value);
  return v;
}

// Para cada mes, calcula los percentiles de las trayectorias.
export function percentilesPorMes(trayectorias, percentiles) {
  const meses = trayectorias[0].length;
  const nSims = trayectorias.length;
  const buf   = new Float64Array(nSims);
  const out   = percentiles.map(() => new Array(meses));
  for (let m = 0; m < meses; m++) {
    for (let s = 0; s < nSims; s++) buf[s] = trayectorias[s][m];
    buf.sort();
    percentiles.forEach((p, i) => {
      const idx = Math.min(Math.floor(nSims * p / 100), nSims - 1);
      out[i][m] = buf[idx];
    });
  }
  return out;
}

// Cuenta meses consecutivos hacia atrás partiendo del último, sobre un set de fechas YYYY-MM.
function streakMeses(fechasDesc) {
  if (!fechasDesc.length) return 0;
  let streak = 1;
  let [py, pm] = fechasDesc[0].split("-").map(Number);
  for (let i = 1; i < fechasDesc.length; i++) {
    const [y, m] = fechasDesc[i].split("-").map(Number);
    let expM = pm - 1, expY = py;
    if (expM < 1) { expM = 12; expY--; }
    if (y === expY && m === expM) { streak++; py = y; pm = m; }
    else break;
  }
  return streak;
}

// Calcula el streak de un producto (entradas con aportTotal > 0). Un mes
// registrado con aportación 0 corta la racha, también si es el último: antes
// se filtraba y la racha seguía contando desde el mes anterior.
export function calcStreakProducto(entradas) {
  const desc = [...(entradas || [])].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const fechas = [];
  for (const e of desc) {
    if (aportTotal(e) <= 0) break;
    fechas.push(e.fecha);
  }
  return streakMeses(fechas);
}

// Streak global de la cartera: meses consecutivos en los que al menos un producto aportó.
export function calcStreakTotal({ productos, entradas }) {
  const set = new Set();
  productos.forEach(p => (entradas[p.id] || []).forEach(e => {
    if (aportTotal(e) > 0) set.add(e.fecha);
  }));
  return streakMeses([...set].sort().reverse());
}

// Coste fiscal por el método del coste medio. Una retirada (aportación total
// negativa) vende una parte de la posición: sale la parte PROPORCIONAL del
// coste, no el importe vendido (antes la plusvalía de esa venta desaparecía y la
// latente quedaba inflada). El valor antes de la venta ≈ valor del mes + retirada.
// La posición previa (primer mes) entra al coste por su valor al registrarla.
// Devuelve { coste, realizada, realizadaPorAno: { "2026": € } }.
export function calcCosteMedio(entradas) {
  let coste = 0, realizada = 0;
  const realizadaPorAno = {};
  [...(entradas || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((e, i) => {
    const ap = aportTotal(e);
    if (i === 0) { coste += ap + posicionPrevia(e, 0); return; }
    if (ap >= 0) { coste += ap; return; }
    const venta = -ap;
    const valorAntes = (e.valor || 0) + venta;
    const frac = valorAntes > 0 ? Math.min(1, venta / valorAntes) : 1;
    const costeVendido = coste * frac;
    const plus = venta - costeVendido;
    coste -= costeVendido;
    realizada += plus;
    const y = e.fecha.slice(0, 4);
    realizadaPorAno[y] = (realizadaPorAno[y] || 0) + plus;
  });
  return { coste, realizada, realizadaPorAno };
}

// Productos con meses sin registrar, para el aviso "Pendiente" del Total y el
// punto del botón Cierre. Solo productos con historial anterior al mes:
//   • mes anterior: si no lo tienen (se lo saltaron), cualquier día;
//   • mes en curso: desde el día `desdeDia` (el valor se suele apuntar a fin de mes).
// Devuelve [{ mes, productos: [{ id, nombre }] }], el mes anterior primero.
export function calcPendientes({ productos, entradas }, mesActual, dia, desdeDia = 25) {
  const [y, m] = mesActual.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const mesAnterior = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const falta = (mes) => productos
    .filter(p => {
      const fechas = (entradas[p.id] || []).map(e => e.fecha);
      return fechas.some(f => f < mes) && !fechas.includes(mes);
    })
    .map(p => ({ id: p.id, nombre: p.nombre }));
  const out = [];
  const ant = falta(mesAnterior);
  if (ant.length) out.push({ mes: mesAnterior, productos: ant });
  if (dia >= desdeDia) {
    const act = falta(mesActual);
    if (act.length) out.push({ mes: mesActual, productos: act });
  }
  return out;
}

// Impuesto por tramos de la base del ahorro (tabla única FISCAL_TRAMOS_2026).
// Aplica a plusvalías y rendimientos del capital mobiliario.
export function calcImpuestoTramos(baseEur) {
  if (!Number.isFinite(baseEur) || baseEur <= 0) return 0;
  let restante = baseEur;
  let total = 0, prev = 0;
  for (const t of FISCAL_TRAMOS_2026) {
    if (restante <= 0) break;
    const ancho = Math.min(restante, t.hasta - prev);
    total += ancho * t.tipo;
    restante -= ancho;
    prev = t.hasta;
    if (!Number.isFinite(t.hasta)) break;
  }
  return total;
}

// Impuesto sobre una plusvalía (alias con el nombre que usan las vistas)
export function calcImpuestoPlusvalia(ganancia) {
  return calcImpuestoTramos(ganancia);
}

// Tipo medio efectivo (impuesto / ganancia bruta). Útil para mostrar contexto.
export function tipoMedioEfectivo(ganancia) {
  if (ganancia <= 0) return 0;
  return calcImpuestoPlusvalia(ganancia) / ganancia;
}

// Coste anual estimado por producto: TER × valor actual + comisión de compra ×
// nº de aportaciones de los últimos 12 meses. Solo productos con algún coste definido.
export function calcCostes(cartera) {
  const { productos } = cartera;
  const entradas = Object.fromEntries(productos.map(p => [p.id, entradasEUR(cartera, p)]));
  const items = productos.map(p => {
    const ter = +p.ter || 0;
    const com = +p.comisionCompra || 0;
    if (ter <= 0 && com <= 0) return null;
    const ents  = [...(entradas[p.id] || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ult   = ents.at(-1);
    const valor = ult?.valor || 0;
    const desde = ult ? calcCutoff(ult.fecha, "1y") : null;
    const nAport12m = ents.filter(e => (!desde || e.fecha >= desde) && aportTotal(e) > 0).length;
    const costeTer = valor * ter / 100;
    const costeCom = nAport12m * com;
    return { id: p.id, nombre: p.nombre, color: p.color, valor, ter, com, nAport12m, costeTer, costeCom, coste: costeTer + costeCom };
  }).filter(Boolean);
  const valorCartera = productos.reduce((s, p) => {
    const ents = [...(entradas[p.id] || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
    return s + (ents.at(-1)?.valor || 0);
  }, 0);
  const costeTotal  = items.reduce((s, i) => s + i.coste, 0);
  const conTer      = items.filter(i => i.ter > 0 && i.valor > 0);
  const valorConTer = conTer.reduce((s, i) => s + i.valor, 0);
  const terPonderado = valorConTer > 0
    ? conTer.reduce((s, i) => s + i.valor * i.ter, 0) / valorConTer
    : null;
  return { items, costeTotal, terPonderado, valorCartera };
}

// Devuelve la fecha de corte (YYYY-MM) para un periodo dado tomando como
// referencia `ultFecha`. periodo: "all"|"3m"|"6m"|"9m"|"ytd"|"1y"|"2y"|"3y"|"5y".
// Devuelve null si el periodo es "all" o no aplica.
function calcCutoff(ultFecha, periodo) {
  if (!ultFecha || periodo === "all" || !periodo) return null;
  const [uy, um] = ultFecha.split("-").map(Number);
  let cy = uy, cm = um;
  if      (periodo === "3m") cm -= 2;   // últimos 3 meses incluyendo el actual
  else if (periodo === "6m") cm -= 5;
  else if (periodo === "9m") cm -= 8;
  else if (periodo === "1y") cm -= 11;
  else if (periodo === "2y") cm -= 23;
  else if (periodo === "3y") cm -= 35;
  else if (periodo === "5y") cm -= 59;
  else if (periodo === "ytd") { cm = 1; cy = uy; }
  while (cm <= 0) { cm += 12; cy--; }
  return `${cy}-${String(cm).padStart(2,"0")}`;
}

// Filtra filas por periodo. periodo: "all" | "3m" | "6m" | "ytd" | "1y" | "2y" | "3y" | "5y"
export function filtrarFilas(filas, periodo) {
  if (!filas?.length) return filas;
  const cutoff = calcCutoff(filas.at(-1).fecha, periodo);
  if (!cutoff) return filas;
  return filas.filter(f => f.fecha >= cutoff);
}
