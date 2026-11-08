import { type NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validation";
import { requireApiContext } from "@/lib/auth/session";
import { changeOwnPassword } from "@/lib/auth/auth-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    enforceRateLimit(`change-password:${ctx.user.id}`, 6, 60 * 60 * 1000);
    const input = await parseJson(req, changePasswordSchema);
    await changeOwnPassword(
      ctx.user.id,
      input.currentPassword,
      input.newPassword,
      ctx.sessionId,
      ctx.organization.id,
    );
    return noStore({
      ok: true,
      message: "Password changed. Other active sessions were revoked.",
    });
  });
}
