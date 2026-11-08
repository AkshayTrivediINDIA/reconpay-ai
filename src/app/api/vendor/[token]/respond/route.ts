import type { NextRequest } from "next/server";
import { parseJson, clientIp } from "@/lib/api";
import { withApi, noStore } from "@/lib/http";
import { vendorResponseSchema } from "@/lib/validation";
import { respondToVendorToken } from "@/lib/services/settlements";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  return withApi(async () => {
    enforceRateLimit(`vendor-token:${clientIp(req)}`, 20, 15 * 60 * 1000);
    const { token } = await params;
    const input = await parseJson(req, vendorResponseSchema);
    await respondToVendorToken(token, input);
    return noStore({ ok: true });
  });
}
