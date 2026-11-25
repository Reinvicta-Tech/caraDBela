import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'segredo-de-testes-com-mais-de-trinta-e-dois';
const { criarApp } = await import('../src/app.js');
const { config } = await import('../src/config.js');
const { ligar, prepararBase, Alert, Device, Report } = await import('../src/models/index.js');
const { codigoInstalacao } = await import('../src/routes/auth.js');
const { verificar } = await import('../src/services/monitor.js');
config.permitirRegisto = false;

const PASSE = 'uma-passe-comprida';
let mongo, servidor, base, id, chave;

function cliente() {
  let cookie = '';
  return async (metodo, rota, corpo, cab = {}) => {
    const r = await fetch(`${base}/api${rota}`, {
      method: metodo, headers: { 'content-type': 'application/json', 'x-caradbela': '1', cookie, ...cab }, body: corpo && JSON.stringify(corpo),
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const texto = await r.text();
    return { status: r.status, dados: texto ? JSON.parse(texto) : null, set };
  };
}
const admin = cliente();
const ana = cliente();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await ligar(mongo.getUri('t'));
  await prepararBase();
  servidor = criarApp().listen(0, '127.0.0.1');
  await new Promise((r) => { servidor.once('listening', r); });
  base = `http://127.0.0.1:${servidor.address().port}`;
}, { timeout: 300_000 });
after(async () => {
  servidor?.close();
  servidor?.closeAllConnections();
  await mongoose.disconnect();
  await mongo?.stop();
});

test('instalação exige o código e só acontece uma vez', async () => {
  assert.equal((await admin('POST', '/auth/instalar', { username: 'chefe', password: PASSE, codigo: 'errado' })).status, 403);
  const r = await admin('POST', '/auth/instalar', { username: 'chefe', password: PASSE, codigo: codigoInstalacao });
  assert.equal(r.status, 201);
  assert.match(r.set, /HttpOnly.*SameSite=Strict/i);
  assert.equal((await cliente()('POST', '/auth/instalar', { username: 'outro', password: PASSE, codigo: codigoInstalacao })).status, 409);
});

test('sem sessão, sem cabeçalho ou com registo fechado é recusado', async () => {
  assert.equal((await cliente()('GET', '/dispositivos')).status, 401);
  assert.equal((await admin('POST', '/tipos', { name: 'X' }, { 'x-caradbela': '' })).status, 403);
  assert.equal((await cliente()('POST', '/auth/registar', { username: 'novo', password: PASSE })).status, 403);
  assert.equal((await cliente()('POST', '/auth/entrar', { username: { $ne: null }, password: 'x' })).status, 400);
});

test('utilizador comum não acede à administração', async () => {
  assert.equal((await admin('POST', '/admin/utilizadores', { username: 'ana', password: PASSE })).status, 201);
  assert.equal((await ana('POST', '/auth/entrar', { username: 'ana', password: PASSE })).status, 200);
  assert.equal((await ana('GET', '/admin/utilizadores')).status, 403);
  assert.equal((await ana('POST', '/tipos', { name: 'X' })).status, 403);
});

test('dispositivos: validação, isolamento entre utilizadores e chave escondida', async () => {
  const novo = { name: 'Fechadura', ip: '192.168.1.20', mac: 'aa-bb-cc-00-11-22' };
  const r = await admin('POST', '/dispositivos', novo);
  assert.equal(r.status, 201);
  id = r.dados._id;
  assert.equal(r.dados.mac, 'AA:BB:CC:00:11:22');
  assert.equal((await admin('POST', '/dispositivos', novo)).status, 409);
  assert.equal((await ana('POST', '/dispositivos', novo)).status, 201);
  assert.equal((await admin('POST', '/dispositivos', { name: 'x', ip: '8.8.8.8' })).status, 400);
  for (const n of [5, 6]) assert.equal((await admin('POST', '/dispositivos', { name: `sem mac ${n}`, ip: `192.168.1.${n}` })).status, 201);
  for (const [m, c] of [['PATCH', { name: 'roubado' }], ['DELETE']]) assert.equal((await ana(m, `/dispositivos/${id}`, c)).status, 404);
  assert.equal((await ana('POST', '/analises', { deviceId: id })).status, 404);
  chave = (await admin('POST', `/dispositivos/${id}/chave`)).dados.chave;
  const lista = (await admin('GET', '/dispositivos')).dados;
  assert.ok(lista.some((d) => d.hasKey) && !JSON.stringify(lista).includes('keyHash'));
  const p = await admin('PATCH', `/dispositivos/${id}`, { trust: 'isolado' });
  assert.equal(p.dados.trust, 'isolado');
  assert.equal(p.dados.mac, 'AA:BB:CC:00:11:22', 'alterar um campo não apaga os outros');
  assert.ok(!('keyHash' in p.dados));
});

