// O que se cola em cada equipamento. Funções puras: recebem o endereço do servidor e a chave.
const envioSh = String.raw`  if [ -n "$ip" ]; then dados="{\"tipo\":\"$tipo\",\"origemIp\":\"$ip\"}"; else dados="{\"tipo\":\"$tipo\"}"; fi
  curl -s -m 5 -X POST "$SERVIDOR/api/receber" -H "Authorization: Bearer $CHAVE" -H "Content-Type: application/json" -d "$dados" > /dev/null < /dev/null`;

const openwrt = (u, k) => String.raw`#!/bin/sh
SERVIDOR="${u}"
CHAVE="${k}"
logread -f | while read -r linha; do
  case "$linha" in
    *dropbear*"ad password attempt"*|*dropbear*"nonexistent user"*) tipo=login_falhado ;;
    *dropbear*"auth succeeded"*) tipo=login_ok ;;
    *) continue ;;
  esac
  ip=$(echo "$linha" | sed -n 's/.* from <\{0,1\}\([0-9.]*\):[0-9].*/\1/p')
${envioSh}
done`;

const linux = (u, k) => String.raw`#!/bin/sh
SERVIDOR="${u}"
CHAVE="${k}"
journalctl -f -n 0 -o cat -t sshd -t sshd-session | while read -r linha; do
  case "$linha" in
    "Failed password"*) tipo=login_falhado ;;
    "Accepted "*) tipo=login_ok ;;
    *) continue ;;
  esac
  ip=$(echo "$linha" | sed -n 's/.* from \([0-9.]*\) port .*/\1/p')
${envioSh}
done`;

const windows = (u) => `$f = Join-Path $env:TEMP 'caradbela-vigia.ps1'
Invoke-WebRequest "${u}/vigia/windows.ps1" -OutFile $f -UseBasicParsing
& $f -Instalar -Servidor "${u}"`;
const windowsTeste = (u, k) => `Invoke-RestMethod -Method Post -Uri "${u}/api/receber" -Headers @{ Authorization = "Bearer ${k}" } -ContentType "application/json" -Body '{"tipo":"ligacao","detalhe":"Teste"}'`;

const esp32 = (u, k) => String.raw`#include <WiFi.h>
#include <HTTPClient.h>

// Chama depois de o Wi-Fi estar ligado, por exemplo: avisar("login_falhado");
void avisar(const char* tipo) {
  HTTPClient http;
  http.begin("${u}/api/receber");
  http.addHeader("Authorization", "Bearer ${k}");
  http.addHeader("Content-Type", "application/json");
  int resposta = http.POST(String("{\"tipo\":\"") + tipo + "\"}");
  Serial.println(resposta); // 202 = recebido
  http.end();
}`;

const homeAssistant = (u, k) => `rest_command:
  caradbela:
    url: "${u}/api/receber"
    method: POST
    content_type: "application/json"
    headers:
      Authorization: "Bearer ${k}"
    payload: '{"tipo":"{{ tipo }}"}'`;

export const RECEITAS = {
  windows: {
    nome: 'Windows', icone: 'PC', codigo: windows, pedeChave: true, vigia: true, selo: 'Vigia sozinho',
    dura: 'Fica sempre ativa. Instalas uma vez e arranca quando inicias sessão. Vês a janela «CaraDBela vigia» minimizada na barra; se a fechares, deixa de vigiar.',
    onde: ['Abre o PowerShell no computador: menu Iniciar, escreve PowerShell. Não precisas de administrador.', 'Cola o código e carrega em Enter.', 'Quando pedir, cola a chave do passo 2. Não aparece nada enquanto a colas.'],
    deteta: 'Bloqueio, desbloqueio, início de sessão e sessões remotas. As palavras-passe erradas do Windows só entram se a tua conta puder ler o registo de segurança (normalmente, só administradores).',
    extra: [['Só quero testar a chave', 'Envia um evento de teste e termina. Não fica nada a vigiar.', windowsTeste],
      ['Remover a vigia', 'Para a vigia e apaga o que instalou.', () => '& "$env:LOCALAPPDATA\\CaraDBela\\vigia.ps1" -Remover']],
  },
  linux: {
    nome: 'Linux', icone: 'PC', codigo: linux, selo: 'Vigia sozinho',
    dura: 'Vigia enquanto o código estiver a correr. Se fechares a janela ou reiniciares, para: por isso, o último passo põe-no a arrancar com o sistema.',
    onde: ['Guarda o código num ficheiro caradbela.sh no equipamento (um Raspberry Pi, por exemplo).', 'Corre: sudo sh caradbela.sh', 'A partir de outro equipamento, tenta entrar por SSH e erra a palavra-passe.', 'Quando funcionar, põe-no a arrancar com o sistema (systemd, ou crontab com @reboot).'],
    deteta: 'Entradas e falhas por SSH. Precisa de systemd e curl.',
  },
  router: {
    nome: 'Router OpenWrt ou GL.iNet', icone: 'Router', codigo: openwrt, selo: 'Vigia sozinho',
    dura: 'Vigia enquanto o código estiver a correr. Se fechares a janela ou reiniciares o router, para: por isso, o último passo põe-no a arrancar com ele.',
    onde: ['Entra no router por SSH, com a palavra-passe de administrador.', 'Guarda o código no router, em /root/caradbela.sh', 'Corre: sh /root/caradbela.sh', 'Noutra janela, tenta entrar por SSH e erra a palavra-passe.', 'Quando funcionar, junta a linha sh /root/caradbela.sh & antes de exit 0 em /etc/rc.local, para arrancar com o router.'],
    deteta: 'Entradas e falhas por SSH. As falhas no painel web do router não estão incluídas: depende de o router as registar. Precisa de curl no router.',
  },
  esp32: {
    nome: 'ESP32', icone: 'Sensor', codigo: esp32, selo: 'Depende do programa',
    dura: 'Fica ativo enquanto a placa estiver ligada, mas só avisa quando o teu programa chamar avisar().',
    onde: ['Junta a função ao teu programa, no Arduino IDE.', 'Chama avisar("acesso") ou avisar("login_falhado") quando isso acontecer.', 'Envia para a placa e abre o Serial Monitor: 202 quer dizer recebido.'],
    deteta: 'O que o teu programa avisar. Se usas o ponto de acesso em firmware/ap_guarda, basta pôr o endereço em SERVIDOR e a chave em CHAVE, no config.h.',
  },
  casa: {
    nome: 'Home Assistant', icone: 'Fechadura', codigo: homeAssistant, selo: 'Depende da automação',
    dura: 'Fica sempre ativo, mas só avisa quando a automação disparar.',
    onde: ['Junta isto ao configuration.yaml e reinicia o Home Assistant.', 'Cria uma automação que dispara quando o dispositivo muda (a fechadura abre, por exemplo).', 'Na ação, escolhe rest_command.caradbela e, nos dados, escreve tipo: acesso', 'Corre a automação uma vez para testar.'],
    deteta: 'O que a automação avisar. É o caminho para câmaras, fechaduras e tomadas de marca que já estejam no Home Assistant.',
  },
  fechado: { nome: 'TV, câmara ou outro de marca', icone: 'TV', selo: 'Não envia' },
};

export function receitaPara(tipo = '') {
  if (/router/i.test(tipo)) return 'router';
  if (/^pc$|comput|port[aá]til/i.test(tipo)) return 'windows';
  if (/sensor/i.test(tipo)) return 'esp32';
  return 'fechado';
}
