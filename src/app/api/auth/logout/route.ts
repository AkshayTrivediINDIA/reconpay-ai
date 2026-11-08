import { type NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { destroyCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    await destroyCurrentSession();
    return noStore({ ok: true });
  });
}