test('o guia sabe se outros equipamentos alcançam o servidor', async () => {
  assert.equal((await cliente()('GET', '/servidor')).status, 401);
  const antes = config.host;
  config.host = '127.0.0.1';
  assert.deepEqual((await admin('GET', '/servidor')).dados, { soLocal: true, endereco: null });
  config.host = '192.168.1.10';
  assert.deepEqual((await admin('GET', '/servidor')).dados, { soLocal: false, endereco: `http://192.168.1.10:${config.porta}` });
  config.host = antes;
});

test('um evento de teste não conta como vigia', async () => {
  const d = (await admin('POST', '/dispositivos', { name: 'Teste', ip: '192.168.1.77' })).dados;
  const k = (await admin('POST', `/dispositivos/${d._id}/chave`)).dados.chave;
  const enviar = (corpo) => cliente()('POST', '/receber', corpo, { authorization: `Bearer ${k}`, 'x-caradbela': '' });
  const estado = async () => (await admin('GET', '/dispositivos')).dados.find((x) => x._id === d._id);
  for (let i = 0; i < 6; i++) assert.equal((await enviar({ tipo: 'login_falhado', detalhe: 'Teste' })).dados.alertas, 0);
  assert.equal((await estado()).eventAt, undefined);
  await enviar({ tipo: 'acesso' });
  assert.ok((await estado()).eventAt);
  await admin('POST', `/dispositivos/${d._id}/chave`);
  assert.equal((await estado()).eventAt, undefined, 'com chave nova, ainda nada está ligado');
  assert.equal((await admin('DELETE', `/dispositivos/${d._id}`)).status, 204);
});

test('eventos geram alertas agrupados e visíveis só para o dono', async () => {
  const enviar = (corpo, k = chave) => cliente()('POST', '/receber', corpo, { authorization: `Bearer ${k}`, 'x-caradbela': '' });
  assert.equal((await enviar({ tipo: 'acesso' }, `cdb_${'0'.repeat(48)}`)).status, 401);
  assert.equal((await enviar({ tipo: 'inventado' })).status, 400);
  for (let i = 0; i < 7; i++) assert.equal((await enviar({ tipo: 'login_falhado', origemIp: '192.168.1.99' })).status, 202);
  assert.equal((await enviar({ tipo: 'login_ok', origemIp: '192.168.1.99' })).dados.alertas, 1);
  const estado = async () => (await admin('GET', '/dispositivos')).dados.find((d) => d._id === id);
  const vivo = (k, corpo) => cliente()('POST', '/receber/vivo', corpo, { authorization: `Bearer ${k}`, 'x-caradbela': '' });
  assert.equal((await vivo(`cdb_${'0'.repeat(48)}`, {})).status, 401);
  assert.equal((await vivo(chave, { falhas: 'sim' })).status, 400);
  assert.equal((await estado()).watchedAt, undefined);
  assert.equal((await vivo(chave, { falhas: true })).status, 204);
  assert.ok((await estado()).watchedAt && (await estado()).watchesLogins);
  const alertas = (await admin('GET', '/alertas')).dados;
  assert.deepEqual(alertas.map((a) => [a.rule, a.count]).sort(), [['forca_bruta', 3], ['intrusao', 1]]);
  assert.equal((await ana('GET', '/alertas')).dados.length, 0);
  assert.equal((await ana('POST', `/alertas/${alertas[0]._id}/resolver`)).status, 404);
  assert.equal((await admin('POST', `/alertas/${alertas[0]._id}/resolver`)).status, 204);
  assert.equal((await admin('GET', '/alertas')).dados.length, 1);
  const { horas, porDispositivo } = (await admin('GET', '/resumo')).dados;
  const soma = (l) => l.reduce((x, n) => x + n, 0);
  assert.equal(soma(horas.map((h) => h.total)), 8);
  assert.equal(soma(porDispositivo[id]), 8);
  assert.equal(soma((await admin('GET', '/resumo?tipo=login_ok')).dados.porDispositivo[id]), 1);
  assert.deepEqual((await ana('GET', '/resumo')).dados.porDispositivo, {});
});

