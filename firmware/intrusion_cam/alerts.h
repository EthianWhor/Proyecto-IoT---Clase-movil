#pragma once
#include <Arduino.h>

// Envío de alertas por internet. Ambas funciones bloquean unos segundos (TLS),
// por eso se llaman desde loop() y no desde los servidores web ni desde una ISR.

// Foto + texto al chat de Telegram (Bot API, HTTPS, multipart/form-data).
bool alertTelegram(const uint8_t *jpeg, size_t len, const String &caption);

// Correo por SMTP de Gmail (SSL, puerto 465) con la foto adjunta.
bool alertEmail(const uint8_t *jpeg, size_t len, const String &when);
