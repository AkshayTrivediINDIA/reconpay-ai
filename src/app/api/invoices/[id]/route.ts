import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uuidSchema, invoiceUpdateSchema } from "@/lib/validation";
import { getInvoiceDetail, updateAndVerifyInvoice } from "@/lib/services/invoices";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    return noStore(await getInvoiceDetail(ctx, uuidSchema.parse(id)));
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const { id } = await params;
    const invoiceId = uuidSchema.parse(id);
    const input = await parseJson(req, invoiceUpdateSchema);
    const invoice = await updateAndVerifyInvoice(ctx, invoiceId, input);
    return noStore({ ok: true, invoice });
  });
}
