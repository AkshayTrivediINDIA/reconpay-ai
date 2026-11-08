import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { handlePaypalWebhook } from "@/lib/services/payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headers: Record<string, string | null> = {
      "paypal-transmission-id": req.headers.get("paypal-transmission-id"),
      "paypal-transmission-time": req.headers.get("paypal-transmission-time"),
      "paypal-transmission-sig": req.headers.get("paypal-transmission-sig"),
      "paypal-cert-url": req.headers.get("paypal-cert-url"),
      "paypal-auth-algo": req.headers.get("paypal-auth-algo"),
      "correlation-id": req.headers.get("correlation-id"),
    };
    const result = await handlePaypalWebhook({ rawBody, headers });
    const status =
      result.status === "REJECTED" ? 400 : result.status === "DUPLICATE" ? 200 : 200;
    return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[paypal-webhook] processing failed", error);
    return jsonError(500, "WEBHOOK_FAILED", "Webhook processing failed");
  }
}
