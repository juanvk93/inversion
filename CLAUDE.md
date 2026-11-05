# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**MI CARTERA** es una aplicación SPA de seguimiento de carteras de inversión. No tiene backend, sistema de build ni dependencias npm. Es HTML/CSS/JS puro. (`package.json` solo existe para que Node trate `js/` como módulos ES en los tests.)

## Decisiones de producto (NO revertir)

- **Sparklines en pestañas: descartados permanentemente.** Se probó un mini-gráfico de línea junto al nombre de cada tab y se retiró por decisión del usuario. **No volver a proponer, implementar ni sugerir sparklines (ni ninguna otra visualización) en las pestañas.** No debe existir función `sparkline()` ni la clase CSS `.tab .spark`.

## Desarrollo

La lógica usa **módulos ES nativos** (`<script type="module">`), así que **no funciona abriendo
`index.html` con `file://`**: hay que servir la carpeta por HTTP (también necesario para el
Service Worker y la instalación PWA):
```bash
python3 -m http.server 8000   # → http://localhost:8000
```

Tests (Node ≥ 20, sin dependencias): `npm test` (= `node --test tests/*.test.js`). Cubren `js/calc.js` y
`parseNum()`. El despliegue los ejecuta antes de publicar: si uno falla, no se publica. **Al cambiar una
fórmula de `calc.js`, añadir o ajustar su test.**

Dependencias externas (vía CDN en `index.html`):
- Chart.js 4.4.1
- Google Fonts: Inter (400/500/600/700)

Los assets propios se sirven solo desde la pre-caché de cada versión (sin revalidar). El despliegue
(`pages.yml`) fija `const CACHE = "cartera-<commit>"` automáticamente, así que cada publicación llega a los
usuarios; aun así, subir `cartera-vN` a mano al cambiar archivos (lo necesitan las pruebas en local). La versión nueva queda en espera y la app muestra "Nueva versión · RECARGAR" (`js/version.js`).
**Al crear, renombrar o borrar un módulo de `js/`, actualizar la lista `ASSETS` de `sw.js`** (si falta uno,
la app no funciona offline; si sobra uno inexistente, falla la instalación del SW). El despliegue
(`.github/workflows/pages.yml`) copia la carpeta `js/` entera.

## Arquitectura

- **`index.html`** — estructura estática: pestañas, barra inferior `#bottomNav` (Cartera `#navCartera`, Cierre `#btnCierre`, + `#fabAddEntry`, Análisis `#navAnalisis`, Más `#btnDrawer`), hoja `#modalAnalisis` con las vistas internas, modales (`#modalPass`, `#modalEntrada`, `#modalProd`, `#modalObjetivos`, `#modalChangelog`, `#modalCalc`), drawer "Más" (entra por la derecha: productos, configuración, datos, novedades) y toasts. Incluye una cabecera **Content-Security-Policy** (`script-src` sin `'unsafe-inline'`; `connect-src` enumera las APIs de precios permitidas). Carga `js/main.js` como módulo.
- **`style.css`** — tema oscuro (negro puro, por defecto) y claro con variables CSS (`--bg`, `--sheet`, `--panel`, `--panel-b`, `--field-b`, `--text`, `--mute`, `--dim`, `--green`, `--red`, `--accent`…). El color de acento cambia por producto/vista activa. La clase `.light` en `<html>` activa el tema claro. En móvil los modales son hojas que suben desde abajo.
- **`js/`** — toda la lógica, en módulos ES con `import`/`export` explícitos (sin build ni bundler).
- **`sw.js`** — Service Worker. Assets propios: pre-caché por versión, servidos solo desde ella (no se mezclan versiones); sin `skipWaiting` en install: se activa al pulsar RECARGAR (mensaje `{tipo:"activar"}`). CDN/fuentes de `CACHEABLE_HOSTS`: stale-while-revalidate. Las APIs de precios pasan siempre a red (sin caché).

