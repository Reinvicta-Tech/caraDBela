import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config, RAIZ } from './config.js';
import { autenticado, contraCsrf, Erro, tratarErros } from './middleware/index.js';
import { rotasAdmin, rotasTipos } from './routes/admin.js';
import { rotasAuth } from './routes/auth.js';
import { rotasDispositivos } from './routes/dispositivos.js';
import { rotasReceber, rotasVigilancia } from './routes/vigilancia.js';

export function criarApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    hsts: config.cookieSecure,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], styleSrc: ["'self'"], fontSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
  }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/saude', (_req, res) => {
    const ok = mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({ ok });
  });
  app.use('/api/receber', rotasReceber());

  const api = express.Router();
  api.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, cookieParser(), contraCsrf);
  api.use('/auth', rotasAuth());
  api.use(autenticado);
  api.use('/dispositivos', rotasDispositivos());
  api.use('/tipos', rotasTipos());
  api.use('/admin', rotasAdmin());
  api.use(rotasVigilancia());
  api.use(() => { throw new Erro(404, 'Não encontrado.'); });
  app.use('/api', api);

  app.use(express.static(path.join(RAIZ, 'public')));
  app.use((_req, res) => res.status(404).type('text').send('Não encontrado.'));
  app.use(tratarErros);
  return app;
}
