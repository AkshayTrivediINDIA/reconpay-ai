import type { NextRequest } from "next/server";
import { parseJson } from "@/lib/api";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { notificationReadSchema } from "@/lib/validation";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

export function GET() {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const [notifications, unread] = await Promise.all([
      listNotifications(ctx),
      unreadNotificationCount(ctx),
    ]);
    return noStore({ notifications, unread });
  });
}

export function PATCH(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const input = await parseJson(req, notificationReadSchema);
    if (input.all) await markAllNotificationsRead(ctx);
    else if (input.id) await markNotificationRead(ctx, input.id);
    return noStore({ ok: true });
  });
}
