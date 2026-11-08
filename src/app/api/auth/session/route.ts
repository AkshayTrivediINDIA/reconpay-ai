import { withApi, noStore } from "@/lib/http";
import { getAppContext, listUserOrganizations } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const ctx = await getAppContext();
    if (!ctx) return noStore({ authenticated: false }, 200);
    const organizations = await listUserOrganizations(ctx.user.id);
    return noStore({
      authenticated: true,
      user: ctx.user,
      organization: ctx.organization,
      membership: {
        role: ctx.membership.role,
        vendorId: ctx.membership.vendorId,
        approvalLimitMinor: ctx.membership.approvalLimitMinor?.toString() ?? null,
      },
      organizations,
    });
  });
}
