import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { settlementCreateSchema } from "@/lib/validation";
import { listSettlements, createSettlement } from "@/lib/services/settlements";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    return noStore(
      await listSettlements(ctx, {
        search: params.get("search") ?? undefined,
        status: params.get("status") ?? undefined,
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
    const input = await parseJson(req, settlementCreateSchema);
    const settlement = await createSettlement(ctx, input);
    return noStore({ ok: true, settlement }, 201);
  });
}
