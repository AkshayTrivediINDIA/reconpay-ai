import type { NextRequest } from "next/server";
import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { getReconciliationDetail } from "@/lib/services/reconciliation";

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
