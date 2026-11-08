import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { teamUpdateSchema, uuidSchema } from "@/lib/validation";
import { updateTeamMember } from "@/lib/services/team";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const input = await parseJson(req, teamUpdateSchema);
    await updateTeamMember(ctx, uuidSchema.parse(id), input);
    return noStore({ ok: true });
  });
}
