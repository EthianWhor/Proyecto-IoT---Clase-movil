// Copia este archivo como config.h y llena tus datos. config.h NO se sube a git.
#pragma once

// Wi-Fi de la casa (modo estación). Si no conecta, la ESP32 levanta su propio AP.
#define WIFI_SSID      "TU_WIFI"
#define WIFI_PASSWORD  "TU_CLAVE"

// AP de respaldo
#define AP_SSID        "Intrusos-ESP32"
#define AP_PASSWORD    "12345678"

// Telegram (bot creado con @BotFather)
#define TG_BOT_TOKEN   "123456:ABC..."
#define TG_CHAT_ID     "000000000"

// Correo (Gmail con contraseña de aplicación)
#define SMTP_HOST      "smtp.gmail.com"
#define SMTP_PORT      465
#define SMTP_USER      "tu_correo@gmail.com"
#define SMTP_APP_PASS  "xxxx xxxx xxxx xxxx"
#define ALERT_EMAIL_TO "destino@gmail.com"

// Fuente de detección:
//   0 = solo cámara (comparación de fotogramas)
//   1 = solo sensor PIR
//   2 = PIR dispara y la cámara confirma que hubo cambio en la imagen (recomendado)
#define DETECTION_MODE 2
#define PIR_PIN        14   // salida (OUT) del HC-SR501

// Detección de personas con IA (opcional). Después de confirmar movimiento, un
// modelo de TensorFlow Lite Micro revisa la foto y solo alerta si ve una persona.
// 0 = apagado (por defecto), 1 = encendido.
#define PERSON_DETECTION 0
