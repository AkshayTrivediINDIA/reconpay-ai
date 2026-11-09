# 8–10 minute demo script

The goal is to show one honest financial control loop, not every screen:

```text
invoice -> deterministic three-way match -> evidence -> approval
        -> vendor response -> approved settlement -> real PayPal sandbox capture
```

## Before the call

- [ ] **Live demo URL:** <https://reconpay-ai.onrender.com> — open once to wake the free Render service (cold-start ~50s).
- [ ] Supabase project is already awake (ap-south-1).
- [ ] Sign in as `admin@demo.reconpay.ai` / `ReconPay!2026`.
- [ ] Confirm the organisation switcher is on **ReconPay Demo (INR)**.
- [ ] Run **Settings → Integration connectivity → PayPal → Test connection** (shows "configured · sandbox").
- [ ] PayPal sandbox buyer: `sb-injib53177998@personal.example.com` / `ReconPay!2026` (US personal, $5,000 balance).
- [ ] Use a desktop window; keep the final demo URL visible.
- [ ] For a local demo, run `npm run db:reset` before starting if the seed was
      changed by a previous run.

Demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.reconpay.ai` | `ReconPay!2026` |
| Finance Manager | `finance@demo.reconpay.ai` | `ReconPay!2026` |
| Vendor | `vendor@demo.reconpay.ai` | `ReconPay!2026` |

## 0. Opening — 20 seconds

Say:

> “ReconPay is an invoice-control product. It extracts invoice data, reconciles
> it against the purchase order and goods receipt using deterministic rules,
> keeps the evidence, and only allows a payment after approval. AI explains;
> the rules decide.”

## 1. Landing page — 20 seconds

Open `/`.

Point out:

- the workflow and control positioning;
- **Sign in to the demo** for the seeded account;
- the product does not claim that a browser redirect moves money.

## 2. Dashboard — 60 seconds

After signing in, open **Dashboard**.

Show:

- counts and invoice value read from the database;
- **Open discrepancy exposure**;
- the most recent invoices and pending approvals;
- the organisation switcher in the top bar.

Say:

> “These are database-backed metrics for the active organisation. The INR and
> USD demo organisations are separate so currencies are never mixed.”

## 3. Invoice — 90 seconds

Go to **Invoices → INV-2026-001**.

Show:

- vendor ABC Office Supplies;
- purchase order `PO-2026-001`;
- invoice value INR 5,00,000;
- the uploaded source document and its SHA-256/evidence metadata;
- extracted line item: 100 ergonomic chairs at INR 5,000;
- the deterministic extraction fallback label if OpenAI is not configured.

Click through to the reconciliation run.

## 4. Three-way reconciliation — the key screen — 2 minutes

Open the reconciliation for `INV-2026-001`.

Show the exact math:

```text
Ordered:        100 units
Usable received: 90 units
Short:            10 units
Unit price:    INR 5,000
Exposure:      INR 50,000
```

Say:

> “The system found ten missing units. It calls INR 50,000 a potential exposure
> or review signal. It does not call the vendor liable, and it does not silently
> reduce the payable to INR 4,50,000. A human must resolve the commercial
> position.”

Point out:

- `RECEIVED_QTY_MISMATCH` and `PARTIAL_DELIVERY`;
- source references to the PO and goods receipt;
- exact integer minor units and milli-unit quantities;
- rule version/snapshot stored with the run;
- **Download evidence PDF**.

Optionally open **Discrepancies** and show that a finding can be resolved or
disputed with a reason, and the action is audited.

## 5. Evidence centre — 45 seconds

Open **Evidence**, then the generated evidence report.

Show:

- the human-readable findings and source references;
- the generated PDF download;
- the expiring signed download link.

Say:

> “The evidence pack is generated from the stored run, not from a screenshot or
> an AI narrative.”

## 6. Approval and separation of duties — 60 seconds

Open **Approvals**.

Show the clean INR match:

- `INV-2026-002`, `PO-2026-002`, `GR-2026-002`;
- settlement `STL-2026-0001` submitted by the finance manager;
- the administrator can approve it;
- the creator cannot approve their own settlement; administrators have an
  explicit override for demo practicality.

Do not approve unless you intend to change the demo state. If you do approve,
mention that a real deployment would keep an immutable audit trail and that the
local demo can be reset.

## 7. Vendor portal — 60 seconds

Open **Settlements → STL-2026-0002** (the price-variance proposal).

Show:

- proposed amount INR 50,000 and disputed exposure INR 10,000;
- the proposal is approved for **vendor discussion only**;
- **Share with vendor** creates a fresh expiring link;
- the link stores only a token hash.

Open the link in a private window (or sign in as the vendor account) and show
the vendor can accept, dispute or request clarification. The response is
recorded with a reason.

Say:

> “The vendor is told what is disputed, but the system does not pretend the
> dispute is a final liability.”

## 8. USD + real PayPal sandbox — 2–3 minutes

Switch the organisation to **ReconPay Demo (USD)**.

Open **Settlements → STL-2026-0001**.

Show:

- `INV-2026-101`, `PO-2026-101`, `GR-2026-101`;
- USD 1,500.00 clean match;
- status `READY_FOR_PAYMENT`;
- internal approval is present.

Click **Pay with PayPal**.

Explain the sequence:

1. the server creates a local payment record;
2. it calls PayPal Orders v2 with the exact amount and currency;
3. the browser is redirected to PayPal;
4. the buyer approves;
5. the server captures the order server-side;
6. the captured amount/currency must match;
7. only then does the settlement become `PAID`.

Approve with the PayPal sandbox buyer account. After returning, open
**Payments** and show the provider states, capture ID and audit events.

Say:

> “The browser return alone is not trusted. The payment is confirmed from the
> PayPal capture response and verified webhook. If credentials are missing, the
> app refuses the action instead of simulating success.”

If you want to demonstrate webhook verification, replay a sandbox webhook in
PayPal and show the verified event and duplicate protection.

## 9. Audit and reports — 30 seconds

Open **Audit** and briefly show sign-in, invoice verification, reconciliation,
evidence, approval and payment events.

Open **Reports** and show a CSV export. Mention the UTF-8 BOM and spreadsheet
formula neutralisation.

## Closing — 20 seconds

> “The important control is not the AI. It is the chain: exact math, stored
> evidence, role-scoped approval, and a payment confirmation that comes from
> the provider. AI is used to reduce reading effort, not to decide money.”

## Demo state and reset

- **Local:** stop the dev server, run `npm run db:reset`, restart.
- **Render:** `db:reset` is intentionally blocked for external databases and
  production. Prefer a read-only demo path, or use a disposable Supabase project
  for interactive runs. `npm run db:seed` is idempotent and only seeds when the
  demo organisations are absent.
- Approving a settlement, resolving a discrepancy, or responding to a vendor
  link changes the data. Always use a known-good snapshot for a public demo.

## If something fails

- **PayPal disabled or error:** show Settings → Integration connectivity and
  the honest NOT_CONFIGURED/ERROR message. Do not claim a payment succeeded.
- **Supabase unavailable:** the app returns an error rather than writing to a
  fallback local bucket on Render. Show the health response and Settings test.
- **Render cold start:** wait for the health check/page to load before starting
  the narrative; mention free-tier spin-down.
- **Unexpected variance:** read the stored rule findings and source references;
  do not recalculate money in the presentation.

Detailed scenarios and expected values: `docs/DEMO.md`.
Deployment checklist: `docs/RENDER.md`.
