#include "person_detector.h"
#if PERSON_DETECTION

#include "esp_camera.h"
#include "jpeg_decoder.h"
#include "person_model_data.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"

namespace {
// El JPEG VGA (640x480) se decodifica a escala 1/4 = 160x120. De ahí se recorta
// el cuadrado central de 120x120 y se reduce a 96x96, que es lo que espera el modelo.
const int SRC_W = 160;
const int SRC_H = 120;
const int CROP = 120;
const int CROP_X = (SRC_W - CROP) / 2;
const int MODEL_SIDE = 96;

const float PERSON_THRESHOLD = 0.60f;  // puntaje mínimo para decir "hay una persona"
const int PERSON_FRAMES = 3;           // fotogramas a revisar antes de descartar
const int ARENA_SIZE = 140 * 1024;     // memoria de trabajo de la red neuronal
const int PERSON_INDEX = 1;            // salida del modelo: [no persona, persona]

uint8_t *rgb = nullptr;
uint8_t *arena = nullptr;
tflite::MicroInterpreter *interpreter = nullptr;
TfLiteTensor *input = nullptr;
bool ready = false;
float lastScore = 0;

// Toma una foto, la deja en 96x96 gris dentro de la entrada del modelo y
// devuelve la probabilidad de persona (0-1), o -1 si algo falló.
float scoreFrame() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return -1;

  esp_jpeg_image_cfg_t cfg = {};
  cfg.indata = fb->buf;
  cfg.indata_size = fb->len;
  cfg.outbuf = rgb;
  cfg.outbuf_size = SRC_W * SRC_H * 3;
  cfg.out_format = JPEG_IMAGE_FORMAT_RGB888;
  cfg.out_scale = JPEG_IMAGE_SCALE_1_4;
  esp_jpeg_image_output_t out;
  esp_err_t err = esp_jpeg_decode(&cfg, &out);
  esp_camera_fb_return(fb);  // devolver el búfer cuanto antes: el stream lo necesita
  if (err != ESP_OK || out.width != SRC_W || out.height != SRC_H) return -1;

  // Reducción por "vecino más cercano": cada píxel de 96x96 toma el de 120x120
  // que le corresponde. El modelo usa int8, por eso el gris 0-255 pasa a -128..127.
  for (int y = 0; y < MODEL_SIDE; y++) {
    for (int x = 0; x < MODEL_SIDE; x++) {
      int sx = CROP_X + x * CROP / MODEL_SIDE;
      int sy = y * CROP / MODEL_SIDE;
      const uint8_t *p = rgb + (sy * SRC_W + sx) * 3;
      uint8_t gray = (p[0] + p[1] + p[2]) / 3;
      input->data.int8[y * MODEL_SIDE + x] = (int8_t)(gray - 128);
    }
  }

  if (interpreter->Invoke() != kTfLiteOk) return -1;

  // La salida también viene en int8; se convierte a probabilidad real.
  TfLiteTensor *output = interpreter->output(0);
  int8_t q = output->data.int8[PERSON_INDEX];
  return (q - output->params.zero_point) * output->params.scale;
}
}  // namespace

void personDetectorBegin() {
  rgb = (uint8_t *)ps_malloc(SRC_W * SRC_H * 3);
  arena = (uint8_t *)ps_malloc(ARENA_SIZE);
  if (!rgb || !arena) {
    Serial.println("[persona] Sin memoria para el modelo: desactivado");
    return;
  }

  const tflite::Model *model = tflite::GetModel(g_person_detect_model_data);
  if (model->version() != TFLITE_SCHEMA_VERSION) {
    Serial.println("[persona] Versión del modelo incompatible: desactivado");
    return;
  }

  // Solo se registran las 5 operaciones que usa este modelo (ahorra flash).
  static tflite::MicroMutableOpResolver<5> resolver;
  resolver.AddAveragePool2D();
  resolver.AddConv2D();
  resolver.AddDepthwiseConv2D();
  resolver.AddReshape();
  resolver.AddSoftmax();

  static tflite::MicroInterpreter staticInterpreter(model, resolver, arena, ARENA_SIZE);
  interpreter = &staticInterpreter;
  if (interpreter->AllocateTensors() != kTfLiteOk) {
    Serial.println("[persona] AllocateTensors falló (¿ARENA_SIZE pequeña?): desactivado");
    return;
  }
  input = interpreter->input(0);
  ready = true;
  Serial.printf("[persona] Modelo listo (%u bytes de arena usados)\n", interpreter->arena_used_bytes());
}

bool personDetectorConfirm() {
  lastScore = 0;
  if (!ready) return true;  // sin modelo, se comporta como antes: alerta igual

  for (int i = 0; i < PERSON_FRAMES; i++) {
    uint32_t start = millis();
    float score = scoreFrame();
    if (score > lastScore) lastScore = score;
    Serial.printf("[persona] fotograma %d: %.0f%% persona (%lu ms)\n", i + 1, score * 100, millis() - start);
    if (score >= PERSON_THRESHOLD) return true;
  }
  Serial.println("[persona] Movimiento sin persona: descartado");
  return false;
}

float personDetectorScore() {
  return lastScore;
}

#endif  // PERSON_DETECTION
