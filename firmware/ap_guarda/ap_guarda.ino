// CaraDBela: ponto de acesso ESP32 que só aceita equipamentos autorizados.
// Precisa do pacote "esp32" 3.x. Copia config.exemplo.h para config.h.
//
// Nota: um endereço MAC pode ser falsificado. Isto é uma barreira adicional,
// não substitui uma boa palavra-passe no ponto de acesso.
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_wifi.h>
#include "config.h"

struct Aviso { uint8_t mac[6]; };
static QueueHandle_t avisos;

static bool autorizado(const uint8_t *mac) {
  for (const auto &m : MACS_AUTORIZADOS) {
    if (memcmp(m, mac, 6) == 0) return true;
  }
  return false;
}

// Corre na tarefa do Wi-Fi: expulsa já e deixa o envio para o loop().
static void aoLigar(WiFiEvent_t, WiFiEventInfo_t info) {
  const auto &e = info.wifi_ap_staconnected;
  if (autorizado(e.mac)) return;
  esp_wifi_deauth_sta(e.aid);
  Aviso a;
  memcpy(a.mac, e.mac, 6);
  xQueueSend(avisos, &a, 0);
}

static void enviar(const Aviso &a) {
  char mac[18];
  snprintf(mac, sizeof mac, "%02X:%02X:%02X:%02X:%02X:%02X", a.mac[0], a.mac[1], a.mac[2], a.mac[3], a.mac[4], a.mac[5]);
  Serial.printf("Recusado: %s\n", mac);
  if (strlen(SERVIDOR) == 0 || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(3000);
  if (!http.begin(String(SERVIDOR) + "/api/receber")) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + CHAVE);
  const int codigo = http.POST(String("{\"tipo\":\"nao_autorizado\",\"origemMac\":\"") + mac + "\"}");
  if (codigo != 202) Serial.printf("O servidor respondeu %d\n", codigo);
  http.end();
}

void setup() {
  Serial.begin(115200);
  avisos = xQueueCreate(16, sizeof(Aviso));
  WiFi.mode(WIFI_AP_STA);
  WiFi.onEvent(aoLigar, ARDUINO_EVENT_WIFI_AP_STACONNECTED);
  if (strlen(CASA_SSID) > 0) WiFi.begin(CASA_SSID, CASA_PASSE);
  if (!WiFi.softAP(AP_SSID, AP_PASSE)) Serial.println("Falhou a criar o ponto de acesso (a palavra-passe precisa de 8 ou mais caracteres).");
}

void loop() {
  Aviso a;
  if (xQueueReceive(avisos, &a, pdMS_TO_TICKS(1000)) == pdTRUE) enviar(a);
}
