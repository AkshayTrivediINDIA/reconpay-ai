import { type NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { switchOrgSchema } from "@/lib/validation";
import { requireApiContext, switchOrganization } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    await requireApiContext();
    const input = await parseJson(req, switchOrgSchema);
    await switchOrganization(input.organizationId);
    return noStore({ ok: true });
  });
}
