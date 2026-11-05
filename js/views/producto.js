import { bindCommon } from "../bindings.js";
import { agruparPorAno, calcAportacionMedia, calcCosteMedio, calcPendientes, divisasSinTipo, entradasEUR, calcAportacionesPorAno, calcContribucionGanancia, calcCostes, calcCrecimientoNormalizado, calcDCAAutomatico, calcImpuestoPlusvalia, calcMaxDrawdown, calcMejorMes, calcRachaMaxPositiva, calcSharpe, calcSortino, calcStats, calcStreakProducto, calcStreakTotal, calcTIR, calcVolatilidad, filtrarFilas, statsTotalCalc, tipoMedioEfectivo } from "../calc.js";
import { drawChartAportPorAno, drawChartContribucion, drawChartGrowth, drawChartHistograma, drawChartPeso, drawChartRent, drawChartTirComp, drawChartValor } from "../charts.js";
import { MESES } from "../config.js";
import { getProductPriceSync, priceAgeLabel, priceSourceLabel } from "../precios.js";
import { state } from "../state.js";
import { $, esc, fmt, fmtDiv, fmtE, hoy, iniciales, labelMes } from "../utils.js";
import { renderObjetivos } from "./fiscal.js";
import { getAccentColor, render } from "./render.js";

// Importes de la vista: en un producto, en su divisa; en el Total y en lo
// fiscal, en euros (fmtE). Se fija al empezar cada render.
let fmtM = fmtE;

// Piezas de la vista (estilo lista: etiqueta a la izquierda, cifra a la derecha)
const tipHTML = (l, tip) => tip
  ? `<span class="kpi-info" tabindex="0" role="button" aria-label="Información sobre ${esc(l)}" data-tip="${esc(tip)}">i</span>` : "";
const datoHTML = (k) => `
  <div class="dato">
    <span class="dato-l">${esc(k.l)}${tipHTML(k.l, k.tip)}</span>
    <span class="dato-v"><span style="color:${k.c || "var(--text)"}">${k.v}</span>${k.s ? `<span class="dato-s">${k.s}</span>` : ""}</span>
  </div>`;
