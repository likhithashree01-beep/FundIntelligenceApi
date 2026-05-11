import fs from 'fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { closeDb } from '../src/db/database';

const app = createApp();

const login = async (): Promise<string> => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'demo@nordic.io', password: 'demo123' });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
};

afterAll(() => {
  closeDb();
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(`${dbPath}${suffix}`);
      } catch {
        // ignore cleanup errors
      }
    }
  }
});

describe('funds API', () => {
  let token: string;

  beforeAll(async () => {
    token = await login();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/funds');
    expect(res.status).toBe(401);
  });

  it('returns the seeded fund list', async () => {
    const res = await request(app).get('/api/funds').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.funds)).toBe(true);
    expect(res.body.funds.length).toBe(3);
    const ids = res.body.funds.map((f: { id: string }) => f.id).sort();
    expect(ids).toEqual(['fund-001', 'fund-002', 'fund-003']);
    expect(res.body.funds[0].metrics).toHaveProperty('irr');
  });

  it('returns fund detail with navHistory and portfolioCompanies', async () => {
    const res = await request(app)
      .get('/api/funds/fund-001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('fund-001');
    expect(res.body.navHistory).toHaveLength(12);
    expect(res.body.portfolioCompanies).toHaveLength(3);
  });

  it('filters performance by date range', async () => {
    const res = await request(app)
      .get('/api/funds/fund-001/performance?from=2024-03&to=2024-06')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.navHistory).toHaveLength(4);
    expect(res.body.navHistory[0].month).toBe('2024-03');
    expect(res.body.navHistory[3].month).toBe('2024-06');
  });

  it('filters portfolio companies by flag', async () => {
    const res = await request(app)
      .get('/api/funds/fund-001/portfolio?flag=at-risk')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.portfolioCompanies).toHaveLength(1);
    expect(res.body.portfolioCompanies[0].id).toBe('pc-003');
    expect(res.body.portfolioCompanies[0].flags).toContain('at-risk');
  });

  it('404s on unknown fund', async () => {
    const res = await request(app)
      .get('/api/funds/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
