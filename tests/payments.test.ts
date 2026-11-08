import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, getDb } from "@/lib/db";
import { payments, settlements, webhookEvents } from "@/lib/db/schema";
import { createMatchFixture, useTestDatabase } from "./helpers/fixtures";
import {
  approveSettlement,
  createSettlement,
  getSettlement,
  markReadyForPayment,
  respondToVendorToken,
  shareSettlement,
  submitSettlement,
} from "@/lib/services/settlements";
import {
  createPaypalPayment,
  getPaymentDetail,
  handlePaypalWebhook,
} from "@/lib/services/payments";

const paypalMocks = vi.hoisted(() => ({
  createPaypalOrder: vi.fn(),
  capturePaypalOrder: vi.fn(),
  getPaypalOrder: vi.fn(),
  verifyPaypalWebhook: vi.fn(),
}));

vi.mock("@/lib/paypal/client", () => {
  class PaypalError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: unknown;
    constructor(code: string, message: string, status = 502, details?: unknown) {
      super(message);
      this.name = "PaypalError";
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    PaypalError,
    createPaypalOrder: paypalMocks.createPaypalOrder,
    capturePaypalOrder: paypalMocks.capturePaypalOrder,
    getPaypalOrder: paypalMocks.getPaypalOrder,
    verifyPaypalWebhook: paypalMocks.verifyPaypalWebhook,
  };
});

const webhookHeaders = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
  "paypal-transmission-id": "transmission-1",
  "paypal-transmission-sig": "signature",
  "paypal-transmission-time": "2026-11-07T00:00:00Z",
};

async function readyUsdSettlement(suffix: string) {
  const fixture = await createMatchFixture({ suffix, currency: "USD" });
  const settlement = await createSettlement(fixture.finance, {
    invoiceId: fixture.invoiceId,
    proposedAmount: "1500.00",
    disputedAmount: "0.00",
    reason: "Idempotency and webhook test settlement.",
    currency: "USD",
  });
  await submitSettlement(fixture.finance, settlement.id);
  await approveSettlement(fixture.admin, settlement.id, {
    decision: "APPROVED",
    comments: "Approved in automated test.",
  });
  const share = await shareSettlement(fixture.admin, settlement.id, 7);
  await respondToVendorToken(share.token, { action: "ACCEPT" });
  await markReadyForPayment(fixture.admin, settlement.id);
  return { fixture, settlement };
}

