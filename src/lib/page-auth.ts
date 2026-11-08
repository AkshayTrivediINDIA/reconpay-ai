import { redirect } from "next/navigation";
import type { AuthContext, Permission } from "@/lib/auth/rbac";
import { can, isVendor } from "@/lib/auth/rbac";
import { requireAppContext } from "@/lib/auth/session";

/** Internal pages are unavailable to vendor-role members. */
export async function requireInternalPage(
  permission?: Permission,
): Promise<AuthContext> {
  const ctx = await requireAppContext();
  if (isVendor(ctx)) {
    redirect(
      permission
        ? `/dashboard?denied=${encodeURIComponent(permission)}`
        : "/dashboard",
    );
  }
  if (permission && !can(ctx, permission)) {
    redirect(`/dashboard?denied=${encodeURIComponent(permission)}`);
  }
  return ctx;
}

export async function requireVendorOrInternalPage(): Promise<AuthContext> {
  return requireAppContext();
}

export async function requirePagePermission(
  permission: Permission,
): Promise<AuthContext> {
  const ctx = await requireAppContext();
  if (!can(ctx, permission)) {
    redirect(`/dashboard?denied=${encodeURIComponent(permission)}`);
  }
  return ctx;
}
