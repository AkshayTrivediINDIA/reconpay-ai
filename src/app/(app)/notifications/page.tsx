import Link from "next/link";
import { Bell } from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { listNotifications, unreadNotificationCount } from "@/lib/notifications";
import { formatDateTime } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { NotificationReadButton } from "@/components/notifications/notification-read-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (entityType === "INVOICE") return `/invoices/${entityId}`;
  if (entityType === "SETTLEMENT") return `/settlements/${entityId}`;
  if (entityType === "PAYMENT") return `/payments/${entityId}`;
  return null;
}

export default async function NotificationsPage() {
  const ctx = await requireAppContext();
  const [notifications, unread] = await Promise.all([
    listNotifications(ctx),
    unreadNotificationCount(ctx),
  ]);

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Operational events that need attention. Notifications never replace the underlying audit record."
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {unread} unread
          </span>
        }
        actions={unread > 0 ? <NotificationReadButton all /> : null}
      />
      <Card>
        <CardContent className="px-0 pb-0">
          {notifications.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Bell}
                title="No notifications"
                description="Invoice verification, approvals, vendor responses, discrepancies, and payment confirmations appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {notifications.map((notification) => {
                const href = entityHref(notification.entityType, notification.entityId);
                const unreadItem = notification.readAt === null;
                return (
                  <li
                    key={notification.id}
                    className={
                      unreadItem ? "bg-indigo-50/40 px-5 py-4" : "px-5 py-4"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {unreadItem ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" aria-label="Unread" />
                          ) : null}
                          <p className="text-xs font-semibold text-slate-900">
                            {href ? (
                              <Link href={href} className="hover:text-indigo-700">
                                {notification.title}
                              </Link>
                            ) : (
                              notification.title
                            )}
                          </p>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                            {notification.type.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-600">
                          {notification.body}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {formatDateTime(notification.createdAt)}
                          {notification.userId ? " · Direct" : " · Organization"}
                        </p>
                      </div>
                      {unreadItem ? (
                        <NotificationReadButton id={notification.id} />
                      ) : (
                        <span className="text-[10px] text-slate-400">Read</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            Showing the most recent 50 notifications for this user and organization.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
