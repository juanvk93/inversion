import { $ } from "./utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// 9. DRAWER
// ═══════════════════════════════════════════════════════════════════════════

export function openDrawer() {
  $("#drawer").classList.add("open");
  $("#drawerOverlay").classList.add("open");
}
export function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawerOverlay").classList.remove("open");
}
export function toggleDrawer() {
  if ($("#drawer").classList.contains("open")) closeDrawer();
  else openDrawer();
}
