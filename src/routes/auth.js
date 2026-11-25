import { randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { autenticado, Erro, esquemaNome, esquemaPasse, iniciarSessao, terminarSessao, validar } from '../middleware/index.js';
import { Report, User } from '../models/index.js';
import { Tentativas } from '../services/tentativas.js';

export const codigoInstalacao = randomBytes(6).toString('hex');
const HASH_FALSO = bcrypt.hashSync('nunca-corresponde', 12);
const publico = (u) => ({ id: u._id, username: u.username, isAdmin: u.isAdmin });
export const haAdmin = () => User.exists({ isAdmin: true, disabled: { $ne: true } });

export function rotasAuth() {
  const r = Router();
  const tentativas = new Tentativas();
  const limite = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Demasiados pedidos. Espera um minuto.' } });
  let aInstalar = false;

  r.get('/estado', async (_req, res) => {
    res.json({ instalar: !(await haAdmin()), permitirRegisto: config.permitirRegisto });
  });

  r.post('/instalar', limite, validar(z.object({ username: esquemaNome, password: esquemaPasse, codigo: z.string({ error: 'Indica o código de instalação.' }) })), async (req, res) => {
    const { username, password, codigo } = req.dados;
    const a = Buffer.from(codigo.trim());
    const b = Buffer.from(codigoInstalacao);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Erro(403, 'O código não está certo. Copia-o da consola do servidor.');
    if (aInstalar) throw new Erro(409, 'A instalação já foi feita.');
    aInstalar = true;
    try {
      if (await haAdmin()) throw new Erro(409, 'A instalação já foi feita.');
      const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 12), isAdmin: true });
      iniciarSessao(res, user);
      res.status(201).json(publico(user));
    } finally { aInstalar = false; }
  });

  r.post('/registar', limite, validar(z.object({ username: esquemaNome, password: esquemaPasse })), async (req, res) => {
    if (!config.permitirRegisto) throw new Erro(403, 'O registo está desligado. Pede conta a um administrador.');
    const { username, password } = req.dados;
    if (await User.exists({ username })) throw new Erro(409, 'Esse nome de utilizador já existe.');
    const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 12) });
    iniciarSessao(res, user);
    res.status(201).json(publico(user));
  });

  const credenciais = z.object({
    username: z.string({ error: 'Indica o nome de utilizador.' }).trim().min(1, 'Indica o nome de utilizador.').max(64),
    password: z.string({ error: 'Indica a palavra-passe.' }).min(1, 'Indica a palavra-passe.').max(200),
  });
  r.post('/entrar', limite, validar(credenciais), async (req, res) => {
    const { username, password } = req.dados;
    const chave = `${req.ip}|${username}`;
    const espera = tentativas.espera(chave);
    if (espera) throw new Erro(429, `Demasiadas tentativas. Tenta de novo dentro de ${espera} segundos.`);
    const user = await User.findOne({ username });
    const certo = await bcrypt.compare(password, user?.passwordHash || HASH_FALSO);
    if (!user || !certo || user.disabled) {
      const { falhas, bloqueioMin } = tentativas.falhou(chave);
      if (bloqueioMin) await Report.create({ ip: req.ip, username, reason: `${falhas} tentativas falhadas. Bloqueado por ${bloqueioMin} min.` });
      throw new Erro(401, 'Utilizador ou palavra-passe errados.');
    }
    tentativas.limpar(chave);
    iniciarSessao(res, user);
    res.json(publico(user));
  });

  r.post('/sair', (_req, res) => { terminarSessao(res); res.status(204).end(); });
  r.get('/eu', autenticado, (req, res) => res.json(publico(req.user)));

  r.put('/palavra-passe', limite, autenticado, validar(z.object({ atual: z.string().max(200), nova: esquemaPasse })), async (req, res) => {
    if (!(await bcrypt.compare(req.dados.atual, req.user.passwordHash))) throw new Erro(400, 'A palavra-passe atual não está certa.');
    req.user.passwordHash = await bcrypt.hash(req.dados.nova, 12);
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1; // termina as outras sessões
    await req.user.save();
    iniciarSessao(res, req.user);
    res.status(204).end();
  });
  return r;
}
