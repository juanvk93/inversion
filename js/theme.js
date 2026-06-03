/* ============================================================
   theme.js — Gestión del tema (oscuro por defecto / claro).
   Persiste en localStorage y sincroniza la meta theme-color.
   ============================================================ */

const KEY = 'gt-theme';

export function getTheme() {
  return localStorage.getItem(KEY) || 'dark';
}

export function setTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem(KEY, t);
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0f1115' : '#e9ebf3');
  return t;
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
