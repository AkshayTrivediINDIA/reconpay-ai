# PayPal sandbox setup

ReconPay uses the real PayPal Orders v2 REST API. It does not simulate a successful payment. Without credentials the payment button is disabled and the server rejects payment initiation.

## Important currency restriction

PayPal does not support INR for these orders. The INR demo settlement must never be sent to PayPal; the server rejects it with an explicit validation error. Use `ReconPay Demo (USD)`, whose seeded settlement `STL-2026-0001` is ready for a real sandbox payment.

## 1. Create a sandbox REST app

1. Sign in at <https://developer.paypal.com/dashboard/>.
2. Switch to **Sandbox**.
3. Open **Apps & Credentials** and create a REST app.
4. Copy the sandbox **Client ID** and **Secret**.
5. Copy the sandbox **Business** account email for use as the payer in the test checkout. Do not use live credentials for the demo.

## 2. Configure the environment

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your-sandbox-client-id
PAYPAL_CLIENT_SECRET=your-sandbox-client-secret
PAYPAL_WEBHOOK_ID=your-sandbox-webhook-id
APP_URL=https://your-app.example
```

`PAYPAL_ENV` defaults to `sandbox`. Only set it to `live` when you intentionally intend to move real money.

`APP_URL` must exactly match the public origin used in the browser. It is used to construct the PayPal return/cancel URLs and the secure webhook URL.

## 3. Register the webhook

In the PayPal sandbox app, add a webhook with:

```text
https://<your-public-domain>/api/webhooks/paypal
```

Subscribe to at least:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`

Copy the generated **Webhook ID** into `PAYPAL_WEBHOOK_ID`. The webhook ID is not the URL and is not the signing secret.

On the Render demo, use the service's public URL:

```text
https://<your-service>.onrender.com/api/webhooks/paypal
```

`render.yaml` can set `PAYPAL_WEBHOOK_ID=pending` for the first deploy. Replace
it with the real webhook ID after registering the URL and restart/redeploy the
service. Payment initiation still works without the webhook ID, but webhook
signature verification will fail until it is correct.

For local development, expose the local server with an HTTPS tunnel and use the tunnel URL as `APP_URL` while testing. A plain localhost webhook cannot be called by PayPal. Local checkout can still be initiated, but do not claim webhook verification unless it was actually exercised.

## 4. Payment flow implemented

1. An authorised internal user opens a settlement in `READY_FOR_PAYMENT`.
2. The server verifies:
   - the settlement belongs to the active organisation;
   - internal approval is recorded;
   - state is ready;
   - PayPal supports the currency;
   - PayPal credentials exist.
3. The server creates a local payment row and calls `POST /v2/checkout/orders` with `intent: CAPTURE` and the exact amount in major units.
4. The browser is sent to the PayPal approval URL.
5. On return, the server calls `POST /v2/checkout/orders/{orderId}/capture`. The capture is never performed only in the browser.
6. The returned capture amount and currency are compared with the stored payment.
7. A settlement is marked `PAID` only after the captured amount matches.
8. PayPal webhooks call `/api/webhooks/paypal`. The server sends the raw event and PayPal signature headers to `/v1/notifications/verify-webhook-signature` using the configured webhook ID. The event is stored once; duplicate event IDs return `DUPLICATE` without repeating the state change.
9. Cancellation is recorded server-side; a confirmed payment cannot be cancelled.

## 5. Idempotency

- The browser generates an idempotency key for the payment initiation.
- Reusing the key for the same settlement returns the existing payment and approval URL without another PayPal order.
- Reusing the key for a different settlement is rejected.
- The check runs before mutable settlement-state checks, so a network retry after the settlement moved to `PAYMENT_PROCESSING` remains safe.
- PayPal requests also carry an `idempotencyKey` header where the PayPal API supports it.

## 6. Verify the sandbox path

Use the USD demo organisation and an authorised internal user:

1. Open `STL-2026-0001` (`READY_FOR_PAYMENT`).
2. Click **Pay with PayPal**.
3. Confirm the local payment is `AWAITING_APPROVAL`; the settlement is `PAYMENT_PROCESSING`.
4. Approve the order in PayPal with a sandbox buyer account.
5. Confirm the return handler captures server-side.
6. Confirm the payment becomes `SUCCEEDED` and the settlement becomes `PAID`.
7. Confirm the capture amount and currency match the proposal exactly.
8. Send or replay a webhook in the PayPal dashboard and verify:
   - a valid event is recorded with `signatureVerified = true`;
   - a duplicate event ID is ignored;
   - a tampered/invalid signature is rejected and recorded without changing payment state.
9. Check audit/evidence events for initiation, confirmation, cancellation and webhook outcomes.

## 7. Failure behaviour

- Missing credentials: HTTP 503 / disabled control; no fake success.
- Unsupported currency: validation error before any provider call.
- Missing approval or wrong state: conflict error.
- PayPal order failure: payment is marked `FAILED`, an event is recorded and the settlement can be retried from a failed state.
- Missing approval link: explicit provider error.
- Webhook signature failure: rejected and recorded; no payment state change.
- Amount/currency mismatch: payment marked `FAILED`, settlement marked `PAYMENT_FAILED`.
- Confirmed payment: cancellation is rejected.

## 8. Security rules

- Never place the client secret or webhook ID in client-side code.
- Never log the OAuth token or full PayPal payloads containing payer data.
- Keep `APP_URL` exact; never accept an arbitrary return URL from a query parameter.
- Always verify webhook signatures through PayPal's API.
- Treat `PAYMENT.CAPTURE.COMPLETED` as authoritative over a browser redirect.
- Do not enable live mode until sandbox tests, refunds, failures and webhook replays have been verified.
- Rotate the client secret if it is exposed.

## 9. What was not verified here

No PayPal credentials were available in this workspace. The code, client tests with a mocked provider, webhook signature-header checks and idempotency tests pass, but **no live sandbox OAuth, order, capture, webhook or refund was executed**. Do not state that this integration is live-tested until the steps above have been completed with real sandbox credentials.
