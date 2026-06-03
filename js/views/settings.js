/* ============================================================
   settings.js — Ajustes y configuración.
   Accesos a configuradores, tema, copia de seguridad y datos.
   ============================================================ */

import { el, esc, toast, confirmDialog } from '../utils.js';
import { navigate } from '../router.js';
import { getTheme, setTheme } from '../theme.js';
import { getUnit, setUnit } from '../prefs.js';
import * as db from '../db.js';
import * as store from '../store.js';

function navItem(label, sub, route, iconPath) {
  const item = el(`
    <div class="item clickable">
      <span style="display:inline-flex;color:var(--primary)">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
      </span>
      <div class="grow">
        <div class="title">${esc(label)}</div>
        <div class="sub">${esc(sub)}</div>
      </div>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-faint)" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>`);
  item.onclick = () => navigate(route);
  return item;
}

export async function settings() {
  const node = el('<div></div>');

  // Configuradores
  node.appendChild(el('<div class="section-title" style="margin-top:0">Configuración</div>'));
  const list = el('<div class="list"></div>');
  list.appendChild(navItem('Ejercicios', 'Crea y edita ejercicios genéricos', '#/exercises',
    '<path d="M6.5 6.5l11 11M3 9l3-3 4 4-3 3zM21 15l-3 3-4-4 3-3z"/>'));
  list.appendChild(navItem('Grupos de ejercicios', 'Agrupa ejercicios por día o zona', '#/groups',
    '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>'));
  list.appendChild(navItem('Registrar peso', 'Controla tu peso corporal', '#/weight',
    '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 3v9l5-3"/>'));
  list.appendChild(navItem('Calculadora lb ⇄ kg', 'Convierte libras a kilos', '#/calculator',
    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2"/>'));
  node.appendChild(list);

  // Tema
  node.appendChild(el('<div class="section-title">Apariencia</div>'));
  const themeCard = el(`
    <div class="card">
      <div class="row between mb">
        <div class="grow"><div class="title" style="font-weight:700">Tema</div>
          <div class="sub muted">Oscuro por defecto</div></div>
      </div>
      <div class="chip-grid">
        <button class="chip" data-theme="dark">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          Oscuro
        </button>
        <button class="chip" data-theme="light">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          Claro
        </button>
      </div>
    </div>`);
  function paintTheme() {
    const cur = getTheme();
    themeCard.querySelectorAll('[data-theme]').forEach((b) =>
      b.classList.toggle('selected', b.dataset.theme === cur));
  }
  themeCard.querySelectorAll('[data-theme]').forEach((b) => {
    b.onclick = () => { setTheme(b.dataset.theme); paintTheme(); };
  });
  paintTheme();
  node.appendChild(themeCard);

  // Unidad de peso (global)
  const unitCard = el(`
    <div class="card">
      <div class="row between mb">
        <div class="grow"><div class="title" style="font-weight:700">Unidad de peso</div>
          <div class="sub muted">Se aplica a toda la app</div></div>
      </div>
      <div class="chip-grid">
        <button class="chip" data-unit="kg">Kilogramos (kg)</button>
        <button class="chip" data-unit="lb">Libras (lb)</button>
      </div>
    </div>`);
  function paintUnit() {
    const cur = getUnit();
    unitCard.querySelectorAll('[data-unit]').forEach((b) => b.classList.toggle('selected', b.dataset.unit === cur));
  }
  unitCard.querySelectorAll('[data-unit]').forEach((b) => {
    b.onclick = () => { setUnit(b.dataset.unit); paintUnit(); toast('Unidad: ' + b.dataset.unit, 'success'); };
  });
  paintUnit();
  node.appendChild(unitCard);

  // Datos
  node.appendChild(el('<div class="section-title">Datos</div>'));
  const dataCard = el(`
    <div class="card">
      <div class="btn-row">
        <button class="btn ghost" id="export">Exportar</button>
        <button class="btn ghost" id="import">Importar</button>
      </div>
      <button class="btn danger block mt" id="reset">Borrar todos los datos</button>
    </div>`);

  dataCard.querySelector('#export').onclick = async () => {
    const data = await db.exportAll();
    // Incluye también la configuración (tema + unidad).
    data.config = { theme: getTheme(), unit: getUnit() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Copia exportada', 'success');
  };

  dataCard.querySelector('#import').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (e) {
        toast('Archivo no válido (JSON)', 'error');
        return;
      }
      // Validación: debe parecer un backup de la app (evita borrar datos con un archivo cualquiera).
      const looksValid = data && typeof data === 'object' &&
        (Array.isArray(data.exercises) || Array.isArray(data.groups) ||
         Array.isArray(data.sessions) || Array.isArray(data.bodyweight));
      if (!looksValid) { toast('No parece una copia de Gym Tracker', 'error'); return; }

      if (!await confirmDialog('Importar reemplazará TODOS los datos y la configuración actuales. ¿Continuar?', { okText: 'Importar', danger: true })) return;
      try {
        await db.importAll(data);
        await store.migrate(); // normaliza datos antiguos importados
        // Restaura la configuración si viene en el backup.
        if (data.config) {
          if (data.config.theme) setTheme(data.config.theme);
          if (data.config.unit) setUnit(data.config.unit);
        }
        toast('Datos importados', 'success');
        navigate('#/');
      } catch (e) {
        toast('Error al importar', 'error');
      }
    };
    input.click();
  };

  dataCard.querySelector('#reset').onclick = async () => {
    if (!await confirmDialog('Esto borrará ejercicios, grupos, sesiones y pesos. ¿Seguro?', { okText: 'Borrar todo' })) return;
    await Promise.all([
      db.clear(db.STORES.EXERCISES), db.clear(db.STORES.GROUPS),
      db.clear(db.STORES.SESSIONS), db.clear(db.STORES.BODYWEIGHT),
    ]);
    toast('Datos borrados', 'success');
    navigate('#/');
  };
  node.appendChild(dataCard);

  node.appendChild(el('<p class="faint center mt" style="font-size:12px">Gym Tracker · PWA offline · v1.0</p>'));

  return { title: 'Ajustes', back: false, node };
}
