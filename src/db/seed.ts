import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { SeedDataset } from '../types';
import { getDb } from './database';

const DATASET_PATH = path.resolve(__dirname, '../data/funds.json');

const loadDataset = (): SeedDataset => {
  const raw = fs.readFileSync(DATASET_PATH, 'utf8');
  return JSON.parse(raw) as SeedDataset;
};

export const seed = (options: { force?: boolean } = {}): void => {
  const db = getDb();

  const fundCount = (db.prepare('SELECT COUNT(*) AS n FROM funds').get() as { n: number }).n;
  const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;

  if (!options.force && fundCount > 0 && userCount > 0) {
    return;
  }

  const dataset = loadDataset();

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash) VALUES (?, ?)`,
  );
  const insertFund = db.prepare(
    `INSERT OR REPLACE INTO funds
       (id, name, type, vintage, total_commitments, irr, tvpi, dpi, rvpi, nav)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertNav = db.prepare(
    `INSERT OR REPLACE INTO nav_history (fund_id, month, nav) VALUES (?, ?, ?)`,
  );
  const insertCompany = db.prepare(
    `INSERT OR REPLACE INTO portfolio_companies
       (id, fund_id, name, sector, country, revenue, ebitda, ebitda_margin,
        status, investment_date, invested_capital, current_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const deleteFlags = db.prepare(`DELETE FROM portfolio_company_flags WHERE company_id = ?`);
  const insertFlag = db.prepare(
    `INSERT OR IGNORE INTO portfolio_company_flags (company_id, flag) VALUES (?, ?)`,
  );

  const run = db.transaction(() => {
    const hash = bcrypt.hashSync(config.seedUser.password, 10);
    insertUser.run(config.seedUser.email, hash);

    for (const fund of dataset.funds) {
      insertFund.run(
        fund.id,
        fund.name,
        fund.type,
        fund.vintage,
        fund.totalCommitments,
        fund.metrics.irr,
        fund.metrics.tvpi,
        fund.metrics.dpi,
        fund.metrics.rvpi,
        fund.metrics.nav,
      );

      for (const point of fund.navHistory) {
        insertNav.run(fund.id, point.month, point.nav);
      }

      for (const company of fund.portfolioCompanies) {
        insertCompany.run(
          company.id,
          fund.id,
          company.name,
          company.sector,
          company.country,
          company.revenue,
          company.ebitda,
          company.ebitdaMargin,
          company.status,
          company.investmentDate,
          company.investedCapital,
          company.currentValue,
        );
        deleteFlags.run(company.id);
        for (const flag of company.flags) {
          insertFlag.run(company.id, flag);
        }
      }
    }
  });

  run();
};

if (require.main === module) {
  seed({ force: true });
  // eslint-disable-next-line no-console
  console.log(`Seeded ${config.databasePath}`);
}
