// Adapta uma base de dados da versão 1. Pode ser executado mais do que uma vez.
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { Device, ligar, prepararBase, User } from '../src/models/index.js';
import { normalizarMac } from '../src/services/rede.js';

await ligar(config.mongo);
const db = mongoose.connection.db;
const existentes = new Set((await db.listCollections().toArray()).map((c) => c.name));

if (existentes.has('saveddevices')) {
  const devices = db.collection('saveddevices');
  // Na versão 1 o MAC era único em toda a base, o que impedia dois MAC "Desconhecido".
  if ((await devices.indexes()).some((i) => i.name === 'mac_1')) await devices.dropIndex('mac_1');
  const vistos = new Set();
  for (const d of await devices.find().sort({ addedAt: 1 }).toArray()) {
    const mac = normalizarMac(d.mac);
    const chave = `${d.userId}|${mac}`;
    const repetido = mac && vistos.has(chave);
    if (repetido) console.warn(`MAC repetido em "${d.name}" (${d._id}): mantido sem MAC.`);
    vistos.add(chave);
    const $set = { name: d.name || d.ip || 'Sem nome' };
    await devices.updateOne({ _id: d._id }, mac && !repetido ? { $set: { ...$set, mac } } : { $set, $unset: { mac: '' } });
  }
}

if (existentes.has('whitelists')) {
  for (const w of await db.collection('whitelists').find().toArray()) {
    for (const item of w.allowedMAC || []) {
      const mac = normalizarMac(item.mac);
      // Só onde ainda não há classificação, para não desfazer escolhas feitas na versão 2.
      if (mac) await Device.updateOne({ userId: w.userId, mac, trust: { $exists: false } }, { trust: item.isInDividedNetwork ? 'isolado' : 'confiavel' });
    }
  }
}
await Device.updateMany({ trust: { $exists: false } }, { trust: 'desconhecido' });

// A palavra-passe do "admin" da versão 1 está publicada no repositório.
const antigo = await User.updateOne({ username: 'admin', tokenVersion: { $exists: false } }, { $set: { disabled: true, tokenVersion: 1 } });
if (antigo.modifiedCount) console.warn('A conta "admin" antiga foi bloqueada porque a sua palavra-passe é pública. Executa: npm run palavra-passe -- admin');
await User.updateMany({ tokenVersion: { $exists: false } }, { tokenVersion: 0 });

await prepararBase();
await mongoose.disconnect();
console.log('Migração concluída.');
