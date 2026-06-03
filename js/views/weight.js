/* ============================================================
   weight.js — Registrar peso corporal y ver su evolución.
   ============================================================ */

import { el, esc, num, round, todayISO, fmtDate, fmtDateShort, fmtNum, toast, confirmDialog, lineChart } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

export async function weight() {
  const node = el('<div></div>');
  const records = await store.listBodyweight();
  const u = unitLabel();

  // Formulario de registro
  const form = el(`
    <div class="card">
      <div class="row" style="gap:10px;align-items:flex-end">
        <div class="field grow" style="margin:0">
          <label>Fecha</label>
          <input class="input" type="date" id="w-date" value="${todayISO()}">
        </div>
        <div class="field" style="margin:0;width:110px">
          <label>Peso (${esc(u)})</label>
          <input class="input" type="number" inputmode="decimal" step="0.1" min="0" id="w-val" placeholder="0.0">
        </div>
      </div>
      <button class="btn primary block mt" id="w-save">Registrar peso</button>
    </div>`);
  form.querySelector('#w-save').onclick = async () => {
    const date = form.querySelector('#w-date').value;
    const val = num(form.querySelector('#w-val').value);
    if (!date || val <= 0) { toast('Introduce una fecha y un peso válido', 'error'); return; }
    await store.saveBodyweight({ date, weight: val });
    toast('Peso registrado', 'success');
    navigate('#/weight');
  };
  node.appendChild(form);

  // Evolución del peso
  if (records.length) {
    node.appendChild(el('<div class="section-title">Evolución</div>'));
    const first = records[0].weight;
    const last = records[records.length - 1].weight;
    const min = Math.min(...records.map((r) => r.weight));
    const max = Math.max(...records.map((r) => r.weight));
    const diff = round(last - first, 2);
    const sign = diff > 0 ? '+' : '';
    const diffColor = diff > 0 ? 'var(--warning)' : (diff < 0 ? 'var(--success)' : 'var(--text-faint)');

    node.appendChild(el(`
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="val">${fmtNum(last)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Actual</div></div>
        <div class="stat"><div class="val" style="color:${diffColor}">${sign}${fmtNum(diff)}<span class="unit"> ${esc(u)}</span></div><div class="lbl">Variación</div></div>
        <div class="stat"><div class="val">${fmtNum(min)}–${fmtNum(max)}</div><div class="lbl">Rango</div></div>
      </div>`));

    if (records.length >= 2) {
      const points = records.map((r) => ({ x: fmtDateShort(r.date), y: r.weight }));
      node.appendChild(el(`<div class="card mt">${lineChart(points, { unit: u })}<div class="faint center" style="font-size:12px;margin-top:6px">Peso (${esc(u)}) por fecha</div></div>`));
    } else {
      node.appendChild(el('<div class="card"><div class="empty"><p>Registra al menos 2 pesos para ver la gráfica.</p></div></div>'));
    }
  }

  node.appendChild(el('<div class="section-title">Historial</div>'));
  if (!records.length) {
    node.appendChild(el('<div class="empty"><p>Aún no has registrado tu peso.</p></div>'));
  } else {
    const list = el('<div class="list"></div>');
    // Más reciente primero, con delta respecto al anterior.
    const reversed = records.slice().reverse();
    reversed.forEach((r, i) => {
      const prev = reversed[i + 1];
      let delta = '';
      if (prev) {
        const d = r.weight - prev.weight;
        const sign = d > 0 ? '+' : '';
        const color = d > 0 ? 'var(--warning)' : (d < 0 ? 'var(--success)' : 'var(--text-faint)');
        delta = `<span style="color:${color};font-weight:700">${sign}${fmtNum(d)} ${esc(u)}</span>`;
      }
      const item = el(`
        <div class="item">
          <div class="grow">
            <div class="title">${fmtNum(r.weight)} ${esc(u)}</div>
            <div class="sub">${fmtDate(r.date)}</div>
          </div>
          ${delta}
          <button class="icon-btn" data-act="del" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>`);
      item.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog('¿Eliminar este registro de peso?')) {
          await store.deleteBodyweight(r.id);
          toast('Registro eliminado', 'success');
          navigate('#/weight');
        }
      };
      list.appendChild(item);
    });
    node.appendChild(list);
  }

  return { title: 'Registrar peso', back: '#/settings', node };
}
