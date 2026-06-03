/* ============================================================
   utils.js — Utilidades compartidas: DOM, formato, IDs,
   toast, modales y gráficas SVG.
   ============================================================ */

/* ---------- IDs y fechas ---------- */
export function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Convierte un valor a Date interpretando las cadenas 'YYYY-MM-DD' como
 * fecha LOCAL (no UTC). Sin esto, `new Date('2026-06-01')` se interpreta como
 * medianoche UTC y en zonas horarias detrás de UTC muestra el día anterior.
 */
function toLocalDate(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

export function fmtDate(value) {
  return toLocalDate(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateShort(value) {
  return toLocalDate(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function fmtTime(value) {
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** Construye un timestamp (ms) a partir de fecha 'YYYY-MM-DD' y hora 'HH:MM' (hora local). */
export function tsFromDateTime(dateStr, timeStr) {
  const d = dateStr || todayISO();
  const t = /^\d{2}:\d{2}/.test(timeStr || '') ? timeStr : '00:00';
  const ms = new Date(`${d}T${t}`).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

/** Devuelve 'YYYY-MM-DD' (hora local) a partir de un timestamp. */
export function dateInputValue(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Devuelve 'HH:MM' (hora local) a partir de un timestamp. */
export function timeInputValue(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Duración legible entre dos timestamps (ms). */
export function fmtDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

/* ---------- Números ---------- */
export function round(n, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

export function num(v, fallback = 0) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/** Formatea un número quitando decimales innecesarios. */
export function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(round(n, 1));
}

export const LB_TO_KG = 0.45359237;
export function lbToKg(lb) { return round(num(lb) * LB_TO_KG, 2); }
export function kgToLb(kg) { return round(num(kg) / LB_TO_KG, 2); }

/* ---------- DOM helpers ---------- */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/** Escapa texto para inserción segura en HTML. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ---------- Toast ---------- */
let _toastTimer = null;
export function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast' + (type ? ' ' + type : ''); }, 2400);
}

/* ---------- Modal genérico (bottom sheet) ---------- */
/**
 * Muestra un modal. content puede ser HTMLElement o string HTML.
 * Devuelve { close } y resuelve cuando se cierra.
 */
let _activeModalClose = null;
export function showModal(title, content, { onClose } = {}) {
  // Singleton: cierra cualquier modal anterior para evitar diálogos apilados
  // (p. ej. por un doble toque que abriría dos confirmaciones a la vez).
  if (_activeModalClose) _activeModalClose();

  const backdrop = el('<div class="modal-backdrop"></div>');
  const modal = el('<div class="modal" role="dialog" aria-modal="true"></div>');
  modal.appendChild(el('<div class="modal-handle"></div>'));
  if (title) modal.appendChild(el(`<h3>${esc(title)}</h3>`));
  const body = el('<div class="modal-body"></div>');
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  function close() {
    if (_activeModalClose === close) _activeModalClose = null;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
  _activeModalClose = close;
  return { close, modal, body };
}

/** Confirmación con promesa. */
export function confirmDialog(message, { okText = 'Eliminar', danger = true } = {}) {
  return new Promise((resolve) => {
    const content = el(`
      <div>
        <p class="muted" style="margin-top:0">${esc(message)}</p>
        <div class="btn-row mt">
          <button class="btn ghost" data-act="cancel">Cancelar</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okText)}</button>
        </div>
      </div>`);
    const { close } = showModal('Confirmar', content, { onClose: () => resolve(false) });
    content.querySelector('[data-act="cancel"]').onclick = () => close();
    content.querySelector('[data-act="ok"]').onclick = () => { resolve(true); close(); };
  });
}

/* ---------- Gráfica de líneas SVG ---------- */
/**
 * Genera un SVG de gráfica de líneas.
 * points: [{ x: label, y: number }]
 */
export function lineChart(points, { unit = '', height = 180 } = {}) {
  if (!points || points.length === 0) {
    return '<div class="empty"><p>Sin datos suficientes.</p></div>';
  }
  const W = 320, H = height;
  const padL = 38, padR = 12, padT = 16, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) { min = min - 1; max = max + 1; }
  const range = max - min;

  const n = points.length;
  const xAt = (i) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v) => padT + innerH - ((v - min) / range) * innerH;

  // Líneas de cuadrícula y etiquetas Y (3 niveles)
  let grid = '';
  for (let k = 0; k <= 2; k++) {
    const v = min + (range * k) / 2;
    const y = yAt(v);
    grid += `<line class="chart-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="chart-axis-label" x="4" y="${(y + 3).toFixed(1)}">${fmtNum(round(v, 1))}</text>`;
  }

  const linePts = points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${(W - padR)},${padT + innerH}`;

  const dots = points.map((p, i) =>
    `<circle class="chart-dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="3"/>`).join('');

  // Etiquetas X: primera, media y última para no saturar
  const idxs = n <= 4 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = idxs.map((i) => {
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    return `<text class="chart-axis-label" x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(points[i].x)}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfica de progreso">
        ${grid}
        <polygon class="chart-area" points="${areaPts}"/>
        <polyline class="chart-line" points="${linePts}"/>
        ${dots}
        ${xLabels}
      </svg>
    </div>`;
}

/* ---------- Gráfica de barras SVG ---------- */
/**
 * Genera un SVG de gráfica de barras. El eje Y siempre parte de 0.
 * points: [{ x: label, y: number }]
 */
export function barChart(points, { height = 160 } = {}) {
  if (!points || points.length === 0) {
    return '<div class="empty"><p>Sin datos suficientes.</p></div>';
  }
  const W = 320, H = height;
  const padL = 30, padR = 12, padT = 16, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...points.map((p) => p.y), 1);
  const n = points.length;
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(26, slot * 0.7));

  // Líneas de cuadrícula y etiquetas Y (3 niveles)
  let grid = '';
  for (let k = 0; k <= 2; k++) {
    const v = (max * k) / 2;
    const y = padT + innerH - (v / max) * innerH;
    grid += `<line class="chart-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="chart-axis-label" x="4" y="${(y + 3).toFixed(1)}">${fmtNum(round(v, 1))}</text>`;
  }

  const bars = points.map((p, i) => {
    const h = (p.y / max) * innerH;
    const x = padL + slot * i + (slot - barW) / 2;
    const y = padT + innerH - h;
    if (p.y <= 0) return '';
    return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 2).toFixed(1)}" rx="2"/>`;
  }).join('');

  // Etiquetas X: primera, media y última para no saturar
  const idxs = n <= 4 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = idxs.map((i) => {
    const cx = padL + slot * i + slot / 2;
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    const x = i === 0 ? padL : (i === n - 1 ? W - padR : cx);
    return `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(points[i].x)}</text>`;
  }).join('');

  return `
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfica de barras">
        ${grid}
        ${bars}
        ${xLabels}
      </svg>
    </div>`;
}
