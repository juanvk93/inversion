import { DB_KV } from "../config.js";
import { _locked, cryptoDisponible } from "../crypto.js";
import { dbGet, isStoragePersisted, requestPersistentStorage } from "../db.js";
import { avisar } from "../dialog.js";
import { refreshAllPricesAsync } from "../precios.js";
import { changePassphrase, disableEncryption, enableEncryption } from "../seguridad.js";
import { crearSnapshot, renderSnapshots, updateSnapSub } from "../snapshots.js";
import { flash, lsSet, saveState, state, twelveDataCache, yahooCache } from "../state.js";
import { applyTheme } from "../tema.js";
import { $, $$, esc } from "../utils.js";
import { render } from "./render.js";

// ═══════════════════════════════════════════════════════════════════════════
// 7e. VISTA · CONFIGURACIÓN (página)
// ═══════════════════════════════════════════════════════════════════════════

export function renderConfig() {
  const accent   = "#94A3B8";
  const isLight  = document.documentElement.classList.contains("light");
  const provider = state.etfProvider || "twelvedata";

  const html = `
    <div class="title-row">
      <div>
        <h2>Configuración</h2>
        <div class="subtitle">Apariencia, proveedores de datos, seguridad y copias</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Apariencia</div>
      <div class="cfg-line">
        <span class="cfg-line-label">Tema de la interfaz</span>
        <div class="toggle">
          <button class="${!isLight ? "active" : ""}" data-theme="dark">Oscuro</button>
          <button class="${isLight ? "active" : ""}" data-theme="light">Claro</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Proveedor de precios ETF</div>
      <div class="cfg-card-group">
        <label class="cfg-card">
          <input type="radio" name="cfgProvider" value="twelvedata" ${provider === "twelvedata" ? "checked" : ""}>
          <span class="cfg-card-check" aria-hidden="true">✓</span>
          <span class="cfg-card-body">
            <strong>Twelve Data</strong>
            <small>Requiere API key · formato MIC (ej. IWDA.XAMS)</small>
          </span>
        </label>
        <div class="field" id="cfgTDKeyField">
          <label>Twelve Data API key</label>
          <input type="text" id="cfgTwelveDataKey" placeholder="Tu API key de twelvedata.com..." autocomplete="off" spellcheck="false" value="${esc(state.twelveDataApiKey || "")}">
          <div class="field-hint">Registro gratis en <strong>twelvedata.com</strong> · 800 peticiones/día. La key se guarda solo en este dispositivo.</div>
        </div>
        <label class="cfg-card">
          <input type="radio" name="cfgProvider" value="yahoo" ${provider === "yahoo" ? "checked" : ""}>
          <span class="cfg-card-check" aria-hidden="true">✓</span>
          <span class="cfg-card-body">
            <strong>Yahoo Finance</strong>
            <small>Sin clave · vía proxy CORS · formato suffix (ej. IWDA.AS)</small>
          </span>
        </label>
      </div>
      <button class="save-btn" id="cfgSave" style="margin-top:16px">Guardar proveedor</button>
    </div>

    <div class="panel">
      <div class="panel-title">Seguridad</div>
      <div id="seg-body"></div>
    </div>

    <div class="panel">
      <div class="panel-title">Almacenamiento persistente</div>
      <div id="persist-body"></div>
    </div>

    <div class="panel">
      <div class="panel-title">Puntos de restauración</div>
      <button class="drawer-item" id="btnSnapshot" style="width:100%">
        <span class="di-icon">⦿</span>
        <div class="di-body">
          <div class="di-title">Crear punto</div>
          <div class="di-sub" id="snapSub">Sin guardado reciente</div>
        </div>
      </button>
      <div class="snap-list" id="snapList" style="margin-top:8px"></div>
    </div>
  `;
  $("#main").innerHTML = html;

  // Apariencia
  $$('[data-theme]').forEach(b => b.onclick = () => {
    const tema = b.dataset.theme;
    lsSet("tema", tema);
    applyTheme(tema);
    render();
  });

  // Proveedor de precios
  toggleConfigKeyField(provider);
  $$('input[name="cfgProvider"]').forEach(r => {
    r.onchange = () => toggleConfigKeyField(r.value);
  });
  $("#cfgSave").onclick = saveConfig;

  // Seguridad (cifrado)
  renderSegBody();

  // Almacenamiento persistente
  renderPersistBody();

  // Snapshots
  $("#btnSnapshot").onclick = crearSnapshot;
  updateSnapSub();
  renderSnapshots();
}

function toggleConfigKeyField(provider) {
  const f = $("#cfgTDKeyField");
  if (f) f.style.display = provider === "twelvedata" ? "" : "none";
}

