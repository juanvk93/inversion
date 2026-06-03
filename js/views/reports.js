/* ============================================================
   reports.js — Informes y progresión.
   Filtro por periodo, resumen global, volumen por sesión,
   frecuencia y rachas, duración, volumen por grupo muscular,
   récords personales y progreso por ejercicio (con 1RM estimado).
   ============================================================ */

import { el, esc, fmtNum, fmtDateShort, fmtDuration, lineChart, barChart } from '../utils.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

/** Periodos del filtro global. `days: null` = todo el histórico. */
const PERIODS = [
  { key: '4w', label: '4 semanas', days: 28 },
  { key: '3m', label: '3 meses', days: 91 },
  { key: '1y', label: '1 año', days: 365 },
  { key: 'all', label: 'Todo', days: null },
];

const PR_VISIBLE = 8; // récords mostrados antes del botón "Ver todos"

export async function reports() {
  const node = el('<div></div>');

  // Sin ninguna sesión finalizada no hay nada que informar.
  const hasAny = (await store.globalStats()).sessionCount > 0;
  if (!hasAny) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
        <p>Aún no hay datos de progreso.</p>
        <p class="faint">Finaliza alguna sesión para ver tus informes.</p>
      </div>`));
    return { title: 'Informes', back: false, node };
  }

  // ---- Estado de la vista (sobrevive a los repintados por cambio de periodo)
  let period = 'all';
  let currentExerciseId = '';
  let currentMetric = 'topWeight';

  const exercises = await store.listExercises();
  const prs = await store.personalRecords(); // siempre sobre todo el histórico

  // ---- Filtro de periodo
  const chips = el(`<div class="chip-grid mb">${PERIODS.map((p) =>
    `<button class="chip${p.key === period ? ' selected' : ''}" data-period="${p.key}">${esc(p.label)}</button>`).join('')}</div>`);
  node.appendChild(chips);
  chips.querySelectorAll('[data-period]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.period === period) return;
      period = b.dataset.period;
      chips.querySelectorAll('[data-period]').forEach((x) => x.classList.toggle('selected', x === b));
      render();
    };
  });

  const content = el('<div></div>');
  node.appendChild(content);

  async function render() {
    const days = PERIODS.find((p) => p.key === period).days;
    const since = days ? Date.now() - days * 24 * 3600 * 1000 : null;
    const u = unitLabel();

    const [g, freq, dur, byTag] = await Promise.all([
      store.globalStats({ since }),
      store.frequencyStats({ since }),
      store.durationStats({ since }),
      store.volumeByTag({ since }),
    ]);

    content.innerHTML = '';

    if (!g.sessionCount) {
      content.appendChild(el('<div class="card"><div class="empty"><p>No hay sesiones en este periodo.</p></div></div>'));
    } else {
      // ---- Resumen global
      content.appendChild(el(`
        <div class="stat-grid">
          <div class="stat"><div class="val">${g.sessionCount}</div><div class="lbl">Sesiones</div></div>
          <div class="stat"><div class="val">${fmtNum(g.totalVolume)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Volumen total</div></div>
          <div class="stat"><div class="val">${g.totalSets}</div><div class="lbl">Series</div></div>
          <div class="stat"><div class="val">${g.totalReps}</div><div class="lbl">Repeticiones</div></div>
        </div>`));

      // ---- Volumen por sesión
      content.appendChild(el('<div class="section-title">Volumen por sesión</div>'));
      const volPoints = g.volumeByDate.map((d) => ({ x: fmtDateShort(d.date), y: d.volume }));
      content.appendChild(el(`<div class="card">${lineChart(volPoints, { unit: u })}</div>`));

      // ---- Frecuencia y constancia
      content.appendChild(el('<div class="section-title">Frecuencia y constancia</div>'));
      content.appendChild(el(`
        <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="val">${freq.currentStreak}<span class="unit"> sem</span></div><div class="lbl">Racha actual</div></div>
          <div class="stat"><div class="val">${freq.bestStreak}<span class="unit"> sem</span></div><div class="lbl">Mejor racha</div></div>
          <div class="stat"><div class="val">${fmtNum(freq.avgPerWeek)}</div><div class="lbl">Sesiones/semana</div></div>
        </div>`));
      const weekPoints = freq.weeks.map((w) => ({ x: fmtDateShort(w.start), y: w.count }));
      content.appendChild(el(`<div class="card mt">${barChart(weekPoints)}<div class="faint center" style="font-size:12px;margin-top:6px">Sesiones por semana</div></div>`));

      // ---- Duración de los entrenamientos
      content.appendChild(el('<div class="section-title">Duración de los entrenamientos</div>'));
      if (!dur.count) {
        content.appendChild(el('<div class="card"><div class="empty"><p>Sin sesiones con hora de inicio y fin.</p></div></div>'));
      } else {
        content.appendChild(el(`
          <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
            <div class="stat"><div class="val">${fmtDuration(dur.avgMs)}</div><div class="lbl">Media</div></div>
            <div class="stat"><div class="val">${fmtDuration(dur.longestMs)}</div><div class="lbl">Más largo</div></div>
            <div class="stat"><div class="val">${fmtDuration(dur.totalMs)}</div><div class="lbl">Tiempo total</div></div>
          </div>`));
        const durPoints = dur.series.map((d) => ({ x: fmtDateShort(d.date), y: Math.round(d.ms / 60000) }));
        content.appendChild(el(`<div class="card mt">${lineChart(durPoints, { unit: 'min' })}<div class="faint center" style="font-size:12px;margin-top:6px">Minutos por sesión</div></div>`));
      }

      // ---- Volumen por grupo muscular (etiqueta)
      content.appendChild(el('<div class="section-title">Volumen por grupo muscular</div>'));
      if (!byTag.length) {
        content.appendChild(el('<div class="card"><div class="empty"><p>Aún no hay volumen por etiqueta.</p></div></div>'));
      } else {
        const max = Math.max(...byTag.map((t) => t.volume)) || 1;
        const card = el('<div class="card"></div>');
        for (const t of byTag) {
          const pct = Math.max(2, Math.round((t.volume / max) * 100));
          card.appendChild(el(`
            <div style="margin-bottom:12px">
              <div class="row between" style="font-size:13px;margin-bottom:5px">
                <span style="font-weight:700">${esc(t.tag)}</span>
                <span class="muted">${fmtNum(t.volume)} ${esc(u)} · ${t.sets} series</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            </div>`));
        }
        content.appendChild(card);
      }
    }

    // ---- Récords personales (siempre sobre todo el histórico)
    content.appendChild(el('<div class="section-title">Récords personales</div>'));
    if (!prs.length) {
      content.appendChild(el('<div class="card"><div class="empty"><p>Aún no hay récords registrados.</p></div></div>'));
    } else {
      const card = el('<div class="card"></div>');
      const prRow = (r) => el(`
        <div class="pr-item">
          <div class="row between" style="margin-bottom:4px">
            <span style="font-weight:700">${esc(r.name)}${r.isRecent ? ' <span class="badge">Nuevo PR</span>' : ''}</span>
            <span class="faint" style="font-size:12px">${fmtDateShort(r.best1RM.date)}</span>
          </div>
          <div class="row muted" style="gap:14px;font-size:13px;flex-wrap:wrap">
            <span>Peso máx <b>${fmtNum(r.topWeight.weight)} ${esc(u)}</b></span>
            <span>Mejor serie <b>${fmtNum(r.bestSet.weight)} × ${fmtNum(r.bestSet.reps)}</b></span>
            <span>1RM est. <b>${fmtNum(r.best1RM.value)} ${esc(u)}</b></span>
          </div>
        </div>`);
      for (const r of prs.slice(0, PR_VISIBLE)) card.appendChild(prRow(r));
      if (prs.length > PR_VISIBLE) {
        const more = el(`<button class="btn ghost mt" style="width:100%">Ver todos (${prs.length})</button>`);
        more.onclick = () => {
          for (const r of prs.slice(PR_VISIBLE)) card.insertBefore(prRow(r), more);
          more.remove();
        };
        card.appendChild(more);
      }
      content.appendChild(card);
    }

    // ---- Progreso por ejercicio (selector + métrica)
    content.appendChild(el('<div class="section-title">Progreso por ejercicio</div>'));
    const card = el('<div class="card"></div>');
    const select = el('<select class="input mb"></select>');
    select.appendChild(el('<option value="">Selecciona un ejercicio…</option>'));
    for (const ex of exercises) select.appendChild(el(`<option value="${esc(ex.id)}">${esc(ex.name)}</option>`));
    select.value = currentExerciseId;
    card.appendChild(select);

    const metricRow = el(`
      <div class="chip-grid mb" hidden>
        <button class="chip${currentMetric === 'topWeight' ? ' selected' : ''}" data-metric="topWeight">Peso máximo</button>
        <button class="chip${currentMetric === 'est1RM' ? ' selected' : ''}" data-metric="est1RM">1RM est.</button>
        <button class="chip${currentMetric === 'volume' ? ' selected' : ''}" data-metric="volume">Volumen</button>
      </div>`);
    card.appendChild(metricRow);

    const chartHost = el('<div></div>');
    card.appendChild(chartHost);
    content.appendChild(card);

    let currentSeries = [];

    async function loadExercise(id) {
      currentExerciseId = id;
      if (!id) { metricRow.hidden = true; chartHost.innerHTML = ''; return; }
      currentSeries = await store.exerciseProgress(id, { since });
      metricRow.hidden = false;
      drawChart();
    }
    function drawChart() {
      if (!currentSeries.length) {
        chartHost.innerHTML = '<div class="empty"><p>Sin registros para este ejercicio en este periodo.</p></div>';
        return;
      }
      const points = currentSeries.map((s) => ({ x: fmtDateShort(s.date), y: s[currentMetric] }));
      chartHost.innerHTML = lineChart(points, { unit: u });
    }

    select.onchange = () => loadExercise(select.value);
    metricRow.querySelectorAll('[data-metric]').forEach((b) => {
      b.onclick = () => {
        currentMetric = b.dataset.metric;
        metricRow.querySelectorAll('[data-metric]').forEach((x) => x.classList.toggle('selected', x === b));
        drawChart();
      };
    });

    if (currentExerciseId) await loadExercise(currentExerciseId);
  }

  await render();
  return { title: 'Informes', back: false, node };
}
