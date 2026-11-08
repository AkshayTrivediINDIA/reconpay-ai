import type { NextRequest } from "next/server";
import { withApi } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { createEvidencePdf } from "@/lib/services/evidence";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    const { bytes, fileName } = await createEvidencePdf(ctx, uuidSchema.parse(id));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