| Módulo (`js/…`) | Responsabilidad |
|---|---|
| `main.js` | Punto de entrada: init async (tema → `loadState()` → `bindGlobals()` → `render()` → recordatorios → SW) |
| `config.js` | Constantes, paleta, datos iniciales, claves DB/localStorage, `RESERVED_IDS`, tramos fiscales, proveedores ETF |
| `utils.js` | `fmt()`, `fmtE()`, `esc()`, `sanitizeId()`, `$()`, `$$()`, helpers de fecha, `parseNum()` |
| `crypto.js` | AES-GCM con clave PBKDF2 (`deriveKey`, `encryptValue`, `decryptValue`); variables `_cryptoKey` y `_locked` |
| `db.js` | `openDB()`, `dbGet/Put/Delete/All()`, almacenamiento persistente |
| `state.js` | `state`, `loadState()` async con migración, `saveState()` con cola, `readField/writeField` (cifran si hay clave) |
| `calc.js` | `calcStats()`, `posicionPrevia()`, `entradasEUR()`/`tipoCambio()`, `calcPendientes()`, `memoMonteCarlo()`, `statsTotalCalc()`, `xirr()`, `calcTIR()`, `calcProyeccion()`, `tasaProyeccion()` (TIR para proyectar: ≥ `PROY_MESES_MIN` meses y acotada a `PROY_TASA_MIN`…`PROY_TASA_MAX`), riesgo, `simulateMonteCarlo()`, rachas, fiscalidad (`calcCosteMedio()`), costes |
| `logros.js` | Definición de logros, `checkLogros()` y su modal |
| `io/csv.js` · `io/json.js` · `io/backup.js` | Export/import CSV (`parseCSVRecords` respeta comillas y saltos de línea), backup JSON completo, copias externas (descargar/compartir) |
| `snapshots.js` | Snapshots en IndexedDB (máx. 20), recordatorio tras 7 días, toasts de copia/restaurar |
| `precios.js` | CoinGecko (cripto), Twelve Data / Yahoo (ETFs) y precio manual; caché con TTL y negative-cache. `pedirYahoo(target, extraer)` recorre los proxies CORS; `pedirTwelveData(url, key)` manda la key en la cabecera `Authorization` (y en la URL solo si CORS lo impide); `precioSospechoso()` descarta precios no positivos o que saltan ×5 |
| `charts.js` | `drawChartValor/Rent/TirComp/Proy/Peso/Histograma/Growth/Contribucion/AportPorAno/MonteCarlo`; todos crean el gráfico con `crearGrafico(clave, idCanvas, config)` |
| `views/render.js` | `render()`, pestañas (`renderTabs`, drag & drop), color de acento |
| `views/*.js` | Una vista por archivo: `producto` (tab de producto/Total, heatmap, tablas, KPIs), `resumen`, `proyeccion`, `fire`, `asignacion`, `diff`, `fiscal`, `benchmark`, `config`, `wrapped`, `cierre` (cierre de mes: todos los productos en una pantalla; borrador en `state.cierre`) |
| `modals/*.js` | `entrada` (prellenado con el mes anterior, botón unidades × precio, errores junto al campo con `marcarError()`), `producto` (incluye búsqueda de tickers), `objetivos`, `changelog`, `calc` |
| `seguridad.js` | Activar/desactivar cifrado, cambiar passphrase, desbloqueo al arrancar |
| `dialog.js` | Diálogos propios (encolados): `elegir(titulo, mensaje, opciones)`, `avisar(msg)` (en lugar de `alert`), `confirmar(msg, {titulo, si, peligro})` (en lugar de `confirm`); `avisoDeshacer(texto, fn)` para el toast DESHACER |
| `version.js` | Registro del Service Worker y aviso "Nueva versión · RECARGAR" |
| `sincro.js` | Varias ventanas abiertas: cada guardado comprueba e incrementa la revisión `rev` del KV en la misma transacción (`dbWriteRev`); si otra ventana guardó después, esta queda desfasada (`bloqueado()` lo impide todo) y se recarga o muestra `#syncToast`. Avisos por `BroadcastChannel("mi-cartera")` |
| `divisas.js` | Tipos de cambio mensuales a EUR del BCE (api.frankfurter.app) para los productos en otra divisa → `state.tiposCambio`, caché `tiposCambio` en el KV |
| `atras.js` | Botón atrás de Android: mantiene una entrada en el historial mientras hay modales/drawer abiertos y cierra la capa superior |
| `drawer.js` · `shortcuts.js` · `bindings.js` · `tema.js` · `pdf.js` | Panel "Más" (barra inferior); atajos N, E, I, S, M, P, F, A, C, T, B, 1-9, Esc (desactivados en táctil, `SIN_TECLADO`; sus indicaciones `.drawer-section-kbd`/`.kbd-hint` se ocultan con la misma media query); `bindGlobals()`/`bindCommon()`; tema claro/oscuro; export PDF |

