import type { NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { reprocessInvoice } from "@/lib/services/invoices";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    enforceRateLimit(`invoice-reprocess:${ctx.user.id}`, 10, 10 * 60 * 1000);
    const { id } = await params;
    await reprocessInvoice(ctx, uuidSchema.parse(id));
    return noStore({ ok: true });
  });
}
