import mongoose from 'mongoose';
import { criarApp } from './app.js';
import { config } from './config.js';
import { ligar, prepararBase } from './models/index.js';
import { codigoInstalacao, haAdmin } from './routes/auth.js';
import { iniciarMonitor } from './services/monitor.js';

export async function arrancar(uri = config.mongo) {
  await ligar(uri);
  await prepararBase();
  const servidor = await new Promise((resolve, reject) => {
    const s = criarApp().listen(config.porta, config.host, (e) => (e ? reject(e) : resolve(s)));
  });
  const pararMonitor = iniciarMonitor();
  const visivel = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`CaraDBela em http://${visivel}:${config.porta}`);
  const parar = async () => {
    pararMonitor();
    servidor.close();
    servidor.closeAllConnections();
    await mongoose.disconnect();
  };
  return { servidor, parar };
}

if (import.meta.main) {
  try {
    const { parar } = await arrancar();
    if (!(await haAdmin())) console.log(`\nPrimeira utilização. Código de instalação: ${codigoInstalacao}\n`);
    for (const sinal of ['SIGINT', 'SIGTERM']) process.once(sinal, () => parar().then(() => process.exit(0)));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
