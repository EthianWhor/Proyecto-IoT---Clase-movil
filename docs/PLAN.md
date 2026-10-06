# Plan — Sistema de Detección de Intrusos IoT (ESP32-S3 CAM + React Native)

> Plan vivo: se marcan las casillas a medida que se avanza.
> Sustentación: **jueves 8 de octubre de 2026**. Hoy: martes 29 de septiembre. Trabajo individual → ~9 días.

## Contexto
Parcial de Desarrollo Móvil (ver `Parcial Desarrollo Movil - Proyecto 1_ ... V2.md`). Hay que construir:
1. Firmware para la ESP32-S3 CAM: stream MJPEG y detección de movimiento con sensor PIR + confirmación por cámara (el profesor autorizó el PIR).
2. App en React Native (Expo) con visor en vivo, reconexión, Foreground Service y horarios.
3. Alertas automáticas por correo **y** Telegram con foto y marca de tiempo.

La nota depende sobre todo de la defensa oral (5 preguntas al azar). Todo el código tiene que ser simple y explicable, y hay una guía de estudio como entregable.

## Decisiones tomadas
| Tema | Decisión |
|---|---|
| App | React Native + Expo (SDK 57). Se desarrolla en **Expo Go** y al final se genera un **development build de Android** para el Foreground Service con `@notifee/react-native`. En este PC no hay Java ni Android SDK, así que el build se hace en la nube con EAS (`npx eas-cli build --profile development -p android`, requiere cuenta gratuita de Expo). |
| Detección | **PIR HC-SR501 + confirmación por cámara** (`DETECTION_MODE 2` en `config.h`). El profesor autorizó el PIR, pero aclaró que ni el PIR ni la cámara identifican a una *persona sospechosa*, solo algo que se mueve. El PIR reacciona al calor corporal en movimiento (ignora cambios de luz) y la comparación de fotogramas confirma el cambio en la imagen. Modos alternativos: `0` solo cámara, `1` solo PIR. |
| Quién envía las alertas | **La ESP32 directamente**: Telegram (Bot API por HTTPS, `sendPhoto`) y correo por SMTP (Gmail + contraseña de aplicación). |
| Red | **STA + AP de respaldo**: se conecta al Wi-Fi de la casa y, si falla, levanta su propio AP. Hora por NTP. |

### Pros y contras de quién envía (para la defensa)
- **ESP32 directo (elegida).** Pros: es autónoma (funciona con el celular apagado), tiene la menor latencia y usa menos piezas. Contras: TLS consume RAM y compite con la cámara (se mitiga con PSRAM y enviando de forma secuencial), las credenciales quedan en el chip, y cambiar el destinatario obliga a reflashear (se mitiga guardándolo en NVS y configurándolo desde la app).
- **App.** Pros: todo el código en JS y fácil de depurar. Contras: depende de que el sistema operativo no mate la app, no puede usar SMTP directo (necesitaría una API externa) y si el celular está apagado no hay alerta.
- **Backend.** Pros: los secretos quedan fuera del dispositivo, hay historial de eventos y es fácil de escalar. Contras: es una pieza más que desplegar, mantener en línea y defender, y no hay tiempo para eso en 9 días.

## Hardware a comprar (urgente, esta semana)
- **Elegida: tarjeta ESP32-S3-CAM WROOM N16R8 con cámara OV2640** (SKU M143; la tienda solo la tenía con OV2640, el firmware sirve igual): 16 MB de flash, 8 MB de PSRAM y 2 puertos USB-C. Se descartó la ESP32-CAM clásica (AI-Thinker, OV2640) porque no es S3, trae menos memoria, no tiene USB y deja pocos pines libres.
  - Arduino IDE: placa "ESP32S3 Dev Module", PSRAM "OPI PSRAM", Flash Size "16MB". El pinout de la cámara hay que confirmarlo con el vendedor (suele ser el mismo de Freenove ESP32-S3 WROOM CAM).
