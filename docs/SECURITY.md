# Security model

This document separates controls that are implemented and verified from controls that require additional production infrastructure.

## Implemented controls

### Authentication

- Custom server-side authentication with Node `scrypt` (N=16384, r=8, p=1), per-user 16-byte random salt and a versioned hash format.
- Password policy: 10-200 characters with upper-, lower-case and numeric characters.
- Opaque random session tokens (32 bytes). Only an HMAC-SHA-256 hash of the token is stored in the database.
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, expiry, and `Secure` when the application is served in production over HTTPS.
- Login failures increment a counter; repeated failures lock the account for 15 minutes.
- Session expiry and revocation are enforced on the server. Signing out revokes the current session.
- Password reset tokens are random, expiring, stored only as hashes and single-use.
- Login, registration, password reset, invoice upload/reprocess and vendor response endpoints are rate-limited.

### CSRF and request integrity

- All state-changing browser requests require an `Origin` header matching the configured `APP_URL` or the request's own origin.
- Missing or cross-site origins are rejected before domain work begins.
- Cookies are `SameSite=Lax` and every mutation uses a server-side session context.
- Security headers are set in `next.config.ts`: CSP, frame denial, MIME sniffing denial, referrer policy, permissions policy, and HSTS in production.

### Authorisation and tenancy

- Role permissions are defined centrally in `src/lib/auth/rbac.ts` and checked in services and page loaders. Client-side menu visibility is not an authorization boundary.
- Every organisation-scoped query filters by the active organisation on the server. A caller cannot select an organisation by passing an ID to a domain query.
- Organisation switching checks that the signed-in user has an active membership in the target organisation.
- Vendor users are scoped to their linked vendor and can only read their own invoices, settlements and payments.
- Finance approval is capped by `approval_limit_minor`. A settlement creator who is not an administrator cannot approve their own settlement.
- Vendors cannot approve, share, initiate payments and cannot read internal reports/audit pages.
- Automated tests cover cross-tenant reads, vendor isolation, RBAC boundaries, approval limits, self-approval prevention, payment authorization and unsupported currency blocking.

### Money and data integrity

- Monetary values use `bigint` minor units and quantities use integer milli-units.
- Database writes that change settlement/payment state are transactional where required.
- Deterministic reconciliation stores its engine version, input references, result snapshot and source references.
- Payment initiation checks approval, ready state, currency support, amount and settlement ownership on the server.
- Payment capture is confirmed from the provider response, not from a browser query parameter.
- PayPal webhooks are signature-verified with PayPal before processing; duplicate provider event IDs are deduplicated and recorded.
- Payment idempotency keys are unique per organisation. Reusing a key for the same settlement returns the original payment; reusing it for another settlement is rejected. The key is checked before mutable state checks so a legitimate retry is safe.
- Captured amount and currency must match the stored payment amount and currency.

### File handling

- Uploads limited to 15 MB, PDF/PNG/JPEG only.
- File extension, declared content type and magic bytes must agree.
- Random storage keys; original names are retained only as metadata.
- SHA-256 hashes are recorded for source evidence.
- Private files are served through short-lived HMAC-signed URLs, not by exposing the storage directory.
- Optional Supabase Storage uses a private bucket and short-lived signed URLs.

### Audit and sensitive data

- Authentication, invoice verification, reconciliation, discrepancy changes, evidence generation, settlement approval/share/response, payment and cancellation events write to the audit/evidence tables.
- AI usage logs store token counts, provider/model, latency and status. Invoice text or API keys are not stored in the usage log.
- Integration connectivity tests return status and a short error, never credentials.
- Errors returned to clients are sanitised; stack traces stay server-side.

### AI-specific controls

- AI is optional. Without a key, deterministic extraction and rules-based summaries are used and labelled.
- Invoice text is treated as untrusted data. The system prompt tells the model to ignore embedded instructions and never change workflow or payment behaviour.
- Output is constrained to a strict JSON schema and then validated with Zod.
- The model returns decimal strings; the application converts them with exact integer parsing. The model is told not to invent or calculate values.
- AI output never creates approvals, resolves discrepancies or authorises payments.
- Timeouts, retries with backoff, schema failures and provider failures fall back or fail explicitly rather than producing fabricated results.

## Role matrix

| Capability | Admin | Finance Manager | Vendor |
| --- | --- | --- | --- |
| Manage organisation / team / integrations | Yes | No | No |
| View audit | Yes | No | No |
| Invoices / procurement | Yes | Yes | Own invoices only |
| Run reconciliation / resolve findings | Yes | Yes | No |
| Generate evidence | Yes | Yes | No |
| Create / share settlement | Yes | Yes | No |
| Approve settlement | Yes (including own, demo override) | Within limit, not own | No |
| Initiate payment | Yes | Yes | No |
| View internal reports | Yes | Yes | No |
| Respond to vendor proposal | No | No | Own proposal only |

## Not enabled / not verified

- **Database RLS is not active.** The application uses PGlite locally or a direct PostgreSQL connection in production and enforces tenant isolation in service code. A Supabase RLS template is provided, but it requires a dedicated non-bypass database role and setting `app.organization_id` per transaction. Enabling RLS without those changes will either do nothing for a privileged role or break queries.
- **Sentry is not integrated.** `SENTRY_DSN` is reserved but no SDK is wired in.
- **No penetration test, SOC 2 attestation, PCI certification or legal review** has been performed.
- **The in-memory rate limiter is single-instance only.** Use a shared Redis/Upstash limiter in production.
- **The local email path prints messages to logs.** Do not use password-reset content from production logs; configure a real provider.
- **Live PayPal and OpenAI behaviour is not verified** in this workspace. The code is structured around their documented endpoints, but credentials and sandbox interactions were unavailable.

## Production checklist

1. Use PostgreSQL with a least-privilege application role.
2. Set `AUTH_SECRET` and `APP_ENCRYPTION_KEY` to long random values; never commit them.
3. Set `DEMO_MODE=false`.
4. Serve only over HTTPS; set `APP_URL` to the exact public HTTPS origin.
5. Configure private object storage and verify signed URL expiry.
6. Configure a real email provider and verify reset/invitation delivery.
7. Replace the in-memory rate limiter with shared storage.
8. Add application monitoring and alerting; do not assume Sentry is active.
9. Run database backups and test restore.
10. Review retention for uploaded financial documents and audit records.
11. If Supabase RLS is required, implement the per-request tenant setting with a dedicated role and test it before enabling.
12. Rotate any credentials that were ever pasted into a terminal, log or shared document.
