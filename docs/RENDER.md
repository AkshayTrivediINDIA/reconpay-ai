# Deploy the demo on Render with Supabase and PayPal

This document prepares a public, labelled ReconPay demo on Render. It is a
checklist, not a claim that a deployment has already happened. Verify each step
in the Render, Supabase and PayPal dashboards before presenting it.

## Architecture

```text
Browser
  -> Render web service (Next.js, `next start`)
  -> Supabase PostgreSQL (app data, audit trail, sessions)
  -> private Supabase Storage bucket (invoice/evidence files)
  -> PayPal sandbox Orders v2 (USD demonstration only)
```

Do **not** use this demo configuration with real invoices, vendor data or live
PayPal money. Set `PAYPAL_ENV=sandbox`, keep demo data labelled, and use
`ALLOW_DEMO_SEED=true` only for this public demo deployment.

## What you need

- A GitHub repository containing this project
- A Render account
- A Supabase account/project
- A PayPal Developer account with a sandbox REST app
- Optional: an OpenAI API key for live extraction/evidence explanations
- Optional: a Resend API key for real invitation/password-reset email

Approximate time: 20–30 minutes, excluding first Render build and Supabase
provisioning.

## 1. Put the code on GitHub

Render deploys from a Git repository.

```bash
# From the project directory, once the repository exists:
git init
git add .
git commit -m "Prepare ReconPay AI demo"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Never commit `.env.local`, `.data`, `.auth`, provider dashboards, database
passwords, service-role keys or PayPal secrets. `.gitignore` already excludes
the local artefacts used by this project.

If you have not created the GitHub repository yet, create an empty one first.

## 2. Create the Supabase project

1. Open <https://supabase.com/dashboard>.
2. Create a project. Use the region closest to the Render region
   (`Singapore` matches the provided `render.yaml`).
3. Save the database password in your password manager.
4. Wait until the project is fully provisioned.

### 2a. Database connection strings

Open **Project Settings → Database → Connection string** (the wording can vary
slightly) and copy two URLs:

| Render variable | Supabase connection | Port | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Transaction pooler | `6543` | Application queries |
| `MIGRATION_DATABASE_URL` | Direct connection or session pooler | `5432` | Drizzle DDL/migrations |

Both URLs must include `sslmode=require`.

For `DATABASE_URL`:

- use the transaction pooler URL;
- remove any `?pgbouncer=true` parameter;
- keep `sslmode=require`;
- keep the password exactly as Supabase provided it (URL-encoded if needed).

The app uses `postgres-js` with prepared statements disabled, which is required
for transaction poolers. Migrations are intentionally sent through
`MIGRATION_DATABASE_URL` because transaction poolers are not the right place for
DDL.

### 2b. Private Storage bucket

1. Open **Storage** in Supabase.
2. Create a private bucket named `reconpay-evidence`.
3. Do not make the bucket public.
4. Open **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

The service-role key bypasses Storage row-level security. It is server-only and
must never be placed in browser code.

### 2c. RLS

This app uses its own session/auth system and connects directly to PostgreSQL.
Supabase Row Level Security is **not active** with this build. Application-level
tenant isolation is enforced and tested, but do not claim database RLS is
enabled. See `docs/SECURITY.md` and the optional `docs/supabase-rls.sql` template.

## 3. Create the PayPal sandbox app

1. Open <https://developer.paypal.com/dashboard/>.
2. Switch to **Sandbox**.
3. Open **Apps & Credentials**.
4. Create a REST app, for example `ReconPay Demo`.
5. Copy the sandbox **Client ID** and **Secret**.
6. Note the sandbox **Business** and **Personal/Buyer** test accounts. You will
   use the buyer account during the checkout demonstration.

PayPal does not support INR for this order flow. The INR demo settlement is
blocked; the separate USD organisation contains the payment-ready settlement.

## 4. Create the Render Blueprint

1. Open <https://dashboard.render.com/blueprints>.
2. Choose **New Blueprint Instance**.
3. Connect the GitHub repository containing `render.yaml`.
4. Render reads the blueprint. Keep the service name `reconpay-ai`, or update
   the self-reference in `render.yaml` if you rename it.
5. Fill the prompted environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL, port `6543` |
| `MIGRATION_DATABASE_URL` | Supabase direct/session URL, port `5432` |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key |
| `PAYPAL_CLIENT_ID` | Sandbox REST app client ID |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST app secret |
| `PAYPAL_WEBHOOK_ID` | Enter `pending` for the first deploy, then replace it |

`AUTH_SECRET` and `APP_ENCRYPTION_KEY` are generated automatically.
`APP_URL` is automatically populated from Render's `RENDER_EXTERNAL_URL`.
`DEMO_MODE=true`, `ALLOW_DEMO_SEED=true`, `RUN_MIGRATIONS=true` and
`SUPABASE_STORAGE_BUCKET=reconpay-evidence` are set by the blueprint.

6. Create the service and wait for the first deploy.

The first successful deploy:

- runs Drizzle migrations against `MIGRATION_DATABASE_URL`;
- starts the Next.js server;
- runs `npm run db:seed` once through `initialDeployHook`;
- creates the two labelled demo organisations and uploads their source
  documents/evidence to Supabase Storage.

Watch the Render logs for `Demo seed complete.` If the seed fails, fix the
connection string/bucket and run `npm run db:seed` from the Render Shell.

### If Render asks for `APP_URL`

The blueprint normally sets it automatically. If your account does not resolve
the self-reference, copy the service URL, for example
`https://reconpay-ai.onrender.com`, and set `APP_URL` to that exact value with no
trailing slash.

