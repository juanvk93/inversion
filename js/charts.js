import { charts } from "./state.js";
import { $, fmt, fmtE } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// 6. CHARTS
// ═══════════════════════════════════════════════════════════════════════════

// Si el CDN de Chart.js falla (primera visita offline, red corporativa…), la app
// debe seguir funcionando sin gráficos en lugar de reventar el IIFE completo.
export const CHARTS_OK = typeof Chart !== "undefined";
// Misma familia que el resto de la app (style.css)
export const FUENTE = "Inter, system-ui, sans-serif";
if (CHARTS_OK) {
  Chart.defaults.color       = "#8E8E96";
  Chart.defaults.font.family = FUENTE;
  Chart.defaults.font.size   = 11;
  Chart.defaults.borderColor = "rgba(255,255,255,0.04)";
  // render() recrea todos los gráficos en cada cambio (incluso al llegar un
  // precio): animarlos cada vez hacía la app pesada en móvil.
  Chart.defaults.animation   = false;
} else {
  console.warn("[Cartera] Chart.js no disponible — la app funciona sin gráficos");
}

export function destroyChart(key)   { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
export function destroyAllCharts()  { Object.keys(charts).forEach(destroyChart); }

// Crea (o recrea) el gráfico `clave` en el canvas #id. Sin el canvas en la vista
// o sin Chart.js (CDN caído) no hace nada. destroyChart evita instancias
// huérfanas si se redibuja sin pasar por render().
export function crearGrafico(clave, id, config) {
  const ctx = $(`#${id}`)?.getContext("2d");
  if (!ctx || !CHARTS_OK) return null;
  destroyChart(clave);
  charts[clave] = new Chart(ctx, config);
  return charts[clave];
}

export function gridConfig(yTickFmt) {
  return {
    // Sin rejilla vertical y una horizontal apenas visible: el protagonista es la línea
    x: { grid: { display: false }, border: { display: false }, ticks: { color: "#8E8E96", maxRotation: 0, autoSkipPadding: 12 } },
    y: {
      grid: { color: "rgba(255,255,255,0.05)" }, border: { display: false },
      ticks: { color: "#8E8E96", callback: yTickFmt }
    },
  };
}

// Formatter de eje Y para € que se adapta al rango. Usa los ticks del propio eje
// para decidir la escala (€, k, M) y los decimales necesarios. Evita el problema
// "0k 0k 0k" cuando la cartera está por debajo de 1.000 €.
export function fmtTickEUR(value, index, ticks) {
  const max = ticks && ticks.length
    ? Math.max(...ticks.map(t => Math.abs(t.value)))
    : Math.abs(value);
  if (max >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (max >= 10_000)    return `${(value / 1000).toFixed(0)}k`;
  if (max >= 1000)      return `${(value / 1000).toFixed(1)}k`;
  if (max >= 100)       return `${Math.round(value)}`;
  return `${value.toFixed(0)}`;
}

export function makeGradient(ctx, color, area, alpha = 0.2) {
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2,"0"));
  g.addColorStop(1, color + "00");
  return g;
}

export const TOOLTIP_BASE = {
  backgroundColor: "#1C1C1F",
  borderColor:     "rgba(255,255,255,0.08)",
  borderWidth:     1,
  titleColor:      "#A1A1A8",
  titleFont:       { family: FUENTE, size: 12 },
  bodyFont:        { family: FUENTE, size: 12 },
  padding:         12,
  boxPadding:      4,
};

