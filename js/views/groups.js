/* ============================================================
   groups.js — Configurador de grupos de ejercicios.
   Un grupo agrupa varios ejercicios (p. ej. "Bíceps y Espalda").
   ============================================================ */

import { el, esc, toast, showModal, confirmDialog } from '../utils.js';
import { navigate } from '../router.js';
import * as store from '../store.js';

export async function groups() {
  const node = el('<div></div>');
  const list = await store.listGroups();
  const allExercises = await store.listExercises();

  const addBtn = el(`<button class="btn primary block" id="add">+ Nuevo grupo</button>`);
  addBtn.onclick = () => openForm(null, allExercises);
  node.appendChild(addBtn);

  if (!allExercises.length) {
    node.appendChild(el(`
      <div class="card mt" style="border-color:var(--warning)">
        <p class="muted" style="margin:0">Primero crea algún ejercicio para poder añadirlo a un grupo.</p>
        <button class="btn ghost block mt" id="go-ex">Ir a Ejercicios</button>
      </div>`));
    node.querySelector('#go-ex').onclick = () => navigate('#/exercises');
  }

  if (!list.length) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg>
        <p>No hay grupos todavía.</p>
        <p class="faint">Agrupa tus ejercicios por día o zona muscular.</p>
      </div>`));
  } else {
    const wrap = el('<div class="list mt"></div>');
    const exMap = new Map(allExercises.map((e) => [e.id, e]));
    for (const g of list) {
      const names = g.exerciseIds.map((id) => exMap.get(id)?.name).filter(Boolean);
      const item = el(`
        <div class="item">
          <div class="grow">
            <div class="title">${esc(g.name)}</div>
            <div class="sub">${names.length ? esc(names.join(', ')) : 'Sin ejercicios'}</div>
          </div>
          <div class="item-actions">
            <button class="icon-btn" data-act="edit" aria-label="Editar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
            <button class="icon-btn" data-act="del" aria-label="Eliminar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </div>`);
      item.querySelector('[data-act="edit"]').onclick = () => openForm(g, allExercises);
      item.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog(`¿Eliminar el grupo "${g.name}"?`)) {
          await store.deleteGroup(g.id);
          toast('Grupo eliminado', 'success');
          navigate('#/groups');
        }
      };
      wrap.appendChild(item);
    }
    node.appendChild(wrap);
  }

  return { title: 'Grupos de ejercicios', back: '#/settings', node };
}

