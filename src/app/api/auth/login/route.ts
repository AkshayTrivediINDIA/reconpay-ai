import { type NextRequest } from "next/server";
import { clientIp, parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { loginRequestSchema } from "@/lib/validation";
import { authenticate } from "@/lib/auth/auth-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ip = clientIp(req);
    const input = await parseJson(req, loginRequestSchema);
    enforceRateLimit(`login-ip:${ip}`, 20, 15 * 60 * 1000);
    enforceRateLimit(`login-account:${input.email}`, 10, 15 * 60 * 1000);
    const result = await authenticate({
      ...input,
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return noStore({ ok: true, ...result });
  });
}
