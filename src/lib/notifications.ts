import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";

type NotificationType = "INFO" | "ACTION_REQUIRED" | "APPROVAL" | "PAYMENT" | "DISCREPANCY";

export async function notify(input: {
  organizationId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(notifications).values({
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    type: input.type,
    title: input.title.slice(0, 200),
    body: input.body,
    entityType: input.entityType,
    entityId: input.entityId,
  });
}

export async function listNotifications(ctx: AuthContext, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, ctx.organization.id),
        or(
          isNull(notifications.userId),
          eq(notifications.userId, ctx.user.id),
        ),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(ctx: AuthContext): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, ctx.organization.id),
        or(
          isNull(notifications.userId),
          eq(notifications.userId, ctx.user.id),
        ),
        isNull(notifications.readAt),
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function markNotificationRead(
  ctx: AuthContext,
  notificationId: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organizationId, ctx.organization.id),
      ),
    );
}

export async function markAllNotificationsRead(ctx: AuthContext): Promise<void> {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, ctx.organization.id),
        isNull(notifications.readAt),
        or(
          isNull(notifications.userId),
          eq(notifications.userId, ctx.user.id),
        ),
      ),
    );
}