describe("PayPal payment initiation and webhook deduplication", () => {
  beforeAll(async () => {
    await useTestDatabase();
    paypalMocks.createPaypalOrder.mockImplementation(
      async (input: { settlementNumber: string; amount: string; currency: string }) => ({
        id: `ORDER-${input.settlementNumber}-${crypto.randomUUID().slice(0, 8)}`,
        status: "CREATED",
        links: [
          {
            rel: "approve",
            href: `https://www.sandbox.paypal.com/checkoutnow?token=ORDER-${input.settlementNumber}`,
          },
        ],
        purchase_units: [
          { amount: { currency_code: input.currency, value: input.amount } },
        ],
      }),
    );
    paypalMocks.verifyPaypalWebhook.mockResolvedValue(true);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("uses the idempotency key to return the same payment and calls PayPal once", async () => {
    const { fixture, settlement } = await readyUsdSettlement("idem");
    expect((await getSettlement(fixture.admin, settlement.id)).status).toBe(
      "READY_FOR_PAYMENT",
    );
    const first = await createPaypalPayment(
      fixture.admin,
      settlement.id,
      "idempotency-key-fixed-1",
    );
    expect(first.reused).toBe(false);
    expect(first.status).toBe("AWAITING_APPROVAL");
    expect(first.approvalUrl).toContain("sandbox.paypal.com");

    const second = await createPaypalPayment(
      fixture.admin,
      settlement.id,
      "idempotency-key-fixed-1",
    );
    expect(second.reused).toBe(true);
    expect(second.paymentId).toBe(first.paymentId);
    expect(second.approvalUrl).toBe(first.approvalUrl);
    expect(paypalMocks.createPaypalOrder).toHaveBeenCalledTimes(1);

    const rows = await (await getDb())
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, "idempotency-key-fixed-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerOrderId).toMatch(
      new RegExp(`^ORDER-${settlement.settlementNumber}-`),
    );
  });

  it("rejects reusing an idempotency key for a different settlement", async () => {
    const first = await readyUsdSettlement("idem-same-org");
    await createPaypalPayment(first.fixture.admin, first.settlement.id, "shared-key");
    const secondSettlement = await createSettlement(first.fixture.finance, {
      invoiceId: first.fixture.invoiceId,
      proposedAmount: "1000.00",
      disputedAmount: "0.00",
      reason: "Second settlement in the same organization for idempotency-key conflict.",
      currency: "USD",
    });
    await submitSettlement(first.fixture.finance, secondSettlement.id);
    await approveSettlement(first.fixture.admin, secondSettlement.id, {
      decision: "APPROVED",
      comments: "Approved in idempotency-key conflict test.",
    });
    const share = await shareSettlement(first.fixture.admin, secondSettlement.id, 7);
    await respondToVendorToken(share.token, { action: "ACCEPT" });
    await markReadyForPayment(first.fixture.admin, secondSettlement.id);
    await expect(
      createPaypalPayment(first.fixture.admin, secondSettlement.id, "shared-key"),
    ).rejects.toThrow(/different settlement/);
  });

  it("processes a verified webhook once and marks the settlement paid", async () => {
    const { fixture, settlement } = await readyUsdSettlement("webhook");
    const initiation = await createPaypalPayment(
      fixture.admin,
      settlement.id,
      "webhook-key",
    );
    const paymentRows = await (await getDb())
      .select()
      .from(payments)
      .where(eq(payments.id, initiation.paymentId));
    const payment = paymentRows[0]!;
    expect(payment.providerOrderId).toBeTruthy();

    const event = {
      id: "WH-EVENT-COMPLETED-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-1",
        status: "COMPLETED",
        amount: { value: "1500.00", currency_code: "USD" },
        supplementary_data: { related_ids: { order_id: payment.providerOrderId } },
      },
    };
    const first = await handlePaypalWebhook({
      rawBody: JSON.stringify(event),
      headers: webhookHeaders,
    });
    expect(first.status).toBe("PROCESSED");
    expect(paypalMocks.verifyPaypalWebhook).toHaveBeenCalled();

    const duplicate = await handlePaypalWebhook({
      rawBody: JSON.stringify(event),
      headers: webhookHeaders,
    });
    expect(duplicate.status).toBe("DUPLICATE");

    const detail = await getPaymentDetail(fixture.admin, initiation.paymentId);
    expect(detail.payment.status).toBe("SUCCEEDED");
    const settlementRows = await (await getDb())
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlement.id));
    expect(settlementRows[0]?.status).toBe("PAID");
    const events = await (await getDb())
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.providerEventId, "WH-EVENT-COMPLETED-1"));
    expect(events).toHaveLength(1);
    expect(events[0]?.signatureVerified).toBe(true);
  });

  it("rejects a webhook whose signature verification fails", async () => {
    paypalMocks.verifyPaypalWebhook.mockResolvedValueOnce(false);
    const event = {
      id: "WH-EVENT-REJECTED-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAPTURE-X", status: "COMPLETED" },
    };
    const result = await handlePaypalWebhook({
      rawBody: JSON.stringify(event),
      headers: webhookHeaders,
    });
    expect(result.status).toBe("REJECTED");
    const rows = await (await getDb())
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.providerEventId, "WH-EVENT-REJECTED-1"));
    expect(rows[0]?.signatureVerified).toBe(false);
    expect(rows[0]?.processingStatus).toBe("REJECTED");
  });

  it("rejects malformed JSON before any signature call or state mutation", async () => {
    const before = paypalMocks.verifyPaypalWebhook.mock.calls.length;
    const result = await handlePaypalWebhook({
      rawBody: "{not-json",
      headers: webhookHeaders,
    });
    expect(result.status).toBe("REJECTED");
    expect(paypalMocks.verifyPaypalWebhook.mock.calls.length).toBe(before);
  });
});