- Cable USB-C de **datos** y una fuente de 5V/2A.
- **Sensor PIR HC-SR501** (elegido sobre el HC-SR505 porque permite ajustar la sensibilidad y el tiempo) y 3 cables dupont hembra-hembra.
  - Conexión: VCC → pin 5V de la placa, GND → GND, OUT → GPIO14 (la salida es de 3.3V, segura para la ESP32). Jumper en **H** (redisparo), tiempo al mínimo y sensibilidad a la mitad.
- Opcional: un LED o buzzer para indicar el estado.

## Arquitectura
```
[PIR] --GPIO14--> dispara · [Cámara] confirma (comparación de fotogramas)
                |
         [ESP32-S3 CAM] --MJPEG :81/stream--> [App RN]
                   |  HTTP :80  /status /arm /schedule /capture  <--> [App RN]
                   |--HTTPS--> Telegram Bot API (foto + hora)
                   '--SMTPS--> Gmail (foto adjunta + hora)
```
- **Detector intercambiable:** `detector.h` expone solo `detectorBegin()` y `detectorMotion()`. `DETECTION_MODE` en `config.h` elige la fuente: cámara, PIR o ambos. El resto del firmware (estados, alertas, servidor) no sabe cuál está activa.
- **Estados de la ESP32:** `DESARMADO → ARMADO → DETECTANDO → ALERTA_ENVIADA → (cooldown) → ARMADO`.
- **Armado efectivo** = armado manual ("Fuera de casa") **o** la hora NTP actual está dentro de una franja activa. Las franjas se guardan en NVS (Preferences).
- **La app** consulta `/status` cada 2–3 s (con polling basta; la mejora opcional es un WebSocket de eventos) y muestra el último evento.

## Estructura del proyecto
```
Proyecto IoT/
  PLAN.md
  firmware/intrusion_cam/     (Arduino IDE, core esp32 v3.x)
    intrusion_cam.ino   setup() y loop()
    camera.*            cámara OV2640 (JPEG VGA, 3 búferes en PSRAM)
    netconn.*           Wi-Fi STA + AP de respaldo, mDNS, NTP
    schedule.*          franjas y "Fuera de casa" en NVS
    detector.*          PIR / comparación de fotogramas (DETECTION_MODE)
    alerts.*            Telegram sendPhoto + correo SMTP
    system_state.*      máquina de estados
    web_server.*        API :80 y stream MJPEG :81 (esp_http_server)
    config.h            secretos (en .gitignore)
  app/                        (Expo, TypeScript)
    src/app/index.tsx         visor + estado + "Fuera de casa"
    src/app/schedule.tsx      franjas horarias
    src/app/settings.tsx      IP de la ESP32, prueba de conexión
    src/api/esp32.ts          fetch con timeout y reintentos
    src/hooks/useStream.ts    reconexión con backoff exponencial
    src/services/monitor.ts   foreground service (notifee) + polling
  tools/mock-esp32/           simulador de la ESP32 para probar sin placa
  docs/API.md                 contrato app ↔ firmware
  docs/GUIA_SUSTENTACION.md   preguntas probables y respuestas
```

