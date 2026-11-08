import { describe, expect, it } from "vitest";
import { verifyPaypalWebhook } from "@/lib/paypal/client";

describe("PayPal webhook verification guardrails", () => {
  it("refuses to verify without PayPal signature headers", async () => {
    await expect(
      verifyPaypalWebhook({ headers: {}, body: { id: "WH-1" } }),
    ).rejects.toMatchObject({
      code: "PAYPAL_WEBHOOK_HEADERS_MISSING",
      status: 400,
    });
  });

  it("refuses to verify when only some signature headers are present", async () => {
    await expect(
      verifyPaypalWebhook({
        headers: {
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-transmission-id": "transmission-1",
        },
        body: { id: "WH-1" },
      }),
    ).rejects.toMatchObject({ code: "PAYPAL_WEBHOOK_HEADERS_MISSING" });
  });
});