test('monitor: avisa uma vez por equipamento novo e atualiza a presença', async () => {
  const rede = { dispositivos: [{ ip: '192.168.1.77', mac: 'AA:BB:CC:00:11:22' }, { ip: '192.168.1.78', mac: 'AA:BB:CC:00:11:99' }] };
  await verificar(rede);
  await verificar(rede);
  assert.equal(await Alert.countDocuments({ rule: 'novo_na_rede' }), 2); // um por utilizador
  assert.equal((await Device.findById(id)).ip, '192.168.1.77');
});

test('bloqueio após 5 falhas fica registado', async () => {
  const c = cliente();
  for (let i = 0; i < 5; i++) assert.equal((await c('POST', '/auth/entrar', { username: 'ana', password: 'errada' })).status, 401);
  assert.equal((await c('POST', '/auth/entrar', { username: 'ana', password: PASSE })).status, 429);
  assert.equal(await Report.countDocuments(), 1);
});

test('desativar a conta termina a sessão', async () => {
  const u = (await admin('GET', '/admin/utilizadores')).dados.find((x) => x.username === 'ana');
  assert.equal((await admin('PATCH', `/admin/utilizadores/${u._id}`, { disabled: true })).status, 204);
  assert.equal((await ana('GET', '/auth/eu')).status, 401);
});

test('mudar a palavra-passe termina as outras sessões', async () => {
  const outro = cliente();
  await outro('POST', '/auth/entrar', { username: 'chefe', password: PASSE });
  assert.equal((await admin('PUT', '/auth/palavra-passe', { atual: PASSE, nova: 'outra-passe-longa' })).status, 204);
  assert.equal((await outro('GET', '/auth/eu')).status, 401);
  assert.equal((await admin('GET', '/auth/eu')).status, 200);
});

test('apagar a chave e o dispositivo apaga o acesso e os dados', async () => {
  assert.equal((await admin('DELETE', `/dispositivos/${id}/chave`)).status, 204);
  assert.equal((await cliente()('POST', '/receber', { tipo: 'acesso' }, { authorization: `Bearer ${chave}` })).status, 401);
  assert.equal((await admin('DELETE', `/dispositivos/${id}`)).status, 204);
  assert.equal((await admin('GET', '/eventos')).dados.length, 0);
});

test('migração da versão 1', async () => {
  const con = await mongoose.createConnection(mongo.getUri('antiga')).asPromise();
  const userId = new mongoose.Types.ObjectId();
  await con.collection('users').insertOne({ _id: userId, username: 'admin', passwordHash: 'x', isAdmin: true });
  await con.collection('saveddevices').insertMany([
    { userId, name: 'A', ip: '192.168.1.2', mac: 'aa-bb-cc-00-00-01' }, { userId, name: 'B', ip: '192.168.1.3', mac: 'Desconhecido' },
    { userId, name: 'C', ip: '192.168.1.4', mac: 'AA:BB:CC:00:00:01' },
  ]);
  await con.collection('saveddevices').createIndex({ mac: 1 }, { unique: true, name: 'mac_1' });
  await con.collection('whitelists').insertOne({ userId, allowedMAC: [{ mac: 'AA:BB:CC:00:00:01', isInDividedNetwork: true }] });
  for (let i = 0; i < 2; i++) {
    await promisify(execFile)(process.execPath, ['scripts/migrar.js'], { env: { ...process.env, MONGODB_URI: mongo.getUri('antiga') } });
  }
  const devices = await con.collection('saveddevices').find().sort({ name: 1 }).toArray();
  assert.deepEqual(devices.map((d) => [d.mac, d.trust]), [['AA:BB:CC:00:00:01', 'isolado'], [undefined, 'desconhecido'], [undefined, 'desconhecido']]);
  assert.equal((await con.collection('users').findOne({ username: 'admin' })).disabled, true);
  await con.close();
});