## Fases y cronograma
**Fase 0 — Setup (29–30 sep)**
- [x] Arduino IDE + core ESP32 3.3.11 y Node 24 ya estaban instalados.
- [x] App creada en `app/` (Expo SDK 57) con `react-native-webview` y `async-storage`; `expo-doctor` pasa 21/21.
- [x] Firmware de prueba de humo en `firmware/intrusion_cam/` (PSRAM + cámara + Wi-Fi); compila para ESP32-S3 con OPI PSRAM y 16 MB.
- [x] Bot de Telegram creado (@Patroclo_security_bot); token verificado y guardado en `config.h`.
- [x] `chat_id` obtenido y guardado; mensaje de prueba de Telegram enviado con éxito.
- [x] Contraseña de aplicación de Gmail guardada en `config.h`.
- [x] Correo remitente y destinatario: (correo del propietario). SMTP de Gmail probado desde el PC (puerto 465) con éxito.
- [x] Expo Go instalado en el celular.
- [x] App abierta en el celular (APK de desarrollo + `npx expo start`).
- [x] Pinout de la cámara confirmado (el de ESP32S3_EYE / Freenove funciona en la placa nueva).
- [x] Wi-Fi en `config.h` (zona Wi-Fi del Redmi Note 12S).
- [x] El profesor autorizó el PIR.
- [x] Comprar la placa, el PIR HC-SR501, 3 cables dupont hembra-hembra y un cable USB-C de datos (viernes 2 oct).
- [x] **Cámara defectuosa (2 oct), placa cambiada en la tienda (3 oct):** la OV2640 se detecta (PID 0x26/0x42), pero `esp_camera_init` falla 0/20 veces, también con el ejemplo oficial CameraWebServer. Se grabó un video (ejemplo oficial + `firmware/demo_falla_camara/`) para pedir el cambio en la tienda.
- [x] Placa nueva (COM7): diagnóstico 10/10, firmware arranca con cámara OK, Wi-Fi conectado, stream en `:81/stream` (el video se ve desde el celular).
- [x] **PIR conectado y probado (3 oct):** 2 detecciones confirmadas por cámara, Telegram con foto y correo recibidos. Corregido `setTimeout` en alerts.cpp (en core 3.x va en ms), que hacía registrar "FALLÓ" aunque Telegram sí entregaba. Conexión: con el USB desconectado: VCC→5V, OUT→GPIO14, GND→GND; jumper en H, tiempo al mínimo, sensibilidad a la mitad. Después, probar la detección (modo 2), Telegram y el correo.

**Fase 1 — Firmware base (1–2 oct)** — código listo y compilando (30 sep); falta probar en la placa
- Inicializar la cámara (PSRAM, `FRAMESIZE_VGA`, `jpeg_quality ~12`, `fb_count 2`, `CAMERA_GRAB_LATEST`).
- Conexión STA con AP de respaldo, mDNS `intrusos.local`, y NTP con zona horaria `COT5`.
- Stream MJPEG en el puerto 81 (`multipart/x-mixed-replace`) en su propio servidor y tarea.
- Endpoints REST: `/status`, `/arm`, `/schedule` (GET/POST), `/capture`.
- Verificación: ver el stream en el navegador de la PC.

**Fase 2 — Detección y alertas (2–3 oct)** — código listo y compilando (30 sep); falta probar y calibrar en la placa
- **Detección por cámara (por defecto):** una tarea FreeRTOS toma un fotograma cada ~200 ms, lo reduce a 80×60 en escala de grises (`jpg2rgb565` a escala 1/8) y lo compara píxel a píxel con el anterior. Si más del ~3 % de los píxeles cambian más que un umbral durante 2 comparaciones seguidas, hay movimiento.
  - Contra falsos positivos: se ignoran los primeros segundos tras encender (la cámara ajusta la exposición), se exigen comparaciones consecutivas y hay cooldown.
  - Umbrales ajustables como constantes; se calibran con la placa real.
- **PIR (`DETECTION_MODE` 1 o 2):** interrupción del GPIO → bandera; ventana de calentamiento de unos 30–60 s. En modo 2 la alerta solo sale si, además, la cámara confirma cambio en la imagen.
- En ambos casos, `detectorMotion()` avisa a la tarea `alertTask`, que hace la captura y el envío. Nunca se envía dentro de una ISR.
- Cooldown de unos 60 s entre alertas.
- Telegram con `sendPhoto` multipart por `WiFiClientSecure`, y correo con la librería `ESP_Mail_Client` adjuntando el JPEG.
- Verificación: moverse frente al PIR y la cámara con el sistema armado → llegan la foto por Telegram y el correo; con la escena quieta no llega nada.

