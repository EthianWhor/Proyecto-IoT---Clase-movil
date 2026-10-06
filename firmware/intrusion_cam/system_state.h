#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Máquina de estados del sistema:
//
//   DESARMADO --(Fuera de casa o franja activa)--> ARMADO
//   ARMADO --(detector confirma movimiento)--> DETECTANDO
//   DETECTANDO --(foto + Telegram + correo)--> ALERTA_ENVIADA
//   ALERTA_ENVIADA --(pasa el cooldown)--> ARMADO o DESARMADO
//   ARMADO / ALERTA_ENVIADA --(se desarma)--> DESARMADO
enum class SystemState { DESARMADO, ARMADO, DETECTANDO, ALERTA_ENVIADA };

void systemBegin();
void systemLoop();  // se llama en cada vuelta de loop()

void systemStatusJson(JsonObject out);  // contenido de GET /status
