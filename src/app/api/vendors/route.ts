import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { vendorCreateSchema } from "@/lib/validation";
import { listVendors, createVendor } from "@/lib/services/vendors";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const search = req.nextUrl.searchParams.get("search") ?? undefined;
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const result = await listVendors(ctx, {
      search,
      status: status === "ALL" ? undefined : status,
      page: Number(req.nextUrl.searchParams.get("page") ?? "1"),
      pageSize: Number(req.nextUrl.searchParams.get("pageSize") ?? "100"),
    });
    return noStore(result);
  });
}

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const input = await parseJson(req, vendorCreateSchema);
    const vendor = await createVendor(ctx, input);
    return noStore({ ok: true, vendor }, 201);
  });
}
