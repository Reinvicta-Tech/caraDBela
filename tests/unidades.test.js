import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avaliar, dentroDoHorario } from '../src/services/detecao.js';
import { alvoPermitido, enderecosDaRede, ipPrivado, lerArp, normalizarMac } from '../src/services/rede.js';
import { analisarDispositivo, lerNmap } from '../src/services/seguranca.js';
import { Tentativas } from '../src/services/tentativas.js';

const fuso = 'Europe/Lisbon';
const disp = { _id: 'd1', name: 'Câmara', schedule: { enabled: false } };
const ev = (kind, sourceIp = '192.168.1.9', at = new Date()) => ({ kind, sourceIp, at });
const regras = (evento, recentes = [], dispositivo = disp) => avaliar({ evento, dispositivo, recentes, fuso }).map((a) => a.rule);

test('MAC: normaliza e recusa multicast e difusão', () => {
  assert.equal(normalizarMac('94-83-c4-24-55-49'), '94:83:C4:24:55:49');
  assert.equal(normalizarMac('0:1a:2:3:4:5'), '00:1A:02:03:04:05');
  for (const m of ['ff-ff-ff-ff-ff-ff', '01-00-5e-00-00-16', 'Desconhecido', null]) assert.equal(normalizarMac(m), null);
});

test('IPs privados e alvos permitidos', () => {
  assert.ok(ipPrivado('172.16.0.1') && ipPrivado('::ffff:10.0.0.1') && !ipPrivado('172.32.0.1') && !ipPrivado('8.8.8.8'));
  assert.ok(alvoPermitido('192.168.1.1'));
  for (const ip of ['127.0.0.1', '8.8.8.8', '192.168.1.1; calc', '-iL', '169.254.1.1']) assert.ok(!alvoPermitido(ip));
});

test('rede: expande e limita o tamanho', () => {
  const l = enderecosDaRede('192.168.11.116/24');
  assert.deepEqual([l.length, l[0], l.at(-1)], [254, '192.168.11.1', '192.168.11.254']);
  assert.throws(() => enderecosDaRede('10.0.0.0/8'));
  assert.throws(() => enderecosDaRede('8.8.8.0/24'));
});

test('ARP: Windows, Linux e macOS', () => {
  const t = lerArp([
    '  192.168.11.1   94-83-c4-24-55-49   dynamic', '  192.168.11.255  ff-ff-ff-ff-ff-ff  static',
    '192.168.1.7 dev eth0 lladdr 00:e0:4c:5b:75:4a REACHABLE', '? (192.168.1.8) at 0:e0:4c:5b:75:4b on en0', '192.168.1.9 dev eth0 FAILED',
  ].join('\r\n'));
  assert.deepEqual([...t.keys()], ['192.168.11.1', '192.168.1.7', '192.168.1.8']);
});

test('horário normal, noturno e mudança da hora', () => {
  const noite = { enabled: true, start: '22:00', end: '06:00', days: [1] }; // segunda à noite
  assert.ok(dentroDoHorario(noite, new Date('2026-01-06T03:00:00Z'), fuso)); // terça de madrugada
  assert.ok(!dentroDoHorario(noite, new Date('2026-01-05T03:00:00Z'), fuso));
  const dia = { enabled: true, start: '08:00', end: '09:00', days: [0, 1, 2, 3, 4, 5, 6] };
  assert.ok(dentroDoHorario(dia, new Date('2026-07-06T07:30:00Z'), fuso)); // verão: 08:30
  assert.ok(!dentroDoHorario(dia, new Date('2026-01-06T07:30:00Z'), fuso));
});

test('deteção: cada regra dispara só quando deve', () => {
  const falhas = (n, ip) => Array.from({ length: n }, () => ev('login_falhado', ip));
  assert.deepEqual(regras(ev('login_falhado'), falhas(3)), []);
  assert.deepEqual(regras(ev('login_falhado'), falhas(4)), ['forca_bruta']);
  assert.deepEqual(regras(ev('login_falhado'), falhas(4, '192.168.1.10')), []);
  assert.deepEqual(regras(ev('login_ok'), falhas(5)), ['intrusao']);
  assert.deepEqual(regras(ev('acesso', '203.0.113.9')), ['origem_externa']);
  assert.deepEqual(regras(ev('nao_autorizado')), ['nao_autorizado']);
  assert.deepEqual(regras(ev('ligacao'), Array.from({ length: 59 }, () => ev('ligacao'))), ['rajada']);
  assert.deepEqual(regras(ev('acesso'), [], { ...disp, schedule: { enabled: true, start: '00:00', end: '01:00', days: [] } }), ['fora_de_horas']);
});

test('nmap: portas e vulnerabilidades', () => {
  const r = lerNmap(`<nmaprun><host><ports>
    <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="7.4"/>
      <script id="vulners"><table key="cpe:/a">
        <table><elem key="id">X</elem><elem key="cvss">5.0</elem><elem key="is_exploit">true</elem></table>
        <table><elem key="id">CVE-2023-38408</elem><elem key="cvss">9.8</elem><elem key="is_exploit">false</elem></table>
      </table></script></port>
    <port protocol="tcp" portid="23"><state state="closed"/></port></ports></host></nmaprun>`);
  assert.equal(r.ports.length, 1);
  assert.equal(r.ports[0].version, 'OpenSSH 7.4');
  assert.deepEqual(r.vulnerabilities.map((v) => [v.id, v.severity, v.exploit]), [['CVE-2023-38408', 'critica', false], ['X', 'media', true]]);
});

test('a análise recusa alvos fora da rede local', async () => { await assert.rejects(analisarDispositivo('8.8.8.8')); });

test('tentativas: 5 falhas bloqueiam 1 minuto, 10 bloqueiam 5', () => {
  let t = 0;
  const x = new Tentativas(() => t);
  for (let i = 0; i < 4; i++) x.falhou('a');
  assert.equal(x.espera('a'), 0);
  x.falhou('a');
  assert.equal(x.espera('a'), 60);
  t = 61_000;
  assert.equal(x.espera('a'), 0);
  for (let i = 0; i < 5; i++) x.falhou('a');
  assert.equal(x.espera('a'), 300);
  assert.equal(x.espera('b'), 0);
});
