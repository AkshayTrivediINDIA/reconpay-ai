import type { NextRequest } from "next/server";
import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { getPaymentDetail, capturePaypalPayment } from "@/lib/services/payments";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    return noStore(await getPaymentDetail(ctx, uuidSchema.parse(id)));
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    const result = await capturePaypalPayment(ctx, uuidSchema.parse(id));
    return noStore({ ok: true, ...result });
  });
}
