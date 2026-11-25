import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { Erro, idValido, validar } from '../middleware/index.js';
import { Alert, Device, DeviceType, Event, ScanLog } from '../models/index.js';
import { alvoPermitido, normalizarMac } from '../services/rede.js';

export const resumoChave = (chave) => createHash('sha256').update(chave).digest('hex');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida.');
const campos = {
  name: z.string({ error: 'Indica o nome do dispositivo.' }).trim().min(1, 'Indica o nome do dispositivo.').max(80, 'O nome é demasiado longo.'),
  ip: z.string({ error: 'Indica o endereço IP.' }).trim().refine(alvoPermitido, 'O IP tem de ser um endereço da rede local.'),
  mac: z.string().trim().nullish().transform((v, ctx) => {
    if (!v) return null;
    const mac = normalizarMac(v);
    if (!mac) ctx.addIssue({ code: 'custom', message: 'Endereço MAC inválido.' });
    return mac;
  }),
  type: z.string().regex(/^[0-9a-f]{24}$/i, 'Tipo inválido.').nullish(),
  ssid: z.string().trim().max(64).nullish(),
  trust: z.enum(['desconhecido', 'confiavel', 'isolado'], { error: 'Estado de confiança inválido.' }),
  schedule: z.object({ enabled: z.boolean(), start: hora, end: hora, days: z.array(z.int().min(0).max(6)).max(7) }),
};
const criar = z.object({ ...campos, trust: campos.trust.optional(), schedule: campos.schedule.optional() });
const alterar = z.object(campos).partial();

async function confirmarTipo(id) {
  if (id && !(await DeviceType.exists({ _id: id }))) throw new Erro(400, 'Esse tipo de dispositivo não existe.');
}

export function rotasDispositivos() {
  const r = Router();
  r.param('id', idValido);
  const meu = async (req) => {
    const d = await Device.findOne({ _id: req.params.id, userId: req.user._id });
    if (!d) throw new Erro(404, 'Dispositivo não encontrado.');
    return d;
  };

  r.get('/', async (req, res) => {
    res.json(await Device.find({ userId: req.user._id }).populate('type', 'name icon').sort('name').lean());
  });

  r.post('/', validar(criar), async (req, res) => {
    const userId = req.user._id;
    await confirmarTipo(req.dados.type);
    const dados = { ...req.dados };
    if (!dados.mac) delete dados.mac;
    if (await Device.exists(dados.mac ? { userId, mac: dados.mac } : { userId, ip: dados.ip, mac: null })) {
      throw new Erro(409, 'Este dispositivo já está guardado.');
    }
    const d = await Device.create({ ...dados, userId });
    if (d.mac) await Alert.updateMany({ userId, dedupeKey: `novo_na_rede:${d.mac}`, active: true }, { active: false });
    res.status(201).json(await d.populate('type', 'name icon'));
  });

  r.patch('/:id', validar(alterar), async (req, res) => {
    const d = await meu(req);
    // Só os campos realmente enviados: o transform do MAC corre mesmo quando ele falta.
    const dados = Object.fromEntries(Object.entries(req.dados).filter(([k]) => Object.hasOwn(req.body, k)));
    await confirmarTipo(dados.type);
    if ('mac' in dados && !dados.mac) dados.mac = undefined;
    d.set(dados);
    await d.save();
    res.json(await d.populate('type', 'name icon'));
  });

  r.delete('/:id', async (req, res) => {
    const d = await meu(req);
    await Promise.all([Event, Alert, ScanLog].map((m) => m.deleteMany({ deviceId: d._id })));
    await d.deleteOne();
    res.status(204).end();
  });

  // A chave só é mostrada uma vez; na base fica apenas o resumo.
  r.post('/:id/chave', async (req, res) => {
    const d = await meu(req);
    const chave = `cdb_${randomBytes(24).toString('hex')}`;
    d.keyHash = resumoChave(chave);
    d.hasKey = true;
    await d.save();
    res.status(201).json({ chave });
  });

  r.delete('/:id/chave', async (req, res) => {
    const d = await meu(req);
    await Device.updateOne({ _id: d._id }, { $unset: { keyHash: '' }, $set: { hasKey: false } });
    res.status(204).end();
  });
  return r;
}
