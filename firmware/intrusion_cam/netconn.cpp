#include "netconn.h"
#include <ESPmDNS.h>
#include <WiFi.h>
#include <time.h>
#include "config.h"

namespace {
const uint32_t CONNECT_TIMEOUT_MS = 15000;
const uint32_t RECONNECT_EVERY_MS = 10000;
const char *TIMEZONE = "<-05>5";  // Colombia, UTC-5 sin horario de verano
const char *MDNS_NAME = "intrusos";  // http://intrusos.local

bool accessPoint = false;
uint32_t lastReconnectTry = 0;
}

void networkBegin() {
  WiFi.mode(WIFI_STA);
  // Sin ahorro de energía del Wi-Fi: consume más, pero baja mucho la latencia del video.
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.printf("[wifi] Conectando a \"%s\"", WIFI_SSID);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] Conectado. IP: %s  (señal %d dBm)\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    configTzTime(TIMEZONE, "pool.ntp.org", "time.google.com");
  } else {
    // Respaldo: la ESP32 crea su propia red. Sin internet no hay alertas ni hora
    // NTP, pero el video y el armado manual siguen funcionando.
    WiFi.disconnect(true);
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    accessPoint = true;
    Serial.printf("[wifi] No se pudo conectar. Punto de acceso \"%s\" en %s\n", AP_SSID,
                  WiFi.softAPIP().toString().c_str());
  }

  if (MDNS.begin(MDNS_NAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[wifi] También disponible como http://%s.local\n", MDNS_NAME);
  }
}

void networkLoop() {
  if (accessPoint || WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastReconnectTry < RECONNECT_EVERY_MS) return;
  lastReconnectTry = millis();
  Serial.println("[wifi] Conexión perdida, reintentando...");
  WiFi.reconnect();
}

bool networkIsAccessPoint() {
  return accessPoint;
}

bool networkHasInternet() {
  return !accessPoint && WiFi.status() == WL_CONNECTED;
}

String networkIp() {
  return accessPoint ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
}

bool timeIsSynced() {
  return time(nullptr) > 1700000000;  // cualquier fecha posterior a nov. 2023
}

String timeNowText() {
  time_t now = time(nullptr);
  struct tm local;
  localtime_r(&now, &local);
  char text[24];
  strftime(text, sizeof(text), "%d/%m/%Y %H:%M:%S", &local);
  return String(text);
}
