#pragma once
#include <stdint.h>

// Rede criada pelo ESP32
#define AP_SSID "CaraDBela-IoT"
#define AP_PASSE "muda-esta-palavra-passe"

// Rede de casa, para avisar o servidor (vazio = só aviso na consola)
#define CASA_SSID ""
#define CASA_PASSE ""

// Ex.: "http://192.168.1.10:3000". O servidor precisa de HOST=0.0.0.0
#define SERVIDOR ""
// Chave de eventos, criada ao abrir o dispositivo no CaraDBela
#define CHAVE ""

// O primeiro byte tem de ser par. (O MAC da versão antiga começava por E5 e nunca podia existir.)
static const uint8_t MACS_AUTORIZADOS[][6] = {
  {0x02, 0x00, 0x00, 0x00, 0x00, 0x01},
};
