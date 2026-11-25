// Os nomes das coleções são os da versão 1, para os dados antigos continuarem a servir.
import mongoose from 'mongoose';
import { config } from '../config.js';

const { Schema } = mongoose;
const ref = (nome, extra = {}) => ({ type: Schema.Types.ObjectId, ref: nome, ...extra });

export const User = mongoose.model('User', new Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 },
}), 'users');

export const DeviceType = mongoose.model('DeviceType', new Schema({
  name: { type: String, unique: true, required: true },
  icon: String,
  createdAt: { type: Date, default: Date.now },
}), 'devicetypes');

const deviceSchema = new Schema({
  userId: ref('User', { required: true, index: true }),
  ip: String,
  mac: String,
  name: { type: String, required: true },
  type: ref('DeviceType', { default: null }),
  ssid: String,
  trust: { type: String, enum: ['desconhecido', 'confiavel', 'isolado'], default: 'desconhecido' },
  schedule: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '08:00' },
    end: { type: String, default: '23:00' },
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  },
  keyHash: { type: String, select: false },
  hasKey: { type: Boolean, default: false },
  addedAt: { type: Date, default: Date.now },
  lastSeenAt: Date,
});
deviceSchema.index({ userId: 1, mac: 1 }, { unique: true, partialFilterExpression: { mac: { $type: 'string' } } });
deviceSchema.index({ keyHash: 1 }, { unique: true, partialFilterExpression: { keyHash: { $type: 'string' } } });
export const Device = mongoose.model('Device', deviceSchema, 'saveddevices');

const eventSchema = new Schema({
  userId: ref('User', { required: true }),
  deviceId: ref('Device', { required: true }),
  kind: { type: String, required: true },
  sourceIp: String,
  sourceMac: String,
  detail: String,
  at: { type: Date, default: Date.now },
});
eventSchema.index({ userId: 1, at: -1 });
eventSchema.index({ deviceId: 1, at: -1 });
eventSchema.index({ at: 1 }, { expireAfterSeconds: config.eventosDias * 86400 });
export const Event = mongoose.model('Event', eventSchema, 'events');

const alertSchema = new Schema({
  userId: ref('User', { required: true }),
  deviceId: ref('Device', { default: null }),
  rule: { type: String, required: true },
  severity: { type: String, enum: ['media', 'alta', 'critica'], required: true },
  title: { type: String, required: true },
  detail: String,
  dedupeKey: { type: String, required: true },
  count: { type: Number, default: 1 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastAt: { type: Date, default: Date.now },
});
alertSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { active: true } });
alertSchema.index({ userId: 1, active: 1, lastAt: -1 });
export const Alert = mongoose.model('Alert', alertSchema, 'alerts');

export const ScanLog = mongoose.model('ScanLog', new Schema({
  userId: ref('User', { index: true }),
  deviceId: ref('Device'),
  ipScanned: String,
  scanType: String,
  status: { type: String, enum: ['a_correr', 'concluida', 'falhou'], default: 'concluida' },
  error: String,
  results: Object,
  timestamp: { type: Date, default: Date.now },
}), 'securityscanlogs');

export const Report = mongoose.model('Report', new Schema({
  ip: String, username: String, reason: String, date: { type: Date, default: Date.now },
}), 'reports');

export const TIPOS_INICIAIS = [
  ['PC', '💻'], ['Telemóvel', '📱'], ['Tablet', '📱'], ['Tomada Inteligente', '🔌'], ['Aspirador', '🧹'],
  ['Router', '📶'], ['TV', '📺'], ['Câmara', '📷'], ['Fechadura', '🔒'], ['Sensor', '🌡️'],
];

export async function ligar(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  } catch (e) {
    if (e.name !== 'MongooseServerSelectionError') throw e;
    console.error(`Não consegui ligar ao MongoDB (${uri.replace(/\/\/[^@/]*@/, '//***@')}). Confirma que está instalado e a correr. Sem MongoDB instalado, usa: npm run local`);
    process.exit(1);
  }
}

export async function prepararBase() {
  await Promise.all([User, DeviceType, Device, Event, Alert, ScanLog].map((m) => m.createIndexes()));
  // Só na primeira utilização: assim um tipo que o administrador apagou não volta a aparecer.
  if (!(await DeviceType.exists({}))) {
    await DeviceType.insertMany(TIPOS_INICIAIS.map(([name, icon]) => ({ name, icon })));
  }
  await ScanLog.updateMany({ status: 'a_correr' }, { status: 'falhou', error: 'O servidor reiniciou durante a análise.' });
}
