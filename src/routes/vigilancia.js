import net from 'node:net';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { Erro, idValido, validar } from '../middleware/index.js';
import { Alert, Device, Event, ScanLog } from '../models/index.js';
import { avisar, canal, registarAlerta } from '../services/alertas.js';
import { avaliar, JANELA_MS } from '../services/detecao.js';
import { atualizarPresenca } from '../services/monitor.js';
import { analisarRede, interfaceLocal, normalizarMac } from '../services/rede.js';
import { analisarDispositivo } from '../services/seguranca.js';
import { resumoChave } from './dispositivos.js';

export const TIPOS_EVENTO = ['acesso', 'login_ok', 'login_falhado', 'nao_autorizado', 'ligacao'];
const HORA = 3600_000;
const ID = /^[0-9a-f]{24}$/i;

const esquemaEvento = z.object({
  tipo: z.enum(TIPOS_EVENTO, { error: `O tipo tem de ser um de: ${TIPOS_EVENTO.join(', ')}.` }),
  origemIp: z.string().refine((v) => net.isIP(v) > 0, 'origemIp inválido.').optional(),
  origemMac: z.string().refine((v) => normalizarMac(v), 'origemMac inválido.').optional(),
  detalhe: z.string().max(300).optional(),
});

/** Receção de eventos enviados pelos dispositivos, autenticados pela sua chave. */
export function rotasReceber() {
  const r = Router();
  const limite = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Demasiados eventos.' } });

  async function comChave(req, _res, next) {
    const chave = /^Bearer (cdb_[0-9a-f]{48})$/.exec(req.get('authorization') || '')?.[1];
    req.device = chave && await Device.findOne({ keyHash: resumoChave(chave) });
    if (!req.device) throw new Erro(401, 'Chave de dispositivo inválida.');
    next();
  }

  r.post('/', limite, comChave, validar(esquemaEvento), async (req, res) => {
    const d = req.device;
    const { tipo, origemIp, origemMac, detalhe } = req.dados;
    const at = new Date();
    const recentes = await Event.find({ deviceId: d._id, at: { $gte: new Date(at - JANELA_MS) } }).sort({ at: -1 }).limit(500).lean();
    const evento = await Event.create({ userId: d.userId, deviceId: d._id, kind: tipo, sourceIp: origemIp, sourceMac: normalizarMac(origemMac) || undefined, detail: detalhe, at });
    const teste = detalhe === 'Teste';
    await Device.updateOne({ _id: d._id }, { lastSeenAt: at, ...(teste ? {} : { eventAt: at }) });
    const alertas = teste ? [] : avaliar({ evento, dispositivo: d, recentes, fuso: config.fuso });
    for (const a of alertas) await registarAlerta(d.userId, d._id, a);
    avisar(d.userId, 'evento');
    res.status(202).json({ alertas: alertas.length });
  });

  // Sinal de vida: distingue "não aconteceu nada" de "ninguém está a ver".
  r.post('/vivo', limite, comChave, validar(z.object({ falhas: z.boolean().default(false) })), async (req, res) => {
    const d = req.device;
    const agora = new Date();
    await Device.updateOne({ _id: d._id }, { lastSeenAt: agora, watchedAt: agora, watchesLogins: req.dados.falhas });
    if (!d.watchedAt || agora - d.watchedAt > 3 * 60_000) avisar(d.userId, 'vigia');
    res.status(204).end();
  });
  return r;
}

