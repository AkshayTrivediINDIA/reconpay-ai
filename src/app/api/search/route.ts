import type { NextRequest } from "next/server";
import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { globalSearch } from "@/lib/services/search";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    return noStore(await globalSearch(ctx, req.nextUrl.searchParams.get("q") ?? ""));
  });
}
