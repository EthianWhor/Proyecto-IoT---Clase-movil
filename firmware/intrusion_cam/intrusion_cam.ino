// Sistema de Detección de Intrusos - ESP32-S3-CAM N16R8 (OV2640)
//
// Arduino IDE: placa "ESP32S3 Dev Module", PSRAM "OPI PSRAM", Flash Size "16MB",
// Partition Scheme "16M Flash (3MB APP/9.9MB FATFS)".
// Librerías: ArduinoJson (7.x) y ESP Mail Client (3.x).
// Antes de compilar: copiar config.example.h como config.h y llenar los datos.
//
// Tareas que corren en paralelo (FreeRTOS):
//   - loopTask (esta, loop()): máquina de estados, detector y envío de alertas
//   - tarea del servidor de control (puerto 80)
//   - tarea del servidor de video (puerto 81)
//   - tareas internas de Wi-Fi y de la cámara
#include "camera.h"
#include "detector.h"
#include "netconn.h"
#include "person_detector.h"
#include "schedule.h"
#include "system_state.h"
#include "web_server.h"

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Sistema de Detección de Intrusos ===");
  Serial.printf("PSRAM: %s (%u bytes)\n", psramFound() ? "OK" : "NO DETECTADA", ESP.getPsramSize());

  if (!cameraBegin()) {
    Serial.println("Sin cámara no hay sistema. Reiniciando en 5 s...");
    delay(5000);
    ESP.restart();
  }

  scheduleBegin();
  systemBegin();
  detectorBegin();
  personDetectorBegin();  // no hace nada si PERSON_DETECTION es 0
  networkBegin();
  webServerBegin();

  Serial.printf("Listo. Video: http://%s:81/stream  Estado: http://%s/status\n", networkIp().c_str(),
                networkIp().c_str());
}

void loop() {
  networkLoop();
  systemLoop();
  delay(10);  // cede la CPU a las demás tareas
}