**Fase 3 — App: visor y control (30 sep) ✅**
- [x] Simulador de la ESP32 en `tools/mock-esp32` (misma API, video falso, teclas m/c/f para movimiento, corte y congelamiento). Contrato en `docs/API.md`.
- [x] Visor MJPEG en WebView: lee el stream con `fetch`, separa los JPEG por marcadores FF D8 / FF D9, muestra solo el más reciente y reporta fps.
- [x] Reconexión (`src/hooks/use-stream.ts`): watchdog de 4 s sin fotogramas + backoff 1, 2, 4, 8, 10 s; pausa en segundo plano y cuando la pestaña no está a la vista.
- [x] Estado por polling de `/status` cada 2,5 s con timeout de 3 s (`src/hooks/use-device-status.ts`).
- [x] Switch "Fuera de casa" en el Visor → POST `/arm`.
- [x] Pantalla Horarios: franjas con días, HH:MM y validación → POST `/schedule`.
- [x] Ajustes: IP y puertos guardados en AsyncStorage, botón "Probar conexión".
- [x] Probado en el navegador contra el simulador: video, corte y congelamiento con reconexión, horarios, switch y movimiento.
- [x] Probado en el celular con el APK de desarrollo contra la placa real (3 oct): video, switch, contador y alertas. Expo Go se cayó al importar expo-notifications; se arregló con un require diferido en `monitor.ts`.

**Cómo probar sin la placa**
1. `cd tools/mock-esp32` y `npm start` (la primera vez, Windows pide permiso de firewall para Node: permitir en redes privadas).
2. En otra terminal: `cd app` y `npx expo start`, y escanear el QR con Expo Go.
3. En la app → Ajustes: poner la IP del PC (la imprime el simulador), Guardar.
4. En la terminal del simulador: `m` simula movimiento, `c` corta el video 10 s, `f` lo congela 10 s.

**Fase 4 — Foreground Service (30 sep)** — código listo; build de desarrollo en EAS
- [x] `react-native-background-actions` en lugar de notifee: notifee no se actualiza desde dic. 2024. Aviso de expo-doctor: no está probada oficialmente con la New Architecture, así que hay que confirmarlo en el celular.
- [x] Tipo de servicio `connectedDevice` (config plugin `app/plugins/with-background-service.js`). Se descartó `dataSync` por el límite de 6 h al día en Android 15.
- [x] Tarea en segundo plano (`src/services/monitor.ts`): consulta `/status` cada 5 s, actualiza la notificación fija ("Armado · última detección ...") y lanza una notificación de alerta (canal "alertas", prioridad máxima) cuando sube `motionCount`.
- [x] Interruptor "Vigilancia en segundo plano" en Ajustes; se reanuda solo al abrir la app (`MonitorAutoStart`).
- [x] `usesCleartextTraffic: true` (expo-build-properties), permisos POST_NOTIFICATIONS y FOREGROUND_SERVICE_CONNECTED_DEVICE.
- [x] Proyecto EAS @ethianwhor/detector-intrusos; perfiles `development` (dev client) y `preview` (APK independiente para la sustentación).
- [x] APK de desarrollo instalado; con la pantalla bloqueada llega la notificación de movimiento desde la placa real (3 oct).
- [x] APK final (preview) compilado el 3 oct: https://expo.dev/artifacts/eas/H7Qu3Nh_KMd2VmYyLa-F899Rp5kBf3qNRmCDF6P8Jfk.apk; instalado y probado sin el PC.

