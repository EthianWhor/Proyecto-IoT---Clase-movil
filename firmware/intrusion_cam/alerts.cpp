#include "alerts.h"
#include <ESP_Mail_Client.h>
#include <WiFiClientSecure.h>
#include "config.h"

namespace {
const char *TELEGRAM_HOST = "api.telegram.org";
const char *BOUNDARY = "----IntrusosESP32";
const uint32_t TELEGRAM_TIMEOUT_MS = 15000;
const size_t CHUNK = 4096;
}

bool alertTelegram(const uint8_t *jpeg, size_t len, const String &caption) {
  WiFiClientSecure client;
  // setInsecure(): cifra la conexión pero no verifica el certificado del servidor.
  // Es la opción simple; la más segura sería cargar el certificado raíz de Telegram.
  client.setInsecure();
  client.setTimeout(TELEGRAM_TIMEOUT_MS);  // en core 3.x es en milisegundos

  if (!client.connect(TELEGRAM_HOST, 443)) {
    Serial.println("[telegram] No se pudo conectar");
    return false;
  }

  // multipart/form-data: tres partes (chat_id, caption y la foto) separadas por el boundary.
  String head = String("--") + BOUNDARY + "\r\n"
                "Content-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + TG_CHAT_ID + "\r\n"
                "--" + BOUNDARY + "\r\n"
                "Content-Disposition: form-data; name=\"caption\"\r\n\r\n" + caption + "\r\n"
                "--" + BOUNDARY + "\r\n"
                "Content-Disposition: form-data; name=\"photo\"; filename=\"intruso.jpg\"\r\n"
                "Content-Type: image/jpeg\r\n\r\n";
  String tail = String("\r\n--") + BOUNDARY + "--\r\n";

  client.printf("POST /bot%s/sendPhoto HTTP/1.1\r\n", TG_BOT_TOKEN);
  client.printf("Host: %s\r\n", TELEGRAM_HOST);
  client.printf("Content-Type: multipart/form-data; boundary=%s\r\n", BOUNDARY);
  client.printf("Content-Length: %u\r\n", head.length() + len + tail.length());
  client.print("Connection: close\r\n\r\n");
  client.print(head);
  // La foto se envía por pedazos para no armar otra copia completa en memoria.
  for (size_t sent = 0; sent < len; sent += CHUNK) {
    client.write(jpeg + sent, min(CHUNK, len - sent));
  }
  client.print(tail);

  // Primera línea de la respuesta, por ejemplo "HTTP/1.1 200 OK".
  String statusLine = client.readStringUntil('\n');
  client.stop();
  bool ok = statusLine.indexOf(" 200") > 0;
  Serial.printf("[telegram] %s (%s)\n", ok ? "enviado" : "FALLÓ", statusLine.c_str());
  return ok;
}

bool alertEmail(const uint8_t *jpeg, size_t len, const String &when) {
  SMTPSession smtp;
  Session_Config config;
  config.server.host_name = SMTP_HOST;
  config.server.port = SMTP_PORT;
  config.login.email = SMTP_USER;
  config.login.password = SMTP_APP_PASS;
  config.login.user_domain = F("127.0.0.1");

  SMTP_Message message;
  message.sender.name = F("Sistema de Detección de Intrusos");
  message.sender.email = SMTP_USER;
  message.subject = "Alerta: movimiento detectado " + when;
  message.addRecipient(F("Propietario"), ALERT_EMAIL_TO);
  message.text.content = "Se detectó movimiento con el sistema armado.\r\n\r\nFecha y hora: " + when +
                         "\r\n\r\nSe adjunta la foto tomada en ese momento.";
  message.text.charSet = F("utf-8");
  message.text.transfer_encoding = Content_Transfer_Encoding::enc_base64;
  message.priority = esp_mail_smtp_priority::esp_mail_smtp_priority_high;

  SMTP_Attachment photo;
  photo.descr.filename = F("intruso.jpg");
  photo.descr.mime = F("image/jpeg");
  photo.blob.data = jpeg;
  photo.blob.size = len;
  photo.descr.transfer_encoding = Content_Transfer_Encoding::enc_base64;
  message.addAttachment(photo);

  if (!smtp.connect(&config)) {
    Serial.printf("[correo] No se pudo conectar: %s\n", smtp.errorReason().c_str());
    return false;
  }
  bool ok = MailClient.sendMail(&smtp, &message);
  Serial.printf("[correo] %s%s\n", ok ? "enviado" : "FALLÓ: ", ok ? "" : smtp.errorReason().c_str());
  return ok;
}
