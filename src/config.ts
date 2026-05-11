import 'dotenv/config';
import path from 'path';

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const backendRoot = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  databasePath: path.isAbsolute(process.env.DATABASE_PATH ?? '')
    ? process.env.DATABASE_PATH!
    : path.resolve(backendRoot, process.env.DATABASE_PATH ?? './data/fund_intelligence.db'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  seedUser: {
    email: process.env.SEED_USER_EMAIL ?? 'demo@nordic.io',
    password: process.env.SEED_USER_PASSWORD ?? 'demo123',
  },
};
