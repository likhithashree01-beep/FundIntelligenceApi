-- Nordic Analytics Fund Intelligence — SQLite schema
-- Design notes:
--   * funds.id and portfolio_companies.id are kept as TEXT to preserve the
--     domain identifiers from the source dataset (fund-001, pc-001). These
--     IDs are visible in the API surface, so opaque-but-stable beats
--     auto-incrementing integers.
--   * nav_history and portfolio_companies are 1:N children of funds with
--     ON DELETE CASCADE — deleting a fund removes its history cleanly.
--   * Flags live in a separate junction table rather than a CSV column so we
--     can filter by flag with a real index (see /api/funds/:id/portfolio?flag=).
--   * Monetary values are stored as INTEGER (cents would be safer in prod;
--     the source data is in whole units so we mirror it).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS funds (
  id                  TEXT    PRIMARY KEY,
  name                TEXT    NOT NULL,
  type                TEXT    NOT NULL,
  vintage             INTEGER NOT NULL,
  total_commitments   INTEGER NOT NULL,
  irr                 REAL    NOT NULL,
  tvpi                REAL    NOT NULL,
  dpi                 REAL    NOT NULL,
  rvpi                REAL    NOT NULL,
  nav                 INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nav_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id  TEXT    NOT NULL,
  month    TEXT    NOT NULL,     -- ISO YYYY-MM, lexicographically sortable
  nav      INTEGER NOT NULL,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE,
  UNIQUE (fund_id, month)
);

-- Performance endpoint filters by fund_id and a month range, so a composite
-- index on (fund_id, month) lets SQLite serve the query from the index alone.
CREATE INDEX IF NOT EXISTS idx_nav_history_fund_month
  ON nav_history(fund_id, month);

CREATE TABLE IF NOT EXISTS portfolio_companies (
  id                TEXT    PRIMARY KEY,
  fund_id           TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  sector            TEXT    NOT NULL,
  country           TEXT    NOT NULL,
  revenue           INTEGER NOT NULL,
  ebitda            INTEGER NOT NULL,
  ebitda_margin     REAL    NOT NULL,
  status            TEXT    NOT NULL,
  investment_date   TEXT    NOT NULL,   -- ISO YYYY-MM-DD
  invested_capital  INTEGER NOT NULL,
  current_value     INTEGER NOT NULL,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portfolio_companies_fund
  ON portfolio_companies(fund_id);

CREATE TABLE IF NOT EXISTS portfolio_company_flags (
  company_id TEXT NOT NULL,
  flag       TEXT NOT NULL,
  PRIMARY KEY (company_id, flag),
  FOREIGN KEY (company_id) REFERENCES portfolio_companies(id) ON DELETE CASCADE
);

-- Flag filtering across the dataset (e.g. show all watch-listed companies)
-- would scan without this index.
CREATE INDEX IF NOT EXISTS idx_portfolio_company_flags_flag
  ON portfolio_company_flags(flag);
