import type { NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { testIntegration } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

const allowed = ["OPENAI", "PAYPAL", "SUPABASE"] as const;
type Provider = (typeof allowed)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { provider } = await params;
    if (!(allowed as readonly string[]).includes(provider)) {
      return noStore({ error: "Unknown integration" }, 404);
    }
    return noStore(await testIntegration(ctx, provider as Provider));
  });
}
