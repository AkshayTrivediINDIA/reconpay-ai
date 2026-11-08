import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { grCreateSchema } from "@/lib/validation";
import { listGoodsReceipts, createGoodsReceipt } from "@/lib/services/goods-receipts";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    return noStore(
      await listGoodsReceipts(ctx, {
        search: params.get("search") ?? undefined,
        page: Number(params.get("page") ?? "1"),
        pageSize: Number(params.get("pageSize") ?? "25"),
      }),
    );
  });
}

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const input = await parseJson(req, grCreateSchema);
    const goodsReceipt = await createGoodsReceipt(ctx, input);
    return noStore({ ok: true, goodsReceipt }, 201);
  });
}
