// Arranca o CaraDBela com um MongoDB próprio, sem instalação nem permissões de administrador.
// Os dados ficam em .dados/mongo e mantêm-se entre arranques.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config, RAIZ } from '../src/config.js';
import { codigoInstalacao, haAdmin } from '../src/routes/auth.js';
import { arrancar } from '../src/server.js';

const PORTA = 27017;
const dbPath = path.join(RAIZ, '.dados', 'mongo');
mkdirSync(dbPath, { recursive: true });
console.log('A arrancar o MongoDB (a primeira vez descarrega-o)…');
let mongo;
let parar;
let aTerminar = false;
async function terminar(codigo = 0) {
  if (aTerminar) return;
  aTerminar = true;
  await parar?.();
  await mongo?.stop({ doCleanup: false }); // nunca apagar os dados
  process.exit(codigo);
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => terminar());
try {
  mongo = await MongoMemoryServer.create({ instance: { port: PORTA, portGeneration: false, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' } });
  // Só esta base: evita ligar sem querer a um endereço definido no .env.
  config.mongo = `mongodb://127.0.0.1:${PORTA}/CaraDBela`;
  ({ parar } = await arrancar());
  if (!(await haAdmin())) console.log(`\nPrimeira utilização. Código de instalação: ${codigoInstalacao}\n`);
  console.log('Para parar: Ctrl+C');
} catch (e) {
  console.error(`Não consegui arrancar: ${e.message}`);
  await terminar(1);
}
