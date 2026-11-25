// Arranca com uma base temporária e dados inventados. Nada fica guardado.
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../src/config.js';
import { Alert, Device, DeviceType, Event, User } from '../src/models/index.js';
import { arrancar } from '../src/server.js';

config.host = '127.0.0.1'; // a conta de demonstração é pública: nunca expor na rede
config.monitorMinutos = 0;
console.log('A preparar a demonstração (a primeira vez descarrega o MongoDB)…');
const mongo = await MongoMemoryServer.create();
const { parar } = await arrancar(mongo.getUri('demo'));
const user = await User.create({ username: 'demo', passwordHash: await bcrypt.hash('demonstracao', 12), isAdmin: true });
const tipos = Object.fromEntries((await DeviceType.find()).map((t) => [t.name, t._id]));
const min = (n) => new Date(Date.now() - n * 60_000);

const criados = await Device.insertMany([
  ['Router', 'Router', 1, 'confiavel', 1],
  ['Câmara da entrada', 'Câmara', 20, 'isolado', 2],
  ['Fechadura', 'Fechadura', 21, 'isolado', 3],
  ['Televisão da sala', 'TV', 30, 'confiavel', 8],
  ['Aspirador', 'Aspirador', 34, 'isolado', 400],
  ['Portátil', 'PC', 40, 'confiavel', 1],
  ['Telemóvel', 'Telemóvel', 41, 'confiavel', 5],
  ['Tomada do escritório', 'Tomada Inteligente', 52, 'desconhecido', 12],
  ['Sensor da cave', 'Sensor', 53, 'desconhecido', 2000],
].map(([name, tipo, n, trust, visto]) => ({
  userId: user._id, name, type: tipos[tipo], ip: `192.168.50.${n}`, trust, lastSeenAt: min(visto), ssid: 'Casa',
  mac: `02:00:00:00:00:${n.toString(16).padStart(2, '0').toUpperCase()}`,
})));
const d = Object.fromEntries(criados.map((x) => [x.name, x]));

const eventos = [];
for (let h = 0; h < 24; h++) {
  for (let i = 0; i < 2 + ((h * 7) % 9); i++) {
    eventos.push({ userId: user._id, deviceId: criados[(h + i) % 7]._id, kind: i % 4 ? 'acesso' : 'login_ok', sourceIp: '192.168.50.40', at: min(h * 60 + i * 5 + 2) });
  }
}
for (let i = 0; i < 14; i++) eventos.push({ userId: user._id, deviceId: d.Fechadura._id, kind: 'login_falhado', sourceIp: '203.0.113.24', at: min(20 + i / 2) });
await Event.insertMany(eventos);
await Device.updateMany({ _id: { $in: criados.slice(0, 7).map((x) => x._id) } }, { hasKey: true, eventAt: min(5) });
await Device.updateOne({ _id: d.Portátil._id }, { watchedAt: min(0), watchesLogins: false });

const alerta = (nome, rule, severity, title, detail, count, m) => ({
  userId: user._id, deviceId: nome ? d[nome]._id : null, rule, severity, title, detail, count,
  dedupeKey: `${rule}:${nome}`, createdAt: min(m + 10), lastAt: min(m),
});
await Alert.insertMany([
  alerta('Fechadura', 'forca_bruta', 'alta', 'Fechadura: tentativas repetidas', '14 falhas em 10 minutos a partir de 203.0.113.24.', 10, 20),
  alerta('Câmara da entrada', 'fora_de_horas', 'media', 'Câmara da entrada: acesso fora de horas', 'Acesso de 192.168.50.40 fora do horário 08:00–23:00.', 1, 190),
  alerta(null, 'novo_na_rede', 'media', 'Equipamento novo na rede', '192.168.50.77 (02:00:00:00:00:4D) ligou-se à rede.', 1, 320),
]);
console.log('Entra com  demo / demonstracao');
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, async () => { await parar(); await mongo.stop(); process.exit(0); });