// fmtImporte: formato de la divisa del producto (euros por defecto)
export function drawChartValor(filas, accent, fmtImporte = fmtE) {
  // Anotaciones: puntos destacados donde hay nota
  const notas = filas.map(f => f.nota ? f.valor : null);
  const tieneNotas = notas.some(v => v != null);
  const last = filas.length - 1;
  // Relleno suave entre "valor real" y "aportado": verde = plusvalía, rojo = pérdida
  const GAN_FILL = "rgba(52,209,122,0.10)";
  const PER_FILL = "rgba(255,107,107,0.10)";
  // Leyenda y valor actual van en el HTML (cabecera de la vista y .chart-leyenda)
  crearGrafico("valor", "chartValor", {
    type: "line",
    data: {
      labels: filas.map(f => f.label),
      datasets: [
        {
          label: "Aportado",
          data: filas.map(f => f.acumAportado),
          borderColor: "#6E6E76", borderWidth: 1.2, borderDash: [3, 4],
          tension: 0.3, fill: false, pointRadius: 0,
        },
        {
          label: "Valor real",
          data: filas.map(f => f.valor),
          borderColor: accent, borderWidth: 2,
          // Relleno hacia "Aportado" (dataset anterior): verde si hay ganancia, rojo si pérdida
          fill: { target: "-1", above: GAN_FILL, below: PER_FILL },
          tension: 0.3,
          pointRadius: filas.map((f, i) => i === last ? 4 : 0),
          pointBackgroundColor: accent, pointBorderColor: accent,
          pointHoverRadius: filas.map(f => f.nota ? 0 : 4),
        },
        ...(tieneNotas ? [{
          label: "Notas",
          data: notas,
          borderColor: "transparent",
          backgroundColor: "#A1A1A8",
          pointRadius: 4, pointHoverRadius: 7,
          pointStyle: "circle",
          pointBorderColor: getComputedStyle(document.body).backgroundColor || "#000000",
          pointBorderWidth: 2,
          showLine: false, fill: false,
        }] : []),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: {
            label: (c) => c.dataset.label === "Notas" ? "" : ` ${c.dataset.label}: ${fmtImporte(c.parsed.y)}`,
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              const f = filas[i];
              return f?.nota ? [``, `📝 ${f.nota}`] : [];
            },
          },
        }
      },
      scales: gridConfig(fmtTickEUR),
    },
  });
}

export function drawChartMonteCarlo(labels, percs, aportado) {
  const purpA = (a) => `rgba(167,139,250,${a})`;
  crearGrafico("mc", "chartMC", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "p5",   data: percs[0], borderColor: purpA(0.18), borderWidth: 1, pointRadius: 0, fill: false, tension: 0.25 },
        { label: "p25",  data: percs[1], borderColor: purpA(0.28), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.07), tension: 0.25 },
        { label: "p50 (mediana)", data: percs[2], borderColor: "#A78BFA", borderWidth: 2.5, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.13), tension: 0.25 },
        { label: "p75",  data: percs[3], borderColor: purpA(0.28), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.13), tension: 0.25 },
        { label: "p95",  data: percs[4], borderColor: purpA(0.18), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: purpA(0.07), tension: 0.25 },
        { label: "Aportado", data: aportado, borderColor: "#4B5563", borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#9CA3AF", font: { family: FUENTE, size: 12 }, boxWidth: 12, padding: 12, filter: it => it.text !== "p5" && it.text !== "p25" && it.text !== "p75" } },
        tooltip: { ...TOOLTIP_BASE, callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtE(c.parsed.y)}` } },
      },
      scales: gridConfig(fmtTickEUR),
    },
  });
}

export function drawChartRent(filas, accent) {
  // Relleno respecto a 0%: verde en ganancia, rojo en pérdida
  const GAN_FILL = "rgba(52,211,153,0.16)";
  const PER_FILL = "rgba(248,113,113,0.15)";
  // Escala Y con la línea base de 0% resaltada respecto al resto del grid
  const sc = gridConfig(v => `${v.toFixed(0)}%`);
  sc.y.grid.color = (c) => c.tick.value === 0 ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.04)";
  crearGrafico("rent", "chartRent", {
    type: "line",
    data: {
      labels: filas.map(f => f.label),
      datasets: [{
        label: "Rent. acumulada",
        data: filas.map(f => f.rentPct),
        borderColor: accent, borderWidth: 2, tension: 0.3,
        fill: { target: { value: 0 }, above: GAN_FILL, below: PER_FILL },
        pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: accent,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: false,
          callbacks: { label: (ctx) => { const v = ctx.parsed.y; return ` ${v>=0?"+":""}${fmt(v)}%`; } }
        }
      },
      scales: sc,
    }
  });
}

export function drawChartTirComp(data) {
  crearGrafico("tirComp", "chartTirComp", {
    type: "bar",
    data: {
      labels: data.map(d => d.nombre),
      datasets: [{
        label: "TIR",
        // TIR desconocida → null (sin barra), no 0% (se confundía con rentabilidad nula)
        data: data.map(d => d.tir != null ? +(d.tir * 100).toFixed(2) : null),
        backgroundColor: data.map(d => d.color + "D9"),
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => ctx.parsed.x == null ? " TIR no disponible" : ` ${ctx.parsed.x>=0?"+":""}${fmt(ctx.parsed.x)}%`
          }
        }
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false },
             ticks: { color: "#374151", callback: v => `${v.toFixed(0)}%` } },
        y: { grid: { display: false }, border: { display: false },
             ticks: { color: "#9CA3AF", font: { size: 11 } } }
      }
    }
  });
}

export function drawChartProy(labels, datasets) {
  crearGrafico("proy", "chartProy", {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#9CA3AF", font: { family: FUENTE, size: 12 }, boxWidth: 12, padding: 12 } },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtE(ctx.parsed.y)}` }
        }
      },
      scales: gridConfig(fmtTickEUR),
    }
  });
}

