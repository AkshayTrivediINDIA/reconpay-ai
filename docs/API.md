# API reference

This is an internal application API for the Next.js UI. It is not a public partner API and has no versioned contract.

## Authentication and request rules

- Browser sessions use an opaque, hashed session token in the `rp_session` `HttpOnly`, `SameSite=Lax` cookie.
- Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) must include an `Origin` header matching `APP_URL` or the request's own origin. Requests without `Origin` are rejected.
- All domain requests resolve the signed-in user and active organisation on the server. Client-supplied organisation IDs are not trusted for authorisation.
- Vendor-role users are additionally restricted to their linked vendor ID.
- Responses are `Cache-Control: no-store`. JSON money/quantity fields are serialised as exact decimal strings, for example `"50000000"` for `50,000,000` minor units, because JSON has no bigint type.
- Validation errors use HTTP 422 and include `{ error: { code, message, details } }`.
- Domain errors use consistent codes such as `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `RATE_LIMITED`, and `INTERNAL_ERROR`.
- In-memory rate limits apply to login, registration, password reset, invoice upload/reprocess and vendor-token responses. Production should replace the in-memory limiter with a shared store.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create a user, organisation and admin membership; starts a session |
| `POST` | `/api/auth/login` | Authenticate; starts a session |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/session` | Current user, organisation, membership and role |
| `POST` | `/api/auth/switch-organization` | Switch active organisation after a membership check |
| `POST` | `/api/auth/forgot-password` | Create a reset token and send/print reset instructions |
| `POST` | `/api/auth/reset-password` | Consume a reset token and set a new password |
| `POST` | `/api/auth/change-password` | Change the signed-in user's password |

## Dashboard, search and notifications

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Role-aware dashboard data from database queries |
| `GET` | `/api/search?q=...` | Scoped global search |
| `GET` | `/api/notifications` | Notifications and unread count |
| `POST` | `/api/notifications` | Mark one or all notifications as read |

## Invoices and documents

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/invoices` | List invoices with filters and pagination |
| `POST` | `/api/invoices` | Upload and extract a PDF/PNG/JPEG invoice (multipart form data) |
| `GET` | `/api/invoices/{id}` | Invoice detail, line items, runs, documents and duplicate check |
| `PATCH` | `/api/invoices/{id}` | Save corrected extracted fields and re-verify |
| `POST` | `/api/invoices/{id}/reprocess` | Re-run extraction for a stored source document |
| `POST` | `/api/invoices/{id}/reconcile` | Run deterministic reconciliation against a PO and selected receipts |
| `POST` | `/api/documents` | Upload a supporting document (PDF/PNG/JPEG) |
| `GET` | `/api/files/download?token=...` | HMAC-signed expiring private file access |

Upload validation checks size, extension, declared MIME type and file magic bytes. Files are stored privately and linked to the tenant by database records.

## Purchase orders and goods receipts

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/purchase-orders` | List purchase orders |
| `POST` | `/api/purchase-orders` | Create a purchase order with exact line quantities/prices |
| `GET` | `/api/purchase-orders/{id}` | Purchase-order detail and receipts |
| `PATCH` | `/api/purchase-orders/{id}` | Update an editable purchase order |
| `GET` | `/api/goods-receipts` | List goods receipts |
| `POST` | `/api/goods-receipts` | Record a goods receipt, including damaged quantity |
| `GET` | `/api/goods-receipts/{id}` | Goods-receipt detail |
| `PATCH` | `/api/goods-receipts/{id}` | Update an editable receipt |

## Reconciliation and discrepancies

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/reconciliation` | List stored reconciliation runs |
| `GET` | `/api/reconciliation/{id}` | Run snapshot, findings, sources, reports and timeline |
| `GET` | `/api/discrepancies` | List discrepancies |
| `PATCH` | `/api/discrepancies/{id}` | Resolve, dispute or reopen a finding with a reason |

The engine is deterministic and versioned. AI is not involved in the calculation or the decision.

## Evidence

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/evidence` | Evidence report index |
| `POST` | `/api/evidence` | Generate an evidence summary for a completed run |
| `GET` | `/api/evidence/{runId}/pdf` | Download a generated PDF evidence pack |

