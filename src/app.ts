import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { config } from './config';
import { seed } from './db/seed';
import { logger } from './logger';
import { requireAuth } from './middleware/auth';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import fundsRoutes from './routes/funds';

const SLOW_RESPONSE_MS = 200;
const LARGE_RESPONSE_BYTES = 1024 * 1024;

export const createApp = (): express.Express => {
  // Make sure the DB is created and the seed user/funds are in place before
  // any request lands. Idempotent — does nothing if the data is already there.
  seed();

  const app = express();

  // pino-http auto-generates a request id, attaches `req.log`, and emits one
  // structured log per request. Custom serializers keep the line compact in dev
  // while still emitting a single structured object that aggregators can index.
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res) =>
        `${req.method} ${(req as { originalUrl?: string }).originalUrl ?? req.url} ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${(req as { originalUrl?: string }).originalUrl ?? req.url} ${res.statusCode} ${err.message}`,
      serializers: {
        req: (req: { id?: string | number; method?: string; url?: string; originalUrl?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.originalUrl ?? req.url,
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      // Health checks are noisy and never useful in logs.
      autoLogging: {
        ignore: (req) => req.url === '/api/health',
      },
    }),
  );

  // Surface anomalies the request log alone won't make obvious.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const sizeHeader = res.getHeader('content-length');
      const size = Number(sizeHeader ?? 0);

      if (durationMs > SLOW_RESPONSE_MS) {
        req.log.warn({ durationMs: Math.round(durationMs) }, 'slow response');
      }
      if (size > LARGE_RESPONSE_BYTES) {
        req.log.warn({ sizeBytes: size }, 'large response');
      }
    });
    next();
  });

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
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log.error(
      {
        err,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.sub,
      },
      'unhandled error',
    );
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
};
