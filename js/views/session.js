/* ============================================================
   session.js — Sesión de entrenamiento activa + resumen.
   Registro de series (reps/peso), marcar completadas,
   recordar la última vez, finalizar y ver estadísticas.
   ============================================================ */

import { el, esc, num, fmtDate, fmtTime, fmtDuration, fmtNum, toast, confirmDialog, showModal,
  tsFromDateTime, dateInputValue, timeInputValue } from '../utils.js';
import { navigate } from '../router.js';
import { unitLabel } from '../prefs.js';
import * as store from '../store.js';

/* ---------------- Sesión activa ---------------- */
export async function session(ctx) {
  const s = await store.getSession(ctx.params.id);
  if (!s) return notFound();
  if (s.status === 'finished') { navigate(`#/session/${s.id}/summary`); return { title: '', back: '#/', node: el('<div></div>') }; }

  const node = el('<div></div>');

  // Cabecera de progreso
  const header = el(`
    <div class="card">
      <div class="row between">
        <div class="grow">
          <div style="font-weight:800;font-size:18px">${esc(s.groupName)}</div>
          <div class="sub muted">${fmtDate(s.startedAt)} · ${s.exercises.length} ejercicios</div>
        </div>
        <span class="badge">En curso</span>
      </div>
    </div>`);
  node.appendChild(header);

  // Día y hora de inicio (editables)
  const schedule = el(`
    <div class="card">
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Día</label>
          <input class="input" type="date" id="se-date" value="${dateInputValue(s.startedAt)}">
        </div>
        <div class="field" style="width:130px;margin:0">
          <label>Hora inicio</label>
          <input class="input" type="time" id="se-start" value="${timeInputValue(s.startedAt)}">
        </div>
      </div>
    </div>`);
  const syncStart = () => {
    s.startedAt = tsFromDateTime(schedule.querySelector('#se-date').value, schedule.querySelector('#se-start').value);
    autosave(s);
  };
  schedule.querySelector('#se-date').onchange = syncStart;
  schedule.querySelector('#se-start').onchange = syncStart;
  node.appendChild(schedule);

  // Render de cada ejercicio
  s.exercises.forEach((ex, exIdx) => {
    node.appendChild(renderExercise(s, ex, exIdx));
  });

  // Añadir más ejercicios a la sesión en curso (por grupo o sueltos).
  const addRow = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="add-group">+ Grupo</button>
      <button class="btn ghost" id="add-ex">+ Ejercicio</button>
    </div>`);
  addRow.querySelector('#add-group').onclick = () => openAddGroups(s);
  addRow.querySelector('#add-ex').onclick = () => openAddExercises(s);
  node.appendChild(addRow);

  // Acciones finales
  const actions = el(`
    <div class="btn-row mt">
      <button class="btn danger" id="cancel-session">Descartar</button>
      <button class="btn primary" id="finish-session">Finalizar sesión</button>
    </div>`);
  actions.querySelector('#finish-session').onclick = async () => {
    cancelAutosave(); // descarta un guardado pendiente: persistimos el estado final aquí.
    s.status = 'finished';
    s.finishedAt = Date.now();
    await store.saveSession(s);
    toast('¡Sesión finalizada!', 'success');
    navigate(`#/session/${s.id}/summary`);
  };
  actions.querySelector('#cancel-session').onclick = async () => {
    if (await confirmDialog('¿Descartar esta sesión? Se perderán los datos registrados.', { okText: 'Descartar' })) {
      cancelAutosave(); // evita que un autosave pendiente recree la sesión tras borrarla.
      await store.deleteSession(s.id);
      toast('Sesión descartada');
      navigate('#/');
    }
  };
  node.appendChild(actions);

  return { title: 'Sesión activa', back: '#/', node };
}

/** Persiste cambios de la sesión (debounced ligero). */
let _saveTimer = null;
function autosave(s) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => store.saveSession(s), 350);
}
/** Cancela un autosave pendiente (evita re-escribir una sesión ya borrada/finalizada). */
function cancelAutosave() { clearTimeout(_saveTimer); }

