# ReconPay AI

ReconPay AI is a working B2B invoice-verification and three-way reconciliation application. It converts vendor invoices into structured data, compares them with purchase orders and goods receipts using deterministic rules, records source evidence, supports vendor proposals and internal approvals, and can execute an approved settlement through the real PayPal Orders API when sandbox credentials are configured.

The product is intentionally conservative about money and automation:

- Financial amounts are exact integer minor units. Quantities are exact integer milli-units. No financial calculation uses floating point.
- The reconciliation engine decides findings and calculations. AI may extract invoice fields or explain an existing result, but it never calculates a settlement, decides a discrepancy, or authorises a payment.
- Amounts confirmed as paid come from a verified PayPal response, not from a browser redirect or an optimistic local update.
- A short delivery or price variance is presented as **flagged exposure** or a **review signal**, not as a vendor liability or an automatically reduced payable.

## Verified status

Last verified in this workspace on 7 November 2026:

| Check | Result |
| --- | --- |
| `npm run db:reset` with local PGlite | Passed; two demo organisations seeded |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with no warnings |
| `npm test` | 42 unit/integration tests passed |
| `npm run build` | Production build passed |
| `npm run e2e` | 10 Playwright tests passed (Chromium) |
| Local production server (`next start`) | Started and served the seeded app |

Live third-party execution was **not** verified because no credentials were available in this environment:

| Integration | Current state |
| --- | --- |
| OpenAI | Adapter and strict-schema flow implemented; no live API call verified. Without a key the app uses a clearly labelled deterministic PDF text parser and rules-based evidence summaries. |
| PayPal sandbox | Real OAuth, Orders v2 create/capture, return/cancel and webhook verification are implemented; no live sandbox payment was executed. Payments are disabled until credentials exist. |
| Supabase PostgreSQL/Storage | Adapters exist; only local PGlite and local private file storage were exercised. |
| Vercel deployment | Not deployed. A deployment checklist is provided, but no deployment is claimed. |
| Sentry | `SENTRY_DSN` is reserved in the environment model. Sentry is not wired into this build, so do not treat error monitoring as enabled. |
| Resend email | Adapter implemented; without a key, messages are printed to the development server console only. |

## Feature map

- Public landing page, registration, sign-in/out, password reset, protected application shell.
- Multiple organisations per user with an explicit organisation switcher and server-side membership checks.
- Roles: `ADMIN`, `FINANCE_MANAGER`, `VENDOR`; separation of duties for settlement approval and vendor-scoped data access.
- Invoice upload with magic-byte validation, private storage, source SHA-256 hashes, deterministic local PDF text extraction, optional OpenAI structured extraction, human verification, duplicate detection and line-item editing.
- Purchase orders and goods receipts with exact quantities, damaged quantities, inspection state and vendor/PO matching.
- Versioned deterministic reconciliation rules with stored run snapshots, source references, open/resolved/disputed findings, evidence events and timelines.
- Evidence centre with human-readable reports and generated PDF evidence packs.
- Settlement proposals, submit/approve, finance approval limits, vendor acceptance/clarification links, ready-for-payment gate and payment history.
- PayPal sandbox payment initiation, provider redirect, server-side capture, webhook signature verification, provider-event idempotency and server-side amount/currency checks.
- Reports for invoices, discrepancies, reconciliation, settlements, payments and audit; CSV export with UTF-8 BOM and spreadsheet-formula neutralisation.
- Audit trail, notifications, global search, team invitations, organisation settings and integration connectivity tests.
- Responsive light-content/navy-sidebar UI. Dashboard metrics are read from the database. Empty, loading and error states are implemented.

## Technology

- Next.js 15 App Router, React 19, strict TypeScript
- Tailwind CSS with hand-built shadcn-style components and Lucide icons
- Recharts for the real monthly invoice chart
- React Hook Form and Zod
- Drizzle ORM
- PostgreSQL in production, with PGlite as the zero-setup local PostgreSQL-compatible database
- OpenAI Responses API adapter (optional)
- PayPal Orders v2 sandbox/live REST API (optional)
- Vitest and Playwright

## Quick start

Prerequisites: Node.js 20+ (this workspace uses Node 24.22) and npm.

```bash
npm install
cp .env.example .env.local
# Replace AUTH_SECRET and APP_ENCRYPTION_KEY with long random values.
npm run db:reset
npm run dev
```

Open <http://localhost:3000>.

`db:reset` is destructive and intentionally refuses an external `DATABASE_URL` or `NODE_ENV=production`. Stop the dev server before resetting the local PGlite database.

## Demo accounts

