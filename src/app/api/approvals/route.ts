import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { listPendingApprovals } from "@/lib/services/settlements";
import { requirePermission } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const ctx = await requireApiContext();
    requirePermission(ctx, "approve_settlement");
    return noStore({ approvals: await listPendingApprovals(ctx) });
  });
}