/** Modal para añadir uno o varios grupos a la sesión en curso. */
async function openAddGroups(s) {
  const groups = await store.listGroups();
  if (!groups.length) { toast('No hay grupos. Crea uno primero.', 'error'); return; }

  const selected = new Set();
  const content = el(`
    <div>
      <div class="field">
        <label>Grupos a añadir (puedes elegir varios)</label>
        <div class="chip-grid" id="g-chips"></div>
      </div>
      <button class="btn primary block mt" id="add" disabled>Añadir a la sesión</button>
    </div>`);
  const chipsHost = content.querySelector('#g-chips');
  const addBtn = content.querySelector('#add');
  for (const g of groups) {
    const exCount = g.exerciseIds.length;
    const chip = el(`<button class="chip" type="button">${esc(g.name)}${exCount ? ` · ${exCount}` : ''}</button>`);
    if (exCount === 0) { chip.disabled = true; chip.style.opacity = '0.4'; }
    chip.onclick = () => {
      if (selected.has(g.id)) { selected.delete(g.id); chip.classList.remove('selected'); }
      else { selected.add(g.id); chip.classList.add('selected'); }
      addBtn.disabled = selected.size === 0;
    };
    chipsHost.appendChild(chip);
  }

  const { close } = showModal('Añadir grupo', content);
  addBtn.onclick = async () => {
    if (!selected.size) return;
    const chosen = [];
    for (const g of groups) if (selected.has(g.id)) chosen.push(await store.getGroup(g.id));
    const added = await store.addGroupsToSession(s, chosen);
    close();
    toast(added > 0 ? `${added} ejercicio${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}` : 'Ya estaban todos en la sesión',
      added > 0 ? 'success' : '');
    navigate(`#/session/${s.id}`);
  };
}

/** Modal para añadir ejercicios sueltos a la sesión en curso (con filtro por etiqueta). */
async function openAddExercises(s) {
  const all = await store.listExercises();
  const inSession = new Set(s.exercises.map((e) => e.exerciseId));
  const available = all.filter((e) => !inSession.has(e.id));
  if (!available.length) { toast('Todos los ejercicios ya están en la sesión'); return; }

  const tags = [...new Set(available.flatMap((e) => store.exerciseTags(e)))].sort((a, b) => a.localeCompare(b, 'es'));
  const filter = new Set();
  const selected = new Set();

  const content = el(`
    <div>
      <div class="field" id="filter-field" style="margin-bottom:10px">
        <label>Filtrar por etiqueta</label>
        <div class="chip-grid" id="f-tags"></div>
      </div>
      <div class="field">
        <label>Ejercicios a añadir (puedes elegir varios)</label>
        <div class="chip-grid" id="ex-chips"></div>
      </div>
      <button class="btn primary block mt" id="add" disabled>Añadir a la sesión</button>
    </div>`);
  const fTags = content.querySelector('#f-tags');
  const exChips = content.querySelector('#ex-chips');
  const addBtn = content.querySelector('#add');
  if (!tags.length) content.querySelector('#filter-field').hidden = true;

  function renderChips() {
    fTags.innerHTML = '';
    if (tags.length) {
      const allc = el(`<button class="chip ${filter.size === 0 ? 'selected' : ''}" type="button">Todas</button>`);
      allc.onclick = () => { filter.clear(); renderChips(); };
      fTags.appendChild(allc);
      for (const t of tags) {
        const c = el(`<button class="chip ${filter.has(t) ? 'selected' : ''}" type="button">${esc(t)}</button>`);
        c.onclick = () => { if (filter.has(t)) filter.delete(t); else filter.add(t); renderChips(); };
        fTags.appendChild(c);
      }
    }
    exChips.innerHTML = '';
    const list = filter.size ? available.filter((e) => store.exerciseTags(e).some((t) => filter.has(t))) : available;
    if (!list.length) exChips.appendChild(el('<span class="faint">Ningún ejercicio con ese filtro.</span>'));
    for (const e of list) {
      const c = el(`<button class="chip ${selected.has(e.id) ? 'selected' : ''}" type="button">${esc(e.name)}</button>`);
      c.onclick = () => { if (selected.has(e.id)) selected.delete(e.id); else selected.add(e.id); renderChips(); };
      exChips.appendChild(c);
    }
    addBtn.disabled = selected.size === 0;
  }
  renderChips();

  const { close } = showModal('Añadir ejercicio', content);
  addBtn.onclick = async () => {
    if (!selected.size) return;
    const added = await store.addExercisesToSession(s, [...selected]);
    close();
    toast(`${added} ejercicio${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}`, 'success');
    navigate(`#/session/${s.id}`);
  };
}

