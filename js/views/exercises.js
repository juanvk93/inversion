/* ============================================================
   exercises.js — Configurador de ejercicios genéricos.
   Crear, editar y eliminar ejercicios, con etiquetas (grupos
   musculares) y filtro por etiqueta.
   ============================================================ */

import { el, esc, toast, showModal, confirmDialog } from '../utils.js';
import { navigate } from '../router.js';
import * as store from '../store.js';

// Filtro de etiquetas activo (se conserva entre renders).
const activeFilter = new Set();

export async function exercises() {
  const node = el('<div></div>');
  const list = await store.listExercises();
  const tags = await store.allTags();

  const addBtn = el(`<button class="btn primary block" id="add">+ Nuevo ejercicio</button>`);
  addBtn.onclick = () => openForm(null);
  node.appendChild(addBtn);

  if (!list.length) {
    node.appendChild(el(`
      <div class="empty">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5l11 11M3 9l3-3 4 4-3 3zM21 15l-3 3-4-4 3-3z"/></svg>
        <p>No hay ejercicios todavía.</p>
        <p class="faint">Crea ejercicios genéricos para usarlos en tus grupos.</p>
      </div>`));
    return { title: 'Ejercicios', back: '#/settings', node };
  }

  // Limpia del filtro etiquetas que ya no existan.
  for (const t of [...activeFilter]) if (!tags.includes(t)) activeFilter.delete(t);

  // Barra de filtro por etiqueta.
  if (tags.length) {
    node.appendChild(el('<div class="section-title">Filtrar por etiqueta</div>'));
    const filterBar = el('<div class="chip-grid"></div>');
    const allChip = el(`<button class="chip ${activeFilter.size === 0 ? 'selected' : ''}">Todas</button>`);
    allChip.onclick = () => { activeFilter.clear(); renderList(); paintFilter(); };
    filterBar.appendChild(allChip);
    for (const t of tags) {
      const chip = el(`<button class="chip ${activeFilter.has(t) ? 'selected' : ''}">${esc(t)}</button>`);
      chip.onclick = () => {
        if (activeFilter.has(t)) activeFilter.delete(t); else activeFilter.add(t);
        renderList(); paintFilter();
      };
      chip.dataset.tag = t;
      filterBar.appendChild(chip);
    }
    function paintFilter() {
      allChip.classList.toggle('selected', activeFilter.size === 0);
      filterBar.querySelectorAll('[data-tag]').forEach((c) => c.classList.toggle('selected', activeFilter.has(c.dataset.tag)));
    }
    node.appendChild(filterBar);
  }

  const wrap = el('<div class="list mt"></div>');
  node.appendChild(wrap);

  function renderList() {
    wrap.innerHTML = '';
    // OR: muestra ejercicios que tengan ALGUNA de las etiquetas seleccionadas.
    const filtered = activeFilter.size === 0
      ? list
      : list.filter((ex) => store.exerciseTags(ex).some((t) => activeFilter.has(t)));

    if (!filtered.length) {
      wrap.appendChild(el('<div class="empty"><p>Ningún ejercicio con ese filtro.</p></div>'));
      return;
    }
    for (const ex of filtered) {
      const exTags = store.exerciseTags(ex);
      const tagChips = exTags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
      const uniBadge = ex.unilateral
        ? `<span class="badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7L4 11l4 4M16 7l4 4-4 4M4 11h16"/></svg>Unilateral ×2</span>`
        : '';
      const item = el(`
        <div class="item">
          <div class="grow">
            <div class="title">${esc(ex.name)}</div>
            ${(tagChips || uniBadge) ? `<div class="row wrap" style="gap:6px;margin-top:7px">${tagChips}${uniBadge}</div>` : ''}
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
      item.querySelector('[data-act="edit"]').onclick = () => openForm(ex);
      item.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog(`¿Eliminar "${ex.name}"? Se quitará de los grupos que lo usen.`)) {
          await store.deleteExercise(ex.id);
          toast('Ejercicio eliminado', 'success');
          navigate('#/exercises');
        }
      };
      wrap.appendChild(item);
    }
  }
  renderList();

  return { title: 'Ejercicios', back: '#/settings', node };
}

async function openForm(ex) {
  const isEdit = !!ex;
  const knownTags = await store.allTags();
  const selectedTags = new Set(ex ? store.exerciseTags(ex) : []);

  const content = el(`
    <div>
      <div class="field">
        <label>Nombre</label>
        <input class="input" id="f-name" placeholder="Ej. Curl de bíceps" value="${esc(ex?.name || '')}">
      </div>
      <div class="field">
        <label>Etiquetas (grupos musculares)</label>
        <div class="chip-grid" id="sel-tags" style="margin-bottom:8px"></div>
        <div class="row" style="gap:8px">
          <input class="input grow" id="f-tag" placeholder="Añadir etiqueta…">
          <button class="btn ghost" id="add-tag" type="button">Añadir</button>
        </div>
        <div class="chip-grid" id="known-tags" style="margin-top:8px"></div>
      </div>
      <div class="field">
        <label class="row between" for="f-uni" style="cursor:pointer">
          <span>Unilateral (un brazo/pierna cada vez)</span>
          <input type="checkbox" id="f-uni" ${ex?.unilateral ? 'checked' : ''}>
        </label>
        <span class="faint" style="font-size:12px">Si se marca, el volumen contará el doble (ambos lados).</span>
      </div>
      <div class="field">
        <label>Notas (opcional)</label>
        <textarea class="input" id="f-notes" placeholder="Técnica, agarre...">${esc(ex?.notes || '')}</textarea>
      </div>
      <button class="btn primary block" id="save">${isEdit ? 'Guardar cambios' : 'Crear ejercicio'}</button>
    </div>`);

  const selHost = content.querySelector('#sel-tags');
  const knownHost = content.querySelector('#known-tags');
  const tagInput = content.querySelector('#f-tag');

  function renderTags() {
    // Etiquetas seleccionadas (con × para quitar).
    selHost.innerHTML = '';
    if (!selectedTags.size) selHost.appendChild(el('<span class="faint" style="font-size:13px">Sin etiquetas</span>'));
    for (const t of selectedTags) {
      const chip = el(`<button class="chip selected" type="button">${esc(t)} ✕</button>`);
      chip.onclick = () => { selectedTags.delete(t); renderTags(); };
      selHost.appendChild(chip);
    }
    // Etiquetas conocidas no seleccionadas (toque para añadir).
    knownHost.innerHTML = '';
    const avail = knownTags.filter((t) => !selectedTags.has(t));
    for (const t of avail) {
      const chip = el(`<button class="chip" type="button">+ ${esc(t)}</button>`);
      chip.onclick = () => { selectedTags.add(t); renderTags(); };
      knownHost.appendChild(chip);
    }
  }
  renderTags();

  function addTyped() {
    const val = tagInput.value.trim();
    if (val) { selectedTags.add(val); tagInput.value = ''; renderTags(); }
    tagInput.focus();
  }
  content.querySelector('#add-tag').onclick = addTyped;
  tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } });

  const { close } = showModal(isEdit ? 'Editar ejercicio' : 'Nuevo ejercicio', content);
  content.querySelector('#f-name').focus();
  content.querySelector('#save').onclick = async () => {
    const name = content.querySelector('#f-name').value.trim();
    if (!name) { toast('El nombre es obligatorio', 'error'); return; }
    await store.saveExercise({
      id: ex?.id,
      name,
      tags: [...selectedTags],
      unilateral: content.querySelector('#f-uni').checked,
      notes: content.querySelector('#f-notes').value,
    });
    toast(isEdit ? 'Ejercicio actualizado' : 'Ejercicio creado', 'success');
    close();
    navigate('#/exercises');
  };
}
