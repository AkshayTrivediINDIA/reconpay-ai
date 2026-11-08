import type { NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { listInvoices, uploadInvoice } from "@/lib/services/invoices";
import { ValidationError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const params = req.nextUrl.searchParams;
    const result = await listInvoices(ctx, {
      search: params.get("search") ?? undefined,
      status: params.get("status") ?? undefined,
      vendorId: params.get("vendorId") ?? undefined,
      page: Number(params.get("page") ?? "1"),
      pageSize: Number(params.get("pageSize") ?? "25"),
    });
    return noStore(result);
  });
}

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    enforceRateLimit(`invoice-upload:${ctx.user.id}`, 20, 10 * 60 * 1000);
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ValidationError("Upload an invoice as multipart/form-data with a file field");
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("A PDF or image invoice file is required");
    const vendorId = typeof form.get("vendorId") === "string" ? String(form.get("vendorId")) : null;
    const poReference =
      typeof form.get("poReference") === "string" ? String(form.get("poReference")) : null;
    const result = await uploadInvoice(ctx, {
      file,
      vendorId: vendorId || null,
      poReference: poReference || null,
    });
    return noStore({ ok: true, ...result }, 201);
  });
}