const HIST_BUCKETS = [
  { label: "<−5%",    min: -Infinity, max: -5 },
  { label: "−5/−3%", min: -5,        max: -3 },
  { label: "−3/−1%", min: -3,        max: -1 },
  { label: "−1/0%",  min: -1,        max:  0 },
  { label: "0/+1%",  min:  0,        max:  1 },
  { label: "+1/+3%", min:  1,        max:  3 },
  { label: "+3/+5%", min:  3,        max:  5 },
  { label: ">+5%",   min:  5,        max: Infinity },
];

export function drawChartHistograma(filas) {
  const rents = filas.filter(f => f.rentMes != null).map(f => f.rentMes);
  if (!rents.length) return;
  const counts = HIST_BUCKETS.map(b => rents.filter(r => r >= b.min && r < b.max).length);
  const colors = HIST_BUCKETS.map(b => b.max <= 0 ? "rgba(248,113,113,0.75)" : "rgba(110,231,183,0.75)");
  crearGrafico("hist", "chartHist", {
    type: "bar",
    data: {
      labels: HIST_BUCKETS.map(b => b.label),
      datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4, borderSkipped: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE, displayColors: false,
          callbacks: { label: (c) => ` ${c.parsed.y} ${c.parsed.y === 1 ? "mes" : "meses"}` } },
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#6B7280", font: { family: FUENTE, size: 11 } } },
        y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#6B7280", font: { family: FUENTE, size: 11 }, stepSize: 1 }, beginAtZero: true },
      },
    },
  });
}

