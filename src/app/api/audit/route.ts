import type { NextRequest } from "next/server";
import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/services/audit";
import { getReportSummary } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    if (params.get("summary") === "true") {
      return noStore(await getReportSummary(ctx));
    }
    return noStore(
      await listAuditLogs(ctx, {
        search: params.get("search") ?? undefined,
        action: params.get("action") ?? undefined,
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        page: Number(params.get("page") ?? "1"),
        pageSize: Number(params.get("pageSize") ?? "40"),
      }),
    );
  });
}
