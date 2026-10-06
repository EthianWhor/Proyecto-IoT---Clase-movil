#pragma once
#include <Arduino.h>
#include "config.h"

// Detección de personas con la cámara (opcional, apagada por defecto).
// Se activa poniendo  #define PERSON_DETECTION 1  en config.h.
//
// Va DESPUÉS del detector de movimiento: cuando el PIR y la cámara ya
// confirmaron movimiento, una red neuronal pequeña (TensorFlow Lite Micro,
// incluida en el core ESP32) mira la foto y dice si hay una persona. Si no la
// hay (gato, cortina, sombra), la alerta se descarta.
#ifndef PERSON_DETECTION
#define PERSON_DETECTION 0
#endif

#if PERSON_DETECTION

void personDetectorBegin();

// Analiza unos pocos fotogramas. true = se vio una persona.
// Si el modelo no se pudo cargar devuelve true, para no perder alertas.
bool personDetectorConfirm();

// Mejor puntaje (0-1) del último personDetectorConfirm().
float personDetectorScore();

#else

// Apagado: no se compila nada y todo pasa igual que sin este módulo.
inline void personDetectorBegin() {}
inline bool personDetectorConfirm() { return true; }
inline float personDetectorScore() { return 0; }

#endif
