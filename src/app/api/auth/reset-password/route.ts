import { type NextRequest } from "next/server";
import { clientIp, parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation";
import { resetPassword } from "@/lib/auth/auth-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    enforceRateLimit(`reset:${clientIp(req)}`, 10, 60 * 60 * 1000);
    const input = await parseJson(req, resetPasswordSchema);
    await resetPassword(input);
    return noStore({
      ok: true,
      message: "Password reset. Sign in with your new password.",
    });
  });
}
