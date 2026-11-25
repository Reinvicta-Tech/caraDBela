import { execFile } from 'node:child_process';
import net from 'node:net';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import { alvoPermitido, emParalelo } from './rede.js';

const executar = promisify(execFile);
const RISCO = {
  21: ['alta', 'FTP envia palavras-passe sem cifra.'],
  22: ['media', 'SSH exposto. Confirma que usa chaves.'],
  23: ['critica', 'Telnet é a porta de entrada clássica de botnets IoT.'],
  80: ['media', 'Página de administração sem cifra.'],
  445: ['media', 'Partilha de ficheiros Windows exposta na rede.'],
  554: ['media', 'Vídeo RTSP. Confirma que pede palavra-passe.'],
  1883: ['alta', 'MQTT sem cifra. Qualquer um na rede pode ler as mensagens.'],
  2323: ['critica', 'Telnet alternativo, muito procurado por botnets IoT.'],
  3389: ['alta', 'Ambiente de trabalho remoto exposto.'],
  5555: ['critica', 'ADB aberto dá controlo total a equipamentos Android.'],
  5900: ['alta', 'VNC exposto, muitas vezes com autenticação fraca.'],
  8080: ['media', 'Página de administração sem cifra.'],
};
const SERVICOS = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 53: 'dns', 80: 'http', 139: 'netbios', 443: 'https', 445: 'smb', 554: 'rtsp',
  631: 'ipp', 1883: 'mqtt', 2323: 'telnet', 3389: 'rdp', 5000: 'upnp', 5555: 'adb', 5900: 'vnc', 8000: 'http',
  8008: 'http', 8080: 'http', 8443: 'https', 8883: 'mqtts', 9100: 'impressora',
};

export const classificarPorta = (n) => ({ risk: RISCO[n]?.[0] || 'baixa', note: RISCO[n]?.[1] || '' });
const lista = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const deCvss = (n) => (n >= 9 ? 'critica' : n >= 7 ? 'alta' : n >= 4 ? 'media' : 'baixa');

export function lerNmap(xml) {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseAttributeValue: false, parseTagValue: false }).parse(xml);
  const host = lista(doc?.nmaprun?.host)[0];
  const ports = [];
  const vulnerabilities = [];
  for (const p of lista(host?.ports?.port)) {
    if (p.state?.['@state'] !== 'open') continue;
    const numero = Number(p['@portid']);
    ports.push({
      number: numero, protocol: p['@protocol'], service: p.service?.['@name'] || 'desconhecido',
      version: [p.service?.['@product'], p.service?.['@version']].filter(Boolean).join(' '), ...classificarPorta(numero),
    });
    for (const script of lista(p.script).filter((s) => s['@id'] === 'vulners')) {
      for (const cpe of lista(script.table)) {
        for (const linha of lista(cpe.table)) {
          const campos = Object.fromEntries(lista(linha.elem).map((e) => [e['@key'], e['#text'] ?? '']));
          if (!campos.id) continue;
          const cvss = Number(campos.cvss) || 0;
          vulnerabilities.push({ id: campos.id, port: numero, cvss, severity: deCvss(cvss), exploit: campos.is_exploit === 'true' });
        }
      }
    }
  }
  vulnerabilities.sort((a, b) => b.cvss - a.cvss);
  return { ports, vulnerabilities };
}

function portaAberta(ip, porta) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port: porta });
    const fim = (r) => { s.destroy(); resolve(r); };
    s.setTimeout(1200, () => fim(false));
    s.once('connect', () => fim(true));
    s.once('error', () => fim(false));
  });
}

async function analiseBasica(ip) {
  const portas = Object.keys(SERVICOS).map(Number);
  const abertas = await emParalelo(portas, 12, (p) => portaAberta(ip, p));
  return {
    engine: 'basico', checked: portas.length, vulnChecked: false, vulnerabilities: [],
    ports: portas.filter((_, i) => abertas[i]).map((n) => ({ number: n, protocol: 'tcp', service: SERVICOS[n], version: '', ...classificarPorta(n) })),
  };
}

export async function analisarDispositivo(ip, { vulners = false } = {}) {
  if (!alvoPermitido(ip)) throw new Error('Só é possível analisar endereços da rede local.');
  const args = ['-sV', '-Pn', '-T4', '--top-ports', '1000', ...(vulners ? ['--script', 'vulners'] : []), '-oX', '-', ip];
  try {
    const { stdout } = await executar('nmap', args, { timeout: 10 * 60_000, maxBuffer: 20e6, windowsHide: true });
    return { engine: 'nmap', checked: 1000, vulnChecked: vulners, ...lerNmap(stdout) };
  } catch (e) {
    if (e.code === 'ENOENT') return analiseBasica(ip);
    throw new Error(e.killed ? 'A análise excedeu 10 minutos.' : 'O nmap terminou com erro.', { cause: e });
  }
}
