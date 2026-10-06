# Sistema de Detección de Intrusos IoT (ESP32-S3 CAM + React Native)

Parcial de Desarrollo Móvil — Proyecto 1. Trabajo individual.

Una ESP32-S3 CAM transmite video MJPEG, detecta movimiento (sensor PIR HC-SR501 + confirmación por comparación de fotogramas) y envía alertas con foto y hora por **Telegram** y **correo (SMTP Gmail)**. La app móvil muestra el video en vivo con reconexión automática, permite armar el sistema ("Fuera de casa"), programar franjas horarias y mantiene la vigilancia en segundo plano con un Foreground Service.

```
[PIR] -> GPIO14 · [Cámara OV2640] confirma
            |
     [ESP32-S3 CAM] --MJPEG :81/stream--> [App RN]
            |  HTTP :80 /status /arm /schedule /capture <--> [App RN]
            |--HTTPS--> Telegram Bot API (foto + hora)
            '--SMTPS--> Gmail (foto adjunta + hora)
```

## Estructura
| Carpeta | Contenido |
|---|---|
| `firmware/intrusion_cam/` | Sketch Arduino (core ESP32 3.x): cámara, Wi-Fi STA+AP, NTP, horarios en NVS, detector, alertas, servidor HTTP/MJPEG |
| `firmware/demo_falla_camara/` | Sketch de diagnóstico usado para documentar la cámara defectuosa |
| `app/` | App Expo/TypeScript: visor, horarios, ajustes, servicio en primer plano |
| `tools/mock-esp32/` | Simulador de la ESP32 para probar la app sin la placa |
| `docs/` | `ENUNCIADO.md`, `API.md` (contrato app↔firmware), `GUIA_SUSTENTACION.md`, `PLAN.md` |

## Firmware
1. Arduino IDE con el core **esp32 3.3.x**; librería `ESP Mail Client` (Mobizt).
2. Copiar `firmware/intrusion_cam/config.example.h` a `config.h` y llenar Wi-Fi, token/chat de Telegram y datos SMTP (`config.h` no se sube a git).
3. Placa **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**, Flash **16MB**, partición `app3M_fat9M_16MB`.
4. Conexión del PIR: VCC→5V, OUT→GPIO14, GND→GND (jumper en H).
5. Subir y abrir `http://<ip>:81/stream` o `http://intrusos.local:81/stream`.

## App
```bash
cd app
npm install
npx expo start
```
El Foreground Service requiere un build nativo (no funciona en Expo Go):
`npx eas-cli build --profile preview -p android` genera el APK. En **Ajustes** se escribe la IP de la ESP32.

## Probar sin la placa
```bash
cd tools/mock-esp32 && npm install && npm start
```
Luego en la app → Ajustes, poner la IP del PC. Teclas del simulador: `m` movimiento, `c` corta el video, `f` lo congela.

## Fuentes de detección (`DETECTION_MODE`)
`0` solo cámara · `1` solo PIR · `2` PIR dispara y la cámara confirma (por defecto).