const signo  = (v) => v >= 0 ? "+" : "−";
const pctTxt = (v) => `${signo(v)}${fmt(Math.abs(v))} %`;
const colorG = (v) => v >= 0 ? "var(--green)" : "var(--red)";
const CHEVRON = `<svg class="pl-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
// Sección plegable: la información secundaria sigue ahí, sin ocupar pantalla
const plegable = (titulo, resumen, contenido) => `
  <details class="plegable">
    <summary><span class="pl-tit">${titulo}${resumen ? `<span class="pl-sub">${resumen}</span>` : ""}</span>${CHEVRON}</summary>
    <div class="pl-body">${contenido}</div>
  </details>`;

export function renderTabActual() {
  const accent   = getAccentColor();
  const esTotal  = state.tab === "total";
  const prod     = state.productos.find(p => p.id === state.tab);
  if (!esTotal && !prod) {   // tab huérfano (producto eliminado/no importado)
    state.tab = "total";
    render();
    return;
  }
  const enOtraDivisa = !esTotal && prod.divisa && prod.divisa !== "EUR";
  fmtM = enOtraDivisa ? (n) => fmtDiv(n, prod.divisa) : fmtE;
  const filasFull = esTotal ? statsTotalCalc(state) : calcStats(state.entradas[state.tab] || []);
  // Filtro temporal: solo afecta display (tablas, charts, heatmap).
  // Las cifras de cabecera siguen usando la última entrada para mantener el valor actual coherente.
  const filas    = filtrarFilas(filasFull, state.filtroPeriodo);
  const ultima   = filasFull[filasFull.length - 1];
  const anterior = filasFull.length > 1 ? filasFull[filasFull.length - 2] : null;
  const varMes   = ultima && anterior ? ultima.valor - anterior.valor : null;

  let tirActual = null;
  if (esTotal) {
    // Filas completas: incluyen flujoExtra (posición previa), que calcTIR necesita
    tirActual = calcTIR(filasFull);
  } else {
    tirActual = calcTIR(state.entradas[state.tab] || []);
  }
  // Streak (basado en datos completos, no afectado por filtro)
  const streak = esTotal ? calcStreakTotal(state) : calcStreakProducto(state.entradas[state.tab] || []);

  // Línea de metadatos sobre la cifra principal
  let meta;
  if (esTotal) {
    const sinTipo = divisasSinTipo(state);
    meta = "Valor de la cartera" + (sinTipo.length
      ? ` <span class="aviso-divisa" title="Sin conexión con el BCE todavía">· ⚠ ${esc(sinTipo.join(", "))} sin tipo de cambio: se suma como euros</span>` : "");
  } else {
    const parts = [];
    if (prod.tipologia)  parts.push(esc(prod.tipologia));
    if (prod.divisa)     parts.push(esc(prod.divisa) + (enOtraDivisa && !state.tiposCambio[prod.divisa] ? " (sin tipo de cambio)" : ""));
    if (Number.isFinite(+prod.unidades) && +prod.unidades > 0) {
      parts.push(`${(+prod.unidades).toLocaleString("es-ES", { maximumFractionDigits: 8 })} u`);
    }
    const price = getProductPriceSync(prod);
    if (price) {
      const fuente = price.source === "manual"
        ? "manual"
        : `${priceSourceLabel(price.source)} · ${priceAgeLabel(price.ts)}`;
      parts.push(`<span title="Precio unitario actual">${fmtE(price.eur)}/u (${fuente})</span>`);
    }
    if (prod.referencia) parts.push(`<span class="sub-ref">${esc(prod.referencia)}</span>`);
    meta = parts.join(" · ") || esc(prod.nombre);
  }
  const comentariosHTML = !esTotal && prod.comentarios
    ? `<div class="prod-coment">${esc(prod.comentarios)}</div>`
    : "";

  const PERIODOS = [
    { id: "3m",  l: "3M"   },
    { id: "6m",  l: "6M"   },
    { id: "9m",  l: "9M"   },
    { id: "ytd", l: "YTD"  },
    { id: "1y",  l: "1A"   },
    { id: "2y",  l: "2A"   },
    { id: "3y",  l: "3A"   },
    { id: "5y",  l: "5A"   },
    { id: "all", l: "Todo" },
  ];

  // Acciones del producto: nueva entrada (principal), calculadora y editar.
  // Eliminar va al final de la vista, lejos del pulgar.
  const accionesHTML = !esTotal ? `
    <div class="prod-acts">
      <button class="btn-accion" id="btnNuevaEntradaProd" style="background:${accent}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva entrada</button>
      <button class="btn-icon" id="btnCalcProd" title="Calculadora" aria-label="Abrir calculadora"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/></svg></button>
      <button class="btn-icon" id="btnEditProd" title="Editar producto" aria-label="Editar producto"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
    </div>` : "";
  const eliminarHTML = !esTotal
    ? `<button class="fila-peligro" id="btnDelProd">Eliminar producto</button>` : "";

  if (!filasFull.length) {
    $("#main").innerHTML = `
      <section class="hero">
        <div class="hero-meta">${meta}</div>
        <div class="hero-valor">${fmtM(0)}</div>
        ${comentariosHTML}
      </section>
      ${accionesHTML}
      <div class="empty">
        <div class="empty-title">Sin entradas aún</div>
        <div class="empty-sub">${esTotal ? "Crea un producto desde Más y registra su primer mes con +" : "Pulsa «Nueva entrada» para registrar el primer mes"}</div>
      </div>
      ${eliminarHTML}`;
    bindCommon();
    return;
  }

  // ── Cabecera: valor, ganancia total y resultado del mes ──
  const tipAportado = `Desglose del total aportado:\n• Manual: ${fmtM(ultima.acumManual)}\n• Saveback: ${fmtM(ultima.acumSaveback)}\n• Round-up: ${fmtM(ultima.acumRoundup)}`
    + (Math.abs(ultima.acumPrevia) >= 0.01 ? `\n• Posición previa (valor al empezar a registrar por encima de lo aportado ese mes): ${fmtM(ultima.acumPrevia)}` : "");
  let html = `
    <section class="hero">
      <div class="hero-meta">${meta}</div>
      <div class="hero-valor">${fmtM(ultima.valor)}</div>
      <div class="hero-gan" style="color:${colorG(ultima.ganancia)}">${ultima.ganancia >= 0 ? "▲" : "▼"} ${fmtM(Math.abs(ultima.ganancia))} · ${pctTxt(ultima.rentPct)} <span class="hero-nota">desde el inicio</span></div>
      <div class="hero-sub">
        Este mes ${varMes != null ? `<b style="color:${colorG(varMes)}">${varMes >= 0 ? "+" : "−"}${fmtM(Math.abs(varMes))}</b>` : "<b>—</b>"}
        · Aportado ${fmtM(ultima.acumAportado)}${tipHTML("Aportado", tipAportado)}
      </div>
      ${comentariosHTML}
    </section>`;

  // ── Pendiente (Total): meses sin registrar → abre el Cierre de ese mes ──
  if (esTotal) {
    calcPendientes(state, hoy(), new Date().getDate()).forEach(({ mes, productos }) => {
      html += `<button class="aviso-pendiente" data-cierre-mes="${mes}">
        <span class="ap-icono" aria-hidden="true">!</span>
        <span class="ap-cuerpo"><span class="ap-tit">Pendiente de ${labelMes(mes)}</span>
          <span class="ap-sub">${productos.map(p => esc(p.nombre)).join(", ")}</span></span>
        <span class="ap-accion">Registrar</span>
      </button>`;
    });
  }

  // Si el filtro de periodo deja menos de 2 entradas, los gráficos de líneas
  // quedan en blanco (pointRadius: 0 + sin línea). Mostramos un placeholder.
  const sparseFilter = filas.length < 2;
  const emptyChart = `<div class="empty" style="padding:36px 0">
    <div class="empty-title">Sin datos en este periodo</div>
    <div class="empty-sub">Elige «Todo» o un rango más amplio</div>
  </div>`;

  // ── Gráfico principal (valor vs aportado) y periodo, que aplica a gráficos e historial ──
  html += `
    <section class="hero-chart" aria-label="Valor real frente a lo aportado">
      ${sparseFilter ? emptyChart : `<div class="chart-box tall"><canvas id="chartValor"></canvas></div>
      <div class="chart-leyenda"><span><i style="background:${accent}"></i>Valor real</span><span><i class="discontinua"></i>Aportado</span></div>`}
      <div class="filter-period" role="group" aria-label="Periodo">
        ${PERIODOS.map(p => `<button class="${state.filtroPeriodo===p.id?"active":""}" data-period="${p.id}" ${state.filtroPeriodo===p.id ? 'aria-pressed="true"' : ""}>${p.l}</button>`).join("")}
      </div>
    </section>
    ${accionesHTML}`;

  // ── Posiciones (Total): una fila por producto con peso y rentabilidad ──
  if (esTotal) {
    const posiciones = state.productos.map(p => {
      const st = calcStats(entradasEUR(state, p));   // en euros, como el total
      const u  = st.at(-1);
      return { p, valor: u?.valor || 0, rent: u ? u.rentPct : null, tiene: !!u };
    });
    const totalValor = posiciones.reduce((s, x) => s + x.valor, 0);
    html += `<section class="panel">
      <div class="panel-title">Posiciones <span class="panel-aux">Peso · rentab.</span></div>
      <div class="lista">
        ${posiciones.map(({ p, valor, rent, tiene }) => `
          <button class="posicion" data-ir="${esc(p.id)}">
            <span class="avatar" style="background:${p.color}26;color:${p.color}">${esc(iniciales(p.nombre))}</span>
            <span class="pos-cuerpo">
              <span class="pos-nombre">${esc(p.nombre)}</span>
              <span class="pos-sub">${totalValor > 0 ? `${fmt(valor / totalValor * 100, 1)} %` : "—"}${p.tipologia ? ` · ${esc(p.tipologia)}` : ""}${p.divisa && p.divisa !== "EUR" ? ` · ${esc(p.divisa)} en €` : ""}</span>
            </span>
            <span class="pos-cifras">
              <span class="pos-valor">${tiene ? fmtE(valor) : "Sin entradas"}</span>
              ${rent != null ? `<span class="pos-sub" style="color:${colorG(rent)}">${pctTxt(rent)}</span>` : ""}
            </span>
          </button>`).join("")}
      </div>
    </section>`;
  }

  // ── Rendimiento: lista de indicadores con su explicación (i) ──
  const mejorMes   = calcMejorMes(filasFull);
  const aportMedia = calcAportacionMedia(filasFull, 3);
  const racha      = calcRachaMaxPositiva(filasFull);
  const dcaAuto    = calcDCAAutomatico(ultima);
  const rendimiento = [
    { l: "TIR anualizada",
      v: tirActual != null ? pctTxt(tirActual * 100) : "—",
      s: tirActual != null ? `XIRR · ${filasFull.length} meses` : "Datos insuficientes",
      c: tirActual == null ? "var(--dimmer)" : colorG(tirActual),
      tip: "Tasa Interna de Retorno anualizada (XIRR). Pondera el momento exacto de cada aportación. Es la rentabilidad anual constante que habría producido el mismo resultado que tu historial real. Incluye las rentas cobradas (dividendos y cupones)." },
    { l: "Mejor mes",
      v: mejorMes != null ? pctTxt(mejorMes.rentMes) : "—",
      s: mejorMes != null ? labelMes(mejorMes.fecha) : "Sin datos suficientes",
      c: mejorMes == null ? "var(--dimmer)" : colorG(mejorMes.rentMes),
      tip: "Mayor rentabilidad mensual registrada. Útil para contextualizar las caídas: cuando aparezca un mes muy malo, este dato te recuerda que también puede haber meses muy buenos en la otra dirección." },
    { l: "Aportación media",
      v: aportMedia != null ? fmtM(aportMedia) : "—",
      s: aportMedia != null ? `Últimos ${Math.min(3, filasFull.length)} meses` : "Sin datos",
      tip: "Aportación total mensual media (manual + saveback + round-up) de los últimos meses. Mide tu ritmo real de DCA." },
    { l: "Racha al alza",
      v: racha > 0 ? `${racha} ${racha === 1 ? "mes" : "meses"}` : "—",
      s: racha > 0 ? "Máx. meses seguidos en positivo" : "Aún no hay rachas",
      c: racha === 0 ? "var(--red)" : (racha > 5 ? "var(--green)" : racha >= 3 ? "var(--yellow)" : "var(--text)"),
      tip: "Mayor número de meses consecutivos cerrando en positivo. Indicador del 'mejor tramo' que ha tenido el producto." },
    { l: "Racha aportando",
      v: streak > 0 ? `${streak} ${streak === 1 ? "mes" : "meses"} seguidos` : "—",
      s: streak >= 2 ? "🔥 sin fallar" : "",
      c: streak >= 2 ? "var(--gold)" : "var(--text)",
      tip: "Meses consecutivos, hasta el último registrado, con alguna aportación (manual, saveback o round-up). Un mes con aportación 0 corta la racha." },
    { l: "DCA automático",
      v: dcaAuto != null ? `${fmt(dcaAuto)} %` : "—",
      s: dcaAuto != null ? "Saveback + round-up sobre el total" : "Sin aportaciones",
      c: dcaAuto == null ? "var(--dimmer)" : (dcaAuto >= 30 ? "var(--green)" : dcaAuto >= 10 ? "var(--yellow)" : "var(--text)"),
      tip: "Porcentaje del total aportado que viene de Saveback + Round-up frente a aportaciones manuales. Mide cuánto de tu inversión es 'esfuerzo cero' (automatizada)." },
  ];
  html += `<section class="panel">
    <div class="panel-title">Rendimiento</div>
    <div class="lista">${rendimiento.map(datoHTML).join("")}</div>
    ${renderKpisExtra(filasFull, tirActual)}
  </section>`;

  // Rentas: solo si se ha cobrado alguna (no estorba carteras sin dividendos)
  const divTotal = ultima.acumDividendos || 0;
  if (divTotal > 0) {
    const div12m   = filasFull.slice(-12).reduce((s, f) => s + (f.dividendo || 0), 0);
    const yieldPct = ultima.valor > 0 ? (div12m / ultima.valor) * 100 : 0;
    const rentaApt = ultima.acumAportado > 0 ? (divTotal / ultima.acumAportado) * 100 : 0;
    const rentTot  = ultima.acumAportado > 0 ? ((ultima.ganancia + divTotal) / ultima.acumAportado) * 100 : 0;
    html += `<section class="panel">
      <div class="panel-title">Rentas cobradas <span class="panel-aux">Dividendos y cupones</span></div>
      <div class="tarjetas">
        <div class="tarjeta"><span class="tj-l">Total cobrado</span><span class="tj-v" style="color:var(--green)">${fmtM(divTotal)}</span><span class="tj-s">Desde el inicio</span></div>
        <div class="tarjeta"><span class="tj-l">Yield 12 m</span><span class="tj-v">${fmt(yieldPct)} %</span><span class="tj-s">${fmtM(div12m)} en 12 meses</span></div>
        <div class="tarjeta"><span class="tj-l">Renta / aportado</span><span class="tj-v">${fmt(rentaApt)} %</span><span class="tj-s">Recuperado vía rentas</span></div>
        <div class="tarjeta"><span class="tj-l">Rentabilidad total</span><span class="tj-v" style="color:${colorG(rentTot)}">${pctTxt(rentTot)}</span><span class="tj-s">Revalorización + rentas</span></div>
      </div>
    </section>`;
  }

  html += renderObjetivos(esTotal ? null : state.tab, ultima.valor);

  // ── Gráficos de análisis ──
  // TIR comparativa y distribución usan datos completos; el resto, el periodo elegido.
  let tirData = null;
  if (esTotal && state.productos.length > 1) {
    tirData = state.productos.map(p => ({ nombre: p.nombre, tir: calcTIR(entradasEUR(state, p)), color: p.color }));
    if (tirData.filter(t => t.tir != null).length > 1) {
      html += `<section class="panel">
        <div class="panel-title">TIR por producto</div>
        <div class="chart-box" style="height:${Math.max(80, state.productos.length * 38)}px"><canvas id="chartTirComp"></canvas></div>
      </section>`;
    } else {
      tirData = null;
    }
  }

  let pesoData = null;
  if (esTotal && state.productos.length > 1) {
    const pesoItems = state.productos.map(p => {
      const ents = [...entradasEUR(state, p)].sort((a,b) => a.fecha.localeCompare(b.fecha));
      const ult = ents[ents.length - 1];
      return { nombre: p.nombre, valor: ult?.valor || 0, color: p.color };
    }).filter(d => d.valor > 0);
    if (pesoItems.length > 1) {
      pesoData = pesoItems;
      html += `<section class="panel">
        <div class="panel-title">Distribución de la cartera</div>
        <div class="chart-box" style="height:220px"><canvas id="chartPeso"></canvas></div>
      </section>`;
    }
  }

  // Tooltips informativos para los paneles comparativos
  const tipGrowth = "Compara la rentabilidad real de cada producto sobre tu inversión.\n\nFórmula: valor del producto / aportado acumulado × 100\n\n• 100 = empate (lo que vale = lo que has metido)\n• > 100 = ganancia (porcentaje sobre lo invertido)\n• < 100 = pérdida\n\nEl acumulado de aportes se calcula desde el inicio del producto. El filtro temporal solo limita los meses visibles, no rebase la métrica.";
  const tipContrib = "Aporte de cada producto a la ganancia de mercado (excluye lo que tú has metido).\n\n• Todo: ganancia lifetime = valor_actual − aportado_total\n• Otros periodos: ganancia_periodo = valor_fin − valor_inicio − aportes_durante\n\nOrden descendente. Tooltip muestra ganancia en € y % sobre lo aportado en el rango.";

  html += `<section class="panel">
    <div class="panel-title">Rentabilidad acumulada</div>
    ${sparseFilter ? emptyChart : `<div class="chart-box short"><canvas id="chartRent"></canvas></div>`}
  </section>`;

  html += `<section class="panel">
    <div class="panel-title">Rentabilidad mensual <span class="panel-aux">Mapa de calor, %</span></div>
    ${renderHeatmap(filas)}
  </section>`;

  // Crecimiento normalizado (base 100) — depende del filtro de periodo
  let growthData = null;
  if (esTotal && state.productos.length > 1) {
    growthData = calcCrecimientoNormalizado(state, state.filtroPeriodo);
    if (growthData.datasets.length > 1 && growthData.labels.length >= 2) {
      html += `<section class="panel">
        <div class="panel-title">Crecimiento normalizado <span class="panel-aux">Base 100</span>${tipHTML("Crecimiento normalizado", tipGrowth)}</div>
        <div class="chart-box" style="height:280px"><canvas id="chartGrowth"></canvas></div>
      </section>`;
    } else {
      growthData = null;
    }
  }

  // Contribución a la ganancia por producto — depende del filtro de periodo
  let contribData = null;
  if (esTotal && state.productos.length > 1) {
    contribData = calcContribucionGanancia(state, state.filtroPeriodo);
    if (contribData.length > 1) {
      html += `<section class="panel">
        <div class="panel-title">Contribución a la ganancia${tipHTML("Contribución a la ganancia", tipContrib)}</div>
        <div class="chart-box" style="height:${Math.max(120, contribData.length * 42)}px"><canvas id="chartContrib"></canvas></div>
      </section>`;
    } else {
      contribData = null;
    }
  }

  // Aportaciones por año (Manual + Saveback + Round-up apiladas, descendente)
  // Es agregación anual, no depende del filtro de periodo.
  let aportYearData = null;
  if (esTotal) {
    aportYearData = calcAportacionesPorAno(state);
    if (aportYearData.length) {
      html += `<section class="panel">
        <div class="panel-title">Aportaciones por año</div>
        <div class="chart-box" style="height:${Math.max(140, aportYearData.length * 46)}px"><canvas id="chartAportYear"></canvas></div>
      </section>`;
    } else {
      aportYearData = null;
    }
  }

  const histRents = filas.filter(f => f.rentMes != null);
  if (histRents.length >= 3) {
    html += `<section class="panel">
      <div class="panel-title">Distribución de rentabilidades mensuales</div>
      <div class="chart-box short"><canvas id="chartHist"></canvas></div>
    </section>`;
  }

  // ── Historial (por años) y secciones plegables ──
  html += esTotal ? renderTablaTotal(filas) : renderTablaProd(filas, ultima);
  // Fiscalidad siempre en euros (al tipo de cambio de cada mes)
  const filasFiscal = enOtraDivisa ? filtrarFilas(calcStats(entradasEUR(state, prod)), state.filtroPeriodo) : filas;
  html += `<section class="panel panel-plegables">
    ${renderResumenFiscal(filasFiscal)}
    ${renderCostesPanel(esTotal)}
    ${eliminarHTML}
  </section>`;

  $("#main").innerHTML = html;
  bindCommon();

  if (!sparseFilter) {
    drawChartValor(filas, accent, fmtM);
    drawChartRent(filas, accent);
  }
  if (histRents.length >= 3) drawChartHistograma(filas);
  if (tirData) drawChartTirComp(tirData);
  if (pesoData) drawChartPeso(pesoData);
  if (growthData)    drawChartGrowth(growthData);
  if (contribData)   drawChartContribucion(contribData);
  if (aportYearData) drawChartAportPorAno(aportYearData);
}

function renderHeatmap(filas) {
  const datos = {};
  filas.forEach(f => {
    if (f.rentMes == null) return;
    const [y, m] = f.fecha.split("-");
    if (!(+m >= 1 && +m <= 12)) return;   // mes fuera de rango (dato antiguo/corrupto)
    if (!datos[y]) datos[y] = {};
    datos[y][+m - 1] = f.rentMes;
  });
  const anos = Object.keys(datos).sort().reverse();
  if (!anos.length) {
    return `<p class="panel-nota" style="text-align:center;padding:30px 0">Necesitas al menos 2 meses de datos para ver el mapa de calor</p>`;
  }
  const todos  = Object.values(datos).flatMap(o => Object.values(o));
  const maxAbs = Math.max(...todos.map(Math.abs), 1);
  const colorCelda = (v) => {
    if (v == null) return "transparent";
    const intensity = Math.min(Math.abs(v) / maxAbs, 1);
    const op = 0.12 + intensity * 0.78;
    return v >= 0 ? `rgba(52,209,122,${op})` : `rgba(255,107,107,${op})`;
  };
  let inner = `<div class="heat-row head"><span></span>${MESES.map(m => `<span>${m}</span>`).join("")}</div>`;
  anos.forEach(y => {
    let cells = `<span class="heat-year">${y}</span>`;
    for (let m = 0; m < 12; m++) {
      const v = datos[y][m];
      if (v == null) cells += `<div class="heat-cell empty"></div>`;
      else {
        const txtDark = Math.abs(v) / maxAbs > 0.5;
        cells += `<div class="heat-cell" title="${MESES[m]} ${y}: ${v>=0?"+":""}${fmt(v)}%" style="background:${colorCelda(v)};color:${txtDark ? "var(--bg)" : "var(--mute)"}">${(() => { const r = Math.round(v) || 0; return `${r>=0?"+":""}${r}`; })()}</div>`;   // || 0 evita "-0"
      }
    }
    inner += `<div class="heat-row">${cells}</div>`;
  });
  const escalaSpans = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map(t => {
    const bg = t === 0 ? "rgba(255,255,255,0.05)"
             : t < 0   ? `rgba(255,107,107,${0.12 + Math.abs(t) * 0.78})`
                       : `rgba(52,209,122,${0.12 + t * 0.78})`;
    return `<div style="background:${bg}"></div>`;
  }).join("");
  inner += `<div class="heat-legend">
    <span>-${fmt(maxAbs,1)}%</span>
    <div class="heat-scale">${escalaSpans}</div>
    <span>+${fmt(maxAbs,1)}%</span>
  </div>`;
  return `<div class="heatmap-scroll"><div class="heatmap-grid">${inner}</div></div>`;
}

// Agrupa filas por año, del más reciente al más antiguo
function porAnos(filas) {
  const porAno = {};
  filas.forEach(f => { (porAno[f.fecha.slice(0, 4)] ||= []).push(f); });
  return Object.keys(porAno).sort().reverse().map(y => ({ y, filas: porAno[y] }));
}
const MESES_LARGOS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const mesLargo = (fecha) => { const [y, m] = fecha.split("-"); return `${MESES_LARGOS[+m - 1] ?? m} ${y}`; };

// Historial de un producto: año → meses. Cada mes es una fila compacta que al
// tocarla muestra el desglose completo y las acciones Editar / Borrar.
function renderTablaProd(filas, ultima) {
  const grupos = porAnos(filas);
  const anoActual = grupos[0]?.y;
  const aportTxt = (m, sb, r) => `${fmtM(m + sb + r)}${sb || r ? ` <span class="desglose">(${fmt(m)} + ${fmt(sb)} + ${fmt(r)})</span>` : ""}`;

  const html = grupos.map(({ y, filas: gFilas }) => {
    const gManual   = gFilas.reduce((s,f) => s + (f.manual   || 0), 0);
    const gSaveback = gFilas.reduce((s,f) => s + (f.saveback || 0), 0);
    const gRoundup  = gFilas.reduce((s,f) => s + (f.roundup  || 0), 0);
    const gValorFin = gFilas[gFilas.length - 1].valor;
    const gRent     = gFilas[gFilas.length - 1].rentPct;
    const meses = [...gFilas].reverse().map(f => `
      <details class="mov">
        <summary>
          <span class="mov-izq">
            <span class="mov-tit">${mesLargo(f.fecha)}${f.nota ? ` <span class="mov-nota" title="${esc(f.nota)}">✎</span>` : ""}</span>
            <span class="mov-sub">Aportado ${fmtM(f.aportacion)}${f.dividendo ? ` · renta ${fmtM(f.dividendo)}` : ""}</span>
          </span>
          <span class="mov-der">
            <span class="mov-valor">${fmtM(f.valor)}</span>
            <span class="mov-sub" style="color:${colorG(f.rentPct)}">${pctTxt(f.rentPct)}</span>
          </span>
        </summary>
        <div class="mov-det">
          <div class="dato"><span class="dato-l">Manual</span><span class="dato-v">${fmtM(f.manual || 0)}</span></div>
          <div class="dato"><span class="dato-l">Saveback</span><span class="dato-v">${f.saveback ? fmtM(f.saveback) : "—"}</span></div>
          <div class="dato"><span class="dato-l">Round-up</span><span class="dato-v">${f.roundup ? fmtM(f.roundup) : "—"}</span></div>
          ${f.dividendo ? `<div class="dato"><span class="dato-l">Renta cobrada</span><span class="dato-v">${fmtM(f.dividendo)}</span></div>` : ""}
          <div class="dato"><span class="dato-l">Ganancia acumulada</span><span class="dato-v" style="color:${colorG(f.ganancia)}">${fmtM(f.ganancia)}</span></div>
          ${f.rentMes != null ? `<div class="dato"><span class="dato-l">Rentabilidad del mes</span><span class="dato-v" style="color:${colorG(f.rentMes)}">${pctTxt(f.rentMes)}</span></div>` : ""}
          ${f.nota ? `<p class="mov-nota-txt">${esc(f.nota)}</p>` : ""}
          <div class="row-acts">
            <button class="row-act" data-edit="${esc(f.id)}">Editar</button>
            <button class="row-act danger" data-del="${esc(f.id)}">Borrar</button>
          </div>
        </div>
      </details>`).join("");
    return `<details class="year-group" ${y === anoActual ? "open" : ""}>
      <summary>
        <span class="mov-izq">
          <span class="ano-tit">${y} ${CHEVRON}</span>
          <span class="mov-sub">${gFilas.length} ${gFilas.length === 1 ? "mes" : "meses"} · aportado ${aportTxt(gManual, gSaveback, gRoundup)}</span>
        </span>
        <span class="mov-der">
          <span class="mov-valor">${fmtM(gValorFin)}</span>
          <span class="mov-sub" style="color:${colorG(gRent)}">${pctTxt(gRent)}</span>
        </span>
      </summary>
      <div class="year-rows">${meses}</div>
    </details>`;
  }).join("");

  const totM = filas.reduce((s,f) => s + (f.manual||0),   0);
  const totS = filas.reduce((s,f) => s + (f.saveback||0), 0);
  const totR = filas.reduce((s,f) => s + (f.roundup||0),  0);
  return `<section class="panel">
    <div class="panel-title">Historial <span class="panel-aux">${filas.length} ${filas.length === 1 ? "entrada" : "entradas"}</span></div>
    <p class="panel-nota">Total del periodo: aportado ${aportTxt(totM, totS, totR)} · valor ${fmtM(ultima.valor)} · ganancia <span style="color:${colorG(ultima.ganancia)}">${fmtM(ultima.ganancia)} (${pctTxt(ultima.rentPct)})</span></p>
    <div class="lista">${html}</div>
  </section>`;
}

// Historial del Total: por años y meses, sin acciones (las entradas son por producto)
function renderTablaTotal(filas) {
  const grupos = porAnos(filas);
  const anoActual = grupos[0]?.y;
  const html = grupos.map(({ y, filas: gFilas }) => {
    const gAportado = gFilas.reduce((s,f) => s + f.aportacion, 0);
    const gValorFin = gFilas[gFilas.length - 1].valor;
    const gRent     = gFilas[gFilas.length - 1].rentPct;
    const meses = [...gFilas].reverse().map(f => `
      <div class="mov mov-fija">
        <span class="mov-izq">
          <span class="mov-tit">${mesLargo(f.fecha)}</span>
          <span class="mov-sub">Aportado ${fmtM(f.aportacion)}</span>
        </span>
        <span class="mov-der">
          <span class="mov-valor">${fmtM(f.valor)}</span>
          <span class="mov-sub" style="color:${colorG(f.ganancia)}">${fmtM(f.ganancia)} · ${pctTxt(f.rentPct)}</span>
        </span>
      </div>`).join("");
    return `<details class="year-group" ${y === anoActual ? "open" : ""}>
      <summary>
        <span class="mov-izq">
          <span class="ano-tit">${y} ${CHEVRON}</span>
          <span class="mov-sub">${gFilas.length} ${gFilas.length === 1 ? "mes" : "meses"} · aportado ${fmtM(gAportado)}</span>
        </span>
        <span class="mov-der">
          <span class="mov-valor">${fmtM(gValorFin)}</span>
          <span class="mov-sub" style="color:${colorG(gRent)}">${pctTxt(gRent)}</span>
        </span>
      </summary>
      <div class="year-rows">${meses}</div>
    </details>`;
  }).join("");
  return `<section class="panel">
    <div class="panel-title">Historial <span class="panel-aux">${filas.length} meses</span></div>
    <div class="lista">${html}</div>
  </section>`;
}

function renderResumenFiscal(filas) {
  const g = agruparPorAno(filas);
  if (!g.length) return "";
  const anos = [...g].reverse().map(y => {
    const imp  = calcImpuestoPlusvalia(y.ganancia);
    const neto = y.ganancia - imp;
    return `
      <div class="mov mov-fija">
        <span class="mov-izq">
          <span class="mov-tit">${y.ano}</span>
          <span class="mov-sub">Aportado ${fmtE(y.aportadoAno)} · cierre ${fmtE(y.valorFin)}${y.rentAno != null ? ` · año ${pctTxt(y.rentAno)}` : ""}</span>
        </span>
        <span class="mov-der">
          <span class="mov-valor" style="color:${colorG(y.ganancia)}">${fmtE(y.ganancia)}</span>
          <span class="mov-sub">${imp ? `impuesto −${fmtE(imp)} · neto ${fmtE(neto)}` : "sin impuesto"}</span>
        </span>
      </div>`;
  }).join("");

  // Simulación venta total hoy: plusvalía sobre el coste medio de lo que sigue
  // invertido (una venta registrada ya tributó su parte; ver calcCosteMedio)
  const ult = filas.at(-1);
  const prods = state.tab === "total" ? state.productos : state.productos.filter(p => p.id === state.tab);
  // La posición previa de cada producto ya cuenta como coste (calcCosteMedio), igual que en la ganancia
  const coste = prods.reduce((s, p) => s + calcCosteMedio(entradasEUR(state, p)).coste, 0);
  const gananciaTotal = ult ? ult.valor - coste : 0;
  const impTotal      = calcImpuestoPlusvalia(gananciaTotal);
  const netoTotal     = gananciaTotal - impTotal;
  const tipoEf        = tipoMedioEfectivo(gananciaTotal);

  const simVenta = gananciaTotal > 0 ? `
    <div class="sub-titulo">Si vendieras hoy <span class="panel-aux">Tramos IRPF del ahorro 2026</span></div>
    <div class="tarjetas">
      <div class="tarjeta"><span class="tj-l">Ganancia bruta</span><span class="tj-v" style="color:var(--green)">${fmtE(gananciaTotal)}</span></div>
      <div class="tarjeta"><span class="tj-l">Impuesto estimado</span><span class="tj-v" style="color:var(--red)">−${fmtE(impTotal)}</span></div>
      <div class="tarjeta"><span class="tj-l">Ganancia neta</span><span class="tj-v">${fmtE(netoTotal)}</span></div>
      <div class="tarjeta"><span class="tj-l">Tipo medio efectivo</span><span class="tj-v">${fmt(tipoEf*100, 1)} %</span></div>
    </div>` : "";

  const resumen = gananciaTotal > 0 ? `Vender hoy: −${fmtE(impTotal)} de impuesto` : "Sin plusvalía latente";
  return plegable("Fiscalidad", resumen, `
    ${simVenta}
    <div class="sub-titulo">Por año <span class="panel-aux">Ganancia latente al cierre</span></div>
    <div class="lista">${anos}</div>`);
}

// Costes (TER y comisiones). En Total, todos los productos con coste definido
// y el total; en un producto, solo su fila.
function renderCostesPanel(esTotal) {
  const { items, costeTotal, terPonderado, valorCartera } = calcCostes(state);
  const visibles = esTotal ? items : items.filter(i => i.id === state.tab);
  if (!visibles.length) return "";
  const sumVisible = visibles.reduce((s, i) => s + i.coste, 0);
  const base       = esTotal ? valorCartera : (visibles[0].valor || 0);
  const pctCoste   = base > 0 ? (sumVisible / base) * 100 : 0;
  const rows = visibles.map(i => `
    <div class="mov mov-fija">
      <span class="mov-izq">
        <span class="mov-tit">${esc(i.nombre)}</span>
        <span class="mov-sub">TER ${i.ter > 0 ? `${fmt(i.ter)} % · ${fmtE(i.costeTer)}/año` : "—"} · comisiones 12 m ${i.costeCom > 0 ? `${fmtE(i.costeCom)} (${i.nAport12m} op.)` : "—"}</span>
      </span>
      <span class="mov-der"><span class="mov-valor" style="color:var(--red)">${fmtE(i.coste)}</span><span class="mov-sub">al año</span></span>
    </div>`).join("");
  const totalRow = esTotal && visibles.length > 1 ? `
    <div class="mov mov-fija">
      <span class="mov-izq"><span class="mov-tit">Total</span><span class="mov-sub">${terPonderado != null ? `TER medio ${fmt(terPonderado)} %` : ""}</span></span>
      <span class="mov-der"><span class="mov-valor" style="color:var(--red)">${fmtE(costeTotal)}</span><span class="mov-sub">al año</span></span>
    </div>` : "";
  const tip = "Coste anual estimado: TER × valor actual + comisión de compra × aportaciones de los últimos 12 meses. Define TER y comisión en el modal de cada producto. Un 1% de coste anual puede comerse ~25% de la ganancia final a 30 años.";
  return plegable(`Costes${tipHTML("Costes", tip)}`, `${fmtE(sumVisible)}/año · ${fmt(pctCoste)} % ${esTotal ? "de la cartera" : "del producto"}`,
    `<div class="lista">${rows}${totalRow}</div>`);
}

// Indicadores de riesgo, plegados dentro de "Rendimiento"
function renderKpisExtra(filasFull, tirAnual) {
  if (!filasFull?.length) return "";
  const vol     = calcVolatilidad(filasFull);
  const sharpe  = calcSharpe(filasFull, tirAnual);
  const sortino = calcSortino(filasFull, tirAnual);
  const maxDd   = calcMaxDrawdown(filasFull);
  const nota    = (r) => r >= 2 ? "Excelente" : r >= 1 ? "Bueno" : r >= 0 ? "Moderado" : "Negativo";
  const colorR  = (r) => r >= 2 ? "var(--green)" : r >= 1 ? "var(--yellow)" : r >= 0 ? "var(--text)" : "var(--red)";

  const items = [
    { l: "Volatilidad",
      v: vol != null ? `${fmt(vol)} %` : "—",
      s: vol != null ? "Anualizada (×√12)" : "Mín. 3 meses",
      c: vol == null ? "var(--dimmer)" : (vol > 20 ? "var(--red)" : vol > 10 ? "var(--yellow)" : "var(--green)"),
      tip: "Desviación estándar de las rentabilidades mensuales, anualizada (×√12). Cuantifica la dispersión de tus retornos respecto a la media. Mayor volatilidad implica mayor riesgo e incertidumbre sobre el resultado futuro." },
    { l: "Sharpe",
      v: sharpe != null ? fmt(sharpe) : "—",
      s: sharpe != null ? nota(sharpe) : "Sin datos",
      c: sharpe == null ? "var(--dimmer)" : colorR(sharpe),
      tip: "Ratio de Sharpe: rentabilidad anual (XIRR) dividida entre la volatilidad anualizada. Mide la rentabilidad obtenida por cada unidad de riesgo asumido. Por encima de 1 se considera bueno; por encima de 2, excelente." },
    { l: "Sortino",
      v: sortino != null ? fmt(sortino) : "—",
      s: sortino != null ? nota(sortino) : "Mín. 3 meses o sin caídas",
      c: sortino == null ? "var(--dimmer)" : colorR(sortino),
      tip: "Ratio de Sortino: como Sharpe pero solo penaliza la volatilidad negativa (downside deviation). Más justo para activos asimétricos: si el producto sube con saltos grandes y baja con saltos pequeños, Sortino lo refleja mejor." },
    { l: "Drawdown máximo",
      v: maxDd != null ? `−${fmt(maxDd)} %` : "—",
      s: maxDd != null ? "Mayor caída desde un pico" : "Sin datos suficientes",
      c: maxDd != null && maxDd > 0.01 ? "var(--red)" : "var(--dimmer)",
      tip: "Mayor caída desde un pico histórico hasta el siguiente valle (en % sobre el valor de cartera). Mide el peor momento que has vivido antes de recuperarte. Un −20% significa que la cartera llegó a valer un 20% menos que su máximo anterior." },
  ];
  const resumen = [vol != null ? `volatilidad ${fmt(vol)} %` : "", sharpe != null ? `Sharpe ${fmt(sharpe)}` : ""].filter(Boolean).join(" · ");
  return plegable("Riesgo", resumen ? resumen[0].toUpperCase() + resumen.slice(1) : "Volatilidad, Sharpe, Sortino y drawdown",
    `<div class="lista">${items.map(datoHTML).join("")}</div>`);
}
