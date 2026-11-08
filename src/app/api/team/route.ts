import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { teamInviteSchema } from "@/lib/validation";
import { listTeam, inviteTeamMember } from "@/lib/services/team";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const ctx = await requireApiContext();
    return noStore(await listTeam(ctx));
  });
}

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const input = await parseJson(req, teamInviteSchema);
    const result = await inviteTeamMember(ctx, input);
    return noStore({ ok: true, ...result }, 201);
  });
}