function openForm(group, allExercises) {
  const isEdit = !!group;
  const exMap = new Map(allExercises.map((e) => [e.id, e]));
  // Orden de los ejercicios del grupo (solo ids que aún existen), conservado.
  const order = (group?.exerciseIds || []).filter((id) => exMap.has(id));
  // Etiquetas disponibles y filtro activo para "Añadir ejercicio".
  const allTagsList = [...new Set(allExercises.flatMap((e) => store.exerciseTags(e)))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const availFilter = new Set();

  const content = el(`
    <div>
      <div class="field">
        <label>Nombre del grupo</label>
        <input class="input" id="f-name" placeholder="Ej. Bíceps y Espalda" value="${esc(group?.name || '')}">
      </div>
      <div class="field">
        <label>Ejercicios del grupo (en orden)</label>
        <div class="list" id="ordered"></div>
      </div>
      <div class="field">
        <label>Añadir ejercicio</label>
        <div class="chip-grid" id="avail-filter" style="margin-bottom:8px"></div>
        <div class="chip-grid" id="available"></div>
      </div>
      <button class="btn primary block" id="save">${isEdit ? 'Guardar cambios' : 'Crear grupo'}</button>
    </div>`);

  const orderedHost = content.querySelector('#ordered');
  const availHost = content.querySelector('#available');
  const filterHost = content.querySelector('#avail-filter');

  // --- Reordenar arrastrando: mantén pulsada la tarjeta (o usa el asa) y arrastra ---
  let dragRow = null, dragClone = null, dragOffsetY = 0, dragActive = false, pressTimer = null, pStartY = 0;
  const sortRows = () => [...orderedHost.querySelectorAll('.sortable-row')];

  function dragActivate(e) {
    dragActive = true;
    const r = dragRow.getBoundingClientRect();
    dragOffsetY = e.clientY - r.top;
    dragClone = dragRow.cloneNode(true);
    dragClone.classList.add('sortable-clone');
    dragClone.style.width = r.width + 'px';
    dragClone.style.left = r.left + 'px';
    dragClone.style.top = (e.clientY - dragOffsetY) + 'px';
    document.body.appendChild(dragClone);
    dragRow.classList.add('placeholder');
    orderedHost.style.touchAction = 'none';
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
  }
  function dragMove(e) {
    if (!dragActive) {
      // Si el dedo se mueve antes de "fijar", cancela el long-press (permite hacer scroll).
      if (Math.abs(e.clientY - pStartY) > 8) clearTimeout(pressTimer);
      return;
    }
    e.preventDefault();
    dragClone.style.top = (e.clientY - dragOffsetY) + 'px';
    let placed = false;
    for (const sib of sortRows()) {
      if (sib === dragRow) continue;
      const rr = sib.getBoundingClientRect();
      if (e.clientY < rr.top + rr.height / 2) { orderedHost.insertBefore(dragRow, sib); placed = true; break; }
    }
    if (!placed) orderedHost.appendChild(dragRow);
  }
  function dragEnd() {
    clearTimeout(pressTimer);
    window.removeEventListener('pointermove', dragMove);
    window.removeEventListener('pointerup', dragEnd);
    window.removeEventListener('pointercancel', dragEnd);
    if (dragActive) {
      dragActive = false;
      if (dragClone) { dragClone.remove(); dragClone = null; }
      if (dragRow) dragRow.classList.remove('placeholder');
      orderedHost.style.touchAction = '';
      // Reconstruye el orden a partir del DOM y refresca los números.
      const newOrder = sortRows().map((r) => r.dataset.id);
      order.length = 0; order.push(...newOrder);
      render();
    }
    dragRow = null;
  }
  function bindDrag(row) {
    row.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest('[data-act="rm"]')) return; // no arrastrar al pulsar quitar
      dragRow = row;
      pStartY = e.clientY;
      const fromHandle = !!e.target.closest('[data-handle]');
      window.addEventListener('pointermove', dragMove);
      window.addEventListener('pointerup', dragEnd);
      window.addEventListener('pointercancel', dragEnd);
      if (fromHandle) dragActivate(e);          // desde el asa: arrastre inmediato
      else pressTimer = setTimeout(() => dragActivate(e), 220); // tap fijo (long-press)
    });
  }

  function render() {
    // Lista ordenada de ejercicios del grupo (con mover y quitar).
    orderedHost.innerHTML = '';
    if (!order.length) {
      orderedHost.appendChild(el('<span class="faint">Aún no hay ejercicios. Tócalos abajo para añadirlos.</span>'));
    }
    order.forEach((id, i) => {
      const ex = exMap.get(id);
      const row = el(`
        <div class="item sortable-row" data-id="${esc(id)}" style="padding:8px 10px">
          <span class="drag-handle" data-handle aria-label="Arrastrar para reordenar">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
          </span>
          <span class="badge" style="min-width:26px;justify-content:center">${i + 1}</span>
          <div class="grow"><div class="title" style="font-size:15px">${esc(ex.name)}</div></div>
          <button class="icon-btn" data-act="rm" aria-label="Quitar" style="width:34px;height:34px">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>`);
      row.querySelector('[data-act="rm"]').onclick = () => { order.splice(i, 1); render(); };
      bindDrag(row);
      orderedHost.appendChild(row);
    });

    // Filtro por etiqueta para los ejercicios disponibles.
    filterHost.innerHTML = '';
    if (allTagsList.length) {
      const allChip = el(`<button class="chip ${availFilter.size === 0 ? 'selected' : ''}" type="button">Todas</button>`);
      allChip.onclick = () => { availFilter.clear(); render(); };
      filterHost.appendChild(allChip);
      for (const t of allTagsList) {
        const chip = el(`<button class="chip ${availFilter.has(t) ? 'selected' : ''}" type="button">${esc(t)}</button>`);
        chip.onclick = () => { if (availFilter.has(t)) availFilter.delete(t); else availFilter.add(t); render(); };
        filterHost.appendChild(chip);
      }
    }

    // Ejercicios disponibles (aún no añadidos), aplicando el filtro de etiquetas.
    availHost.innerHTML = '';
    if (!allExercises.length) {
      availHost.appendChild(el('<span class="faint">No hay ejercicios. Créalos primero.</span>'));
    } else {
      let avail = allExercises.filter((e) => !order.includes(e.id));
      if (availFilter.size) avail = avail.filter((e) => store.exerciseTags(e).some((t) => availFilter.has(t)));
      if (!avail.length) availHost.appendChild(el('<span class="faint">No hay ejercicios disponibles con ese filtro.</span>'));
      avail.forEach((ex) => {
        const chip = el(`<button class="chip" type="button">+ ${esc(ex.name)}</button>`);
        chip.onclick = () => { order.push(ex.id); render(); };
        availHost.appendChild(chip);
      });
    }
  }
  render();

  const { close } = showModal(isEdit ? 'Editar grupo' : 'Nuevo grupo', content);
  content.querySelector('#f-name').focus();
  content.querySelector('#save').onclick = async () => {
    const name = content.querySelector('#f-name').value.trim();
    if (!name) { toast('El nombre es obligatorio', 'error'); return; }
    // El orden elegido se guarda tal cual y se respeta al iniciar la sesión.
    await store.saveGroup({ id: group?.id, name, exerciseIds: order.slice() });
    toast(isEdit ? 'Grupo actualizado' : 'Grupo creado', 'success');
    close();
    navigate('#/groups');
  };
}
