# Guía de sustentación — Sistema de Detección de Intrusos IoT

Cada sección trae: **la respuesta corta** (para decir primero), **el detalle** (si el profesor pide más) y **contrapreguntas probables**. Los nombres de archivo sirven para señalar el código si te lo piden.

---

## 0. La arquitectura en 30 segundos (apréndetela de memoria)

```
 [PIR HC-SR501] --GPIO14 (interrupción)--> 
                                          [ESP32-S3-CAM]  --HTTPS--> Telegram (foto)
 [Cámara OV2640] --bus DVP + SCCB------->   |   |          --SMTPS--> Gmail (foto + hora)
                                            |   |
                           puerto 80 (HTTP) |   | puerto 81 (MJPEG)
                           /status /arm     |   | /stream
                           /schedule        v   v
                                        [App React Native / Expo]
                                        visor + switch + horarios
                                        + Foreground Service (Android)
```

> "La ESP32 es autónoma: captura video, detecta movimiento con el PIR confirmado por la cámara, y ella misma envía la alerta por Telegram y correo. La app es el panel de control: ve el video en vivo, arma o desarma el sistema, programa horarios y, con un servicio en primer plano de Android, sigue vigilando aunque la app esté cerrada."

---

## 1. Hardware y firmware (ESP32-S3)

### 1.1 ¿Qué placa usaste y por qué?
**Corta:** ESP32-S3-CAM N16R8 con cámara OV2640: 16 MB de flash, 8 MB de PSRAM, USB-C.
**Detalle:** Se descartó la ESP32-CAM clásica (AI-Thinker) porque no es S3, tiene menos memoria, no trae USB y deja pocos pines libres. La **PSRAM** (8 MB de RAM externa) es clave: ahí viven los búferes de video, porque la RAM interna es solo de ~320 KB.
**Contrapregunta:** *¿Qué pasa si no activas la PSRAM?* → La cámara no puede reservar sus búferes en memoria externa y el arranque falla. En el Arduino IDE debe estar en "OPI PSRAM".

### 1.2 ¿Cómo está organizado el firmware? ¿Hay hilos?
**Corta:** Sí. La ESP32 corre **FreeRTOS**, y hay varias tareas en paralelo:
- `loop()` (loopTask): máquina de estados, detector y envío de alertas.
- Una tarea del **servidor de control** (puerto 80).
- Una tarea del **servidor de video** (puerto 81).
- Tareas internas del Wi-Fi y de la cámara.

**Detalle:** Son dos servidores HTTP separados (`web_server.cpp`) a propósito: el stream nunca termina, y si estuviera en el mismo servidor bloquearía `/status` y `/arm`.
**Contrapregunta:** *¿Cómo evitas que dos tareas choquen?* → Con un **mutex** (`SemaphoreHandle_t` en `system_state.cpp`): `loop()` escribe el estado y el servidor web lo lee; ambos toman el mutex antes de tocar `state`, `lastMotion` y `motionCount`.

### 1.3 ¿Cómo funciona el PIR? ¿Qué es una interrupción (ISR)?
**Corta:** El PIR saca 3,3 V en su pin OUT cuando detecta calor corporal en movimiento. Ese pin va al **GPIO14** con una **interrupción en flanco de subida**: apenas sube, se ejecuta `onPirRising()`, que **solo levanta una bandera** (`pirTriggered = true`).
**Detalle:** Una ISR debe ser cortísima y no puede bloquearse. Por eso no envía alertas ni usa la cámara: eso lo hace después `loop()`, cuando revisa la bandera. La variable es `volatile` porque la cambia la interrupción y el compilador no debe guardarla en caché. La función lleva `IRAM_ATTR` para que esté en RAM interna y se ejecute rápido.
**Contrapregunta:** *¿Por qué no leer el pin con `digitalRead` en el loop?* → Podría perderse un pulso corto mientras el loop está ocupado, por ejemplo enviando un correo. La interrupción no se pierde.
**Contrapregunta:** *¿Por qué 30 s de calentamiento?* → El HC-SR501 se dispara solo durante el primer minuto tras encender (`PIR_WARMUP_MS`).