## 5. Register the PayPal webhook

1. Copy the deployed HTTPS URL from Render.
2. In the PayPal sandbox REST app, add a webhook:

```text
https://<your-service>.onrender.com/api/webhooks/paypal
```

3. Subscribe to:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
4. Copy the generated **Webhook ID**. It is not the URL and not the client
   secret.
5. In Render, update `PAYPAL_WEBHOOK_ID` and save the environment change.
6. Redeploy or restart the service so the new value is loaded.

`APP_URL` must exactly match the public origin used by the browser. A mismatch
causes PayPal return URLs and webhook verification to fail.

## 6. Verify the deployment

### Health

```bash
curl https://<your-service>.onrender.com/api/health
```

Expected values include:

```json
{
  "ok": true,
  "database": "connected",
  "databaseKind": "postgres",
  "supabaseStorage": "configured",
  "paypal": "configured (sandbox)"
}
```

If `databaseKind` is `pglite`, Render is using an ephemeral local database.
Fix `DATABASE_URL` immediately.

### Sign in

Use the demo accounts shown on `/login` when `DEMO_MODE=true`:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.reconpay.ai` | `ReconPay!2026` |
| Finance Manager | `finance@demo.reconpay.ai` | `ReconPay!2026` |
| Vendor | `vendor@demo.reconpay.ai` | `ReconPay!2026` |

These credentials are public by design for this labelled demo. Do not reuse
this deployment for real data.

### Integration tests in the app

Sign in as the administrator and open **Settings → Integration connectivity**.
Click **Test connection** for:

- **PayPal** — must acquire a real sandbox OAuth token;
- **Supabase Storage** — must reach the private bucket;
- **OpenAI** — only if you added an OpenAI key.

Do not claim an integration is live until the corresponding test passes.

### PayPal sandbox payment

1. Switch to **ReconPay Demo (USD)** in the organisation switcher.
2. Open settlement `STL-2026-0001` (`READY_FOR_PAYMENT`).
3. Choose **Pay with PayPal**.
4. Approve the order with a sandbox buyer account.
5. Wait for the server-side capture and confirm the settlement becomes paid.
6. Open **Payments** and the audit trail.
7. Replay a webhook in PayPal and confirm signature verification and
   idempotency.

### Documents and evidence

Upload a small PDF, run reconciliation on a test PO/GR/invoice, generate an
evidence PDF, and download it through the expiring link. Confirm the Storage
provider in Settings is Supabase rather than local.

## 7. Re-running or resetting the demo

- `npm run db:reset` is blocked for external databases and production. It is
  for local PGlite only.
- `npm run db:seed` is idempotent: it exits if the demo organisations already
  exist.
- To rebuild the public demo from scratch, create a fresh Supabase project (or
  carefully clear only the demo schema with a controlled SQL job), update the
  Render URLs, and redeploy.
- If you approve settlements or respond to vendor proposals during a demo, the
  data changes. Keep a known-good snapshot or use a throwaway Supabase project
  for each presentation.

## 8. Free-tier and production caveats

- Render free web services spin down after inactivity. The first request after
  idle can take tens of seconds. Open the app once before the presentation.
- Render's local filesystem is ephemeral. Supabase Storage is required for
  documents to survive a restart.
- Supabase free-tier projects can pause after inactivity. Wake the project
  before the demo.
- The PayPal demo uses sandbox accounts only. Never switch to live mode for a
  public demo.
- Email delivery uses Resend only if configured; otherwise development reset
  links are printed to the server console. Do not treat console output as a
  production email service.
- Sentry is not wired into this build.
- The app has not been verified against this exact Render/Supabase/PayPal
  deployment until the checklist above has been executed.
