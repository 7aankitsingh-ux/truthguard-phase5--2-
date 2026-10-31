import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { apiLimiter, originCheck } from './middleware/security.js';
import { errorHandler, notFound } from './middleware/error.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter, originCheck, routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
