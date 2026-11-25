import { execFile } from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import { promisify } from 'node:util';

const executar = promisify(execFile);
const MAX_ENDERECOS = 1024;

export function normalizarMac(valor) {
  if (typeof valor !== 'string') return null;
  const partes = valor.trim().split(/[:-]/);
  if (partes.length !== 6 || !partes.every((p) => /^[0-9a-f]{1,2}$/i.test(p))) return null;
  const mac = partes.map((p) => p.padStart(2, '0')).join(':').toUpperCase();
  // Difusão, multicast e endereço nulo nunca identificam um equipamento.
  if (mac === '00:00:00:00:00:00' || parseInt(mac.slice(0, 2), 16) & 1) return null;
  return mac;
}

export function ipPrivado(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 127;
  }
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return ipPrivado(v.slice(7));
    return v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  return false;
}

/** Só endereços de rede local: nunca a própria máquina (loopback) nem a Internet. */
export const alvoPermitido = (ip) => net.isIP(ip) === 4 && ipPrivado(ip) && !ip.startsWith('127.') && !ip.startsWith('169.254.');

const paraNumero = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const paraIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export function enderecosDaRede(cidr) {
  const [ip, prefixoTexto] = String(cidr).split('/');
  const prefixo = Number(prefixoTexto);
  if (!alvoPermitido(ip) || !Number.isInteger(prefixo) || prefixo < 1 || prefixo > 30) {
    throw new Error(`Rede inválida: ${cidr}. Usa uma rede privada, por exemplo 192.168.1.0/24.`);
  }
  const tamanho = 2 ** (32 - prefixo);
  if (tamanho > MAX_ENDERECOS) throw new Error(`A rede ${cidr} é demasiado grande. O máximo é /22; define REDE no ficheiro .env.`);
  const base = Math.floor(paraNumero(ip) / tamanho) * tamanho;
  return Array.from({ length: tamanho - 2 }, (_, i) => paraIp(base + i + 1));
}

function ipDeSaida() {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    const fim = (ip) => { try { s.close(); } catch { /* já fechado */ } resolve(ip); };
    s.once('error', () => fim(null));
    // Ligar um socket UDP não envia nada; só escolhe a interface de saída.
    s.connect(53, '192.0.2.1', () => fim(s.address().address));
  });
}

export async function interfaceLocal() {
  const todas = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i.family === 'IPv4' && !i.internal && alvoPermitido(i.address));
  const saida = await ipDeSaida();
  return todas.find((i) => i.address === saida) || todas[0] || null;
}

async function ping(ip) {
  const args = process.platform === 'win32' ? ['-n', '1', '-w', '800', ip]
    : process.platform === 'darwin' ? ['-c', '1', '-W', '800', ip] : ['-c', '1', '-W', '1', ip];
  try {
    const { stdout } = await executar('ping', args, { timeout: 3000, windowsHide: true });
    // No Windows, "destino inacessível" também termina com código 0.
    return /ttl[=:]/i.test(stdout);
  } catch { return false; }
}

export function lerArp(texto) {
  const tabela = new Map();
  for (const linha of texto.split(/\r?\n/)) {
    const ip = linha.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0];
    const mac = normalizarMac(linha.match(/(?<![0-9a-f:-])(?:[0-9a-f]{1,2}[:-]){5}[0-9a-f]{1,2}(?![0-9a-f:-])/i)?.[0]);
    if (ip && mac && !/FAILED|INCOMPLETE/i.test(linha)) tabela.set(ip, mac);
  }
  return tabela;
}

async function tabelaArp() {
  const tentativas = process.platform === 'linux' ? [['ip', ['neigh']], ['arp', ['-an']]]
    : [['arp', [process.platform === 'win32' ? '-a' : '-an']]];
  for (const [cmd, args] of tentativas) {
    try { return lerArp((await executar(cmd, args, { timeout: 5000, windowsHide: true })).stdout); } catch { /* tenta o seguinte */ }
  }
  return new Map();
}

export async function emParalelo(itens, limite, fn) {
  const saida = new Array(itens.length);
  let seguinte = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (seguinte < itens.length) { const i = seguinte++; saida[i] = await fn(itens[i]); }
  }));
  return saida;
}

async function nomeDe(ip) {
  let relogio;
  try {
    const limite = new Promise((r) => { relogio = setTimeout(() => r(null), 1500); });
    return await Promise.race([dns.reverse(ip).then((n) => n[0] || null), limite]);
  } catch { return null; } finally { clearTimeout(relogio); }
}

async function ssidAtual() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await executar('netsh', ['wlan', 'show', 'interfaces'], { timeout: 4000, windowsHide: true });
      return stdout.match(/^\s*SSID\s*:\s*(.+)$/m)?.[1].trim() || null;
    }
    if (process.platform === 'linux') return (await executar('iwgetid', ['-r'], { timeout: 4000 })).stdout.trim() || null;
  } catch { /* ligação por cabo */ }
  return null;
}

async function analisar(redeConfigurada) {
  const local = await interfaceLocal();
  const cidr = redeConfigurada || local?.cidr;
  if (!cidr) throw new Error('Não há nenhuma rede local ativa nesta máquina.');
  const enderecos = enderecosDaRede(cidr);
  const [respostas, ssid] = await Promise.all([emParalelo(enderecos, 64, ping), ssidAtual()]);
  const arp = await tabelaArp();
  if (local) arp.set(local.address, normalizarMac(local.mac));
  // Um equipamento pode ignorar o ping e mesmo assim responder a ARP.
  const ativos = enderecos.filter((ip, i) => respostas[i] || arp.has(ip));
  const dispositivos = await emParalelo(ativos, 16, async (ip) => ({
    ip, mac: arp.get(ip) || null, hostname: await nomeDe(ip), ssid, estaMaquina: ip === local?.address,
  }));
  return { rede: cidr, ssid, dispositivos };
}

let emCurso = null;
/** Pedidos simultâneos partilham a mesma análise. */
export function analisarRede(rede) {
  emCurso ??= analisar(rede).finally(() => { emCurso = null; });
  return emCurso;
}
