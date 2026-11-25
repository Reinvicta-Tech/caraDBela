import { EventEmitter } from 'node:events';
import { Alert } from '../models/index.js';

/** Canal interno: diz ao ecrã de cada utilizador o que mudou. */
export const canal = new EventEmitter().setMaxListeners(0);
export const avisar = (userId, tipo, dados = {}) => canal.emit('mudanca', { userId: String(userId), tipo, dados });

export async function registarAlerta(userId, deviceId, { dedupeKey, severity, title, detail, rule }) {
  const gravar = () => Alert.findOneAndUpdate(
    { userId, dedupeKey, active: true },
    { $set: { severity, title, detail, lastAt: new Date() }, $inc: { count: 1 }, $setOnInsert: { deviceId, rule, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false },
  );
  let doc;
  // Dois eventos simultâneos podem tentar criar o mesmo alerta; o segundo passa a atualizar.
  try { doc = await gravar(); } catch (e) { if (e.code !== 11000) throw e; doc = await gravar(); }
  avisar(userId, 'alerta', { title, severity });
  return doc;
}
