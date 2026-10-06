#include "detector.h"
#include "config.h"
#include "esp_camera.h"
#include "jpeg_decoder.h"

namespace {
// ---- Comparación de fotogramas ----
// El JPEG VGA (640x480) se decodifica a escala 1/8 = 80x60. A esa escala el
// decodificador casi no trabaja (solo lee el promedio de cada bloque 8x8), tarda
// pocos milisegundos y además suaviza el ruido del sensor.
const int W = 80;
const int H = 60;
const int PIXELS = W * H;
const uint8_t PIXEL_DELTA = 25;      // cuánto debe cambiar un píxel (0-255) para contar
const float CHANGED_RATIO = 0.03f;   // % de píxeles cambiados para decir "la imagen cambió"
const int CONSECUTIVE_NEEDED = 2;    // modo 0: cambios seguidos para confirmar

// ---- PIR ----
const uint32_t PIR_WARMUP_MS = 30000;          // el HC-SR501 se dispara solo al encender
const uint32_t PIR_CONFIRM_WINDOW_MS = 2000;   // modo 2: tiempo para que la cámara confirme

uint8_t *rgb = nullptr;
uint8_t *previous = nullptr;
bool hasPrevious = false;
int consecutive = 0;
uint32_t lastCameraChange = 0;

volatile bool pirTriggered = false;
uint32_t pirPendingUntil = 0;

// La interrupción solo levanta una bandera. Nada de enviar alertas ni usar la
// cámara aquí: una ISR debe ser cortísima y no puede bloquearse.
void IRAM_ATTR onPirRising() {
  pirTriggered = true;
}

// Toma un fotograma y lo compara con el anterior. true = la imagen cambió.
bool cameraChanged() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return false;

  esp_jpeg_image_cfg_t cfg = {};
  cfg.indata = fb->buf;
  cfg.indata_size = fb->len;
  cfg.outbuf = rgb;
  cfg.outbuf_size = PIXELS * 3;
  cfg.out_format = JPEG_IMAGE_FORMAT_RGB888;
  cfg.out_scale = JPEG_IMAGE_SCALE_1_8;
  esp_jpeg_image_output_t out;
  esp_err_t err = esp_jpeg_decode(&cfg, &out);
  esp_camera_fb_return(fb);  // devolver el búfer cuanto antes: el stream lo necesita
  if (err != ESP_OK || out.width != W || out.height != H) return false;

  int changed = 0;
  for (int i = 0; i < PIXELS; i++) {
    uint8_t gray = (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3;
    if (hasPrevious && abs(gray - previous[i]) > PIXEL_DELTA) changed++;
    previous[i] = gray;
  }

  bool first = !hasPrevious;
  hasPrevious = true;
  if (first) return false;

  float ratio = (float)changed / PIXELS;
  if (ratio > CHANGED_RATIO) {
    Serial.printf("[detector] cámara: %.1f%% de píxeles cambiaron\n", ratio * 100);
    return true;
  }
  return false;
}
}  // namespace

void detectorBegin() {
  rgb = (uint8_t *)ps_malloc(PIXELS * 3);
  previous = (uint8_t *)ps_malloc(PIXELS);
#if DETECTION_MODE != 0
  pinMode(PIR_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), onPirRising, RISING);
#endif
  const char *names[] = {"solo cámara", "solo PIR", "PIR + cámara"};
  Serial.printf("[detector] modo %d (%s)\n", DETECTION_MODE, names[DETECTION_MODE]);
}

void detectorReset() {
  hasPrevious = false;
  consecutive = 0;
  lastCameraChange = 0;
  pirTriggered = false;
  pirPendingUntil = 0;
}

bool detectorCheck() {
  uint32_t now = millis();

#if DETECTION_MODE == 0
  consecutive = cameraChanged() ? consecutive + 1 : 0;
  if (consecutive >= CONSECUTIVE_NEEDED) {
    consecutive = 0;
    return true;
  }
  return false;

#elif DETECTION_MODE == 1
  if (!pirTriggered) return false;
  pirTriggered = false;
  if (now < PIR_WARMUP_MS) return false;
  Serial.println("[detector] PIR disparado");
  return true;

#else
  if (cameraChanged()) lastCameraChange = now;

  if (pirTriggered) {
    pirTriggered = false;
    if (now >= PIR_WARMUP_MS) {
      Serial.println("[detector] PIR disparado, esperando confirmación de la cámara");
      pirPendingUntil = now + PIR_CONFIRM_WINDOW_MS;
    }
  }
  if (pirPendingUntil == 0) return false;

  // Vale un cambio en la imagen poco antes o poco después del disparo del PIR.
  bool cameraAgrees = lastCameraChange != 0 && now - lastCameraChange <= PIR_CONFIRM_WINDOW_MS;
  if (cameraAgrees) {
    pirPendingUntil = 0;
    return true;
  }
  if (now > pirPendingUntil) {
    pirPendingUntil = 0;
    Serial.println("[detector] PIR sin cambio en la imagen: descartado");
  }
  return false;
#endif
}
