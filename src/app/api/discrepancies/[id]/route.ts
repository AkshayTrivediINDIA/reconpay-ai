import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { discrepancyUpdateSchema, uuidSchema } from "@/lib/validation";
import { updateDiscrepancy } from "@/lib/services/reconciliation";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const discrepancyId = uuidSchema.parse(id);
    const input = await parseJson(req, discrepancyUpdateSchema);
    const discrepancy = await updateDiscrepancy(ctx, discrepancyId, input);
    return noStore({ ok: true, discrepancy });
  });
}
