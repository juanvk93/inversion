# Changelog

Todos los cambios relevantes de **Gym Tracker** se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar]

### Añadido
- **Informes — filtro de periodo:** chips «4 semanas / 3 meses / 1 año / Todo» que
  filtran todas las estadísticas y gráficas de la pantalla (resumen, volumen,
  frecuencia, duración, grupo muscular y progreso por ejercicio). Los récords
  personales son la excepción: siempre se calculan sobre todo el histórico.
  (`js/views/reports.js`, `js/store.js`)
- **Informes — frecuencia y constancia:** racha actual y mejor racha de semanas
  consecutivas entrenadas (lunes a domingo, hora local; la semana en curso sin
  sesión aún no rompe la racha), media de sesiones/semana y gráfica de barras de
  sesiones por semana (`store.frequencyStats`, `utils.barChart`).
- **Informes — récords personales:** lista por ejercicio con peso máximo, mejor
  serie (mayor peso×reps) y 1RM estimado (fórmula de Epley), con la fecha de la
  primera vez que se lograron y distintivo «Nuevo PR» si son de los últimos 28
  días. Con más de 8 ejercicios se colapsa tras un botón «Ver todos»
  (`store.personalRecords`, `store.epley1RM`).
- **Informes — 1RM estimado como métrica:** tercera opción en la gráfica de
  progreso por ejercicio, junto a peso máximo y volumen (`store.exerciseProgress`
  ahora incluye `est1RM` por sesión).

### Corregido
- **Fechas un día desfasadas (zona horaria):** `fmtDate`/`fmtDateShort` interpretaban
  las cadenas `'YYYY-MM-DD'` (registros de peso corporal) como medianoche **UTC**, por
  lo que en zonas horarias detrás de UTC se mostraba el día anterior. Ahora se interpretan
  como fecha **local**. (`js/utils.js`)
- **Sesión "fantasma" tras descartar/finalizar:** el autosave con debounce (~350 ms)
  podía re-escribir la sesión *después* de borrarla o finalizarla si quedaba un guardado
  pendiente. Ahora se cancela el temporizador en ambas acciones. (`js/views/session.js`)
- **Pérdida parcial de datos al importar un backup malformado:** una fila sin `id` hacía
  que `put` lanzara `DataError` mientras el `clear()` ya encolado podía confirmarse,
  dejando datos borrados y mostrando "Error al importar". La importación ahora filtra las
  filas que no sean objetos con `id`. (`js/db.js`)
- **Duración negativa al cruzar la medianoche:** en el resumen, una sesión con hora de fin
  anterior a la de inicio (entrenamiento que cruza las 00:00) calculaba una duración
  negativa (`—`). Ahora se asume el día siguiente para la hora de fin. (`js/views/session.js`)

### Seguridad
- **XSS reflejado menor:** el mensaje de error de una vista (`err.message`) se insertaba
  en el DOM sin escapar. Ahora se escapa con `esc()`. (`js/app.js`)

### Cambiado
- Caché del Service Worker subida a `gym-tracker-v22` para invalidar la versión anterior
  tras estos cambios. (`service-worker.js`)
