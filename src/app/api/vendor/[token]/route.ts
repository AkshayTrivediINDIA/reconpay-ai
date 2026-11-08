import { withApi, noStore } from "@/lib/http";
import { getVendorPortalData } from "@/lib/services/settlements";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withApi(async () => {
    const { token } = await params;
    const data = await getVendorPortalData(token);
    if (!data) return noStore({ error: "This settlement link is invalid" }, 404);
    if (data.expired) return noStore({ expired: true }, 410);
    return noStore({
      settlement: {
        settlementNumber: data.row.settlement.settlementNumber,
        vendorName: data.row.vendorName,
        invoiceNumber: data.row.invoiceNumber,
        organizationName: data.row.organizationName,
        originalAmountMinor: data.row.settlement.originalAmountMinor.toString(),
        disputedAmountMinor: data.row.settlement.disputedAmountMinor.toString(),
        proposedAmountMinor: data.row.settlement.proposedAmountMinor.toString(),
        currency: data.row.settlement.currency,
        reason: data.row.settlement.reason,
        status: data.row.settlement.status,
        expiresAt: data.row.settlement.vendorTokenExpiresAt,
      },
    });
  });
}
