import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { settlementApprovalSchema, uuidSchema } from "@/lib/validation";
import { approveSettlement } from "@/lib/services/settlements";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const input = await parseJson(req, settlementApprovalSchema);
    await approveSettlement(ctx, uuidSchema.parse(id), input);
    return noStore({ ok: true });
  });
}
