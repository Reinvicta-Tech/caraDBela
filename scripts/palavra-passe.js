// npm run palavra-passe -- <utilizador>   Gera uma palavra-passe nova e desbloqueia a conta.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { ligar, User } from '../src/models/index.js';

const username = process.argv[2];
if (!username) {
  console.error('Indica o utilizador: npm run palavra-passe -- admin');
  process.exit(1);
}
await ligar(config.mongo);
const nova = randomBytes(12).toString('base64url');
const u = await User.findOneAndUpdate({ username }, { $set: { passwordHash: await bcrypt.hash(nova, 12), disabled: false }, $inc: { tokenVersion: 1 } });
console.log(u ? `Nova palavra-passe de ${username}: ${nova}` : `O utilizador ${username} não existe.`);
await mongoose.disconnect();
process.exitCode = u ? 0 : 1;
