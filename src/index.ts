import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'api listening');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutdown: closing server');
  server.close(() => {
    logger.info('shutdown: server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
