#include "web_server.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "schedule.h"
#include "system_state.h"

namespace {
const size_t MAX_BODY = 2048;
const uint32_t STREAM_FRAME_INTERVAL_MS = 66;  // tope de ~15 fps para dejar CPU al detector
const char *PART_HEADER = "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t controlServer = nullptr;
httpd_handle_t streamServer = nullptr;

void allowAnyOrigin(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
}

esp_err_t sendJson(httpd_req_t *req, JsonDocument &doc, const char *status = "200 OK") {
  String body;
  serializeJson(doc, body);
  httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "application/json");
  allowAnyOrigin(req);
  return httpd_resp_send(req, body.c_str(), body.length());
}

esp_err_t sendError(httpd_req_t *req, const char *status, const String &message) {
  JsonDocument doc;
  doc["error"] = message;
  return sendJson(req, doc, status);
}

// Lee el cuerpo completo de un POST (puede llegar en varios pedazos TCP).
bool readBody(httpd_req_t *req, String &out) {
  if (req->content_len > MAX_BODY) return false;
  char buf[256];
  size_t remaining = req->content_len;
  while (remaining > 0) {
    int r = httpd_req_recv(req, buf, min(remaining, sizeof(buf)));
    if (r == HTTPD_SOCK_ERR_TIMEOUT) continue;
    if (r <= 0) return false;
    out.concat(buf, r);
    remaining -= r;
  }
  return true;
}

esp_err_t handleStatus(httpd_req_t *req) {
  JsonDocument doc;
  systemStatusJson(doc.to<JsonObject>());
  return sendJson(req, doc);
}

esp_err_t handleArm(httpd_req_t *req) {
  String body;
  JsonDocument in;
  if (!readBody(req, body) || deserializeJson(in, body) || !in["armed"].is<bool>()) {
    return sendError(req, "400 Bad Request", "Falta \"armed\" (true/false)");
  }
  setManualArmed(in["armed"].as<bool>());
  Serial.printf("[web] Fuera de casa: %s\n", in["armed"].as<bool>() ? "activado" : "desactivado");
  return handleStatus(req);
}

esp_err_t handleGetSchedule(httpd_req_t *req) {
  JsonDocument doc;
  scheduleToJson(doc["slots"].to<JsonArray>());
  return sendJson(req, doc);
}

esp_err_t handlePostSchedule(httpd_req_t *req) {
  String body;
  JsonDocument in;
  if (!readBody(req, body) || deserializeJson(in, body) || !in["slots"].is<JsonArray>()) {
    return sendError(req, "400 Bad Request", "Se esperaba {\"slots\": [...]}");
  }
  String error;
  if (!scheduleFromJson(in["slots"].as<JsonArrayConst>(), error)) {
    return sendError(req, "400 Bad Request", error);
  }
  return handleGetSchedule(req);
}

esp_err_t handleCapture(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return sendError(req, "503 Service Unavailable", "La cámara no entregó foto");
  httpd_resp_set_type(req, "image/jpeg");
  allowAnyOrigin(req);
  esp_err_t r = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return r;
}

// Preflight CORS: solo lo usa el navegador cuando se prueba la app en web.
esp_err_t handleOptions(httpd_req_t *req) {
  allowAnyOrigin(req);
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "Content-Type");
  httpd_resp_set_status(req, "204 No Content");
  return httpd_resp_send(req, nullptr, 0);
}

// MJPEG = una respuesta HTTP que nunca termina ("multipart/x-mixed-replace").
// Cada parte es un JPEG completo; el cliente reemplaza la imagen con cada parte.
esp_err_t handleStream(httpd_req_t *req) {
  httpd_resp_set_type(req, "multipart/x-mixed-replace; boundary=frame");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  allowAnyOrigin(req);
  Serial.println("[stream] cliente conectado");

  char header[96];
  uint32_t lastFrame = 0;
  while (true) {
    uint32_t elapsed = millis() - lastFrame;
    if (elapsed < STREAM_FRAME_INTERVAL_MS) vTaskDelay(pdMS_TO_TICKS(STREAM_FRAME_INTERVAL_MS - elapsed));
    lastFrame = millis();

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[stream] la cámara no entregó fotograma");
      break;
    }
    int n = snprintf(header, sizeof(header), PART_HEADER, fb->len);
    esp_err_t r = httpd_resp_send_chunk(req, header, n);
    if (r == ESP_OK) r = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
    if (r == ESP_OK) r = httpd_resp_send_chunk(req, "\r\n", 2);
    esp_camera_fb_return(fb);

    // Si el envío falla, el cliente se fue (cerró la app, perdió el Wi-Fi...).
    if (r != ESP_OK) break;
  }
  Serial.println("[stream] cliente desconectado");
  return ESP_FAIL;  // cierra el socket
}

void registerUri(httpd_handle_t server, const char *uri, httpd_method_t method, esp_err_t (*handler)(httpd_req_t *)) {
  httpd_uri_t route = {};
  route.uri = uri;
  route.method = method;
  route.handler = handler;
  httpd_register_uri_handler(server, &route);
}
}  // namespace

void webServerBegin() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.ctrl_port = 32768;
  config.stack_size = 8192;  // ArduinoJson y String necesitan más pila que la de defecto
  config.max_uri_handlers = 8;
  config.lru_purge_enable = true;
  config.uri_match_fn = httpd_uri_match_wildcard;  // para que OPTIONS "/*" sirva en todas las rutas
  if (httpd_start(&controlServer, &config) == ESP_OK) {
    registerUri(controlServer, "/status", HTTP_GET, handleStatus);
    registerUri(controlServer, "/arm", HTTP_POST, handleArm);
    registerUri(controlServer, "/schedule", HTTP_GET, handleGetSchedule);
    registerUri(controlServer, "/schedule", HTTP_POST, handlePostSchedule);
    registerUri(controlServer, "/capture", HTTP_GET, handleCapture);
    registerUri(controlServer, "/*", HTTP_OPTIONS, handleOptions);
    Serial.println("[web] API de control en el puerto 80");
  } else {
    Serial.println("[web] FALLO al iniciar el servidor de control");
  }

  httpd_config_t streamConfig = HTTPD_DEFAULT_CONFIG();
  streamConfig.server_port = 81;
  streamConfig.ctrl_port = 32769;  // cada servidor necesita su propio puerto interno
  streamConfig.max_uri_handlers = 1;
  streamConfig.lru_purge_enable = true;
  // Si un cliente deja de recibir (perdió la señal), el envío falla a los 5 s y se libera.
  streamConfig.send_wait_timeout = 5;
  if (httpd_start(&streamServer, &streamConfig) == ESP_OK) {
    registerUri(streamServer, "/stream", HTTP_GET, handleStream);
    Serial.println("[web] Video MJPEG en el puerto 81 (/stream)");
  } else {
    Serial.println("[web] FALLO al iniciar el servidor de video");
  }
}