### 1.4 ¿Cómo detecta movimiento la cámara?
**Corta:** Compara fotogramas. Cada 200 ms toma un JPEG, lo decodifica a **80×60 en escala de grises** y cuenta cuántos píxeles cambiaron más de 25 niveles respecto al anterior. Si cambió más del **3 %** de la imagen, hay movimiento (`detector.cpp`).
**Detalle:** Se decodifica a escala 1/8 porque así el decodificador casi no trabaja (usa el promedio de cada bloque 8×8 del JPEG), tarda pocos milisegundos y además suaviza el ruido del sensor.
**Contrapregunta:** *¿Por qué no solo la cámara?* → Confunde cambios de luz (una nube, encender una lámpara) con movimiento.
**Contrapregunta:** *¿Y por qué no solo el PIR?* → Puede dispararse con corrientes de aire caliente y no "ve" nada.

### 1.5 Modo 2: PIR + cámara (el que usamos)
**Corta:** La alerta solo sale si el PIR se dispara **y** la cámara ve un cambio en la imagen dentro de una ventana de **2 segundos**. Se exige que ambos coincidan.
**Detalle:** En la prueba real, dos disparos del PIR sin cambio en la imagen fueron **descartados** (`PIR sin cambio en la imagen: descartado`). Así funciona el filtro de falsos positivos. `DETECTION_MODE` en `config.h` permite cambiar entre 0 (solo cámara), 1 (solo PIR) y 2 (ambos), sin tocar el resto del código, porque `detector.h` solo expone `detectorBegin()`, `detectorCheck()` y `detectorReset()`.
**Contrapregunta:** *¿Detecta personas?* → **No.** Detecta *movimiento de un cuerpo caliente*. El profesor lo advirtió. Hay una mejora opcional preparada (red neuronal *person_detect* de TensorFlow Lite Micro, `PERSON_DETECTION 1`), pero está apagada.

### 1.6 La máquina de estados
```
DESARMADO --(armado manual o franja activa)--> ARMADO
ARMADO --(detección confirmada)--> DETECTANDO --(envía alertas)--> ALERTA_ENVIADA
ALERTA_ENVIADA --(pasa 1 min de enfriamiento)--> ARMADO
cualquiera --(se desarma)--> DESARMADO
```
**Por qué el enfriamiento (`COOLDOWN_MS = 60 s`):** sin él, una persona caminando generaría decenas de correos seguidos.
**Contrapregunta:** *¿Qué es "armado"?* → `manualArmed() || scheduleActiveNow()`: el switch "Fuera de casa" de la app **o** una franja horaria activa.

### 1.7 Memoria y búfer de video
**Corta:** La cámara usa **3 búferes en PSRAM** (`fb_count = 3`) y el modo `CAMERA_GRAB_LATEST`.
**Detalle:**
- Con varios búferes, mientras la cámara llena uno, el stream y el detector pueden estar usando otros, sin bloquearse entre sí.
- `GRAB_LATEST` descarta los fotogramas viejos y entrega siempre el más reciente: **menos latencia**.
- El JPEG lo comprime la propia cámara por hardware: una foto VGA pesa ~25-35 KB en vez de 600 KB sin comprimir.
- Cada búfer se **devuelve lo antes posible** (`esp_camera_fb_return`), porque si alguien lo retiene, los demás se quedan sin fotogramas.

**Contrapregunta:** *¿Por qué el stream va a ~15 fps máximo?* → `STREAM_FRAME_INTERVAL_MS = 66`, un tope para dejar CPU libre al detector.

### 1.8 Wi-Fi: modo estación y punto de acceso (AP)
**Corta:** La placa intenta conectarse a la red configurada (modo **STA**) durante 15 s. Si no puede, crea **su propia red** "Intrusos-ESP32" (modo **AP**), y el video y el armado manual siguen funcionando, aunque sin internet no salen alertas.
**Detalle (`netconn.cpp`):**
- `WiFi.setSleep(false)`: sin ahorro de energía en el Wi-Fi, para bajar la latencia del video.
- Si se pierde la conexión, reintenta cada 10 s.
- Sincroniza la hora por **NTP** (zona UTC-5) para la marca temporal exacta de las alertas.
- **mDNS** publica el nombre `intrusos.local`.

---

## 2. Redes: protocolos (pregunta casi segura)

