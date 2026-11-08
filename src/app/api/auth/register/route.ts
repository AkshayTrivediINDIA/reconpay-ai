import { type NextRequest } from "next/server";
import { clientIp, parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { registerSchema } from "@/lib/validation";
import { registerAccount } from "@/lib/auth/auth-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ip = clientIp(req);
    enforceRateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    const input = await parseJson(req, registerSchema);
    const result = await registerAccount({
      ...input,
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return noStore({ ok: true, ...result }, 201);
  });
}
