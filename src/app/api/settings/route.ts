import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { organizationUpdateSchema } from "@/lib/validation";
import { getOrganizationSettings, updateOrganizationSafe } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const ctx = await requireApiContext();
    return noStore(await getOrganizationSettings(ctx));
  });
}

export function PATCH(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const input = await parseJson(req, organizationUpdateSchema);
    await updateOrganizationSafe(ctx, input);
    return noStore({ ok: true });
  });
}