### 2.1 ¿Qué protocolos usa el sistema?
| Tramo | Protocolo | Puerto |
|---|---|---|
| App → ESP32 (control) | HTTP sobre TCP, JSON | 80 |
| ESP32 → App (video) | HTTP sobre TCP, MJPEG | 81 |
| ESP32 → Telegram | HTTPS (TLS sobre TCP) | 443 |
| ESP32 → Gmail | SMTP con SSL (SMTPS) | 465 |
| Hora | NTP (sobre UDP) | 123 |
| Nombre `intrusos.local` | mDNS (sobre UDP) | 5353 |

### 2.2 ¿Qué es MJPEG y cómo viaja?
**Corta:** Es una **respuesta HTTP que nunca termina**, con tipo `multipart/x-mixed-replace`. Cada "parte" es un JPEG completo, separado por un delimitador (`--frame`), y el cliente reemplaza la imagen con cada parte nueva.
**Detalle:** Cada parte lleva su cabecera `Content-Type: image/jpeg` y `Content-Length`. La ESP32 envía cada fotograma con `httpd_resp_send_chunk`. Si el envío falla, el cliente se fue (cerró la app o perdió el Wi-Fi), así que el bucle termina y se cierra el socket.
**Contrapregunta:** *¿Por qué MJPEG y no H.264?* → La ESP32 no tiene codificador de video. La cámara sí comprime JPEG por hardware. MJPEG es simple, cada cuadro es independiente (si se pierde uno no se corrompen los siguientes) y lo entiende cualquier navegador.

### 2.3 ¿Por qué TCP y no UDP para el video?
**Corta:** Un JPEG partido en paquetes UDP llega incompleto o desordenado si se pierde un paquete, y la imagen queda corrupta. TCP garantiza **orden y entrega**, y HTTP sobre TCP funciona con cualquier cliente.
**Contra:** TCP puede acumular retraso si la red es mala. Se compensa con `GRAB_LATEST` (siempre el fotograma más nuevo) y con el watchdog de la app, que reconecta si se congela.
**Contrapregunta:** *¿Y WebSockets?* → También van sobre TCP. Servirían para un canal bidireccional, pero aquí el video es de un solo sentido y el control se resuelve con peticiones HTTP cortas, así que MJPEG por HTTP es más simple.

### 2.4 ¿Cómo se comunica la app con la placa para el control?
**Corta:** Con una **API REST** en el puerto 80:
- `GET /status`: estado, armado, última detección, contador, señal Wi-Fi.
- `POST /arm` con `{"armed": true/false}`: el switch "Fuera de casa".
- `GET/POST /schedule`: las franjas horarias.
- `GET /capture`: una foto.

El contrato está en `docs/API.md`. La app consulta `/status` cada **2,5 s** con un timeout de **3 s** (`use-device-status.ts`).
**Contrapregunta:** *¿Por qué `setTimeout` encadenado y no `setInterval`?* → Con `setInterval`, si la red está lenta se acumulan peticiones simultáneas. Encadenado, la siguiente solo sale cuando terminó la anterior.

---

## 3. App móvil: video y reconexión

### 3.1 ¿Cómo muestra la app el video?
**Corta:** Un **WebView** abre el stream con `fetch()`, lee los bytes a medida que llegan (`getReader()`) y separa cada JPEG buscando sus marcadores de inicio `FF D8` y de fin `FF D9`. Solo muestra el **más reciente** y descarta los atrasados, para la menor latencia (`viewer-html.ts`).
**Por qué no un `<Image>` normal:** el componente `Image` de React Native no entiende `multipart/x-mixed-replace` en Android.

### 3.2 ¿Cómo maneja las caídas de Wi-Fi? (reconexión automática)
**Corta:** Hay una máquina de estados en `use-stream.ts`:
```
connecting --(llega fotograma)--> live
live --(error o 4 s sin fotogramas)--> reconnecting
reconnecting --(espera 1, 2, 4, 8, 10 s...)--> connecting
cualquiera --(app en segundo plano)--> paused --(vuelve)--> connecting
```
**Detalle:**
- **Watchdog de 4 s:** detecta el stream *congelado*, es decir, la conexión sigue abierta pero no llegan fotogramas. Sin esto, la imagen se quedaría quieta para siempre sin error.
- **Backoff exponencial** (1, 2, 4, 8 s, con tope de 10 s): no satura a la ESP32 ni la red con reintentos seguidos, pero se recupera rápido si fue un corte breve.
- **Pausa en segundo plano:** no gasta batería ni datos descargando video que nadie ve.

