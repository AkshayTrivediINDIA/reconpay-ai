import { type NextRequest } from "next/server";
import { clientIp, parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { loginRequestSchema } from "@/lib/validation";
import { authenticate } from "@/lib/auth/auth-service";
import { destroyCurrentSession } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60 * 1000;
// Generous enough for a shared public demo (3 seeded accounts, many visitors
// behind one NAT) while still blunting brute force.
const IP_LIMIT = 60;
const ACCOUNT_LIMIT = 30;

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ip = clientIp(req);
    const input = await parseJson(req, loginRequestSchema);
    const email = input.email.trim().toLowerCase();

    // Count the attempt first: a blocked request must not sign the user out.
    const perIp = consumeRateLimit(`login-ip:${ip}`, IP_LIMIT, WINDOW_MS);
    const perAccount = consumeRateLimit(
      `login-account:${email}`,
      ACCOUNT_LIMIT,
      WINDOW_MS,
    );
    if (!perIp.allowed || !perAccount.allowed) {
      const retryAfterSeconds = Math.max(
        perIp.retryAfterSeconds,
        perAccount.retryAfterSeconds,
      );
      throw new AppError(
        429,
        "RATE_LIMITED",
        `Too many sign-in attempts. Please wait ${retryAfterSeconds} seconds and try again.`,
        { retryAfterSeconds },
      );
    }

    // Revoke and clear any existing session before issuing a new one, so a
    // stale cookie can never keep the previous account's identity.
    await destroyCurrentSession();

    const result = await authenticate({
      ...input,
      email,
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return noStore({ ok: true, ...result });
  });
}