## Settlements, approvals and payments

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/settlements` | List settlements |
| `POST` | `/api/settlements` | Create a settlement proposal for a verified invoice |
| `GET` | `/api/settlements/{id}` | Settlement detail, approvals, payments and vendor token state |
| `PATCH` | `/api/settlements/{id}` | Edit a draft proposal |
| `POST` | `/api/settlements/{id}/submit` | Submit for internal approval |
| `POST` | `/api/settlements/{id}/approve` | Approve or reject; enforces segregation of duties and finance limits |
| `POST` | `/api/settlements/{id}/share` | Issue a fresh expiring vendor link; only the token hash is stored |
| `POST` | `/api/settlements/{id}/respond` | Signed-in vendor response |
| `POST` | `/api/settlements/{id}/ready` | Move an accepted, approved settlement to `READY_FOR_PAYMENT` |
| `GET` | `/api/approvals` | Pending approval queue |
| `GET` | `/api/payments` | Payment list |
| `POST` | `/api/payments` | Initiate a PayPal payment for a ready settlement; accepts `Idempotency-Key` |
| `GET` | `/api/payments/{id}` | Payment and provider event detail |
| `GET` | `/api/payments/paypal/return` | Server-side PayPal return/capture handler |
| `GET` | `/api/payments/paypal/cancel` | Server-side PayPal cancellation handler |
| `POST` | `/api/webhooks/paypal` | PayPal webhook endpoint with signature verification and event deduplication |

`POST /api/payments` requires an approved, ready settlement, a PayPal-supported currency and configured PayPal credentials. Reusing the same idempotency key for the same settlement returns the original payment without calling PayPal again; using it for a different settlement is a conflict.

## Vendors and team

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/vendors` | List vendors |
| `POST` | `/api/vendors` | Create a vendor |
| `GET` | `/api/vendors/{id}` | Vendor detail and history |
| `PATCH` | `/api/vendors/{id}` | Update a vendor |
| `GET` | `/api/team` | List organisation members (admin) |
| `POST` | `/api/team` | Invite/create a member (admin) |
| `PATCH` | `/api/team/{id}` | Change role, approval limit, vendor link or active state (admin) |

## Reports and audit

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/reports/{type}` | CSV export; no date filters |
| `GET` | `/api/reports/{type}?from=YYYY-MM-DD&to=YYYY-MM-DD` | Filtered CSV export |
| `GET` | `/api/audit` | Audit/report summary and audit records |

Report types: `invoices`, `discrepancies`, `reconciliation`, `settlements`, `payments`, `audit`. CSV output starts with a UTF-8 BOM and escapes leading `=`, `+`, `-`, `@`, tab and carriage-return characters to reduce spreadsheet formula injection risk.

## Settings and integration checks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/settings` | Organisation settings and integration status |
| `PATCH` | `/api/settings` | Update permitted organisation settings |
| `POST` | `/api/settings/integrations/{provider}/test` | Perform a real connectivity test for `OPENAI`, `PAYPAL` or `SUPABASE` |

Integration tests return status only. Secrets are never returned to the browser.

## Public vendor link API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/vendor/{token}` | Read the settlement proposal for a valid, unexpired token |
| `POST` | `/api/vendor/{token}/respond` | Accept, dispute or clarify; rate-limited by IP |

Vendor tokens are high-entropy, expiring, stored only as hashes and scoped to one settlement. They do not grant access to any internal endpoint.

## Operations

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Database/configuration health check for monitoring |

The health endpoint must not be treated as a substitute for application-level readiness/liveness checks in a production platform.
