⏺ Como la app es ya una PWA (tiene manifest.json + sw.js), solo necesitas que tu móvil acceda a ella vía
  HTTP/HTTPS y el navegador te ofrecerá instalarla. La parte clave: el file:// local no funciona — necesita
  un servidor.

  Tienes 3 caminos según cuánto trabajo quieras hacer.

  ---
  🚀 Opción A — GitHub Pages (recomendado, 5 minutos, gratis)

  La más sencilla y permanente:

  # 1. Crear repo en GitHub y subir el código
  cd /Users/juandelavega/Downloads/Inversion
  git init
  git add .
  git commit -m "Mi Cartera"
  git branch -M main
  git remote add origin https://github.com/TU_USUARIO/mi-cartera.git
  git push -u origin main

  # 2. En GitHub: Settings → Pages → Source: "main / root" → Save

  A los 1-2 minutos tu app estará en https://TU_USUARIO.github.io/mi-cartera/. HTTPS incluido (necesario para
   PWA).

  Privacidad: pon el repo como privado si te preocupa que el código sea público — el sitio servido sigue
  funcionando.

  ⚠ Importante: los datos viven en IndexedDB del navegador, no en GitHub. Lo que subes es solo código. Tu
  cartera no está expuesta.

  ---
  🌐 Opción B — Netlify Drop (1 minuto, sin git)

  1. Ve a app.netlify.com/drop
  2. Arrastra la carpeta Inversion al navegador
  3. Te da una URL tipo https://random-name-12345.netlify.app

  Listo. HTTPS automático, sin cuenta obligatoria.

  ---
  🏠 Opción C — Tu red local (sin internet)

  Sirve desde el portátil para tu móvil mientras estés en la misma WiFi:

  cd /Users/juandelavega/Downloads/Inversion
  python3 -m http.server 8000

  Encuentra tu IP local:
  ipconfig getifaddr en0   # Mac: tu WiFi

  Y desde el móvil entra a http://192.168.X.X:8000.

  ⚠ Limitación: en HTTP plano sin localhost, el Service Worker no se registra en algunos navegadores.
  Funcionará, pero sin caché offline ni instalación PWA "limpia". Para PWA completa en red local necesitas
  HTTPS (lo cual implica certificados auto-firmados, lío). Esta opción es buena para probar rápido, no para
  uso diario.

  ---
  📲 Instalar la PWA en el móvil

  Una vez tengas la URL servida por HTTPS (opciones A o B), desde el móvil:

  iOS (Safari)
  1. Abre la URL en Safari (Chrome iOS no soporta PWA)
  2. Pulsa el botón Compartir (cuadrado con flecha hacia arriba)
  3. Desplázate y elige "Añadir a la pantalla de inicio"
  4. La app aparece con el icono dorado del gráfico

  Android (Chrome / Edge / Firefox)
  1. Abre la URL en el navegador
  2. Aparecerá automáticamente un banner "Instalar app" abajo. Si no, menú ⋮ → "Instalar app" o "Añadir a
  pantalla de inicio"
  3. Se instala como una app nativa, con icono propio y pantalla completa (sin barra del navegador)

  ---
  🎯 Mi recomendación concreta

  Para tu caso: GitHub Pages con repo privado. Razones:
  - HTTPS gratis = PWA funcional al 100%
  - Cero coste mantenimiento
  - Cuando empujes cambios con git push, se redespliegan solos
  - Los datos siguen siendo 100% locales en tu navegador
  - Funciona en cualquier dispositivo, no requiere tu portátil encendido
  - Si más adelante montas la Raspberry, sigues teniendo GitHub como fallback

  Y un detalle: cada vez que actualices código, acuérdate de subir el CACHE = "cartera-vN" en sw.js
  (incrementar versión) para que tu móvil descarte la caché vieja y descargue lo nuevo.

  ¿Quieres que te ayude a configurar el repo de GitHub, o tienes alguna preferencia entre las opciones?
