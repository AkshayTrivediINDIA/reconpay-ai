# Setup and deployment

## Local setup

Tested with Node.js 24.22 and npm. Node 20+ is expected to work.

```bash
npm install
cp .env.example .env.local
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Put one value in `AUTH_SECRET` and another in `APP_ENCRYPTION_KEY`.

Then:

```bash
npm run db:reset
npm run dev
```

The local database is PostgreSQL-compatible PGlite stored under `.data/reconpay`. Local files are stored under `.data/storage`. Both are gitignored.

### Local reset safety

`npm run db:reset`:

- refuses when `DATABASE_URL` is set;
- refuses when `NODE_ENV=production`;
- deletes only `.data/reconpay` and `.data/storage`;
- runs migrations and the seed.

Stop the dev server before resetting because PGlite holds the database file open on Windows.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_URL` | Yes | Exact public origin used for CSRF checks, vendor links, file links and PayPal return URLs. No trailing slash. |
| `AUTH_SECRET` | Yes in production | Secret for hashed sessions and signed file URLs. 32+ random bytes. |
| `APP_ENCRYPTION_KEY` | Recommended | Reserved for integration metadata encryption. |
| `DEMO_MODE` | No | Shows demo credentials only for labelled demo organisations. Set `false` in production. |
| `DATABASE_URL` | Production | PostgreSQL connection string. When absent, PGlite is used. |
| `MIGRATION_DATABASE_URL` | Recommended | Direct/session PostgreSQL connection used only for Drizzle migrations. Falls back to `DATABASE_URL`. |
| `RUN_MIGRATIONS` | No | Set `true` to run Drizzle migrations when the PostgreSQL connection is first opened. |
| `ALLOW_DEMO_SEED` | Demo only | Must be `true` to run `npm run db:seed` with `NODE_ENV=production`. Never enable for real data. |
| `PGLITE_DATA_DIR` | No | Override the local PGlite directory. |
| `STORAGE_DIR` | No | Local private storage directory. |
| `SUPABASE_URL` | Optional | Supabase project URL for Storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server-only service-role key. Never expose to the browser. |
| `SUPABASE_STORAGE_BUCKET` | Optional | Private bucket name, default `reconpay-evidence`. |
| `OPENAI_API_KEY` | Optional | Enables OpenAI structured extraction and evidence summaries. |
| `OPENAI_MODEL` | Optional | Defaults to `gpt-4.1-mini`. |
| `OPENAI_TIMEOUT_MS` | Optional | Defaults to 30000. |
| `PAYPAL_ENV` | Optional | `sandbox` (default) or `live`. |
| `PAYPAL_CLIENT_ID` | Optional | PayPal REST app client ID. |
| `PAYPAL_CLIENT_SECRET` | Optional | PayPal REST app secret. Server-only. |
| `PAYPAL_WEBHOOK_ID` | Optional | PayPal webhook ID used for signature verification. |
| `RESEND_API_KEY` | Optional | Real email delivery. |
| `EMAIL_FROM` | Optional | Verified sender address. |
| `SENTRY_DSN` | Not wired | Reserved only; Sentry is not integrated in this build. |
| `ENABLE_RLS` | Not active | Reserved. Do not assume RLS is enabled. |

Never commit `.env.local`, provider secrets, service-role keys or database passwords.

## Why PGlite is local-only

PGlite runs PostgreSQL in-process against a local directory. It is excellent for a zero-setup demo and deterministic tests, but it is not a horizontally scaled server and Vercel's filesystem is ephemeral. Production must use a managed PostgreSQL service such as Supabase.

## PostgreSQL / Supabase database setup

1. Create a Supabase project or any PostgreSQL 15+ database.
2. Obtain two connection strings:
   - application queries: Supabase transaction pooler, port `6543`;
   - migrations: direct connection or session pooler, port `5432`.
   Keep `sslmode=require` on both. Remove `?pgbouncer=true`; `postgres-js` does
   not need it.
3. Set `DATABASE_URL` and `MIGRATION_DATABASE_URL` in the hosting environment.
4. Apply migrations. Either:
   - run once with `RUN_MIGRATIONS=true`, then set it back to `false`; or
   - run Drizzle migrations from a controlled job:

   ```bash
   DATABASE_URL="postgresql://..." \
   MIGRATION_DATABASE_URL="postgresql://..." \
   RUN_MIGRATIONS=true \
   npm run db:migrate
   ```

   Run migrations against a direct/session connection if your pooler does not
   support DDL or prepared statements.
5. Do not run `npm run db:reset` against the external database. It refuses by design.
6. To create demo data in a controlled non-production environment only:

   ```bash
   DATABASE_URL="postgresql://..." \
   MIGRATION_DATABASE_URL="postgresql://..." \
   NODE_ENV=development npx tsx scripts/seed.ts
   ```

   This inserts demo data only when the demo organisations do not already exist.
   In production, `ALLOW_DEMO_SEED=true` is also required explicitly.

The application uses `postgres-js` with `prepare: false`, which is required for transaction poolers. Query results with bigint money values are serialised by the API as exact decimal strings.

### Optional RLS

The custom session system does not use Supabase Auth, and the application connects directly to PostgreSQL. RLS is **not enabled** by this repository. `docs/supabase-rls.sql` is a template only. Enabling it requires:

