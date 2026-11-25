> **Primeira versão da CaraDBela 2.0**, guardada só para comparação com a `main` (interface anterior ao design do azulejo). Reconstruída a partir dos ficheiros originais; sem as caras atenta/aflita nem o guia de ligação.

<div align="center">
  <img src="design/MiniLogoDB.svg" alt="CaraDBela" width="190" height="190">
  <h1>CaraDBela</h1>
  <p>A tua IoT de forma Bela</p>
</div>

Regista os acessos aos dispositivos IoT da tua rede, deteta os suspeitos e avisa-te. Por exemplo: uma câmara acedida fora do horário habitual, ou uma fechadura com várias tentativas falhadas do mesmo endereço.

## Experimentar em dois minutos

Precisas do [Node.js](https://nodejs.org) 24 ou mais recente.

```sh
npm install
npm run demo
```

Abre http://localhost:3000 e entra com `demo` / `demonstracao`. A base de dados é temporária e os dados são inventados.

## Instalar a sério

1. Arranca o MongoDB: `docker compose up -d`, ou instala-o à mão (ver `MongoDB Configuration/`).
2. Copia `.env.example` para `.env` se quiseres mudar alguma coisa.
3. `npm start`
4. Abre http://localhost:3000 e cria o administrador com o código que aparece na consola.

Opcional: instala o [nmap](https://nmap.org) para a análise de segurança identificar versões. Sem ele são verificadas 22 portas comuns. Com `NMAP_VULNERS=true` também procura vulnerabilidades conhecidas, enviando as versões encontradas para vulners.com.

Para receber eventos de outros equipamentos põe `HOST=0.0.0.0`. Por omissão o servidor só responde ao próprio computador. Fora de uma rede de confiança, usa HTTPS num proxy e `COOKIE_SECURE=true`.

### Sem permissões de administrador

`npm run local` substitui os passos 1 e 3: descarrega e usa um MongoDB próprio, só acessível neste computador, e guarda os dados em `.dados/mongo`. Para cópia de segurança, para o programa e copia essa pasta.

### Vindo da versão 1

Faz cópia de segurança (`mongodump`) e depois:

```sh
npm run migrar
npm run palavra-passe -- admin
```

A migração normaliza os MAC, converte a whitelist em níveis de confiança e bloqueia a conta `admin` antiga, porque a palavra-passe dela estava publicada neste repositório.

## O que é detetado

| Regra | Quando dispara | Gravidade |
|---|---|---|
| Possível intrusão | Entrada com sucesso depois de 5 falhas em 10 minutos | Crítica |
| Tentativas repetidas | 5 falhas da mesma origem em 10 minutos | Alta |
| Ligação recusada | O dispositivo recusou um equipamento | Alta |
| Acesso vindo de fora | Origem fora da rede local | Média, ou alta se entrou |
| Fora de horas | Acesso fora do horário do dispositivo | Média |
| Atividade anormal | 60 eventos num minuto | Média |
| Equipamento novo | MAC desconhecido na rede (com `MONITOR_MINUTOS`) | Média |

A confiança (confiável, isolado, por classificar) é uma classificação: o CaraDBela **não** bloqueia tráfego. Isso faz-se no router ou no ponto de acesso em `firmware/ap_guarda`.

## Enviar eventos

Abre um dispositivo, cria a chave de eventos e:

```sh
curl -X POST http://SERVIDOR:3000/api/receber \
  -H "Authorization: Bearer cdb_..." -H "Content-Type: application/json" \
  -d '{"tipo":"login_falhado","origemIp":"192.168.1.50"}'
```

Tipos: `acesso`, `login_ok`, `login_falhado`, `nao_autorizado`, `ligacao`. Campos opcionais: `origemIp`, `origemMac`, `detalhe`.

## Código

| Pasta | Conteúdo |
|---|---|
| `src/` | Servidor (Express 5, Mongoose 9). As regras estão em `src/services/detecao.js` |
| `public/` | Interface, sem dependências externas nem passo de compilação |
| `firmware/` | Ponto de acesso ESP32 |
| `tests/` | `npm test` |
| `legacy/codigo/` | A versão 1, só para consulta |

Analisa apenas redes tuas ou para as quais tens autorização.

## Roteiro

- [x] Criação da base de dados
- [x] Deteção de comportamentos suspeitos
- [x] Ligação da base de dados a dispositivos IoT
- [ ] Implementação no mundo real

## Contribuições

Faz fork, cria um branch, e abre uma pull request. Confirma antes que `npm test` passa.

<a href="https://github.com/davideferreira00/caraDBela/graphs/contributors"><img src="https://contrib.rocks/image?repo=davideferreira00/caraDBela" alt="Contribuidores"></a>

## Licença

Não copies, não roubes, não espalhes. De resto é tranquilo, usa à vontade!

O tipo de letra Alegreya Sans tem licença própria (`public/fonts/OFL.txt`).

## Reconhecimentos

- [ ] Nasa possivelmente
- [ ] A tua casa
- [x] A minha mãe
- [ ] ???
