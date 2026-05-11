# Fund Intelligence API

Backend service for the Nordic Analytics Fund Intelligence Dashboard. Express + TypeScript on top of SQLite, with JWT auth (access + refresh tokens) and the funds.json dataset seeded on first boot.

## Repos

| Service | Repository |
| ------- | ---------- |
| Backend API (this repo) | https://github.com/likhithashree01-beep/FundIntelligenceApi |
| Frontend | https://github.com/likhithashree01-beep/FundIntelligenceWeb |

## Bonus features completed

All optional bonus items from the case study were implemented:

- **`GET /api/funds/:id/portfolio?flag=watch`** — filters portfolio companies by flag using an indexed junction-table query
- **Rate limiting** — tiered: 20 req / 15 min on auth routes, 120 req / min on API reads
- **`POST /api/auth/refresh`** — returns a new token pair; frontend silently retries on 401
- **Integration tests** — 6 tests covering auth, fund list, fund detail, performance range, flag filter, and 404 (see [Tests](#tests))
- **Structured logging** — Pino with per-request IDs, redacted auth headers, status-derived log levels, and silent mode in test

## Stack

- **Runtime:** Node.js 20+, TypeScript
- **HTTP:** Express
- **Database:** SQLite via `better-sqlite3` (synchronous, file-based, zero setup)
- **Auth:** `jsonwebtoken` + `bcryptjs`
- **Validation:** Zod on request bodies and query params
- **Rate limiting:** `express-rate-limit`
- **Logging:** Pino + pino-http (JSON in prod, pretty in dev) with automatic per-request IDs
- **Tests:** Vitest + Supertest

## (a) Getting started — both services

Both the API and frontend are separate repositories and must be started independently. Start the API first; the frontend proxies `/api/*` to `http://localhost:4000` in dev.

### 1. Start the API (this repo)

```bash
git clone https://github.com/likhithashree01-beep/FundIntelligenceApi
cd FundIntelligenceApi
npm install
cp .env.example .env        # optional — fallbacks work for local dev
npm run dev                 # http://localhost:4000
```

The SQLite file is created and seeded automatically on first boot (`./data/fund_intelligence.db`). No manual setup needed.

To reset and reseed:

```bash
rm -f data/fund_intelligence.db
npm run seed
```

### 2. Start the frontend

```bash
git clone https://github.com/likhithashree01-beep/FundIntelligenceWeb
cd FundIntelligenceWeb
npm install
cp .env.example .env
npm run dev                 # http://localhost:5173
```

Open **http://localhost:5173** and sign in with `demo@nordic.io` / `demo123`.

### Scripts (API)

| Command          | What it does                                    |
| ---------------- | ----------------------------------------------- |
| `npm run dev`    | Hot-reloading dev server via `tsx watch`        |
| `npm run build`  | Type-check + emit JS to `dist/`                 |
| `npm start`      | Run the compiled build                          |
| `npm run seed`   | Force re-seed the database from `funds.json`    |
| `npm test`       | Run the Vitest integration suite                |

## API

All `/api/funds/*` routes require `Authorization: Bearer <accessToken>`.

| Method | Path                                              | Description                                                   |
| ------ | ------------------------------------------------- | ------------------------------------------------------------- |
| POST   | `/api/auth/login`                                 | `{ email, password }` → `{ accessToken, refreshToken }`       |
| POST   | `/api/auth/refresh`                               | `{ refreshToken }` → new token pair                           |
| GET    | `/api/funds`                                      | List of fund summaries                                        |
| GET    | `/api/funds/:id`                                  | Full fund detail (navHistory + portfolioCompanies)            |
| GET    | `/api/funds/:id/performance?from=YYYY-MM&to=YYYY-MM` | NAV history for the fund, optionally bounded                |
| GET    | `/api/funds/:id/portfolio?flag=watch`             | Portfolio companies for the fund, optionally filtered by flag |
| GET    | `/api/health`                                     | `{ status: "ok" }` — for liveness probes                      |

Seeded credentials (mock user):

```
email:    demo@nordic.io
password: demo123
```

### Example

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@nordic.io","password":"demo123"}' \
  | jq -r .accessToken)

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/funds/fund-001/performance?from=2024-03&to=2024-06"
```

## Logs & observability

Every request gets an auto-generated `req.id` that propagates through every log line for that request — grep one ID to reconstruct a full request trace. Levels are derived automatically from the response status (`5xx → error`, `4xx → warn`, `2xx/3xx → info`).

**What gets logged**

| Event | Level | Includes |
| --- | --- | --- |
| Boot | `info` | port, env, db path (created vs reopened), seed counts + duration |
| Each request | by status | method, full URL, status, response time, request id |
| Login | `info` / `warn` | user id, email, ip, reason on failure (`bad_password` / `unknown_email`) |
| Token refresh | `info` / `warn` | user id, ip, reason on failure (`wrong type` / `invalid_token`) |
| Slow / large response | `warn` | duration > 200ms or body > 1MB |
| Unhandled 500 | `error` | stack, method, url, req id, user id (if authenticated) |
| Health checks | (silenced) | `/api/health` never logs |
| Tests | (silenced) | `NODE_ENV=test` sets the logger level to `silent` |

**Format**

- Development (`NODE_ENV=development`): pretty-printed, colorised, single multiline block per log.
- Production (`NODE_ENV=production`): one JSON line per log — ready for Loki, Datadog, CloudWatch, etc.

**Redaction**

`Authorization`, `Cookie`, and any field named `password*` / `password_hash` are replaced with `[redacted]` automatically — see [`src/logger.ts`](src/logger.ts). Bearer tokens never appear in logs.

## Database schema

See [`src/db/schema.sql`](src/db/schema.sql). Six tables, all created on boot:

- **`users`** — auth identities (bcrypt-hashed passwords).
- **`funds`** — one row per fund, including the headline metrics (irr, tvpi, dpi, rvpi, nav). Metrics live on the parent row because they're computed point-in-time snapshots, not a history.
- **`nav_history`** — month-keyed NAV points per fund. `UNIQUE(fund_id, month)` prevents duplicate entries on re-seed; a composite index on `(fund_id, month)` lets the performance endpoint serve range queries straight from the index.
- **`portfolio_companies`** — portfolio holdings per fund, indexed on `fund_id` for the detail-fetch path.
- **`portfolio_company_flags`** — flags promoted into a junction table (rather than a CSV column on `portfolio_companies`) so the `?flag=` filter can use an indexed equality match and so the model stays sane if we add many-to-many semantics later (e.g. flag metadata, who set it, when).

### Design decisions

- **Domain IDs as primary keys.** `fund-001`, `pc-001` come from the source data and are visible in the API surface — keeping them as `TEXT` primary keys avoids a lossy id mapping.
- **`ON DELETE CASCADE`** on every child table so removing a fund is one statement and doesn't leak orphans.
- **Monetary values stored as `INTEGER`.** Cents would be safer in production; the source data is whole-unit, so the schema mirrors it for fidelity.
- **`UNIQUE(fund_id, month)`** on `nav_history` enforces "one NAV per month per fund" at the DB level, which is the right place for that invariant.

## API design decisions & trade-offs

- **Two-token JWT auth.** Short-lived access token (15m) + longer refresh token (7d), signed with **different secrets** so a leak of one secret doesn't compromise the other. Tokens carry a `type: 'access' | 'refresh'` claim and the middleware refuses the wrong type — prevents using a refresh token to call API endpoints.
- **Stateless refresh.** No refresh-token store. Trade-off: I can't revoke a single session before its TTL expires; for a multi-tenant production system I'd back this with a small token-id table or Redis allow-list. For this case study, the simpler model wins.
- **Validation at the boundary.** Zod schemas guard every request body and query param so route handlers can trust their inputs. `YYYY-MM` is regex-validated and `from > to` is rejected explicitly.
- **camelCase API / snake_case DB.** API responses match the original `funds.json` shape; mapping happens in the route layer. Keeps the SQL idiomatic without leaking column names into the wire format.
- **Tiered rate limits.** Auth endpoints (20 req/15min) are tighter than API reads (120 req/min) — the asymmetry matches the real threat (credential stuffing) and the real traffic shape (a dashboard polling).
- **Idempotent seeding on boot.** `createApp()` calls `seed()` which is a no-op if data already exists. The reviewer doesn't need to remember to run `npm run seed` before `npm run dev`.

## What I'd build next for production

1. **Real user management.** Registration, password reset, roles (analyst / partner / admin), and audit logging for who looked at which fund.
2. **Refresh-token rotation + revocation.** Persist refresh-token IDs, rotate on every use, detect replay (same token used twice = compromise → force re-login).
3. **Pagination & filtering on `/api/funds`.** Three funds is fine; three thousand is not. Cursor pagination, sort, and filter by type/vintage/region.
4. **Computed analytics.** Currently the metrics are stored snapshots. In production they'd be derived from cash-flow and valuation tables on demand or materialised on a schedule.
5. **Caching.** ETags on detail endpoints, Redis for hot fund lookups.
6. **Deeper observability.** Pino + request IDs are in place; next steps are shipping logs to an aggregator (Loki / Datadog), OpenTelemetry traces across the API/DB, Prometheus metrics for latency/throughput/error rate, and Sentry for unhandled error tracking.
7. **Schema migrations.** Today the schema is one `schema.sql` applied with `CREATE TABLE IF NOT EXISTS`. Production needs versioned migrations (Drizzle, Prisma, or plain numbered SQL files) so schema changes are reviewable and reversible.
8. **PostgreSQL.** SQLite is great here; a multi-writer production workload wants Postgres for concurrent writes, richer types, partial indexes, and proper backup tooling.
9. **CORS + secrets hardening.** Tight origin allow-list, secrets from a vault rather than `.env`, signed-cookie session option for the frontend.
10. **Deeper test coverage.** Integration tests exist for the happy path and key error cases. Next: unit tests for the auth flow and query builders, e2e tests against a containerised Postgres, contract tests against an OpenAPI spec to catch frontend/backend drift early.

## Tests

6 integration tests running against a real SQLite database (temporary file, wiped per run):

| Test | Covers |
| ---- | ------ |
| Unauthenticated request | `GET /api/funds` returns 401 without a token |
| Fund list | Returns all 3 seeded funds with correct shape |
| Fund detail | Returns navHistory + portfolioCompanies for a known fund |
| Performance range | `?from=2024-03&to=2024-06` returns only the months in range |
| Flag filter | `?flag=watch` returns only companies with that flag |
| Unknown fund | `GET /api/funds/fund-999` returns 404 |

```bash
npm test
```

Tests use a separate `DATABASE_PATH` env var pointing to a temp file — the dev database is never touched.

## Environment variables

See [`.env.example`](.env.example). All variables have safe development fallbacks — the server will boot without a `.env` file, but the JWT secrets MUST be replaced in any non-local environment.