function renderExercise(s, ex, exIdx) {
  const card = el(`<div class="card"></div>`);
  const head = el(`
    <div class="row between" style="gap:8px;margin-bottom:4px;align-items:flex-start">
      <div class="grow" style="min-width:0">
        <div style="font-weight:800;font-size:16px;line-height:1.25">${esc(ex.name)}</div>
        ${ex.unilateral ? '<div style="margin-top:6px"><span class="badge" style="white-space:nowrap">Unilateral ×2</span></div>' : ''}
      </div>
      <button class="icon-btn" data-act="rm-ex" aria-label="Quitar ejercicio de la sesión" style="width:34px;height:34px;flex-shrink:0">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
      </button>
    </div>`);
  head.querySelector('[data-act="rm-ex"]').onclick = async () => {
    const logged = (ex.sets || []).some((st) => num(st.reps) > 0 || num(st.weight) > 0);
    const msg = logged
      ? `¿Quitar "${ex.name}" de la sesión? Tiene series registradas que se perderán.`
      : `¿Quitar "${ex.name}" de la sesión?`;
    if (await confirmDialog(msg, { okText: 'Quitar' })) {
      const idx = s.exercises.indexOf(ex);
      if (idx >= 0) s.exercises.splice(idx, 1);
      await store.saveSession(s);
      toast('Ejercicio quitado');
      navigate(`#/session/${s.id}`);
    }
  };
  card.appendChild(head);

  if (ex.previous) {
    card.appendChild(el(`<div class="sub faint" style="margin-bottom:10px">Última vez · ${fmtDate(ex.previous.date)}</div>`));
  } else {
    card.appendChild(el(`<div class="sub faint" style="margin-bottom:10px">Primera vez con este ejercicio</div>`));
  }

  const table = el(`
    <table class="sets-table">
      <thead>
        <tr>
          <th class="set-idx">#</th>
          <th>Anterior</th>
          <th>Reps</th>
          <th>${esc(unitLabel().toUpperCase())}</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>`);
  const tbody = table.querySelector('tbody');

  function renderRows() {
    tbody.innerHTML = '';
    ex.sets.forEach((set, i) => tbody.appendChild(renderSetRow(s, ex, set, i, renderRows)));
  }
  renderRows();
  card.appendChild(table);

  const addBtn = el(`<button class="btn ghost block mt" style="padding:10px">+ Añadir serie</button>`);
  addBtn.onclick = () => {
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ reps: last ? last.reps : 0, weight: last ? last.weight : 0, done: false });
    renderRows();
    autosave(s);
  };
  card.appendChild(addBtn);
  return card;
}

function renderSetRow(s, ex, set, i, renderRows) {
  const prev = ex.previous && ex.previous.sets[i]
    ? `${fmtNum(ex.previous.sets[i].reps)}×${fmtNum(ex.previous.sets[i].weight)}`
    : '—';
  const tr = el(`
    <tr class="set-row ${set.done ? 'done' : ''}">
      <td class="set-idx">${i + 1}</td>
      <td class="prev-cell">${prev}</td>
      <td><input class="input-inline" type="number" inputmode="numeric" min="0" step="1" value="${set.reps || ''}" placeholder="0" data-f="reps"></td>
      <td><input class="input-inline" type="number" inputmode="decimal" min="0" step="0.5" value="${set.weight || ''}" placeholder="0" data-f="weight"></td>
      <td>
        <div class="row" style="gap:2px">
          <button class="set-done-btn ${set.done ? 'done' : ''}" data-act="done" aria-label="Completar serie">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          </button>
          <button class="icon-btn" data-act="del" aria-label="Eliminar serie" style="width:32px;height:32px">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="var(--text-faint)" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </td>
    </tr>`);

  tr.querySelector('[data-f="reps"]').oninput = (e) => { set.reps = num(e.target.value); autosave(s); };
  tr.querySelector('[data-f="weight"]').oninput = (e) => { set.weight = num(e.target.value); autosave(s); };
  tr.querySelector('[data-act="done"]').onclick = () => {
    set.done = !set.done;
    tr.classList.toggle('done', set.done);
    tr.querySelector('[data-act="done"]').classList.toggle('done', set.done);
    autosave(s);
  };
  tr.querySelector('[data-act="del"]').onclick = () => {
    if (ex.sets.length <= 1) { ex.sets[0] = { reps: 0, weight: 0, done: false }; }
    else ex.sets.splice(i, 1);
    renderRows();
    autosave(s);
  };
  return tr;
}

