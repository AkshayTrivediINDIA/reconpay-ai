import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema, reconcileSchema } from "@/lib/validation";
import {
  getReconciliationDetail,
  runReconciliation,
} from "@/lib/services/reconciliation";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    return noStore(await getReconciliationDetail(ctx, uuidSchema.parse(id)));
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const invoiceId = uuidSchema.parse(id);
    const input = await parseJson(req, reconcileSchema.pick({ purchaseOrderId: true, goodsReceiptIds: true }));
    const result = await runReconciliation(ctx, {
      invoiceId,
      purchaseOrderId: input.purchaseOrderId,
      goodsReceiptIds: input.goodsReceiptIds,
    });
    return noStore({ ok: true, ...result }, 201);
  });
}
