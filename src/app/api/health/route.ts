import { withApi, noStore } from "@/lib/http";
import { getHealthStatus } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const health = await getHealthStatus();
    return noStore(health, health.ok ? 200 : 503);
  });
}
