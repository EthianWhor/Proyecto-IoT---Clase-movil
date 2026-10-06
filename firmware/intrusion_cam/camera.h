#pragma once
#include <Arduino.h>
#include "esp_camera.h"

bool cameraBegin();

// Toma una foto y la copia a un búfer propio en PSRAM, para devolverle de
// inmediato el frame buffer a la cámara (el stream y el detector lo necesitan).
// Quien llama debe liberar la copia con free().
bool cameraCaptureCopy(uint8_t **jpeg, size_t *len);
