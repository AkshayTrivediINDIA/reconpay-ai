import type { NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { generateEvidenceReport, listEvidenceRuns } from "@/lib/services/evidence";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    return noStore(
      await listEvidenceRuns(ctx, {
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
    const body = (await req.json().catch(() => null)) as { runId?: unknown } | null;
    const runId = uuidSchema.parse(body?.runId);
    const result = await generateEvidenceReport(ctx, runId);
    return noStore({ ok: true, ...result }, 201);
  });
}
