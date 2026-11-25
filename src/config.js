import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ficheiroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheiroEnv)) process.loadEnvFile(ficheiroEnv);

const env = process.env;
const numero = (valor, omissao) => {
  const n = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(n) && n >= 0 ? n : omissao;
};
const sim = (valor) => valor === 'true' || valor === '1';

function segredoJwt() {
  if (env.JWT_SECRET) {
    if (env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET tem de ter pelo menos 32 caracteres.');
    return env.JWT_SECRET;
  }
  const pasta = path.join(RAIZ, '.dados');
  const ficheiro = path.join(pasta, 'segredo-jwt');
  if (existsSync(ficheiro)) return readFileSync(ficheiro, 'utf8').trim();
  mkdirSync(pasta, { recursive: true });
  const segredo = randomBytes(48).toString('hex');
  writeFileSync(ficheiro, segredo, { mode: 0o600 });
  return segredo;
}

export const config = {
  porta: numero(env.PORT, 3000),
  host: env.HOST || '127.0.0.1',
  mongo: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/CaraDBela',
  jwtSecret: segredoJwt(),
  cookieSecure: sim(env.COOKIE_SECURE),
  trustProxy: numero(env.TRUST_PROXY, 0),
  permitirRegisto: sim(env.PERMITIR_REGISTO),
  monitorMinutos: numero(env.MONITOR_MINUTOS, 0),
  rede: env.REDE || '',
  fuso: env.FUSO_HORARIO || 'Europe/Lisbon',
  vulners: sim(env.NMAP_VULNERS),
  eventosDias: numero(env.EVENTOS_DIAS, 90) || 90,
};