**Fase 5 — Pulido y defensa (6–7 oct)**
- Pruebas de extremo a extremo y casos de fallo: apagar el router, alejar el celular, reiniciar la ESP32.
- [x] Guía escrita (3 oct) en `docs/GUIA_SUSTENTACION.md`: HTTP vs. TCP/UDP, MJPEG por dentro, ISR vs. tareas, doble búfer de la cámara, TLS en ESP32, estados, backoff, ciclo de vida Android/Foreground Service, y por qué las alertas salen desde la ESP32.
- Ensayar las explicaciones en voz alta.

**Colchón:** 7 oct por la noche.

## Verificación de extremo a extremo
1. Encender la ESP32 → se conecta al Wi-Fi y `http://intrusos.local:81/stream` se ve en el navegador.
2. App → la pestaña Visor muestra el video. Al apagar y encender la ESP32, la app se reconecta sola.
3. Con "Fuera de casa" activo, moverse frente al PIR y la cámara → Telegram con la foto en menos de 5 s y correo con adjunto y hora.
4. Desarmado + movimiento → no llega ninguna alerta. Con una franja activa → sí llega.
5. App en segundo plano o pantalla bloqueada → la notificación persistente sigue viva y llega la notificación local de detección.

## Riesgos
- **El hardware llega tarde.** Mientras tanto se avanza con la app contra un servidor MJPEG simulado en la PC.
- **Falta de memoria por TLS + cámara.** Se envía de forma secuencial, se libera el frame buffer antes del TLS y se usa `setInsecure()` o el certificado raíz.
- **Gmail bloquea el acceso.** Solo funciona con contraseña de aplicación (requiere verificación en 2 pasos). Si falla, Telegram sigue siendo el canal principal.
- **Falsos positivos.** La cámara sola confunde cambios de luz con movimiento y el PIR solo puede dispararse con corrientes de aire caliente. Exigir ambos (modo 2) reduce ambos errores. Si la cámara confirma mal, se baja a modo 1.
- **"Persona sospechosa".** Ningún modo reconoce personas; para la defensa, explicar que se detecta *movimiento de un cuerpo caliente*. Mejora opcional ya preparada (ver abajo): detección de personas con un modelo en la ESP32-S3.

## Detección de personas (opcional, apagada por defecto)
- **Qué hace:** cuando el PIR y la cámara ya confirmaron movimiento, `personDetectorConfirm()` revisa hasta 3 fotos con una red neuronal (modelo *person_detect* de TensorFlow Lite Micro, entrenado con Visual Wake Words). Si alguna foto da persona ≥ 60 %, sale la alerta "🚨 Persona detectada (NN%)". Si no, se descarta (gato, cortina, sombra).
- **Cómo se activa:** en `config.h`, poner `#define PERSON_DETECTION 1`, compilar y subir. En el monitor serie debe aparecer `[persona] Modelo listo`. Para desactivarlo: `0`, o borrar la línea.
- **Archivos:** `person_detector.h/.cpp` (preprocesado e inferencia), `person_model_data.h/.cpp` (el modelo como arreglo en flash, ~300 KB). Los enganches son `personDetectorBegin()` en `setup()` y `detectorCheck() && personDetectorConfirm()` en `system_state.cpp`. Con 0 todo eso compila a nada.
- **Sin librerías extra:** el core ESP32 3.3.11 ya trae TensorFlow Lite Micro y ESP-NN (optimizado para el S3).
- **Preprocesado:** JPEG VGA → decodificado a 160x120 → recorte central de 120x120 → 96x96 en gris → int8 (gris − 128).
- **Límites:** acierta ~80 %, la persona debe ocupar buena parte de la imagen y funciona mal de noche. Si falla al cargar, deja pasar la alerta (el sistema sigue igual que sin IA). Ajustes en `person_detector.cpp`: `PERSON_THRESHOLD`, `PERSON_FRAMES`.
- **Para la defensa:** "el PIR detecta calor en movimiento, la cámara confirma el cambio en la imagen y una red neuronal pequeña, que corre en la propia ESP32, decide si es una persona. Lo sospechoso es que haya una persona mientras el sistema está armado."
