import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/auth/session";
import { capturePaypalPayment } from "@/lib/services/payments";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const paymentId = uuidSchema.safeParse(req.nextUrl.searchParams.get("paymentId"));
  const token = req.nextUrl.searchParams.get("token") ?? undefined;
  if (!paymentId.success) redirect("/payments?error=invalid_return");
  try {
    const ctx = await requireApiContext();
    await capturePaypalPayment(ctx, paymentId.data, token);
    redirect(`/payments/${paymentId.data}?captured=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture failed";
    redirect(`/payments?error=${encodeURIComponent(message.slice(0, 300))}`);
  }
}
