import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { poUpdateSchema, uuidSchema } from "@/lib/validation";
import { getPurchaseOrderDetail, updatePurchaseOrder } from "@/lib/services/purchase-orders";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    return noStore(await getPurchaseOrderDetail(ctx, uuidSchema.parse(id)));
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const input = await parseJson(req, poUpdateSchema);
    const purchaseOrder = await updatePurchaseOrder(ctx, uuidSchema.parse(id), input);
    return noStore({ ok: true, purchaseOrder });
  });
}
