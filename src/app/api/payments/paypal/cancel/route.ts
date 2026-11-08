import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/auth/session";
import { cancelPaypalPayment } from "@/lib/services/payments";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const paymentId = uuidSchema.safeParse(req.nextUrl.searchParams.get("paymentId"));
  if (!paymentId.success) redirect("/payments?error=invalid_cancel");
  try {
    const ctx = await requireApiContext();
    await cancelPaypalPayment(ctx, paymentId.data);
    redirect(`/payments?cancelled=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancellation failed";
    redirect(`/payments?error=${encodeURIComponent(message.slice(0, 300))}`);
  }
}
