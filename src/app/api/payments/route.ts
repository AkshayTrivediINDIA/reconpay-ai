import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { paymentCreateSchema, uuidSchema } from "@/lib/validation";
import { listPayments, createPaypalPayment } from "@/lib/services/payments";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    return noStore(
      await listPayments(ctx, {
        page: Number(params.get("page") ?? "1"),
        pageSize: Number(params.get("pageSize") ?? "25"),
      }),
    );
  });
}

const createSchema = paymentCreateSchema.extend({
  settlementId: uuidSchema,
});

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const input = await parseJson(req, createSchema);
    const result = await createPaypalPayment(
      ctx,
      input.settlementId,
      input.idempotencyKey,
    );
    return noStore({ ok: true, ...result }, result.reused ? 200 : 201);
  });
}
