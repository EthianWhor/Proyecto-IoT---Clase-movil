#pragma once
#include <Arduino.h>

// Detección de movimiento. DETECTION_MODE (config.h) elige la fuente:
//   0 = solo cámara: comparación de fotogramas
//   1 = solo PIR
//   2 = el PIR dispara y la cámara confirma que la imagen cambió
// El resto del firmware solo llama a estas funciones y no sabe cuál está activa.

void detectorBegin();

// Olvida lo anterior (fotograma de referencia, disparos pendientes del PIR).
// Se llama al armar el sistema y al terminar el cooldown.
void detectorReset();

// Se llama cada ~200 ms mientras el sistema está armado.
// Devuelve true cuando hay movimiento confirmado.
bool detectorCheck();
