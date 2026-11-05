import { CHARTS_OK } from "./charts.js";

// ── Tema claro/oscuro ─────────────────────────────────────────────────────
export function applyTheme(tema) {
  const root = document.documentElement;
  if (tema === "light") root.classList.add("light");
  else                  root.classList.remove("light");
  const isLight = tema === "light";
  // Barra de estado de Android (y de la PWA) del color del fondo de cada tema
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? "#FFFFFF" : "#000000");
  // Chart.js: actualizar colores de ejes/tooltip
  if (CHARTS_OK) {
    Chart.defaults.color       = isLight ? "#5C5C64" : "#8E8E96";
    Chart.defaults.borderColor = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
  }
}

