/* ============================================================
   calendar.js — Calendario de sesiones.
   Marca los días con sesiones registradas y permite ver las
   sesiones de un día concreto. Navegación por meses.
   ============================================================ */

import { el, esc, fmtDuration, dateInputValue } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export async function calendar() {
  const node = el('<div></div>');
  const sessions = await store.listSessions();

  // Agrupa las sesiones por día (clave local YYYY-MM-DD).
  const byDay = new Map();
  for (const s of sessions) {
    const k = dateInputValue(s.startedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }

  const now = new Date();
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  let viewY = now.getFullYear();
  let viewM = now.getMonth();
  let selectedKey = byDay.has(todayKey) ? todayKey : null;

  // --- Cabecera de navegación de mes ---
  const header = el(`
    <div class="cal-header">
      <button class="icon-btn" id="prev" aria-label="Mes anterior">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div id="cal-label" style="font-weight:800;font-size:17px"></div>
      <button class="icon-btn" id="next" aria-label="Mes siguiente">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>`);
  node.appendChild(header);

  const card = el('<div class="card"></div>');
  const dowRow = el('<div class="cal-grid" style="margin-bottom:6px"></div>');
  for (const d of DOW) dowRow.appendChild(el(`<div class="cal-dow">${d}</div>`));
  card.appendChild(dowRow);
  const grid = el('<div class="cal-grid"></div>');
  card.appendChild(grid);
  node.appendChild(card);

  // Resumen del mes.
  const monthInfo = el('<div class="muted center" style="font-size:13px;margin:10px 0 0"></div>');
  node.appendChild(monthInfo);

  // Panel del día seleccionado.
  const panel = el('<div id="cal-panel"></div>');
  node.appendChild(panel);

  function renderGrid() {
    header.querySelector('#cal-label').textContent = `${MONTHS[viewM]} ${viewY}`;
    grid.innerHTML = '';

    const first = new Date(viewY, viewM, 1);
    const startDow = (first.getDay() + 6) % 7; // semana empieza en lunes
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();

    for (let i = 0; i < startDow; i++) grid.appendChild(el('<div class="cal-day empty"></div>'));

    let daysWithSessions = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = keyOf(viewY, viewM, d);
      const has = byDay.has(k);
      if (has) daysWithSessions++;
      const cls = ['cal-day'];
      if (has) cls.push('has');
      if (k === todayKey) cls.push('today');
      if (k === selectedKey) cls.push('selected');
      const cell = el(`<button class="${cls.join(' ')}">${d}${has ? '<span class="cal-dot"></span>' : ''}</button>`);
      cell.onclick = () => { selectedKey = (selectedKey === k ? null : k); renderGrid(); renderPanel(); };
      grid.appendChild(cell);
    }

    monthInfo.textContent = daysWithSessions
      ? `${daysWithSessions} día${daysWithSessions === 1 ? '' : 's'} con sesión este mes`
      : 'Sin sesiones este mes';
  }

  function renderPanel() {
    panel.innerHTML = '';
    if (!selectedKey) return;
    const list = byDay.get(selectedKey) || [];
    const [y, m, d] = selectedKey.split('-').map(Number);
    const titleDate = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    panel.appendChild(el(`<div class="section-title">${esc(titleDate.charAt(0).toUpperCase() + titleDate.slice(1))}</div>`));

    if (!list.length) {
      panel.appendChild(el('<div class="empty"><p>No hay sesiones este día.</p></div>'));
      return;
    }
    const wrap = el('<div class="list"></div>');
    for (const s of list) {
      const st = store.sessionStats(s);
      const active = s.status === 'active';
      const item = el(`
        <div class="item clickable">
          <div class="grow">
            <div class="title">${esc(s.groupName)} ${active ? '<span class="badge">En curso</span>' : ''}</div>
            <div class="sub">${st.totalSets} series · ${st.totalVolume} ${esc(unitLabel())} vol · ${fmtDuration(st.duration)}</div>
          </div>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-faint)" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>`);
      item.onclick = () => navigate(active ? `#/session/${s.id}` : `#/session/${s.id}/summary`);
      wrap.appendChild(item);
    }
    panel.appendChild(wrap);
  }

  header.querySelector('#prev').onclick = () => {
    viewM--; if (viewM < 0) { viewM = 11; viewY--; }
    renderGrid();
  };
  header.querySelector('#next').onclick = () => {
    viewM++; if (viewM > 11) { viewM = 0; viewY++; }
    renderGrid();
  };

  renderGrid();
  renderPanel();

  return { title: 'Calendario', back: false, node };
}
