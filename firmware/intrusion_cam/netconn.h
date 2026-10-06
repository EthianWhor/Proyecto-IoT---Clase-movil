#pragma once
#include <Arduino.h>

// Intenta conectarse al Wi-Fi de la casa (modo estación). Si no lo logra en
// 15 s, levanta un punto de acceso propio para que el celular pueda conectarse.
void networkBegin();

// Mantiene viva la conexión: si se cae el Wi-Fi, reintenta.
void networkLoop();

bool networkIsAccessPoint();
bool networkHasInternet();
String networkIp();

// La hora llega por NTP. Mientras no llegue, los horarios no se pueden evaluar.
bool timeIsSynced();
String timeNowText();  // "dd/mm/aaaa hh:mm:ss" en hora de Colombia
