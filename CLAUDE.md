# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**MI CARTERA** es una aplicación SPA de seguimiento de carteras de inversión. No tiene backend, sistema de build ni dependencias npm. Es HTML/CSS/JS puro.

## Decisiones de producto (NO revertir)

- **Sparklines en pestañas: descartados permanentemente.** Se probó un mini-gráfico de línea junto al nombre de cada tab y se retiró por decisión del usuario. **No volver a proponer, implementar ni sugerir sparklines (ni ninguna otra visualización) en las pestañas.** No debe existir función `sparkline()` ni la clase CSS `.tab .spark`.

## Desarrollo

Para ejecutar la aplicación: abrir `index.html` directamente en el navegador (funcional sin servidor).

Para habilitar el Service Worker y la instalación PWA es necesario servir por HTTP/HTTPS:
```bash
python3 -m http.server 8000
```

Dependencias externas (vía CDN en `index.html`):
- Chart.js 4.4.1
- Google Fonts: Bebas Neue + Lato

Al actualizar archivos, incrementar `const CACHE = "cartera-vN"` en `sw.js` para invalidar la caché del Service Worker.

## Arquitectura

Cuatro archivos principales:

- **`index.html`** — estructura estática: tabs, modales (`#modalPass`, `#modalEntrada`, `#modalProd`, `#modalObjetivos`, `#modalChangelog`, `#modalCalc`), drawer lateral, toast de snapshot. Incluye una cabecera **Content-Security-Policy** (`script-src` sin `'unsafe-inline'`; `connect-src` enumera las APIs de precios permitidas).
- **`style.css`** — tema oscuro/claro con variables CSS (`--bg`, `--text`, `--accent`, `--accent-soft`, `--accent-line`, etc.). El color de acento cambia dinámicamente por producto/vista activa. La clase `.light` en `<html>` activa el tema claro.
- **`app.js`** — toda la lógica en un IIFE de ~5.100 líneas, organizado en secciones (busca las cabeceras con `ctrl-F`):
- **`sw.js`** — Service Worker cache-first + revalidación en background. **Solo** cachea assets de mismo origen y los CDN/fuentes de `CACHEABLE_HOSTS`; las APIs de precios pasan siempre a red (sin caché).

| Sección | Responsabilidad |
|---|---|
| CONFIG | Constantes, paleta, datos iniciales, claves DB/localStorage, `RESERVED_IDS`, tramos fiscales, proveedores ETF |
| UTILS | `fmt()`, `fmtE()`, `fmtBytes()`, `esc()`, `sanitizeId()`, `$()`, `$$()`, helpers de fecha |
| CRYPTO | Cifrado local AES-GCM con clave PBKDF2 (`deriveKey`, `encryptValue`, `decryptValue`) |
| INDEXEDDB | `openDB()`, `dbGet/Put/Delete/All()` — persistencia asíncrona |
| STATE & STORAGE | `state`, `loadState()` async con migración, `saveState()` con cola, `readField/writeField` (cifran si hay clave) |
| CALCS | `calcStats()`, `statsTotalCalc()`, `xirr()`, `calcTIR()`, `calcProyeccion()`, riesgo (`calcMaxDrawdown/Volatilidad/Sharpe/Sortino`), `simulateMonteCarlo()`, fiscalidad |
| CSV / JSON | Export/import CSV (`parseCSVRecords` respeta comillas y saltos de línea) y backup JSON completo |
| SNAPSHOTS | Backups en IndexedDB (máx. 20), recordatorio tras 7 días. Se cifran si el cifrado está activo |
| PRECIOS | CoinGecko (cripto), Twelve Data / Yahoo (ETFs) y precio manual; caché en memoria con TTL y negative-cache |
| CHARTS | `drawChartValor/Rent/TirComp/Proy/Peso/Histograma/Growth/Contribucion/AportPorAno/MonteCarlo` |
| RENDER | `renderTabActual`, `renderResumen`, `renderProyeccion`, `renderFIRE`, `renderAsignacion`, `renderDiff`, `renderFiscal`, `renderConfig`, `renderObjetivos`, `renderHeatmap` |
| MODALS | Entrada, producto, objetivos, calculadora, changelog; bloque de seguridad/cifrado |
| DRAWER | Panel lateral: productos, vistas, configuración, datos (CSV/JSON/PDF), changelog |
| SHORTCUTS | N, E, I, S, M, P, F, A, C, T, 1-9, Esc |
| BINDINGS & INIT | `bindGlobals()`, `bindCommon()`, init async |

## Modelo de datos (IndexedDB — store `kv`)

```js
state.productos     // [{ id, nombre, referencia, tipologia, divisa, comentarios, color,
                    //    unidades, precioManual, coingeckoId, etfTicker, asignacionObjetivo }]
state.entradas      // { [productoId]: [{ id, fecha, manual, saveback, roundup, valor, nota }] }
state.objetivos     // [{ id, nombre, meta, productoId }]  — productoId null = cartera total
state.lastSnapshot  // ISO timestamp del último snapshot
```