/* ---------------- Resumen / estadísticas de la sesión ---------------- */
export async function sessionSummary(ctx) {
  const s = await store.getSession(ctx.params.id);
  if (!s) return notFound();
  const st = store.sessionStats(s);
  const node = el('<div></div>');

  node.appendChild(el(`
    <div class="card center">
      <span class="badge" style="background:var(--success);color:#fff">Finalizada</span>
      <div style="font-weight:800;font-size:22px;margin-top:10px">${esc(s.groupName)}</div>
      <div class="muted">${fmtDate(s.startedAt)}</div>
    </div>`));

  const statGrid = el(`
    <div class="stat-grid mt">
      <div class="stat"><div class="val">${st.totalVolume}<span class="unit"> ${esc(unitLabel())}</span></div><div class="lbl">Volumen total</div></div>
      <div class="stat"><div class="val">${st.totalSets}</div><div class="lbl">Series</div></div>
      <div class="stat"><div class="val">${st.totalReps}</div><div class="lbl">Repeticiones</div></div>
      <div class="stat"><div class="val" id="dur-val">${fmtDuration(st.duration)}</div><div class="lbl">Duración</div></div>
    </div>`);
  node.appendChild(statGrid);

  // Horario editable (día, inicio y fin) → recalcula la duración en vivo.
  const sched = el(`
    <div class="card mt">
      <div class="section-title" style="margin-top:0">Horario</div>
      <div class="field" style="margin-bottom:10px">
        <label>Día</label>
        <input class="input" type="date" id="h-date" value="${dateInputValue(s.startedAt)}">
      </div>
      <div class="row" style="gap:10px">
        <div class="field grow" style="margin:0">
          <label>Inicio</label>
          <input class="input" type="time" id="h-start" value="${timeInputValue(s.startedAt)}">
        </div>
        <div class="field grow" style="margin:0">
          <label>Fin</label>
          <input class="input" type="time" id="h-end" value="${s.finishedAt ? timeInputValue(s.finishedAt) : ''}">
        </div>
      </div>
      <div class="sub faint mt" id="h-info"></div>
    </div>`);
  const recalc = () => {
    const date = sched.querySelector('#h-date').value;
    const startT = sched.querySelector('#h-start').value;
    const endT = sched.querySelector('#h-end').value;
    s.startedAt = tsFromDateTime(date, startT);
    if (endT) {
      let finished = tsFromDateTime(date, endT);
      // Si la hora de fin es anterior a la de inicio, la sesión cruzó la medianoche.
      if (finished < s.startedAt) finished += 24 * 3600 * 1000;
      s.finishedAt = finished;
    }
    store.saveSession(s);
    const dur = s.finishedAt ? s.finishedAt - s.startedAt : 0;
    statGrid.querySelector('#dur-val').textContent = fmtDuration(dur);
    sched.querySelector('#h-info').textContent = s.finishedAt
      ? `${fmtTime(s.startedAt)} – ${fmtTime(s.finishedAt)}`
      : 'Sin hora de fin';
  };
  sched.querySelectorAll('input').forEach((i) => { i.onchange = recalc; });
  recalc();
  node.appendChild(sched);

  node.appendChild(el('<div class="section-title">Por ejercicio</div>'));
  const list = el('<div class="list"></div>');
  for (const pe of st.perExercise) {
    list.appendChild(el(`
      <div class="item">
        <div class="grow">
          <div class="title">${esc(pe.name)}${pe.unilateral ? ' · Unilateral ×2' : ''}</div>
          <div class="sub">${pe.sets} series · ${pe.reps} reps · máx ${fmtNum(pe.topWeight)} ${esc(unitLabel())}</div>
        </div>
        <div class="badge">${fmtNum(pe.volume)} ${esc(unitLabel())}</div>
      </div>`));
  }
  if (!st.perExercise.length) list.appendChild(el('<div class="empty"><p>No se registraron series.</p></div>'));
  node.appendChild(list);

  const actions = el(`
    <div class="btn-row mt">
      <button class="btn ghost" id="view-reports">Ver informes</button>
      <button class="btn primary" id="go-home">Inicio</button>
    </div>`);
  actions.querySelector('#go-home').onclick = () => navigate('#/');
  actions.querySelector('#view-reports').onclick = () => navigate('#/reports');
  node.appendChild(actions);

  return { title: 'Resumen', back: '#/', node };
}

function notFound() {
  const node = el('<div class="empty"><p>Sesión no encontrada.</p></div>');
  return { title: 'Sesión', back: '#/', node };
}
