import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { User } from '../models/index.js';

export const COOKIE = 'cdb_sessao';
const VALIDADE_S = 8 * 3600;

export class Erro extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const opcoes = () => ({ httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' });

export function iniciarSessao(res, user) {
  const token = jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.jwtSecret, { algorithm: 'HS256', expiresIn: VALIDADE_S });
  res.cookie(COOKIE, token, { ...opcoes(), maxAge: VALIDADE_S * 1000 });
}
export const terminarSessao = (res) => res.clearCookie(COOKIE, opcoes());

export async function autenticado(req, _res, next) {
  let dados;
  try { dados = jwt.verify(req.cookies?.[COOKIE] || '', config.jwtSecret, { algorithms: ['HS256'] }); } catch { throw new Erro(401, 'Inicia sessão para continuar.'); }
  const user = await User.findById(dados.sub);
  if (!user || user.disabled || (user.tokenVersion || 0) !== dados.v) throw new Erro(401, 'A sessão terminou. Inicia sessão outra vez.');
  req.user = user;
  next();
}

export function administrador(req, _res, next) {
  if (!req.user?.isAdmin) throw new Erro(403, 'Só os administradores podem fazer isto.');
  next();
}

/** Um formulário noutro site não consegue enviar este cabeçalho. */
export function contraCsrf(req, _res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-caradbela') !== '1') throw new Erro(403, 'Pedido recusado.');
  next();
}

export const validar = (esquema) => (req, _res, next) => {
  const r = esquema.safeParse(req.body ?? {});
  if (!r.success) throw new Erro(400, r.error.issues[0].message);
  req.dados = r.data;
  next();
};

export const idValido = (_req, _res, next, id) => {
  next(/^[0-9a-f]{24}$/i.test(id) ? undefined : new Erro(404, 'Não encontrado.'));
};

export const esquemaNome = z.string({ error: 'Indica o nome de utilizador.' }).trim()
  .regex(/^[\p{L}\p{N}_.-]{3,32}$/u, 'O nome de utilizador deve ter 3 a 32 letras, números, pontos, hífenes ou _.');
export const esquemaPasse = z.string({ error: 'Indica a palavra-passe.' }).min(10, 'A palavra-passe deve ter pelo menos 10 caracteres.')
  .refine((p) => Buffer.byteLength(p) <= 72, 'A palavra-passe é demasiado longa (máximo 72 bytes).');

export function tratarErros(err, _req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof Erro) return res.status(err.status).json({ message: err.message });
  if (err.code === 11000) return res.status(409).json({ message: 'Já existe um registo com esses dados.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Pedido inválido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Pedido demasiado grande.' });
  console.error(err);
  res.status(500).json({ message: 'Erro no servidor. Vê o registo para detalhes.' });
}