### Diseño (estilo Trade Republic, no revertir sin pedirlo)

- Fondo negro, tipografía Inter con cifras tabulares (`font-variant-numeric: tabular-nums`); sin Bebas Neue,
  sin monoespaciada y sin letras espaciadas.
- **Textos en minúscula con mayúscula inicial** ("Valor actual", no "VALOR ACTUAL"); las siglas se mantienen
  (TIR, ETF, FIRE…). `frase()` de `utils.js` convierte los títulos y botones de `dialog.js`.
- Pocas cajas: secciones = `.panel` (sin fondo) + `.panel-title` (20 px); datos en filas `.dato` (etiqueta a la
  izquierda, cifra a la derecha); tarjetas `.tarjeta`/`.kpi` solo para destacar; lo secundario en
  `<details class="plegable">` (riesgo, fiscalidad y costes en Total/producto). Sin quitar información.
- Color del producto solo en la pestaña activa (texto subrayado), la línea del gráfico, el botón principal y su
  círculo de iniciales (`iniciales()`). Verde/rojo solo para ganancia/pérdida.
- Botones y zonas táctiles ≥ 44 px; botones principales en pastilla (`.save-btn`, `.btn-accion`).
- **Tema claro**: el acento se oscurece hasta 4,5:1 sobre blanco (`acento()` en `render.js`, `oscurecerHasta()` en
  `utils.js`). En estilos en línea usar siempre `var(--accent)` o `getAccentColor()`, nunca el hex fijo del producto o de
  la vista (en claro no se leería).

### Convenciones de los módulos

- **Divisas**: las entradas se guardan en la divisa del producto. Todo lo que suma o compara productos (Total,
  fiscalidad, resumen, asignación, snapshots, proyección por producto) usa `entradasEUR(state, p)`; la vista de un
  producto muestra su divisa (`fmtDiv`). Sin tipo de cambio se suma tal cual y la vista lo avisa (`divisasSinTipo`).
- **Escrituras**: el estado solo se escribe con `saveState()` / `dbWriteRev()` (control de revisión entre ventanas);
  `bloqueado()` cubre tanto los datos cifrados sin desbloquear como la ventana desfasada.
- **`calc.js` es puro**: no importa `state.js` ni nada que toque el DOM (solo `config.js` y `utils.js`, cuyo
  código de nivel superior comprueba `typeof document`). Las funciones de cartera reciben
  `{ productos, entradas }` como primer argumento: desde la app, `statsTotalCalc(state)`, `calcCostes(state)`…
- Los módulos se importan entre sí con dependencias circulares (p. ej. las vistas llaman a `render()` y
  `render()` a las vistas). Es seguro porque **solo se llaman funciones después de cargar todo**: no
  añadir código de nivel superior que ejecute funciones de otro módulo al evaluarse (salvo en `main.js`).
- Modales con promesa (`#modalPass`, `#modalElegir`) llevan el atributo `data-propio`: los cierres genéricos
  (fondo, Esc) los ignoran y el botón atrás les envía el evento `cerrar` para que resuelvan su promesa.
- **No usar `alert()` / `confirm()` / `prompt()`** (en Android tapan la app y no se pueden estilar): `avisar()`,
  `confirmar()` o `elegir()` de `dialog.js`; errores de formulario con `marcarError()` junto al campo; borrados
  pequeños (entrada, objetivo) sin confirmación previa y con `avisoDeshacer()`.
