import { calcDCAAutomatico, calcMejorMes, calcRachaMaxPositiva, calcStats, calcStreakTotal, calcTIR, entradasEUR, statsTotalCalc } from "./calc.js";
import { _locked } from "./crypto.js";
import { closeDrawer } from "./drawer.js";
import { saveState, state } from "./state.js";
import { desfasada } from "./sincro.js";
import { $, esc, frase, hoyDia } from "./utils.js";

// ── Logros (hitos automáticos) ─────────────────────────────────────────────
// Cada logro define una condición sobre el estado agregado de la cartera.
// Los desbloqueados se guardan en state.logros con su fecha (no se pierden
// aunque la condición deje de cumplirse, p. ej. si la cartera baja de 10k).
const LOGROS_DEF = [
  // Constancia
  { id: "primera_entrada", grupo: "Constancia", icon: "🌱", t: "Primer paso",        d: "Registrar tu primera entrada",          c: x => x.mesesHist >= 1 },
  { id: "streak_3",        grupo: "Constancia", icon: "🔂", t: "Arrancando",         d: "3 meses seguidos aportando",            c: x => x.streak >= 3 },
  { id: "streak_6",        grupo: "Constancia", icon: "🔥", t: "Medio año en racha", d: "6 meses seguidos aportando",            c: x => x.streak >= 6 },
  { id: "streak_12",       grupo: "Constancia", icon: "🗓️", t: "Un año sin fallar",  d: "12 meses seguidos aportando",           c: x => x.streak >= 12 },
  { id: "streak_24",       grupo: "Constancia", icon: "⏳", t: "Dos años de hierro", d: "24 meses seguidos aportando",           c: x => x.streak >= 24 },
  { id: "ano_historial",   grupo: "Constancia", icon: "📚", t: "Historial sólido",   d: "12 meses de historial registrados",     c: x => x.mesesHist >= 12 },
  { id: "bianual",         grupo: "Constancia", icon: "📖", t: "Veterano",           d: "24 meses de historial registrados",     c: x => x.mesesHist >= 24 },

  // Patrimonio
  { id: "valor_1k",        grupo: "Patrimonio", icon: "💶", t: "Primeros 1.000 €",   d: "La cartera alcanza 1.000 €",            c: x => x.valor >= 1000 },
  { id: "valor_5k",        grupo: "Patrimonio", icon: "💵", t: "5.000 €",            d: "La cartera alcanza 5.000 €",            c: x => x.valor >= 5000 },
  { id: "valor_10k",       grupo: "Patrimonio", icon: "💰", t: "Club de los 10K",    d: "La cartera alcanza 10.000 €",           c: x => x.valor >= 10000 },
  { id: "valor_25k",       grupo: "Patrimonio", icon: "🏦", t: "25.000 €",           d: "La cartera alcanza 25.000 €",           c: x => x.valor >= 25000 },
  { id: "valor_50k",       grupo: "Patrimonio", icon: "🚀", t: "Rumbo a 100K",       d: "La cartera alcanza 50.000 €",           c: x => x.valor >= 50000 },
  { id: "valor_100k",      grupo: "Patrimonio", icon: "👑", t: "Seis cifras",        d: "La cartera alcanza 100.000 €",          c: x => x.valor >= 100000 },
  { id: "valor_250k",      grupo: "Patrimonio", icon: "💎", t: "Cuarto de millón",   d: "La cartera alcanza 250.000 €",          c: x => x.valor >= 250000 },

  // Rentabilidad
  { id: "ganancia_1k",     grupo: "Rentabilidad", icon: "📈", t: "Ganancia 1.000 €",  d: "La ganancia acumulada supera 1.000 €",  c: x => x.ganancia >= 1000 },
  { id: "ganancia_10k",    grupo: "Rentabilidad", icon: "📊", t: "Ganancia 10.000 €", d: "La ganancia acumulada supera 10.000 €", c: x => x.ganancia >= 10000 },
  { id: "duplicada",       grupo: "Rentabilidad", icon: "✨", t: "Cartera duplicada", d: "El valor duplica lo aportado",          c: x => x.aportado > 0 && x.valor >= 2 * x.aportado },
  { id: "triplicada",      grupo: "Rentabilidad", icon: "🌟", t: "Cartera triplicada",d: "El valor triplica lo aportado",         c: x => x.aportado > 0 && x.valor >= 3 * x.aportado },
  { id: "tir_10",          grupo: "Rentabilidad", icon: "⚡", t: "Dos dígitos",       d: "TIR anualizada por encima del 10%",     c: x => x.tir != null && x.tir >= 0.10 },
  { id: "mejor_mes_10",    grupo: "Rentabilidad", icon: "🎢", t: "Mes estelar",       d: "Un mes con más de +10% de rentabilidad",c: x => x.mejorRentMes != null && x.mejorRentMes >= 10 },
  { id: "racha_pos_6",     grupo: "Rentabilidad", icon: "☀️", t: "Viento a favor",    d: "6 meses seguidos cerrando en positivo", c: x => x.rachaPositiva >= 6 },

  // Diversificación
  { id: "diversificado",   grupo: "Diversificación", icon: "🧺", t: "Diversificado",  d: "3 o más productos con datos",           c: x => x.prodConDatos >= 3 },
  { id: "muy_divers",      grupo: "Diversificación", icon: "🌍", t: "Cartera global", d: "5 o más productos con datos",           c: x => x.prodConDatos >= 5 },
  { id: "asignacion_100",  grupo: "Diversificación", icon: "🎯", t: "Plan definido",  d: "Asignación objetivo que suma 100%",     c: x => x.sumAsignacion >= 99.5 && x.sumAsignacion <= 100.5 },

  // Rentas
  { id: "primer_dividendo",grupo: "Rentas", icon: "💧", t: "Renta pasiva",     d: "Primer dividendo o cupón cobrado",       c: x => x.dividendos > 0 },
  { id: "dividendos_1k",   grupo: "Rentas", icon: "🌊", t: "Lluvia de rentas", d: "1.000 € cobrados en dividendos/cupones", c: x => x.dividendos >= 1000 },

  // Gestión
  { id: "objetivo_1",      grupo: "Gestión", icon: "🏁", t: "Meta cumplida",    d: "Completar tu primer objetivo",                 c: x => x.objetivosCompletados >= 1 },
  { id: "objetivo_3",      grupo: "Gestión", icon: "🥇", t: "Triple corona",    d: "Completar 3 objetivos",                        c: x => x.objetivosCompletados >= 3 },
  { id: "dca_auto_50",     grupo: "Gestión", icon: "🤖", t: "Piloto automático",d: "Más del 50% aportado vía Saveback + Round-up", c: x => x.dcaAuto != null && x.dcaAuto >= 50 },
];

