#pragma once

// Modelo de detección de personas como arreglo en flash (person_model_data.cpp).
// Entrada: imagen de 96x96 en escala de grises (int8). Salida: [no persona, persona].
extern const unsigned char g_person_detect_model_data[];
extern const int g_person_detect_model_data_len;
