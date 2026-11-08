import type { NextRequest } from "next/server";
import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { listReconciliationRuns } from "@/lib/services/reconciliation";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    return noStore(
      await listReconciliationRuns(ctx, {
        search: params.get("search") ?? undefined,
        page: Number(params.get("page") ?? "1"),
        pageSize: Number(params.get("pageSize") ?? "25"),
      }),
    );
  });
}
