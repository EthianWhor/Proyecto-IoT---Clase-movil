#include "system_state.h"
#include <WiFi.h>
#include <time.h>
#include "alerts.h"
#include "camera.h"
#include "config.h"
#include "detector.h"
#include "netconn.h"
#include "person_detector.h"
#include "schedule.h"

namespace {
const uint32_t DETECT_EVERY_MS = 200;  // ~5 comparaciones por segundo
const uint32_t COOLDOWN_MS = 60000;    // tras una alerta, 1 min sin nuevas alertas

SystemState state = SystemState::DESARMADO;
time_t lastMotion = 0;
uint32_t motionCount = 0;
uint32_t lastDetect = 0;
uint32_t cooldownEnd = 0;

// state, lastMotion y motionCount los escribe loop() y los lee el servidor web.
SemaphoreHandle_t mutex;

struct Lock {
  Lock() { xSemaphoreTake(mutex, portMAX_DELAY); }
  ~Lock() { xSemaphoreGive(mutex); }
};

const char *stateName(SystemState s) {
  switch (s) {
    case SystemState::ARMADO: return "ARMADO";
    case SystemState::DETECTANDO: return "DETECTANDO";
    case SystemState::ALERTA_ENVIADA: return "ALERTA_ENVIADA";
    default: return "DESARMADO";
  }
}

void setState(SystemState next) {
  {
    Lock lock;
    if (state == next) return;
    state = next;
  }
  Serial.printf("[sistema] -> %s\n", stateName(next));
}

bool shouldBeArmed() {
  return manualArmed() || scheduleActiveNow();
}

void handleIntrusion() {
  String when = timeIsSynced() ? timeNowText() : String("hora desconocida (sin NTP)");
  {
    Lock lock;
    state = SystemState::DETECTANDO;
    lastMotion = time(nullptr);
    motionCount++;
  }
  Serial.printf("[sistema] -> DETECTANDO  ¡Movimiento! %s\n", when.c_str());

  uint8_t *jpeg = nullptr;
  size_t len = 0;
  if (!cameraCaptureCopy(&jpeg, &len)) {
    Serial.println("[sistema] No se pudo tomar la foto");
  } else if (!networkHasInternet()) {
    Serial.println("[sistema] Sin internet: no se pueden enviar alertas");
  } else {
    // Envío secuencial: primero Telegram (más rápido) y luego el correo.
    // Nunca dos conexiones TLS a la vez, porque cada una consume ~40 KB de RAM.
#if PERSON_DETECTION
    String title = "🚨 Persona detectada (" + String((int)(personDetectorScore() * 100)) + "%)\n";
#else
    String title = "🚨 Movimiento detectado\n";
#endif
    alertTelegram(jpeg, len, title + when);
    alertEmail(jpeg, len, when);
  }
  free(jpeg);

  cooldownEnd = millis() + COOLDOWN_MS;
  setState(SystemState::ALERTA_ENVIADA);
}
}  // namespace

void systemBegin() {
  mutex = xSemaphoreCreateMutex();
}

void systemLoop() {
  bool armed = shouldBeArmed();
  SystemState current;
  {
    Lock lock;
    current = state;
  }

  switch (current) {
    case SystemState::DESARMADO:
      if (armed) {
        detectorReset();
        setState(SystemState::ARMADO);
      }
      break;

    case SystemState::ARMADO:
      if (!armed) {
        setState(SystemState::DESARMADO);
      } else if (millis() - lastDetect >= DETECT_EVERY_MS) {
        lastDetect = millis();
        if (detectorCheck() && personDetectorConfirm()) handleIntrusion();
      }
      break;

    case SystemState::ALERTA_ENVIADA:
      if (!armed) {
        setState(SystemState::DESARMADO);
      } else if ((int32_t)(millis() - cooldownEnd) >= 0) {
        detectorReset();
        setState(SystemState::ARMADO);
      }
      break;

    case SystemState::DETECTANDO:
      break;  // solo existe mientras handleIntrusion() envía las alertas
  }
}

void systemStatusJson(JsonObject out) {
  bool manual = manualArmed();
  bool inSchedule = scheduleActiveNow();
  Lock lock;
  out["state"] = stateName(state);
  out["armed"] = manual || inSchedule;
  out["manualArmed"] = manual;
  out["inSchedule"] = inSchedule;
  if (lastMotion) out["lastMotion"] = (long)lastMotion;
  else out["lastMotion"] = nullptr;
  out["motionCount"] = motionCount;
  out["detectionMode"] = DETECTION_MODE;
  out["uptime"] = millis() / 1000;
  out["time"] = timeIsSynced() ? (long)time(nullptr) : 0;
  out["rssi"] = networkHasInternet() ? WiFi.RSSI() : 0;
}
