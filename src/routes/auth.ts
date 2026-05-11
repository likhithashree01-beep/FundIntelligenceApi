import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config';
import { getDb } from '../db/database';
import { JwtPayload } from '../types';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
}

const issueTokens = (user: { id: number; email: string }) => {
  const base = { sub: String(user.id), email: user.email };
  const accessToken = jwt.sign(
    { ...base, type: 'access' } satisfies JwtPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl } as SignOptions,
  );
  const refreshToken = jwt.sign(
    { ...base, type: 'refresh' } satisfies JwtPayload,
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl } as SignOptions,
  );
  return { accessToken, refreshToken, tokenType: 'Bearer' as const };
};

router.post('/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }

  const db = getDb();
  const user = db
    .prepare<[string], UserRow>('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(parsed.data.email);

  if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json(issueTokens({ id: user.id, email: user.email }));
});

router.post('/refresh', (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  try {
    const payload = jwt.verify(parsed.data.refreshToken, config.jwt.refreshSecret) as JwtPayload;
    if (payload.type !== 'refresh') {
      res.status(401).json({ error: 'Wrong token type' });
      return;
    }
    res.json(issueTokens({ id: Number(payload.sub), email: payload.email }));
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

export default router;
