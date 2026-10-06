#include "camera.h"
#include "camera_pins.h"

bool cameraBegin() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;

  // JPEG: la cámara comprime por hardware, así cada foto VGA pesa ~15-30 KB
  // en vez de 600 KB. Es lo que se envía por el stream y en las alertas.
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;  // 640x480
  config.jpeg_quality = 12;           // 0-63, menor = mejor calidad y más bytes

  // 3 búferes en PSRAM: mientras uno se llena, los otros pueden estar en uso por
  // el stream y por el detector al mismo tiempo sin bloquearse entre sí.
  config.fb_count = 3;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  // Siempre entregar el fotograma más reciente (descarta los viejos): menos latencia.
  config.grab_mode = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[camara] FALLO al iniciar (0x%x). Revisa camera_pins.h\n", err);
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  Serial.printf("[camara] OK, sensor PID 0x%x\n", s ? s->id.PID : 0);
  return true;
}

bool cameraCaptureCopy(uint8_t **jpeg, size_t *len) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return false;

  uint8_t *copy = (uint8_t *)ps_malloc(fb->len);
  if (copy) {
    memcpy(copy, fb->buf, fb->len);
    *jpeg = copy;
    *len = fb->len;
  }
  esp_camera_fb_return(fb);
  return copy != nullptr;
}
