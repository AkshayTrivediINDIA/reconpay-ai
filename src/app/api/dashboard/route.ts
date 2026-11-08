import { withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const ctx = await requireApiContext();
    return noStore(await getDashboardData(ctx));
  });
}