`DEMO_MODE=true` and the labelled demo organisations are both required before credentials are shown in the UI.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.reconpay.ai` | `ReconPay!2026` |
| Finance Manager | `finance@demo.reconpay.ai` | `ReconPay!2026` |
| Vendor (ABC Office Supplies) | `vendor@demo.reconpay.ai` | `ReconPay!2026` |

The seed creates two organisations so currencies are never aggregated:

- **ReconPay Demo (INR)**: `PO-2026-001`, `GR-2026-001`, `INV-2026-001`; 100 chairs ordered at INR 5,000, 90 usable received, 10 short, INR 50,000 potential quantity exposure. Also includes a clean match, a price variance and a pending approval proposal.
- **ReconPay Demo (USD)**: `INV-2026-101` and `STL-2026-0001` in `READY_FOR_PAYMENT` state. PayPal execution remains blocked until real sandbox credentials are configured. No payment is seeded.

See [docs/DEMO.md](docs/DEMO.md) for the exact scenarios and expected values,
and [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for an 8–10 minute presentation
walkthrough.

## Deploy the demo

A Render Blueprint is included at [`render.yaml`](render.yaml). It provisions a
Node web service and expects Supabase PostgreSQL, a private Supabase Storage
bucket and a PayPal sandbox REST app.

- App database: Supabase transaction pooler on port `6543` (`DATABASE_URL`)
- Migrations: Supabase direct/session connection on port `5432`
  (`MIGRATION_DATABASE_URL`)
- First deploy: migrations run on boot and the labelled demo data is seeded once
  through Render's `initialDeployHook`
- Public demo mode: `DEMO_MODE=true` and `ALLOW_DEMO_SEED=true`

Follow the complete checklist in [docs/RENDER.md](docs/RENDER.md). It includes
the PayPal webhook registration and post-deploy verification steps. A Render or
Supabase deployment is not claimed until those checks have actually passed.


## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # production server
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # Vitest unit/integration tests
npm run e2e          # Playwright E2E tests (seed demo data first)
npm run db:reset     # delete local PGlite DB/storage, migrate and seed
npm run db:migrate   # apply/check migrations
npm run db:seed      # seed only if demo organisations do not already exist
npm run db:generate  # generate a new Drizzle migration after schema changes
```

E2E prerequisites:

```bash
npm run db:reset
npx playwright install chromium   # once
npm run e2e
```

The Playwright configuration reuses an existing development server on port 3000 outside CI. The test setup authenticates the administrator and vendor once via the login API and reuses their storage state, avoiding the login rate limiter.

## Money and reconciliation semantics

Money is stored as `bigint` minor units. For example, INR 5,000 is `500000`. Quantities are stored as milli-units, so 90 units is `90000`. The API serialises bigint values as exact decimal strings because JavaScript's JSON encoder cannot represent bigint without losing precision.

The engine uses half-up integer rounding for tax and line calculations. A reconciliation run stores the engine version, input references, result snapshot and source references. Repeating the same inputs produces the same result.

The key seeded result is:

```text
100 ordered - 90 usable received = 10 short
10 x INR 5,000 = INR 50,000 potential quantity exposure
```

This is not presented as an amount the vendor owes, and the seed does not create a settlement on `INV-2026-001` claiming INR 450,000 is payable.

## Documentation

- [Demo scenarios and expected values](docs/DEMO.md)
- [8–10 minute demo script](docs/DEMO_SCRIPT.md)
- [Render + Supabase + PayPal deployment](docs/RENDER.md)
- [Setup, database and deployment](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
- [Security model and limitations](docs/SECURITY.md)
- [PayPal sandbox setup](docs/PAYPAL.md)
- [Testing](docs/TESTING.md)
- [Optional Supabase RLS template](docs/supabase-rls.sql)

## Project structure

```text
src/app/                 Pages and REST route handlers
src/components/          UI, forms and client interactions
src/lib/auth/            Password hashing, sessions, RBAC
src/lib/db/              Drizzle schema, PGlite/PostgreSQL client
src/lib/reconciliation/  Deterministic reconciliation engine
src/lib/services/        Domain services used by pages and APIs
src/lib/ai/              OpenAI adapter and deterministic fallback
src/lib/paypal/          Real PayPal REST client and verification
scripts/                 Migrate, reset and repeatable seed scripts
drizzle/                 Generated SQL migrations
tests/                   Vitest integration/unit tests and Playwright E2E
docs/                    Operational and security documentation
render.yaml              Render Blueprint for the public demo
```

## Known limitations

- No live OpenAI, PayPal, Supabase PostgreSQL/Storage, Render or email-provider
  call has been verified in this environment. Use the integration tests in the
  app and the deployment checklist before claiming otherwise.
- PGlite is suitable for local evaluation and tests, not a horizontally scaled
  production deployment. Use PostgreSQL for production.
- Application-level tenant isolation is implemented and tested. Supabase Row
  Level Security is **not active** with the custom session auth. The template in
  `docs/supabase-rls.sql` requires a dedicated database role and per-request
  tenant setting before it can be enabled.
- PayPal does not support INR. INR settlements are deliberately blocked from
  PayPal execution; the USD demo organisation exists to exercise the provider
  path.
- Without `RESEND_API_KEY`, password-reset and invitation emails are printed to the development console. Production email delivery is not verified.
- `npm audit --omit=dev` reports zero production vulnerabilities. `npm audit` still reports moderate development-only advisories through `drizzle-kit`'s legacy `@esbuild-kit` loader and ESLint's transitive glob matcher. Fixing them requires breaking tooling changes; they are not part of the production runtime.
- Sentry is not implemented; the environment variable alone does not enable monitoring.
- The app does not claim PCI compliance, formal SOC 2 certification, or production legal/regulatory readiness.

## License

Private evaluation project. No license is granted for redistribution.
