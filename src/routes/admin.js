import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { administrador, Erro, esquemaNome, esquemaPasse, idValido, validar } from '../middleware/index.js';
import { Alert, Device, DeviceType, Event, Report, ScanLog, User } from '../models/index.js';

const esquemaTipo = z.object({
  name: z.string({ error: 'Indica o nome do tipo.' }).trim().min(1, 'Indica o nome do tipo.').max(40, 'O nome é demasiado longo.'),
  icon: z.string().trim().max(8, 'O ícone deve ser um único emoji.').optional(),
});

export function rotasTipos() {
  const r = Router();
  r.param('id', idValido);
  r.get('/', async (_req, res) => res.json(await DeviceType.find().sort('name').lean()));
  r.post('/', administrador, validar(esquemaTipo), async (req, res) => res.status(201).json(await DeviceType.create(req.dados)));
  r.delete('/:id', administrador, async (req, res) => {
    await Device.updateMany({ type: req.params.id }, { type: null });
    await DeviceType.deleteOne({ _id: req.params.id });
    res.status(204).end();
  });
  return r;
}

export function rotasAdmin() {
  const r = Router();
  r.use(administrador);
  r.param('id', idValido);

  r.get('/utilizadores', async (_req, res) => {
    const [users, contagem] = await Promise.all([
      User.find({}, 'username isAdmin disabled').sort('username').lean(),
      Device.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }]),
    ]);
    const mapa = new Map(contagem.map((c) => [String(c._id), c.n]));
    res.json(users.map((u) => ({ ...u, dispositivos: mapa.get(String(u._id)) || 0 })));
  });

  r.post('/utilizadores', validar(z.object({ username: esquemaNome, password: esquemaPasse, isAdmin: z.boolean().default(false) })), async (req, res) => {
    const { username, password, isAdmin } = req.dados;
    if (await User.exists({ username })) throw new Erro(409, 'Esse nome de utilizador já existe.');
    const u = await User.create({ username, isAdmin, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ _id: u._id, username, isAdmin });
  });

  r.patch('/utilizadores/:id', validar(z.object({ isAdmin: z.boolean(), disabled: z.boolean() }).partial()), async (req, res) => {
    if (req.user._id.equals(req.params.id)) throw new Erro(400, 'Não podes alterar a tua própria conta aqui.');
    const u = await User.findByIdAndUpdate(req.params.id, { $set: req.dados, $inc: { tokenVersion: 1 } });
    if (!u) throw new Erro(404, 'Utilizador não encontrado.');
    res.status(204).end();
  });

  r.delete('/utilizadores/:id', async (req, res) => {
    const userId = req.params.id;
    if (req.user._id.equals(userId)) throw new Erro(400, 'Não podes apagar a tua própria conta.');
    await User.deleteOne({ _id: userId });
    await Promise.all([Device, Event, Alert, ScanLog].map((m) => m.deleteMany({ userId })));
    res.status(204).end();
  });

  r.get('/dispositivos', async (_req, res) => {
    const lista = await Device.find({}, 'name ip mac addedAt userId').populate('userId', 'username').sort('-addedAt').limit(500).lean();
    res.json(lista.map(({ userId, ...d }) => ({ ...d, username: userId?.username || '' })));
  });

  r.get('/abusos', async (_req, res) => res.json(await Report.find().sort('-date').limit(200).lean()));
  return r;
}
