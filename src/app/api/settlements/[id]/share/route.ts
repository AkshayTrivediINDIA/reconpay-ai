import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { shareSettlementSchema, uuidSchema } from "@/lib/validation";
import { shareSettlement } from "@/lib/services/settlements";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const input = await parseJson(req, shareSettlementSchema);
    const result = await shareSettlement(ctx, uuidSchema.parse(id), input.expiryDays);
    return noStore({ ok: true, ...result });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const { expireVendorToken } = await import("@/lib/services/settlements");
    await expireVendorToken(ctx, uuidSchema.parse(id));
    return noStore({ ok: true });
  });
}