// Reúne todas las métricas agregadas que evalúan las condiciones de los logros.
function logrosContext() {
  const filasTot = statsTotalCalc(state);
  const ultima   = filasTot.at(-1);
  if (!ultima) return null;
  // Valor actual por contexto (total + cada producto), para contar objetivos cumplidos.
  const valByPid = { total: ultima.valor };
  state.productos.forEach(p => {
    valByPid[p.id] = calcStats(entradasEUR(state, p)).at(-1)?.valor || 0;   // las metas están en €
  });
  const objetivosCompletados = (state.objetivos || []).filter(o => {
    const v = (o.productoId == null || o.productoId === "total") ? valByPid.total : (valByPid[o.productoId] || 0);
    return o.meta > 0 && v >= o.meta;
  }).length;
  return {
    valor:        ultima.valor,
    aportado:     ultima.acumAportado,
    ganancia:     ultima.ganancia,
    dividendos:   ultima.acumDividendos || 0,
    mesesHist:    filasTot.length,
    streak:       calcStreakTotal(state),
    rachaPositiva: calcRachaMaxPositiva(filasTot),
    prodConDatos: state.productos.filter(p => (state.entradas[p.id] || []).length).length,
    tir:          filasTot.length >= 2 ? calcTIR(filasTot) : null,
    mejorRentMes: calcMejorMes(filasTot)?.rentMes ?? null,
    dcaAuto:      calcDCAAutomatico(ultima),
    sumAsignacion: state.productos.reduce((s, p) => s + (+p.asignacionObjetivo || 0), 0),
    objetivosCompletados,
  };
}

export function checkLogros() {
  if (_locked || desfasada()) return;   // no podría guardarse
  const ctx = logrosContext();
  if (!ctx) return;
  if (!state.logros) state.logros = {};
  const nuevos = LOGROS_DEF.filter(l => !state.logros[l.id] && l.c(ctx));
  if (!nuevos.length) return;
  const fecha = hoyDia();
  nuevos.forEach(l => { state.logros[l.id] = fecha; });
  saveState();
  nuevos.forEach((l, i) => setTimeout(() => showLogroToast(l), i * 4600));
  // Si el modal de logros está abierto, refrescar para reflejar los nuevos.
  if ($("#modalLogros")?.classList.contains("open")) renderLogrosModal();
}

function showLogroToast(l) {
  const el = document.createElement("div");
  el.className = "logro-toast";
  el.innerHTML = `<span class="logro-toast-icon">${l.icon}</span>
    <div>
      <div class="logro-toast-tit">¡Logro desbloqueado!</div>
      <div class="logro-toast-sub">${esc(frase(l.t))} — ${esc(l.d)}</div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 4200);
}

export function abrirLogros() {
  closeDrawer();
  renderLogrosModal();
  $("#modalLogros").classList.add("open");
}

function renderLogrosModal() {
  const body = $("#logrosBody");
  if (!body) return;
  const logros = state.logros || {};
  const total  = LOGROS_DEF.length;
  const n      = LOGROS_DEF.filter(l => logros[l.id]).length;
  const pct    = total ? (n / total) * 100 : 0;

  // Agrupar por categoría preservando el orden de definición
  const grupos = [];
  LOGROS_DEF.forEach(l => {
    let g = grupos.find(x => x.nombre === l.grupo);
    if (!g) { g = { nombre: l.grupo, items: [] }; grupos.push(g); }
    g.items.push(l);
  });

  $("#logrosCount").textContent = `${n}/${total}`;
  const barra = `<div class="logros-progress">
    <div class="logros-progress-track"><div class="logros-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    <div class="logros-progress-label">${n} de ${total} logros desbloqueados · ${pct.toFixed(0)}%</div>
  </div>`;

  const secciones = grupos.map(g => {
    const desbl = g.items.filter(l => logros[l.id]).length;
    const cards = g.items.map(l => {
      const f = logros[l.id];
      return `<div class="logro ${f ? "unlocked" : "locked"}" title="${esc(l.d)}">
        <div class="logro-icon">${l.icon}</div>
        <div class="logro-tit">${esc(l.t)}</div>
        <div class="logro-sub">${f ? `✓ ${esc(f)}` : esc(l.d)}</div>
      </div>`;
    }).join("");
    return `<div class="logros-group">
      <div class="logros-group-title">${esc(g.nombre)} <span class="logros-group-count">${desbl}/${g.items.length}</span></div>
      <div class="logros-grid">${cards}</div>
    </div>`;
  }).join("");

  body.innerHTML = barra + secciones;
}