- a dedicated application role that does not own the tables and does not have `BYPASSRLS`;
- setting `app.organization_id` for each transaction/connection;
- integration tests proving no query runs without a tenant setting.

Do not enable RLS in production until those pieces are implemented and verified.

## Supabase Storage setup

1. Create a private bucket, for example `reconpay-evidence`.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_STORAGE_BUCKET`.
3. Keep the bucket private. The app issues short-lived signed URLs.
4. Verify upload and download through the app.

Known limitation: invoice reprocessing reads local storage directly. Reprocessing an invoice whose source file is in Supabase Storage returns a clear unsupported message; download and re-upload it instead. Normal upload and download work through the Supabase adapter.

## OpenAI setup

Set `OPENAI_API_KEY`. The app calls the Responses API with structured-output schemas, validates the result with Zod and logs token usage without storing document text in the usage log.

Without a key:

- invoice extraction uses a deterministic PDF text parser;
- evidence summaries are rules-based;
- the UI labels these as fallback results.

The live OpenAI request was not verified in this workspace.

## PayPal setup

See [PAYPAL.md](PAYPAL.md). Key points:

- PayPal does not support INR. Use a settlement in a supported currency.
- Set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
- Register `https://<your-domain>/api/webhooks/paypal`.
- Capture is performed server-side; the browser return does not mark the payment paid.
- No payment is simulated without credentials.

## Resend email setup

Set `RESEND_API_KEY` and `EMAIL_FROM`. Verify the sender domain in Resend.

Without it, development emails are printed to the server console and no email is delivered. The UI reports delivery status honestly where applicable. Never copy production reset tokens from logs.

## Deploy to Render

The repository includes a `render.yaml` Blueprint for the public demo:

- Render Node web service, free plan, Singapore region by default
- Supabase PostgreSQL and private Storage
- PayPal sandbox
- Migrations on boot and a one-time demo seed through `initialDeployHook`

Follow [RENDER.md](RENDER.md) for the exact Supabase, PayPal, Render and
verification steps. Do not claim the deployment is live until
`/api/health` reports `databaseKind: "postgres"`, the Settings integration tests
pass, and the PayPal sandbox flow has completed.

## Deploy to Vercel

This repository has not been deployed. The following is a checklist, not a claim of completed deployment.

1. Push the repository to a Git provider.
2. Import it into Vercel.
3. Framework preset: Next.js. Build command: `npm run build`. Node 20+.
4. Add environment variables in Vercel:
   - `APP_URL=https://your-production-domain`
   - `AUTH_SECRET`
   - `APP_ENCRYPTION_KEY`
   - `DEMO_MODE=false`
   - `DATABASE_URL`
   - `RUN_MIGRATIONS=false` after initial migration
   - Supabase Storage variables
   - OpenAI/PayPal/Resend variables as applicable
5. Use PostgreSQL, not PGlite. Vercel's filesystem cannot persist the local database or local storage.
6. Apply migrations before serving traffic.
7. Configure the PayPal webhook URL with the final HTTPS domain.
8. Deploy and verify the post-deploy checks below.
9. Ensure no `.env.local`, `.data`, `.auth` or test artifacts are included.

### Post-deploy verification

- `GET /api/health` returns a healthy status and reports the expected database kind.
- HTTPS is enforced and the session cookie is `Secure`.
- Register a new organisation and confirm tenant isolation using two accounts.
- Upload a sample PDF and verify extraction/fallback labelling.
- Reconcile the seeded or a test PO/GR/invoice and confirm exact integer totals.
- Generate an evidence PDF and download it through an expiring link.
- Confirm a vendor user cannot read reports, audit or another vendor's records.
- Test the approval limit and self-approval guard.
- If PayPal is configured, complete a sandbox payment and confirm that:
  - the payment is pending before capture;
  - the return handler captures server-side;
  - a webhook is verified and deduplicated;
  - the settlement becomes paid only after provider confirmation.
- Confirm email delivery for password reset and invitations.
- Check logs for secrets or full document contents.

## Operational commands

```bash
npm run db:generate   # generate a migration after schema changes
npm run db:migrate    # connect, apply PGlite migrations / verify connection
npm run build
npm run start
npm test
npm run e2e
```

## Backups and retention

- Use managed PostgreSQL automated backups and test a restore.
- Back up the private object-storage bucket.
- Define retention for invoice documents, evidence reports, audit logs and AI usage logs.
- Deleting a demo database must never be possible through the production app.

## Monitoring

Sentry is not implemented despite the reserved environment variable. Before claiming monitoring:

1. add and configure a supported error-monitoring SDK;
2. verify server and browser events;
3. add uptime checks for `/api/health` and key pages;
4. add alerts for payment/webhook failures.

## Rollback

- Deploy the previous immutable build.
- Database migrations should be forward-compatible; take a backup before destructive schema changes.
- Disable PayPal by removing the credentials if provider behaviour is unsafe.
- Preserve audit/payment records during rollback; never delete confirmed payment history.

## Not verified in this workspace

- Render deployment, custom domain, TLS and free-tier cold starts
- Vercel deployment, custom domain, TLS and serverless runtime with PostgreSQL
- Supabase PostgreSQL, Storage, signed URLs and RLS
- Live OpenAI extraction/summaries
- Live PayPal OAuth, order creation, capture, webhook verification and refunds
- Resend delivery
- Sentry monitoring
