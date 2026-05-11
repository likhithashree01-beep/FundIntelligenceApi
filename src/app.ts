import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { seed } from './db/seed';
import { requireAuth } from './middleware/auth';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import fundsRoutes from './routes/funds';

export const createApp = (): express.Express => {
  // Make sure the DB is created and the seed user/funds are in place before
  // any request lands. Idempotent — does nothing if the data is already there.
  seed();

  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/funds', apiLimiter, requireAuth, fundsRoutes);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
