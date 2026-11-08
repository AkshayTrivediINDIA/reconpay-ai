import type { NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/validation";
import { submitSettlement } from "@/lib/services/settlements";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    await submitSettlement(ctx, uuidSchema.parse(id));
    return noStore({ ok: true });
  });
}
