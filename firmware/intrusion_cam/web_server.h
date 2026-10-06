#pragma once

// Dos servidores HTTP (esp_http_server de ESP-IDF), cada uno en su propia tarea:
//   puerto 80: API de control en JSON (/status, /arm, /schedule, /capture)
//   puerto 81: video MJPEG (/stream)
// Van separados porque una conexión de video nunca termina: si compartieran
// servidor, el video bloquearía las peticiones de control. Contrato en docs/API.md.
void webServerBegin();