- Operaciones destructivas (importar, restaurar snapshot, eliminar producto) llaman antes a
  `crearSnapshot(motivo)`, que crea un punto automático (no reinicia el recordatorio) y devuelve si se pudo
  crear; si devuelve `false`, la operación se cancela.
- Un binding importado es de solo lectura: para modificar una variable `let` de otro módulo, exportar un
  setter (como `setLocked()` / `setCryptoKey()` en `crypto.js`). Los objetos (`state`, `charts`) sí se
  pueden mutar.

## Modelo de datos (IndexedDB — store `kv`)

```js
state.productos     // [{ id, nombre, referencia, tipologia, divisa, comentarios, color,
                    //    unidades, precioManual, coingeckoId, etfTicker, asignacionObjetivo }]
state.entradas      // { [productoId]: [{ id, fecha, manual, saveback, roundup, valor, nota }] }
state.objetivos     // [{ id, nombre, meta, productoId }]  — productoId null = cartera total
state.lastSnapshot  // ISO timestamp del último snapshot
```

Claves adicionales en el store `kv`: `rev` (revisión de guardado, `sincro.js`), `tiposCambio` (caché de divisas), `firePrefs` (`{gasto, regla}`), `twelveDataApiKey`, `etfProvider`
(`"twelvedata"` | `"yahoo"`), `lastExport` (ISO de la última copia JSON descargada/compartida fuera del
navegador) y `encMeta` (`{enabled, salt, check}`) cuando el cifrado está activo.

**Copias externas**: los snapshots viven en IndexedDB y se pierden si se borran los datos del navegador.
Por eso el modal de entrada ofrece descargar el JSON al guardar (`#meBackup`, preferencia en localStorage
`cartera_backup_al_guardar`), el drawer tiene COMPARTIR COPIA (`compartirBackup()`, Web Share API con
fallback a descarga) y `#backupToast` recuerda la copia tras 7 días o propone restaurar al arrancar vacío.

`fecha` usa formato `YYYY-MM` y es **única por producto** (al reañadir un mes se ofrece reemplazar).
Tres tipos de aportación: **manual**, **saveback** y **roundup**. **Posición previa** (`posicionPrevia()` en
`calc.js`): lo que vale el primer mes de un producto por encima de su aportación es capital que entra, no
rentabilidad; cuenta como aportado/coste en TIR, ganancia, coste medio, contribución, crecimiento y snapshots
(en el Total viene ya calculada en `flujoExtra`). Una venta o retirada se registra con MANUAL
negativo: `calcCosteMedio()` le resta la parte proporcional del coste (coste medio) y la diferencia es
plusvalía realizada. `dividendo` (renta cobrada) sale de la posición: cuenta como flujo positivo en la TIR
y se descuenta en `rentMes`, pero no en `ganancia` ni en el aportado.

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
simulador D-100), `benchmark` (B), `cierre` (cierre de mes) y `config`. Sus IDs están en `RESERVED_IDS` para que un producto importado no los use.

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
| TIR anualizada | XIRR (Newton-Raphson, convergencia ≤ 1e-7); incluye las rentas cobradas |
| Drawdown máx | Mayor caída pico-valle sobre el valor de cartera |
| Volatilidad | Desv. estándar de rentabilidades mensuales × √12 |
| Sharpe | TIR anualizada / volatilidad (Rf = 0) |

`calcStats()` devuelve los tres acumulados por tipo (`acumManual`, `acumSaveback`, `acumRoundup`) además del total `acumAportado`.

## Vista Proyección

Accesible desde el drawer (atajo `P`). Controles: horizonte (1-40 años) y aportación mensual.

Tres escenarios en tarjetas: Conservador 6%, **Realista (TIR histórica)** y Optimista 8%. El Realista, las líneas
por producto, el Monte Carlo y el año FIRE usan `tasaProyeccion()`: sin 12 meses de historial no se calculan
(FIRE usa el 6%) y la tasa se acota entre −10% y 15% anual, con aviso en la vista.

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