**Contrapregunta:** *¿Cómo reconectas?* → Se desmonta el WebView (eso cierra la conexión TCP) y se monta uno nuevo cambiando su `key`.

---

## 4. Segundo plano: Foreground Service (Android)

### 4.1 ¿Cómo sigue vigilando la app cerrada o con la pantalla bloqueada?
**Corta:** Con un **Foreground Service**: un servicio que Android **no mata** aunque la app esté en segundo plano, a cambio de mostrar una **notificación fija**. Dentro corre una tarea JavaScript (HeadlessJS) que consulta `/status` cada **5 s**. Si `motionCount` subió, lanza una notificación de alerta de prioridad máxima (`services/monitor.ts`).
**Detalle:**
- Librería `react-native-background-actions`. Se descartó `notifee` porque no se actualiza desde 2024.
- Tipo de servicio **`connectedDevice`** (obligatorio desde Android 14 declarar el tipo). Se descartó `dataSync` porque Android 15 lo limita a 6 h al día.
- Permisos: `POST_NOTIFICATIONS` y `FOREGROUND_SERVICE_CONNECTED_DEVICE`.
- La notificación fija se actualiza solo si cambia el texto, para evitar parpadeos.

**Contrapregunta:** *¿Por qué no funciona en Expo Go?* → Expo Go solo trae sus módulos nativos incluidos, y el servicio necesita código nativo. Por eso se usa un **development build** / APK propio compilado en **EAS**. Además, desde el SDK 53, Expo Go para Android ni siquiera permite importar `expo-notifications`. Por eso ese módulo se carga de forma diferida (`require` dentro de una función).

### 4.2 Ciclo de vida de la app
- **Primer plano:** visor activo, polling de `/status` cada 2,5 s.
- **Segundo plano:** el visor se pausa (AppState), y si está activada la vigilancia, el Foreground Service sigue consultando cada 5 s.
- **Al volver:** el visor reconecta desde cero.
- **Al reabrir la app:** si la vigilancia estaba activa, se reanuda sola (`MonitorAutoStart`, preferencia guardada en AsyncStorage).

---

## 5. Horarios y alertas

### 5.1 ¿Cómo funcionan las franjas horarias?
**Corta:** La app envía las franjas (días, hora de inicio y fin) con `POST /schedule`. La ESP32 las guarda en **NVS** (memoria no volátil, librería `Preferences`), así que **sobreviven a un reinicio**. Cada vez que el loop decide si está armado, compara la hora actual (NTP) con las franjas (`schedule.cpp`).
**Detalle:** Soporta franjas que cruzan la medianoche (por ejemplo de 22:00 a 06:00): si el inicio es mayor que el fin, revisa si la franja empezó "ayer".
**Contrapregunta:** *¿Y si no hay internet para NTP?* → Sin hora no se puede saber si estamos en una franja; el armado manual sigue funcionando.

### 5.2 ¿Quién envía las alertas y por qué la ESP32 y no el celular?
**Corta:** La **ESP32**, directamente: primero **Telegram** (`sendPhoto`, con la foto) y luego **correo** (Gmail por SMTP, con la foto adjunta y la hora exacta).
**Pros:** el sistema funciona aunque el celular esté apagado o sin batería, tiene la menor latencia y usa menos piezas.
**Contras y mitigación:**
- TLS consume ~40 KB de RAM por conexión → se envía **en secuencia**, nunca dos conexiones a la vez, y los búferes grandes van en PSRAM.
- Las credenciales quedan en el chip (`config.h`) → se usa una **contraseña de aplicación** de Gmail, no la contraseña real.

