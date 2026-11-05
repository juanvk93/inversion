import { isStoragePersisted } from "../db.js";
import { closeDrawer } from "../drawer.js";
import { $ } from "../utils.js";

function fmtBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1048576)     return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

async function renderStorageBar() {
  const el = $("#storageInfo");
  if (!el) return;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const pct      = quota > 0 ? (usage / quota) * 100 : 0;
    const fillColor = pct > 75 ? "var(--red)" : pct > 40 ? "var(--yellow)" : "var(--green)";
    const persisted = await isStoragePersisted();
    const persistTxt = persisted
      ? `<span style="color:var(--green)">● Persistencia activa</span> · el navegador no borrará estos datos`
      : `<span style="color:var(--yellow)">● Sin persistencia garantizada</span> · actívala en Configuración`;
    el.innerHTML = `
      <div class="storage-label">
        <span>IndexedDB · espacio ocupado</span>
        <span class="storage-sizes">${fmtBytes(usage)} <span class="storage-sep">/</span> ${fmtBytes(quota)}</span>
      </div>
      <div class="storage-track">
        <div class="storage-fill" style="width:${Math.min(pct,100).toFixed(3)}%;background:${fillColor}"></div>
      </div>
      <div class="storage-sub">${pct.toFixed(3)}% del almacenamiento de origen utilizado</div>
      <div class="storage-sub">${persistTxt}</div>`;
  } catch {
    el.innerHTML = `<p class="storage-na">Estimación de almacenamiento no disponible en este navegador</p>`;
  }
}

export function openChangelog() {
  closeDrawer();
  renderStorageBar();
  $("#modalChangelog").classList.add("open");
}