Claves adicionales en el store `kv`: `firePrefs` (`{gasto, regla}`), `twelveDataApiKey`, `etfProvider`
(`"twelvedata"` | `"yahoo"`) y `encMeta` (`{enabled, salt, check}`) cuando el cifrado está activo.

`fecha` usa formato `YYYY-MM` y es **única por producto** (al reañadir un mes se ofrece reemplazar).
Tres tipos de aportación: **manual**, **saveback** y **roundup**.

Los snapshots se guardan en el store `snapshots` (máx. 20; los más antiguos se descartan). Si el
cifrado está activo, el payload (`{productos, entradas, objetivos}`) se guarda cifrado en el campo `enc`.

La migración desde localStorage ocurre automáticamente en el primer arranque con IndexedDB vacío.

### Cifrado local (opcional)

Configuración → SEGURIDAD permite cifrar todo el estado con **AES-256-GCM** y clave derivada por
**PBKDF2** (200k iteraciones, SHA-256). La passphrase no se persiste ni se puede recuperar. Al
arrancar con `encMeta.enabled`, `loadState()` pide la passphrase (modal `#modalPass`, verificada
contra el testigo cifrado `encMeta.check`); si se cancela, la app queda `_locked` (solo lectura) para
no pisar los blobs cifrados con texto plano. Activar/desactivar el cifrado y cambiar la passphrase
(`rekeyAll`) re-cifran estado + snapshots + `encMeta` en una única transacción IndexedDB, encolada
en `_saveQueue` (`enqueueWrite`); con `_locked` estas operaciones están bloqueadas.

### Vistas (state.tab)

Pestañas de producto + `total`, y vistas internas accesibles desde el drawer/atajos: `resumen`,
`proyeccion` (P), `fire` (F), `asignacion` (A), `diff` (C, comparar snapshots), `fiscal` (T,
simulador D-100) y `config`. Sus IDs están en `RESERVED_IDS` para que un producto importado no los use.

## Patrones clave

- **Renderizado completo**: cualquier cambio de estado llama a `render()` que re-genera todo el DOM. No hay actualización parcial.
- **CSS custom properties dinámicas**: al cambiar de tab, se actualiza `--accent` en `:root` para colorear la UI según el producto activo.
- **Sin frameworks**: manipulación directa del DOM; los helpers `$()` y `$$()` son alias de `querySelector` / `querySelectorAll`.
- **Persistencia asíncrona con cola**: `saveState()` encadena escrituras en IndexedDB vía `_saveQueue` (Promise chain) para evitar condiciones de carrera.
- **Init async**: el IIFE de arranque es `async`, hace `await loadState()` antes de `render()`.
- **Drag & drop de tabs**: `renderTabs()` asigna `draggable="true"` a los tabs de producto y llama a `bindTabDrag()`. Soporta HTML5 drag (escritorio) y touch events (móvil). El reorden modifica `state.productos` y persiste con `saveState()`.

## KPIs calculados

Por producto y en la vista Total:

| KPI | Cálculo |
|---|---|
| Valor actual | Último `valor` registrado |
| Ganancia | `valor - acumAportado` |
| Este mes | Diferencia con el mes anterior |
| TIR anualizada | XIRR (Newton-Raphson, convergencia ≤ 1e-7) |
| Drawdown máx | Mayor caída pico-valle sobre el valor de cartera |
| Volatilidad | Desv. estándar de rentabilidades mensuales × √12 |
| Sharpe | TIR anualizada / volatilidad (Rf = 0) |

`calcStats()` devuelve los tres acumulados por tipo (`acumManual`, `acumSaveback`, `acumRoundup`) además del total `acumAportado`.

## Vista Proyección

Accesible desde el drawer (atajo `P`). Controles: horizonte (1-40 años) y aportación mensual.

Tres escenarios en tarjetas: Conservador 6%, **Realista (TIR histórica)** y Optimista 8%.

El gráfico "Evolución Proyectada" puede incluir:
- Las tres líneas de escenario de la cartera total
- Líneas individuales por producto (toggle de chips por producto; cada producto usa su propio XIRR y media de aportación de los últimos 3 meses)
- Líneas horizontales de objetivos de cartera total (si existen)

La visibilidad de cada producto en el gráfico se gestiona en `state.proyProductos` (`{ [id]: boolean }`).

## Sistema de objetivos

Modal accesible desde drawer → VISTAS → OBJETIVOS. Cada objetivo: `{ id, nombre, meta, productoId }`.

- `productoId === null` → objetivo de cartera total
- Se muestra como panel "OBJETIVOS" en la tab correspondiente (Total o producto individual)
- Las metas de cartera total aparecen también como líneas horizontales en el gráfico de proyección
