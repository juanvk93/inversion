import { PROY_MESES_MIN, acotarMediaMensual, memoMonteCarlo, simulateMonteCarlo, statsTotalCalc, tasaMensualEq, tasaProyeccion } from "../calc.js";
import { saveState, state } from "../state.js";
import { $, $$, esc, fmt, fmtE } from "../utils.js";
import { setAccentVars } from "./render.js";

export function renderFIRE() {
  const fireColor = "#34D399";
  const filasTot  = statsTotalCalc(state);
  const valorAct  = filasTot.length ? filasTot.at(-1).valor : 0;
  // TIR histórica acotada; null con menos de PROY_MESES_MIN meses (ver calc.js)
  const tp        = tasaProyeccion(filasTot);
  const tirHist   = tp.tasa;

  // Aportación: media últimos 3 meses (igual criterio que proyección)
  const ultimos = filasTot.slice(-3);
  const aportMensual = ultimos.length
    ? Math.round(ultimos.reduce((s,f) => s + f.aportacion, 0) / ultimos.length)
    : 0;

  const gasto      = state.fireGasto || 2000;
  const regla      = state.fireRegla || 0.04;
  const infl       = state.inflacion || 0;
  const inflMensual = Math.pow(1 + infl, 1/12) - 1;
  const capitalObj = (gasto * 12) / regla;
  const gap        = capitalObj - valorAct;
  const pctCompl   = capitalObj > 0 ? Math.min((valorAct / capitalObj) * 100, 100) : 0;

  // Año estimado FIRE: proyecta con TIR histórica (o 6% fallback) hasta cruzar capitalObj.
  // Se usa la rentabilidad REAL (descontada la inflación) porque el capital objetivo está en
  // € de hoy y la regla de retirada ya asume retiros ajustados a inflación.
  const usaFallback = !(tirHist != null && tirHist > 0);
  const tasaProy = usaFallback ? 0.06 : tirHist;
  const tasaReal = (1 + tasaProy) / (1 + infl) - 1;
  const motivoFallback = tp.insuficiente
    ? (filasTot.length ? `historial de ${tp.meses} meses; hacen falta ${PROY_MESES_MIN}` : "")
    : (tirHist != null ? `tu TIR histórica, ${(tirHist*100).toFixed(1)}%, no es positiva` : "");
  const tasaTxt  = usaFallback
    ? `6% por defecto${motivoFallback ? ` (${motivoFallback})` : ""}`
    : `tu TIR histórica (${(tirHist*100).toFixed(1)}%${tp.acotada ? `, acotada; real ${(tp.tir*100).toFixed(1)}%` : ""})`;
  let anoFire = null, mesesFire = null, inalcanzable = false;
  if (valorAct < capitalObj) {
    const tasaM = tasaMensualEq(tasaReal);
    let v = valorAct, m = 0;
    const maxMeses = 80 * 12;   // tope 80 años para evitar loop infinito
    while (v < capitalObj && m < maxMeses) {
      v = v * (1 + tasaM) + aportMensual;
      m++;
    }
    if (m < maxMeses) {
      mesesFire = m;
      const h = new Date();
      anoFire = new Date(h.getFullYear(), h.getMonth() + m, 1).getFullYear();
    } else if (filasTot.length) {
      inalcanzable = true;   // con estos parámetros no se llega (p. ej. rentabilidad real ≤ 0)
    }
  } else {
    mesesFire = 0;
    anoFire   = new Date().getFullYear();
  }

  // Monte Carlo: probabilidad de alcanzar el objetivo en cada horizonte
  const rentMensuales = filasTot.filter(f => f.rentMes != null).map(f => f.rentMes);
  let mcProbs = null;
  if (!tp.insuficiente && rentMensuales.length >= 6 && valorAct > 0) {
    const mediaHist = rentMensuales.reduce((s,v) => s+v, 0) / rentMensuales.length;
    const mediaPct  = acotarMediaMensual(mediaHist / 100) * 100;
    const variancia = rentMensuales.reduce((s,v) => s + (v - mediaHist)**2, 0) / (rentMensuales.length - 1);
    const stdPct    = Math.sqrt(variancia);
    const horizontes = [5, 10, 15, 20, 25, 30];
    const maxMeses   = Math.max(...horizontes) * 12;
    const nSims      = 1500;
    const params = {
      valorInicial: valorAct,
      aportMensual,
      meses: maxMeses,
      mediaMensual: mediaPct / 100 - inflMensual,   // retorno real (descontada inflación)
      stdMensual:   stdPct / 100,
      nSims,
    };
    mcProbs = memoMonteCarlo(`fire|${JSON.stringify(params)}|${capitalObj}`, () => {
      const trays = simulateMonteCarlo(params);
      return horizontes.map(h => {
        const mIdx = h * 12;
        const exitos = trays.reduce((acc, t) => acc + (t[mIdx] >= capitalObj ? 1 : 0), 0);
        return { ano: h, pct: (exitos / nSims) * 100 };
      });
    });
  }

  const fechaActual = new Date();
  const anosRest    = mesesFire != null ? (mesesFire / 12) : null;

  const REGLAS = [
    { v: 0.03,  l: "3%",   desc: "Muy conservador" },
    { v: 0.035, l: "3.5%", desc: "Conservador"     },
    { v: 0.04,  l: "4%",   desc: "Estándar (Trinity)" },
    { v: 0.05,  l: "5%",   desc: "Agresivo"        },
  ];

  setAccentVars(fireColor);

  const html = `
    <div class="title-row">
      <div>
        <h2>Plan FIRE</h2>
        <div class="subtitle">Financial Independence · Retire Early</div>
      </div>
    </div>

    <div class="fire-controls">
      <div>
        <div class="label-row">
          <label>Gasto mensual deseado</label>
          <span class="val">${fmtE(gasto)}</span>
        </div>
        <input type="range" min="500" max="10000" step="100" value="${gasto}" id="rangeFireGasto" style="accent-color:${fireColor}">
        <div class="range-marks">
          <span>500€</span><span>10.000€</span>
        </div>
      </div>
      <div>
        <div class="label-row">
          <label>Regla de retirada</label>
          <span class="val">${(regla*100).toFixed(1)}%</span>
        </div>
        <div class="fire-reglas">
          ${REGLAS.map(r => `
            <button class="${Math.abs(r.v - regla) < 0.001 ? "active" : ""}" data-regla="${r.v}">
              <span class="fr-l">${r.l}</span>
              <span class="fr-d">${r.desc}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="fire-infl-ctrl">
        <div class="label-row">
          <label>Inflación anual
            <span class="kpi-info" tabindex="0" role="button" aria-label="Información" data-tip="Descuenta la inflación de la rentabilidad esperada. El año FIRE y las probabilidades se calculan en € reales (poder adquisitivo de hoy). Ponlo a 0% para el cálculo nominal.">i</span>
          </label>
          <span class="val">${fmt(infl*100, 1)}%</span>
        </div>
        <input type="range" min="0" max="6" step="0.1" value="${(infl*100).toFixed(1)}" id="rangeFireInfl" style="accent-color:${fireColor}">
        <div class="range-marks">
          ${[0, 2, 3, 5].map(v => `<button class="${Math.abs(infl*100 - v) < 0.05 ? "active" : ""}" data-infl-fire="${v}">${v}%</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">Capital objetivo
          <span class="kpi-info" tabindex="0" role="button" aria-label="Información" data-tip="Capital necesario para vivir indefinidamente de las rentas. Calculado como gasto_anual ÷ regla_retirada. Con la regla del 4%, equivale a 25× tu gasto anual.">i</span>
        </div>
        <div class="kpi-value" style="color:${fireColor}">${fmtE(capitalObj)}</div>
        <div class="kpi-sub">${fmtE(gasto)} × 12 ÷ ${(regla*100).toFixed(1)}%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Valor actual</div>
        <div class="kpi-value" style="color:var(--accent)">${fmtE(valorAct)}</div>
        <div class="kpi-sub">${pctCompl.toFixed(1)}% del objetivo</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${gap > 0 ? "Te faltan" : "Excedente"}</div>
        <div class="kpi-value" style="color:${gap > 0 ? "var(--red)" : "var(--green)"}">${gap > 0 ? fmtE(gap) : `+${fmtE(-gap)}`}</div>
        <div class="kpi-sub">${gap > 0 ? `Faltan para FIRE` : "Ya puedes parar 🎉"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Año estimado FIRE
          <span class="kpi-info" tabindex="0" role="button" aria-label="Información" data-tip="Proyección determinista con ${esc(tasaTxt)}${infl > 0 ? ` ajustada por inflación → rentabilidad real ${(tasaReal*100).toFixed(1)}%` : ''} y aportación mensual media de los últimos 3 meses (${fmtE(aportMensual)}). El año real puede variar significativamente.">i</span>
        </div>
        <div class="kpi-value" style="color:${anoFire ? fireColor : "var(--dimmer)"}">${anoFire ?? "—"}</div>
        <div class="kpi-sub">${anosRest != null ? `En ${anosRest.toFixed(1)} años` : inalcanzable ? "No alcanzable en 80 años con estos parámetros" : "Datos insuficientes"}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Progreso hacia FIRE</div>
      <div class="fire-progress-track">
        <div class="fire-progress-fill" style="width:${pctCompl.toFixed(2)}%;background:${fireColor}"></div>
        <div class="fire-progress-label">${pctCompl.toFixed(1)}%</div>
      </div>
      <div class="fire-progress-foot">
        <span>${fmtE(0)}</span>
        <span style="color:${fireColor}">${fmtE(valorAct)} actual</span>
        <span>${fmtE(capitalObj)} objetivo</span>
      </div>
    </div>

    ${mcProbs ? `
      <div class="panel">
        <div class="panel-title">Probabilidad Monte Carlo · 1500 trayectorias</div>
        <p class="mc-foot" style="margin-bottom:12px;text-align:left">Probabilidad de alcanzar el objetivo de ${fmtE(capitalObj)} en cada horizonte.</p>
        <div class="fire-probs">
          ${mcProbs.map(p => `
            <div class="fire-prob">
              <div class="fp-y">${p.ano} años</div>
              <div class="fp-bar"><div class="fp-fill" style="width:${p.pct.toFixed(1)}%;background:${p.pct >= 75 ? "var(--green)" : p.pct >= 50 ? "var(--yellow)" : p.pct >= 25 ? "var(--gold)" : "var(--red)"}"></div></div>
              <div class="fp-v">${p.pct.toFixed(0)}%</div>
            </div>`).join("")}
        </div>
      </div>` : ""}

    <div class="panel">
      <div class="panel-title">Equivalencias</div>
      <div class="fire-eq">
        <div><span class="fe-l">Capital objetivo equivale a</span> <span class="fe-v">${(capitalObj / gasto).toFixed(0)} meses de gasto</span></div>
        <div><span class="fe-l">Rentabilidad usada en la proyección</span> <span class="fe-v">${usaFallback ? `6% (por defecto${motivoFallback ? `; ${esc(motivoFallback)}` : ""})` : `${(tirHist*100).toFixed(1)}% (TIR histórica${tp.acotada ? ", acotada" : ""})`}</span></div>
        <div><span class="fe-l">Aportación mensual media</span> <span class="fe-v">${fmtE(aportMensual)}</span></div>
        <div><span class="fe-l">Renta pasiva mensual al alcanzar FIRE</span> <span class="fe-v" style="color:${fireColor}">${fmtE(capitalObj * regla / 12)}</span></div>
      </div>
    </div>

    <p class="disclaimer">Cálculo orientativo basado en la regla de retirada constante (Trinity Study). ${infl > 0 ? `El año estimado y las probabilidades se calculan en € reales, descontando una inflación anual del ${fmt(infl*100,1)}%.` : "Inflación al 0%: cálculo en términos nominales."} No considera fiscalidad ni shocks de mercado. La regla del 4% asume un horizonte de 30 años con cartera 60/40.</p>
  `;

  $("#main").innerHTML = html;

  // Sliders: durante el arrastre solo cambia la etiqueta; al soltar se guarda y
  // se recalcula (re-renderizar en cada paso recreaba el slider y cortaba el arrastre).
  const setVal = (el, txt) => { const v = el.parentElement.querySelector(".val"); if (v) v.textContent = txt; };
  $("#rangeFireGasto").oninput  = (e) => { state.fireGasto = +e.target.value; setVal(e.target, fmtE(state.fireGasto)); };
  $("#rangeFireGasto").onchange = () => { saveState(); renderFIRE(); };
  $$('[data-regla]').forEach(b => b.onclick = () => {
    state.fireRegla = parseFloat(b.dataset.regla);
    saveState();
    renderFIRE();
  });
  $("#rangeFireInfl").oninput  = (e) => { state.inflacion = +e.target.value / 100; setVal(e.target, `${fmt(state.inflacion*100, 1)}%`); };
  $("#rangeFireInfl").onchange = () => { saveState(); renderFIRE(); };
  $$('[data-infl-fire]').forEach(b => b.onclick = () => {
    state.inflacion = +b.dataset.inflFire / 100;
    saveState();
    renderFIRE();
  });
}
