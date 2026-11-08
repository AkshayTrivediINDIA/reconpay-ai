import { type NextRequest } from "next/server";
import { clientIp, parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/lib/auth/auth-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ip = clientIp(req);
    enforceRateLimit(`forgot:${ip}`, 8, 60 * 60 * 1000);
    const input = await parseJson(req, forgotPasswordSchema);
    const result = await requestPasswordReset(input.email);
    // Always return the same message to avoid account enumeration.
    return noStore({
      ok: true,
      message: "If an account exists for that email, a reset link has been sent.",
      devResetUrl: result.devResetUrl,
    });
  });
}
