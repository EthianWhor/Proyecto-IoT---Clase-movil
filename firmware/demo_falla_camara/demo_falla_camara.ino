// Demostración de falla de la cámara para la tienda.
// Paso 1: confirma que la cámara está conectada y se identifica (OV2640).
// Paso 2: intenta arrancarla 10 veces con el driver oficial (esp_camera).
// LED RGB de la placa (GPIO48): verde = cámara OK, rojo parpadeando = falla.
#include <Wire.h>
#include "esp_camera.h"

// Pines de la ESP32-S3-CAM (mismos que CAMERA_MODEL_ESP32S3_EYE del ejemplo oficial)
#define XCLK 15
#define SIOD 4
#define SIOC 5
#define LED_RGB 48

int leerReg(uint8_t reg) {
  Wire.beginTransmission(0x30); Wire.write(reg);
  if (Wire.endTransmission() != 0) return -1;
  Wire.requestFrom((uint8_t)0x30, (uint8_t)1);
  return Wire.available() ? Wire.read() : -1;
}

bool camaraOk = false;

void setup() {
  Serial.begin(115200);
  delay(2000);
  rgbLedWrite(LED_RGB, 0, 0, 40);  // azul: probando

  Serial.println("\n\n==============================================");
  Serial.println("   PRUEBA DE CAMARA - ESP32-S3-CAM N16R8");
  Serial.println("==============================================");
  Serial.printf("Chip: %s  |  PSRAM: %u MB  |  Flash: %u MB\n",
                ESP.getChipModel(), ESP.getPsramSize() / 1048576, ESP.getFlashChipSize() / 1048576);

  // ---- PASO 1: la cámara está conectada? ----
  Serial.println("\n[PASO 1] Buscando la camara en el bus (SDA 4, SCL 5, XCLK 15)...");
  ledcAttach(XCLK, 20000000, 1); ledcWrite(XCLK, 1); delay(50);
  Wire.begin(SIOD, SIOC, 100000);
  Wire.beginTransmission(0x30); Wire.write(0xFF); Wire.write(0x01); Wire.endTransmission();
  int pid = leerReg(0x0A), ver = leerReg(0x0B);
  Wire.end(); ledcDetach(XCLK);
  if (pid == 0x26 && ver == 0x42) {
    Serial.printf("  -> CAMARA DETECTADA: OV2640 (PID 0x%02X, VER 0x%02X)\n", pid, ver);
    Serial.println("  -> Conexion y pines CORRECTOS");
  } else {
    Serial.printf("  -> No se identifica la camara (PID %d, VER %d)\n", pid, ver);
  }

  // ---- PASO 2: arrancarla con el driver oficial ----
  Serial.println("\n[PASO 2] Iniciando la camara con el driver oficial (10 intentos)...");
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0; c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = 11; c.pin_d1 = 9; c.pin_d2 = 8; c.pin_d3 = 10;
  c.pin_d4 = 12; c.pin_d5 = 18; c.pin_d6 = 17; c.pin_d7 = 16;
  c.pin_xclk = XCLK; c.pin_pclk = 13; c.pin_vsync = 6; c.pin_href = 7;
  c.pin_sccb_sda = SIOD; c.pin_sccb_scl = SIOC; c.pin_pwdn = -1; c.pin_reset = -1;
  c.xclk_freq_hz = 20000000; c.pixel_format = PIXFORMAT_JPEG; c.frame_size = FRAMESIZE_VGA;
  c.jpeg_quality = 12; c.fb_count = 2; c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;

  int exitos = 0;
  for (int i = 1; i <= 10; i++) {
    esp_err_t e = esp_camera_init(&c);
    if (e == ESP_OK) {
      camera_fb_t *fb = esp_camera_fb_get();
      Serial.printf("  Intento %2d: OK  (foto de %u bytes)\n", i, fb ? fb->len : 0);
      if (fb) esp_camera_fb_return(fb);
      exitos++;
    } else {
      Serial.printf("  Intento %2d: FALLA (error 0x%x)\n", i, e);
    }
    esp_camera_deinit();
    delay(500);
  }

  camaraOk = exitos > 0;
  Serial.println("\n==============================================");
  Serial.printf("   RESULTADO: %d de 10 arranques exitosos\n", exitos);
  if (!camaraOk) {
    Serial.println("   La camara se detecta, pero NO logra iniciar.");
    Serial.println("   LED ROJO = camara defectuosa");
  } else {
    Serial.println("   LED VERDE = camara funcionando");
  }
  Serial.println("==============================================");
}

void loop() {
  if (camaraOk) {
    rgbLedWrite(LED_RGB, 0, 40, 0);
  } else {  // rojo parpadeando
    rgbLedWrite(LED_RGB, 60, 0, 0); delay(400);
    rgbLedWrite(LED_RGB, 0, 0, 0);  delay(400);
  }
}
