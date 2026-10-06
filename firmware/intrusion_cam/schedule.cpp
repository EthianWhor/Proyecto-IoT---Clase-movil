#include "schedule.h"
#include <Preferences.h>
#include <time.h>
#include "netconn.h"

namespace {
Preferences prefs;
Slot slots[MAX_SLOTS];
int slotCount = 0;
bool manual = false;

// Los datos se leen desde loop() y se escriben desde la tarea del servidor web:
// son dos tareas de FreeRTOS distintas, así que un mutex evita leer a medias.
SemaphoreHandle_t mutex;

struct Lock {
  Lock() { xSemaphoreTake(mutex, portMAX_DELAY); }
  ~Lock() { xSemaphoreGive(mutex); }
};

bool parseHHMM(const char *text, uint16_t &minutes) {
  if (!text || strlen(text) != 5 || text[2] != ':') return false;
  if (!isdigit(text[0]) || !isdigit(text[1]) || !isdigit(text[3]) || !isdigit(text[4])) return false;
  int h = (text[0] - '0') * 10 + (text[1] - '0');
  int m = (text[3] - '0') * 10 + (text[4] - '0');
  if (h > 23 || m > 59) return false;
  minutes = h * 60 + m;
  return true;
}

void formatHHMM(uint16_t minutes, char out[6]) {
  snprintf(out, 6, "%02u:%02u", minutes / 60, minutes % 60);
}

bool slotContains(const Slot &s, int day, int minutes) {
  if (!s.enabled) return false;
  bool today = s.days & (1 << day);
  if (s.start < s.end) return today && minutes >= s.start && minutes < s.end;
  // Cruza la medianoche (ej. 22:00-06:00): la parte de la madrugada pertenece
  // al día en que empezó la franja, o sea, al día anterior.
  int yesterday = (day + 6) % 7;
  bool startedYesterday = s.days & (1 << yesterday);
  return (today && minutes >= s.start) || (startedYesterday && minutes < s.end);
}
}  // namespace

void scheduleBegin() {
  mutex = xSemaphoreCreateMutex();
  prefs.begin("intrusos", false);
  manual = prefs.getBool("manual", false);
  slotCount = prefs.getBytes("slots", slots, sizeof(slots)) / sizeof(Slot);
  Serial.printf("[horarios] %d franjas cargadas, Fuera de casa: %s\n", slotCount, manual ? "sí" : "no");
}

bool manualArmed() {
  Lock lock;
  return manual;
}

void setManualArmed(bool armed) {
  Lock lock;
  manual = armed;
  prefs.putBool("manual", armed);
}

bool scheduleActiveNow() {
  if (!timeIsSynced()) return false;
  time_t now = time(nullptr);
  struct tm local;
  localtime_r(&now, &local);
  int minutes = local.tm_hour * 60 + local.tm_min;

  Lock lock;
  for (int i = 0; i < slotCount; i++) {
    if (slotContains(slots[i], local.tm_wday, minutes)) return true;
  }
  return false;
}

void scheduleToJson(JsonArray out) {
  Lock lock;
  for (int i = 0; i < slotCount; i++) {
    const Slot &s = slots[i];
    JsonObject o = out.add<JsonObject>();
    o["id"] = s.id;
    JsonArray days = o["days"].to<JsonArray>();
    for (int d = 0; d < 7; d++) {
      if (s.days & (1 << d)) days.add(d);
    }
    char hhmm[6];
    formatHHMM(s.start, hhmm);
    o["start"] = hhmm;
    formatHHMM(s.end, hhmm);
    o["end"] = hhmm;
    o["enabled"] = s.enabled;
  }
}

bool scheduleFromJson(JsonArrayConst in, String &error) {
  if (in.size() > MAX_SLOTS) {
    error = "Máximo 8 franjas";
    return false;
  }

  // Se valida todo en una copia; solo si todo está bien se reemplaza lo guardado.
  Slot parsed[MAX_SLOTS] = {};
  int count = 0;
  for (JsonObjectConst o : in) {
    Slot &s = parsed[count];
    const char *id = o["id"];
    if (!id || strlen(id) == 0 || strlen(id) >= sizeof(s.id)) {
      error = "Id de franja inválido (1 a 15 caracteres)";
      return false;
    }
    strlcpy(s.id, id, sizeof(s.id));

    if (!parseHHMM(o["start"], s.start) || !parseHHMM(o["end"], s.end)) {
      error = "Horas inválidas, usa HH:MM";
      return false;
    }
    if (!o["enabled"].is<bool>() || !o["days"].is<JsonArrayConst>()) {
      error = "Faltan campos en la franja";
      return false;
    }
    s.enabled = o["enabled"];
    for (JsonVariantConst d : o["days"].as<JsonArrayConst>()) {
      int day = d | -1;
      if (day < 0 || day > 6) {
        error = "Días inválidos (0 a 6)";
        return false;
      }
      s.days |= 1 << day;
    }
    count++;
  }

  Lock lock;
  memcpy(slots, parsed, sizeof(slots));
  slotCount = count;
  prefs.putBytes("slots", slots, count * sizeof(Slot));
  Serial.printf("[horarios] %d franjas guardadas\n", count);
  return true;
}
