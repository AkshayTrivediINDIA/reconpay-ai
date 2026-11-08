import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { vendorUpdateSchema, uuidSchema } from "@/lib/validation";
import { getVendorProfile, updateVendor } from "@/lib/services/vendors";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const { id } = await params;
    const vendorId = uuidSchema.parse(id);
    return noStore(await getVendorProfile(ctx, vendorId));
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
    const vendorId = uuidSchema.parse(id);
    const input = await parseJson(req, vendorUpdateSchema);
    const vendor = await updateVendor(ctx, vendorId, input);
    if (!vendor) throw new ValidationError("Vendor update failed");
    return noStore({ ok: true, vendor });
  });
}
