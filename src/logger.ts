import pino, { LoggerOptions } from 'pino';
import { config } from './config';

const isProd = config.nodeEnv === 'production';
const isTest = config.nodeEnv === 'test';

const baseOptions: LoggerOptions = {
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',
  base: { service: 'fund-intelligence-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
    ],
    censor: '[redacted]',
  },
};

// In dev, pretty-print to the terminal; in prod, emit one JSON line per log so
// log aggregators (Datadog/Loki/CloudWatch) can ingest cleanly.
export const logger = isProd
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,service',
          singleLine: false,
        },
      },
    });