### 5.3 ¿Cómo se envía la foto a Telegram?
**Corta:** Con un POST **multipart/form-data** a `api.telegram.org/bot<TOKEN>/sendPhoto`, por HTTPS (`WiFiClientSecure`). Tiene tres partes: `chat_id`, `caption` (el texto con la hora) y `photo` (el JPEG). La foto se envía **por pedazos de 4 KB** para no armar otra copia completa en memoria (`alerts.cpp`).
**Contrapregunta:** *¿Verificas el certificado?* → Se usa `setInsecure()`: la conexión **va cifrada**, pero no se verifica la identidad del servidor. Es la opción simple. Lo más seguro sería cargar el certificado raíz de Telegram. Reconócelo como limitación.
**Bug real que encontramos:** en el core 3.x de la ESP32, `setTimeout()` recibe **milisegundos**, no segundos. Se le pasaba 15, o sea 15 ms, y por eso el registro decía "FALLÓ" aunque Telegram sí entregaba la foto. Se corrigió a 15000.

### 5.4 ¿Y el correo?
**Corta:** Con la librería **ESP Mail Client**, por SMTP a `smtp.gmail.com:465` con SSL. Se adjunta el JPEG **directamente desde la memoria** (blob), sin escribirlo en un archivo, y el texto lleva la marca temporal exacta.

---

## 6. Manejo de errores (contrapreguntas típicas)

| Si pasa esto... | El sistema hace... |
|---|---|
| Se cae el Wi-Fi | La ESP32 reintenta cada 10 s. La app muestra "reconectando" con backoff 1-10 s |
| No hay Wi-Fi al arrancar | La ESP32 crea su red "Intrusos-ESP32": video y armado manual sin alertas |
| Hay Wi-Fi pero no internet | Detecta, pero registra "Sin internet: no se pueden enviar alertas" |
| El video se congela | El watchdog de 4 s lo detecta y reconecta |
| La app va a segundo plano | Se pausa el video. El Foreground Service sigue vigilando |
| Se reinicia la ESP32 | Las franjas y el "Fuera de casa" se recuperan de NVS |
| No arranca la cámara | La ESP32 se reinicia a los 5 s (sin cámara no hay sistema) |
| Movimiento continuo | 1 alerta y luego 1 min de enfriamiento |

---

## 7. La falla de la cámara (buena historia para contar)

La primera placa no lograba iniciar la cámara (`Camera init failed 0xffffffff`, `SCCB_Write Failed`). El diagnóstico fue por descarte:
1. Con un programa propio se comprobó que la cámara **sí respondía** por el bus **SCCB**, una variante de I²C, con su identificación OV2640 (PID 0x26, VER 0x42). Eso descartó un error de pines.
2. Respondía **solo con el reloj XCLK activo**, como debe ser.
3. Pasaba 1000 lecturas sueltas sin fallos, pero la **secuencia de configuración** fallaba en un registro **distinto cada vez**. Eso apuntaba a una falla eléctrica intermitente, no de configuración.
4. Se probaron otro puerto USB, alimentación extra, reloj a 10 MHz y otro esquema de particiones. Nada cambió.
5. La tienda cambió la placa, y la nueva funcionó **10 de 10** con exactamente el mismo código.

**Lección:** separar el problema en capas (bus → identificación → configuración) para distinguir hardware de software.

---

## 8. Guion de demostración (5 minutos)

1. Mostrar la placa: cámara, PIR (VCC→5V, OUT→GPIO14, GND→GND).
2. Abrir la app → **Visor**: video en vivo (mencionar los fps).
3. Activar **"Fuera de casa"** → mostrar el estado "ARMADO".
4. Pasar frente al sensor → llega la notificación del celular, la foto por **Telegram** y el **correo** con la hora.
5. **Horarios:** crear una franja y explicar que se guarda en la ESP32 (NVS).
6. Bloquear el celular → pasar de nuevo → llega la notificación del **Foreground Service**.
7. Si sobra tiempo: apagar el Wi-Fi unos segundos y mostrar la **reconexión automática** del video.

## 9. Pruebas de fallos para hacer antes del jueves
- [ ] Apagar la zona Wi-Fi 20 s con la app abierta y mirar cómo reconecta.
- [ ] Reiniciar la ESP32 (botón RST) y ver que vuelve "Fuera de casa" y las franjas.
- [ ] Alejar el celular hasta perder señal y volver.
- [ ] Con la app cerrada y la vigilancia activa, provocar una detección.
- [ ] Encender la placa sin la zona Wi-Fi y conectarse a la red "Intrusos-ESP32" (IP `192.168.4.1`).
