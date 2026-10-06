#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Franjas horarias y modo "Fuera de casa". Se guardan en NVS (memoria flash no
// volátil) para sobrevivir a un reinicio o a un corte de luz.

const int MAX_SLOTS = 8;

struct Slot {
  char id[16];
  uint8_t days;    // bit d = día d (0 = domingo ... 6 = sábado, como tm_wday)
  uint16_t start;  // minutos desde medianoche
  uint16_t end;    // si end < start, la franja cruza la medianoche
  bool enabled;
};

void scheduleBegin();  // carga desde NVS y crea el mutex

bool manualArmed();
void setManualArmed(bool armed);

// true si la hora actual cae dentro de alguna franja activa.
// Sin hora NTP devuelve false (no se puede saber).
bool scheduleActiveNow();

void scheduleToJson(JsonArray out);
// Valida y guarda. Si algo es inválido no cambia nada y devuelve el motivo en `error`.
bool scheduleFromJson(JsonArrayConst in, String &error);