export function rotasVigilancia() {
  const r = Router();
  r.param('id', idValido);

  r.post('/rede/analisar', async (req, res) => {
    let resultado;
    try { resultado = await analisarRede(config.rede); } catch (e) { throw new Erro(503, e.message); }
    const guardados = await atualizarPresenca(req.user._id, resultado.dispositivos);
    const deviceId = (x) => guardados.find((g) => (g.mac ? g.mac === x.mac : g.ip === x.ip))?._id || null;
    res.json({ ...resultado, dispositivos: resultado.dispositivos.map((x) => ({ ...x, deviceId: deviceId(x) })) });
  });

  r.get('/eventos', async (req, res) => {
    const q = { userId: req.user._id };
    if (ID.test(String(req.query.dispositivo || ''))) q.deviceId = String(req.query.dispositivo);
    if (TIPOS_EVENTO.includes(req.query.tipo)) q.kind = req.query.tipo;
    res.json(await Event.find(q).sort({ at: -1 }).limit(200).populate('deviceId', 'name').lean());
  });

  r.get('/alertas', async (req, res) => {
    const q = { userId: req.user._id, active: req.query.estado !== 'resolvidos' };
    res.json(await Alert.find(q).sort({ lastAt: -1 }).limit(200).populate('deviceId', 'name').lean());
  });

  r.post('/alertas/:id/resolver', async (req, res) => {
    const a = await Alert.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { active: false });
    if (!a) throw new Erro(404, 'Alerta não encontrado.');
    avisar(req.user._id, 'alerta-resolvido');
    res.status(204).end();
  });

  r.get('/resumo', async (req, res) => {
    const userId = req.user._id;
    const inicio = (Math.floor(Date.now() / HORA) - 23) * HORA;
    const quais = { userId, at: { $gte: new Date(inicio) }, ...(TIPOS_EVENTO.includes(req.query.tipo) ? { kind: req.query.tipo } : {}) };
    const [alertas, grupos] = await Promise.all([
      Alert.aggregate([{ $match: { userId, active: true } }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
      Event.aggregate([{ $match: quais }, { $group: { _id: { d: '$deviceId', h: { $dateTrunc: { date: '$at', unit: 'hour' } } }, total: { $sum: 1 } } }]),
    ]);
    const horas = Array(24).fill(0);
    const porDispositivo = {};
    for (const { _id, total } of grupos) {
      const i = Math.floor((_id.h.getTime() - inicio) / HORA);
      if (i < 0 || i > 23) continue;
      horas[i] += total;
      (porDispositivo[_id.d] ??= Array(24).fill(0))[i] += total;
    }
    res.json({
      alertas: Object.fromEntries(alertas.map((a) => [a._id, a.n])),
      horas: horas.map((total, i) => ({ hora: new Date(inicio + i * HORA), total })),
      porDispositivo,
    });
  });

  // Para o guia de ligação mostrar um endereço que os dispositivos alcancem.
  r.get('/servidor', async (_req, res) => {
    const soLocal = ['127.0.0.1', '::1', 'localhost'].includes(config.host);
    const ip = soLocal ? null : ['0.0.0.0', '::'].includes(config.host) ? (await interfaceLocal())?.address : config.host;
    res.json({ soLocal, endereco: ip ? `http://${ip.includes(':') ? `[${ip}]` : ip}:${config.porta}` : null });
  });

  r.get('/analises', async (req, res) => {
    res.json(await ScanLog.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(30).populate('deviceId', 'name').lean());
  });

  r.post('/analises', validar(z.object({ deviceId: z.string({ error: 'Escolhe um dispositivo.' }).regex(ID, 'Escolhe um dispositivo.') })), async (req, res) => {
    const d = await Device.findOne({ _id: req.dados.deviceId, userId: req.user._id });
    if (!d) throw new Erro(404, 'Dispositivo não encontrado.');
    if (await ScanLog.exists({ deviceId: d._id, status: 'a_correr' })) throw new Erro(409, 'Este dispositivo já está a ser analisado.');
    if (await ScanLog.countDocuments({ status: 'a_correr' }) >= 3) throw new Erro(429, 'Já há três análises a correr. Espera que uma termine.');
    const log = await ScanLog.create({ userId: req.user._id, deviceId: d._id, ipScanned: d.ip, scanType: 'manual', status: 'a_correr' });
    res.status(202).json(log);
    analisarDispositivo(d.ip, { vulners: config.vulners })
      .then((results) => ScanLog.updateOne({ _id: log._id }, { status: 'concluida', results }))
      .catch((e) => ScanLog.updateOne({ _id: log._id }, { status: 'falhou', error: e.message }))
      .then(() => avisar(req.user._id, 'analise'))
      .catch((e) => console.error('Análise:', e.message));
  });

  r.get('/direto', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const meu = String(req.user._id);
    const ouvir = (m) => { if (m.userId === meu) res.write(`data: ${JSON.stringify({ tipo: m.tipo, ...m.dados })}\n\n`); };
    canal.on('mudanca', ouvir);
    const pulso = setInterval(() => res.write(': pulso\n\n'), 25_000);
    // Obriga a reautenticar de vez em quando, para uma sessão revogada deixar de receber.
    const fim = setTimeout(() => res.end(), 10 * 60_000);
    res.on('close', () => { clearInterval(pulso); clearTimeout(fim); canal.off('mudanca', ouvir); });
  });
  return r;
}
