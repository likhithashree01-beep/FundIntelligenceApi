import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database';
import {
  FundDetail,
  FundSummary,
  NavPoint,
  PortfolioCompany,
} from '../types';

const router = Router();

interface FundRow {
  id: string;
  name: string;
  type: string;
  vintage: number;
  total_commitments: number;
  irr: number;
  tvpi: number;
  dpi: number;
  rvpi: number;
  nav: number;
}

interface NavRow {
  month: string;
  nav: number;
}

interface CompanyRow {
  id: string;
  name: string;
  sector: string;
  country: string;
  revenue: number;
  ebitda: number;
  ebitda_margin: number;
  status: string;
  investment_date: string;
  invested_capital: number;
  current_value: number;
}

const toFundSummary = (row: FundRow): FundSummary => ({
  id: row.id,
  name: row.name,
  type: row.type,
  vintage: row.vintage,
  totalCommitments: row.total_commitments,
  metrics: {
    irr: row.irr,
    tvpi: row.tvpi,
    dpi: row.dpi,
    rvpi: row.rvpi,
    nav: row.nav,
  },
});

const toCompany = (row: CompanyRow, flags: string[]): PortfolioCompany => ({
  id: row.id,
  name: row.name,
  sector: row.sector,
  country: row.country,
  revenue: row.revenue,
  ebitda: row.ebitda,
  ebitdaMargin: row.ebitda_margin,
  status: row.status,
  investmentDate: row.investment_date,
  investedCapital: row.invested_capital,
  currentValue: row.current_value,
  flags,
});

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

const performanceQuerySchema = z.object({
  from: monthSchema.optional(),
  to: monthSchema.optional(),
});

const portfolioQuerySchema = z.object({
  flag: z.string().min(1).max(32).optional(),
});

const loadCompaniesForFund = (fundId: string, flagFilter?: string): PortfolioCompany[] => {
  const db = getDb();

  let companies: CompanyRow[];
  if (flagFilter) {
    companies = db
      .prepare<[string, string], CompanyRow>(
        `SELECT pc.*
           FROM portfolio_companies pc
           JOIN portfolio_company_flags pcf ON pcf.company_id = pc.id
          WHERE pc.fund_id = ? AND pcf.flag = ?
          ORDER BY pc.name`,
      )
      .all(fundId, flagFilter);
  } else {
    companies = db
      .prepare<[string], CompanyRow>(
        `SELECT * FROM portfolio_companies WHERE fund_id = ? ORDER BY name`,
      )
      .all(fundId);
  }

  if (companies.length === 0) return [];

  const flagRows = db
    .prepare<string[], { company_id: string; flag: string }>(
      `SELECT company_id, flag
         FROM portfolio_company_flags
        WHERE company_id IN (${companies.map(() => '?').join(',')})`,
    )
    .all(...companies.map((c) => c.id));

  const flagsByCompany = new Map<string, string[]>();
  for (const row of flagRows) {
    const list = flagsByCompany.get(row.company_id) ?? [];
    list.push(row.flag);
    flagsByCompany.set(row.company_id, list);
  }

  return companies.map((c) => toCompany(c, flagsByCompany.get(c.id) ?? []));
};

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db
    .prepare<[], FundRow>('SELECT * FROM funds ORDER BY vintage DESC, name')
    .all();
  res.json({ funds: rows.map(toFundSummary) });
});

router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const fund = db
    .prepare<[string], FundRow>('SELECT * FROM funds WHERE id = ?')
    .get(req.params.id);

  if (!fund) {
    res.status(404).json({ error: 'Fund not found' });
    return;
  }

  const navHistory = db
    .prepare<[string], NavRow>(
      'SELECT month, nav FROM nav_history WHERE fund_id = ? ORDER BY month',
    )
    .all(fund.id) satisfies NavPoint[];

  const portfolioCompanies = loadCompaniesForFund(fund.id);

  const detail: FundDetail = {
    ...toFundSummary(fund),
    navHistory,
    portfolioCompanies,
  };

  res.json(detail);
});

router.get('/:id/performance', (req: Request, res: Response) => {
  const parsed = performanceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
    return;
  }

  const { from, to } = parsed.data;
  if (from && to && from > to) {
    res.status(400).json({ error: '`from` must be <= `to`' });
    return;
  }

  const db = getDb();
  const fund = db
    .prepare<[string], { id: string }>('SELECT id FROM funds WHERE id = ?')
    .get(req.params.id);
  if (!fund) {
    res.status(404).json({ error: 'Fund not found' });
    return;
  }

  const clauses: string[] = ['fund_id = ?'];
  const params: (string)[] = [req.params.id];
  if (from) {
    clauses.push('month >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('month <= ?');
    params.push(to);
  }

  const rows = db
    .prepare<string[], NavRow>(
      `SELECT month, nav FROM nav_history WHERE ${clauses.join(' AND ')} ORDER BY month`,
    )
    .all(...params);

  res.json({ fundId: req.params.id, from: from ?? null, to: to ?? null, navHistory: rows });
});

router.get('/:id/portfolio', (req: Request, res: Response) => {
  const parsed = portfolioQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params' });
    return;
  }

  const db = getDb();
  const fund = db
    .prepare<[string], { id: string }>('SELECT id FROM funds WHERE id = ?')
    .get(req.params.id);
  if (!fund) {
    res.status(404).json({ error: 'Fund not found' });
    return;
  }

  const companies = loadCompaniesForFund(req.params.id, parsed.data.flag);
  res.json({ fundId: req.params.id, flag: parsed.data.flag ?? null, portfolioCompanies: companies });
});

export default router;
