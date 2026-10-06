# API de la ESP32 (contrato app ↔ firmware)

La implementan el firmware real y el simulador (`tools/mock-esp32`). Todas las respuestas llevan `Access-Control-Allow-Origin: *`.

## Puerto 80 — control (JSON)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/status` | — | `Status` |
| POST | `/arm` | `{ "armed": true }` | `Status` (activa o desactiva "Fuera de casa") |
| GET | `/schedule` | — | `{ "slots": Slot[] }` |
| POST | `/schedule` | `{ "slots": Slot[] }` (máx. 8) | `{ "slots": Slot[] }` |
| GET | `/capture` | — | `image/jpeg` (una foto) |
| OPTIONS | cualquiera | — | 204 (preflight CORS, para pruebas en el navegador) |

Si algo falla, responde con código 4xx y `{ "error": "mensaje" }`.

```ts
Status = {
  state: 'DESARMADO' | 'ARMADO' | 'DETECTANDO' | 'ALERTA_ENVIADA',
  armed: boolean,        // armado efectivo = manualArmed || inSchedule
  manualArmed: boolean,  // "Fuera de casa"
  inSchedule: boolean,   // la hora NTP actual cae en una franja activa
  lastMotion: number | null, // segundos Unix
  motionCount: number,
  detectionMode: 0 | 1 | 2,  // 0 cámara, 1 PIR, 2 PIR + cámara
  uptime: number,        // segundos desde el arranque
  time: number,          // hora actual de la ESP32 (segundos Unix)
  rssi: number,          // señal Wi-Fi en dBm
}

Slot = {
  id: string,
  days: number[],   // 0 = domingo ... 6 = sábado (igual que tm_wday)
  start: 'HH:MM',
  end: 'HH:MM',     // si end < start, la franja cruza la medianoche
  enabled: boolean,
}
```

## Puerto 81 — video

`GET /stream` → `multipart/x-mixed-replace; boundary=frame`. Cada parte es un JPEG:

```
--frame\r\n
Content-Type: image/jpeg\r\n
Content-Length: <bytes>\r\n
\r\n
<JPEG>\r\n
```

El video va en un servidor aparte para que una conexión de stream que nunca termina no bloquee las peticiones de control.

## Solo del simulador

`POST /debug/motion`, `/debug/cut` (corta el stream 10 s) y `/debug/freeze` (congela el stream 10 s).
