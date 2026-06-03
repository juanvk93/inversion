/* ============================================================
   prefs.js — Preferencias de usuario.
   Unidad de peso global (kg/lb). Es una etiqueta de visualización:
   no convierte los valores ya registrados.
   ============================================================ */

const UNIT_KEY = 'gt-unit';

export function getUnit() {
  return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg';
}

export function setUnit(unit) {
  const v = unit === 'lb' ? 'lb' : 'kg';
  localStorage.setItem(UNIT_KEY, v);
  return v;
}

/** Etiqueta de la unidad actual, p. ej. 'kg' o 'lb'. */
export function unitLabel() {
  return getUnit();
}
