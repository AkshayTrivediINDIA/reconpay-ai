import { requireAppContext, listUserOrganizations } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/notifications";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAppContext();
  const [organizations, unread] = await Promise.all([
    listUserOrganizations(ctx.user.id),
    unreadNotificationCount(ctx),
  ]);
  return (
    <AppShell
      user={{ name: ctx.user.name, email: ctx.user.email }}
      organization={ctx.organization}
      role={ctx.membership.role}
      unread={unread}
      organizations={organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: org.role,
      }))}
      isDemo={ctx.organization.isDemo}
    >
      {children}
    </AppShell>
  );
}