function saveConfig() {
  const newProvider = $('input[name="cfgProvider"]:checked')?.value || "twelvedata";
  const key = $("#cfgTwelveDataKey").value.trim();
  state.etfProvider      = newProvider;
  state.twelveDataApiKey = key;
  // Invalidamos cachés (key cambió o cambió el proveedor → posibles datos viejos)
  Object.keys(twelveDataCache).forEach(k => delete twelveDataCache[k]);
  Object.keys(yahooCache).forEach(k => delete yahooCache[k]);
  saveState();
  flash();
  refreshAllPricesAsync();
}

// Renderiza el bloque de seguridad/cifrado dentro de #seg-body (en la página config).
export async function renderSegBody() {
  const body = $("#seg-body");
  if (!body) return;
  if (_locked) {
    // Con la app bloqueada el estado en memoria está vacío: cualquier operación
    // de cifrado lo escribiría encima de los datos reales.
    body.innerHTML = `
      <div class="seg-status seg-off"><span class="seg-dot"></span> Datos bloqueados</div>
      <p class="seg-info">Los datos no se han cargado. Recarga la página e introduce la passphrase para gestionar el cifrado.</p>`;
    return;
  }
  let encMeta = null;
  try { encMeta = await dbGet(DB_KV, "encMeta"); } catch { /* sin BD */ }
  const enabled = !!encMeta?.enabled;
  if (!enabled && !cryptoDisponible()) {
    body.innerHTML = `
      <div class="seg-status seg-off"><span class="seg-dot"></span> Sin cifrado</div>
      <p class="seg-info">El cifrado requiere abrir la app por https o localhost (no disponible al abrirla como archivo local).</p>`;
    return;
  }
  body.innerHTML = enabled ? `
    <div class="seg-status seg-on"><span class="seg-dot"></span> Cifrado activo</div>
    <p class="seg-info">Tus datos están cifrados con AES-256. Necesitarás la passphrase cada vez que abras la app.</p>
    <button class="save-btn" id="segChange">Cambiar passphrase</button>
    <button class="seg-btn-danger" id="segDisable">Desactivar cifrado</button>
  ` : `
    <div class="seg-status seg-off"><span class="seg-dot"></span> Sin cifrado</div>
    <p class="seg-info">Activa el cifrado para proteger tus datos en este dispositivo. Solo serán accesibles introduciendo tu passphrase.</p>
    <div class="seg-warn">⚠ Si olvidas la passphrase, <strong>no hay forma de recuperar los datos</strong>. Anótala en un sitio seguro antes de activar.</div>
    <div class="field">
      <label>Nueva passphrase (mín. 8 caracteres)</label>
      <input type="password" id="segPass1" placeholder="••••••••" autocomplete="new-password">
    </div>
    <div class="field" style="margin-bottom:24px">
      <label>Confirmar passphrase</label>
      <input type="password" id="segPass2" placeholder="••••••••" autocomplete="new-password">
    </div>
    <button class="save-btn" id="segEnable" disabled>Activar cifrado</button>
  `;
  if (enabled) {
    $("#segChange").onclick  = changePassphrase;
    $("#segDisable").onclick = disableEncryption;
  } else {
    const refresh = () => {
      const p1 = $("#segPass1").value;
      const p2 = $("#segPass2").value;
      $("#segEnable").disabled = !(p1.length >= 8 && p1 === p2);
    };
    $("#segPass1").oninput = refresh;
    $("#segPass2").oninput = refresh;
    $("#segEnable").onclick = enableEncryption;
  }
}

// Renderiza el bloque de almacenamiento persistente dentro de #persist-body.
async function renderPersistBody() {
  const body = $("#persist-body");
  if (!body) return;
  if (!navigator.storage?.persist) {
    body.innerHTML = `<p class="seg-info">Este navegador no permite marcar el almacenamiento como persistente. Tus datos siguen guardándose en este dispositivo, pero el navegador podría borrarlos si necesita espacio.</p>`;
    return;
  }
  const persisted = await isStoragePersisted();
  body.innerHTML = persisted ? `
    <div class="seg-status seg-on"><span class="seg-dot"></span> Persistencia activa</div>
    <p class="seg-info">El navegador no borrará tus datos automáticamente por falta de espacio o inactividad. Solo se eliminarán si los borras tú o desinstalas la app.</p>
  ` : `
    <div class="seg-status seg-off"><span class="seg-dot"></span> Sin persistencia garantizada</div>
    <p class="seg-info">Tus datos se guardan en este dispositivo, pero el navegador podría borrarlos si necesita espacio o tras un largo periodo sin abrir la app.</p>
    <button class="save-btn" id="persistEnable">Activar persistencia</button>
  `;
  if (!persisted) {
    $("#persistEnable").onclick = async () => {
      const ok = await requestPersistentStorage();
      renderPersistBody();
      if (ok) flash();
      else avisar("El navegador no ha concedido la persistencia.\n\nConsejo: instala la app (Añadir a pantalla de inicio / Instalar) y vuelve a intentarlo. Muchos navegadores conceden la persistencia automáticamente a las apps instaladas.");
    };
  }
}
