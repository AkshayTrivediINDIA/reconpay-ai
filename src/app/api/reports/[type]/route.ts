import type { NextRequest } from "next/server";
import { withApi } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { generateCsvReport, reportTypes, type ReportType } from "@/lib/services/reports";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { type } = await params;
    if (!(reportTypes as string[]).includes(type)) {
      throw new ValidationError("Unknown report type");
    }
    const { csv, fileName } = await generateCsvReport(ctx, type as ReportType, {
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
