# Demo guide

The seed is designed to demonstrate honest three-way reconciliation. It does not label an invoice variance as an amount the vendor owes, and it does not create a payment without a real provider response.

## Reset and seed

```bash
# Stop `npm run dev` first: the local PGlite database file must not be open.
npm run db:reset
npm run dev
```

`db:reset` removes only `.data/reconpay` and `.data/storage`, then runs migrations and the seed. It refuses to run when `DATABASE_URL` points to an external database or when `NODE_ENV=production`.

If demo organisations already exist, `npm run db:seed` prints a message and does not duplicate them. Use `db:reset` for a repeatable demonstration.

## Sign-in details

Demo credentials are visible on the login page only when `DEMO_MODE=true` and the active organisation is marked as a demo organisation.

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Asha Menon | Administrator | `admin@demo.reconpay.ai` | `ReconPay!2026` |
| Rohan Kapoor | Finance Manager | `finance@demo.reconpay.ai` | `ReconPay!2026` |
| Priya Nair | Vendor for ABC Office Supplies | `vendor@demo.reconpay.ai` | `ReconPay!2026` |

The administrator and finance user are members of both demo organisations. The vendor user belongs only to the INR organisation and only to ABC Office Supplies.

## Organisation 1: ReconPay Demo (INR)

Base currency: INR. Finance approval limit: INR 5,00,000 (`50,000,000` minor units).

### Scenario A: short delivery on ABC Office Supplies

| Record | Value |
| --- | --- |
| Purchase order | `PO-2026-001` |
| Goods receipt | `GR-2026-001` |
| Invoice | `INV-2026-001` |
| Ordered | 100 ergonomic chairs at INR 5,000 each |
| Invoice value | INR 5,00,000 |
| Received | 90 usable units, 0 damaged |
| Short quantity | 10 units |
| Potential quantity exposure | **INR 50,000** (10 x INR 5,000) |

Expected deterministic findings include `RECEIVED_QTY_MISMATCH` and `PARTIAL_DELIVERY`. The UI explicitly calls this exposure a review signal, not a vendor liability or a revised payable. No settlement is created against this invoice by the seed.

### Scenario B: clean match

| Record | Value |
| --- | --- |
| Purchase order | `PO-2026-002` |
| Goods receipt | `GR-2026-002` |
| Invoice | `INV-2026-002` |
| Vendor | Apex Furniture Co. |
| Item | 5 height-adjustable desks at INR 20,000 each |
| Invoice value | INR 1,00,000 |

The three-way match is exact and produces no material discrepancy. A full-value settlement `STL-2026-0001` is submitted by the finance manager and remains in the approval queue for the administrator. This demonstrates a clean proposal without inventing a deduction.

### Scenario C: price variance and vendor discussion

| Record | Value |
| --- | --- |
| Purchase order | `PO-2026-003` |
| Goods receipt | `GR-2026-003` |
| Invoice | `INV-2026-003` |
| Item | 20 monitor stands |
| Purchase-order price | INR 2,500 each |
| Invoice price | INR 3,000 each |
| Potential price exposure | **INR 10,000** (20 x INR 500) |

The seeded commercial proposal `STL-2026-0002` proposes INR 50,000 and marks INR 10,000 as disputed exposure. It is approved for **vendor discussion only** and the vendor response is `CLARIFY`. The seed does not assert that INR 10,000 is owed.

To exercise the public vendor portal:

1. Sign in as the administrator or finance manager.
2. Open `STL-2026-0002` under Settlements.
3. Use **Share with vendor** to issue a fresh secure link. Only a hash of the token is stored.
4. Open the displayed link in a private browser window. It expires after the selected period.
5. The vendor can accept, dispute or request clarification. The reason and response are recorded.

## Organisation 2: ReconPay Demo (USD)

Base currency: USD. Finance approval limit: USD 50,000 (`5,000,000` minor units).

| Record | Value |
| --- | --- |
| Purchase order | `PO-2026-101` |
| Goods receipt | `GR-2026-101` |
| Invoice | `INV-2026-101` |
| Vendor | Global Office Systems |
| Item | 12 task chairs at USD 125 each |
| Invoice value | USD 1,500.00 |
| Settlement | `STL-2026-0001` |
| State | `READY_FOR_PAYMENT` |

This organisation exists because PayPal does not support INR. No payment is seeded. With real PayPal sandbox credentials configured, an authorised user can open the settlement and initiate a genuine Orders v2 checkout. Without credentials the button is disabled and the server refuses the action; no success is simulated.

Switch organisations with the organisation control in the top bar. Sessions retain the selected organisation server-side, and every query is scoped to it.

## What to inspect

- **Dashboard**: counts, verified invoice value and open flagged exposure are database queries, not hard-coded statistics.
- **Invoice `INV-2026-001`**: source document, extracted line items, verification state and reconciliation link.
- **Reconciliation detail**: exact ordered/received/usable/short quantities, rule calculation, source references and a generated evidence PDF.
- **Discrepancies**: open findings can be resolved or disputed with a reason; state changes are audited.
- **Evidence centre**: generated evidence reports and download availability.
- **Approvals**: finance can approve within the limit; a creator cannot approve their own settlement; administrators may override for demo practicality.
- **Payments**: provider states only; a browser return alone does not mark a payment captured.
- **Reports**: CSV downloads include a UTF-8 BOM and neutralise leading spreadsheet formula characters.
- **Audit trail**: sign-ins, invoice verification, reconciliation, evidence, approval and payment events.
- **Vendor account**: the vendor sees only its own invoices, settlements and payments, and cannot open internal reporting or audit pages.

## Expected limitations in the demo

- The OpenAI path is inactive without a key. Extraction uses the deterministic PDF text parser and evidence summaries are rules-based, labelled accordingly in the UI.
- The USD settlement cannot be paid without PayPal credentials. INR settlements cannot be paid through PayPal at all.
- Email invitations and reset links are printed to the development console unless `RESEND_API_KEY` is configured.
- The demo organisation is intentionally labelled; it must not be used with real vendor or payment data.
