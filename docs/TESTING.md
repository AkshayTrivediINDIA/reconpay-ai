# Tests

## Unit and integration tests (Vitest)

```bash
npm test
npm run test:watch
npm run test:coverage
```

The tests use isolated in-memory PGlite databases. They never touch `.data`.

| File | Coverage |
| --- | --- |
| `tests/money.test.ts` | Exact decimal parsing, integer minor units, milli-quantities, tax rounding, half-up division, large values beyond JavaScript safe integers |
| `tests/reconciliation-engine.test.ts` | Exact match, 10-unit short delivery at INR 5,000 = INR 50,000, damaged goods, price variance, missing receipts, duplicate invoice signal, deterministic repeatability |
| `tests/rbac.test.ts` | Role permissions, vendor scope, finance approval boundary, no-limit denial, admin override |
| `tests/auth.test.ts` | scrypt hashing, registration, duplicate email rejection, login, failed-attempt accounting and reset |
| `tests/services.integration.test.ts` | Stored reconciliation snapshots and source refs, damaged handling, duplicate detection, tenant/vendor isolation, approval segregation, vendor acceptance gate, unauthorized payment prevention, INR PayPal blocking, rules-based evidence PDF |
| `tests/payments.test.ts` | PayPal initiation with mocked provider, idempotency-key reuse and cross-settlement conflict, verified webhook processing, duplicate webhook IDs, rejected signature, malformed JSON |
| `tests/paypal-verification.test.ts` | Required PayPal signature headers are enforced before provider verification |
| `tests/http.test.ts` | Bigint minor units are serialized as exact decimal strings in API responses |

The payment tests mock the PayPal client module. They verify application control flow, not live PayPal behaviour. The provider itself remains unverified until sandbox credentials are used.

## End-to-end tests (Playwright)

Prerequisites:

```bash
npm run db:reset
npx playwright install chromium
npm run e2e
```

The configuration starts/reuses a development server at `http://localhost:3000`. Outside CI it reuses an existing server. If you use another base URL:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 npm run e2e
```

Playwright setup authenticates the demo administrator and vendor once via the login API and stores their session state under `.auth/` (gitignored). Tests then reuse that state so the login rate limiter is not tripped by repeated sign-ins.

The E2E suite verifies:

- unauthenticated redirect to sign-in;
- administrator dashboard metrics and role-aware navigation;
- invoice `INV-2026-001`, reconciliation list and detail with the INR 50,000 potential quantity exposure;
- evidence PDF download beginning with `%PDF-`;
- pending approval `STL-2026-0001`;
- CSV export with UTF-8 BOM and exact amount text;
- vendor-only navigation and restricted internal page redirect;
- organisation switch to the USD demo and its ready settlement;
- sign-out and session revocation.

E2E tests are serial and assume the seeded demo state. Re-run `npm run db:reset` if a prior manual session changed the approvals or settlements.

## Full verification sequence

```bash
npm run lint
npm run typecheck
npm test
npm run build
# stop the development server, then:
npm run db:reset
npm run e2e
```

## Known test limitations

- No live OpenAI request is exercised.
- No live PayPal sandbox request is exercised.
- No Supabase PostgreSQL/Storage or RLS test is exercised.
- No Vercel/serverless runtime test is exercised.
- The E2E suite uses Chromium only.
- The in-memory rate limiter resets when the server restarts; tests cannot validate multi-instance limits.