export function drawChartPeso(data) {

  const cs        = getComputedStyle(document.documentElement);
  const textColor = (cs.getPropertyValue("--text")   || "").trim() || "#E2E8F0";
  const dimColor  = (cs.getPropertyValue("--dimmer") || "").trim() || "#6B7280";
  const nf        = new Intl.NumberFormat("es-ES",
    { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  // Plugin local (solo este chart): rótulo "TOTAL" + importe en el hueco del donut.
  // El total se recalcula con los productos VISIBLES en cada redibujado, de modo
  // que al ocultar uno desde la leyenda el importe del centro se actualiza.
  const centerText = {
    id: "pesoCenterText",
    afterDraw(chart) {
      const arc = chart.getDatasetMeta(0).data[0];
      if (!arc) return;
      const valores = chart.data.datasets[0].data;
      let total = 0;
      for (let i = 0; i < valores.length; i++) {
        if (chart.getDataVisibility(i)) total += valores[i] || 0;
      }
      const totalFmt = nf.format(total);
      const c  = chart.ctx;
      const cx = arc.x, cy = arc.y;
      const innerD = arc.innerRadius * 1.8;   // ancho útil dentro del agujero
      c.save();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = dimColor;
      c.font = `600 10px ${FUENTE}`;
      c.fillText("TOTAL", cx, cy - 11);
      // Ajuste de tamaño para que el importe quepa en el agujero (responsive).
      let fs = 18;
      c.font = `700 ${fs}px 'Lato', sans-serif`;
      while (c.measureText(totalFmt).width > innerD && fs > 9) {
        fs -= 1; c.font = `700 ${fs}px 'Lato', sans-serif`;
      }
      c.fillStyle = textColor;
      c.fillText(totalFmt, cx, cy + 6);
      c.restore();
    }
  };

  crearGrafico("peso", "chartPeso", {
    type: "doughnut",
    data: {
      labels: data.map(d => d.nombre),
      datasets: [{
        data: data.map(d => d.valor),
        backgroundColor: data.map(d => d.color + "E6"),
        borderColor: "transparent",
        borderWidth: 0,
        borderRadius: 4,       // redondeo sutil (radios grandes deforman segmentos pequeños)
        spacing: 3,            // separación ligera entre productos
        hoverOffset: 12,
        hoverBorderColor: data.map(d => d.color),
        hoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: "72%",
      layout: { padding: 6 },
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "#9CA3AF", font: { family: FUENTE, size: 12 },
            padding: 14, boxWidth: 8, boxHeight: 8,
            usePointStyle: true, pointStyle: "circle",
          }
        },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: {
            label: (ctx) => {
              // % sobre el total VISIBLE, coherente con el importe del centro
              let total = 0;
              ctx.dataset.data.forEach((v, i) => { if (ctx.chart.getDataVisibility(i)) total += v || 0; });
              const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${fmtE(ctx.parsed)} (${pct}%)`;
            }
          }
        }
      }
    },
    plugins: [centerText]
  });
}

// Crecimiento normalizado (base 100 = aportado). 100 = empate, >100 ganancia, <100 pérdida.
export function drawChartGrowth(data) {
  // Añadimos una línea horizontal de referencia en 100 (base = aportado)
  const refLength = data.labels.length;
  const dataWithRef = {
    labels: data.labels,
    datasets: [
      ...data.datasets,
      {
        label: "Base 100 (aportado)",
        data: Array(refLength).fill(100),
        borderColor: "#4B5563",
        borderWidth: 1, borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 99,
      },
    ],
  };
  crearGrafico("growth", "chartGrowth", {
    type: "line",
    data: dataWithRef,
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#9CA3AF", font: { family: FUENTE, size: 12 }, padding: 12, boxWidth: 10, boxHeight: 10,
            filter: (item) => item.text !== "Base 100 (aportado)" }
        },
        tooltip: { ...TOOLTIP_BASE, displayColors: true,
          callbacks: {
            label: (c) => {
              if (c.parsed.y == null) return "";
              if (c.dataset.label === "Base 100 (aportado)") return "";
              const delta = c.parsed.y - 100;
              const signo = delta >= 0 ? "+" : "";
              return ` ${c.dataset.label}: ${fmt(c.parsed.y)} (${signo}${fmt(delta)}%)`;
            },
          }
        }
      },
      scales: gridConfig(v => v.toFixed(0)),
    }
  });
}

// Contribución a la ganancia (€) por producto — barra horizontal.
export function drawChartContribucion(items) {
  crearGrafico("contrib", "chartContrib", {
    type: "bar",
    data: {
      labels: items.map(i => i.nombre),
      datasets: [{
        data: items.map(i => i.ganancia),
        backgroundColor: items.map(i => i.color + "CC"),
        borderColor: items.map(i => i.color),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP_BASE,
          callbacks: {
            label: (c) => {
              const item = items[c.dataIndex];
              const pctSobreAport = item.aportado > 0 ? (item.ganancia / item.aportado) * 100 : 0;
              return ` ${item.ganancia >= 0 ? "+" : ""}${fmtE(item.ganancia)} · ${pctSobreAport >= 0 ? "+" : ""}${fmt(pctSobreAport)}%`;
            }
          }
        }
      },
      // indexAxis "y": el eje de euros es x; y es el de categorías (nombres).
      // gridConfig() ponía el formateador € en y y mostraba 0, 1, 2… en vez de nombres.
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false }, ticks: { color: "#374151", callback: fmtTickEUR } },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: "#374151" } },
      },
    }
  });
}

// Aportaciones por año (Manual / Saveback / Round-up) — barras horizontales apiladas.
export function drawChartAportPorAno(years) {
  crearGrafico("aportYear", "chartAportYear", {
    type: "bar",
    data: {
      labels: years.map(y => y.year),
      datasets: [
        { label: "Manual",   data: years.map(y => y.manual),   backgroundColor: "#60A5FA", borderRadius: 4 },
        { label: "Saveback", data: years.map(y => y.saveback), backgroundColor: "#6EE7B7", borderRadius: 4 },
        { label: "Round-up", data: years.map(y => y.roundup),  backgroundColor: "#A78BFA", borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#9CA3AF", font: { family: FUENTE, size: 12 }, padding: 12, boxWidth: 10, boxHeight: 10 }
        },
        tooltip: { ...TOOLTIP_BASE,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${fmtE(c.parsed.x)}`,
            footer: (items) => {
              const total = items.reduce((s, it) => s + (it.parsed.x || 0), 0);
              return ` Total: ${fmtE(total)}`;
            }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false }, ticks: { color: "#374151", callback: fmtTickEUR } },
        y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: "#374151" } },
      },
    }
  });
}
