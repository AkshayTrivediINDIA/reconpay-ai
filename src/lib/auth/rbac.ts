import { ForbiddenError } from "@/lib/errors";
import type { UserRole } from "@/lib/db/schema";

export type AuthContext = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    baseCurrency: string;
    isDemo: boolean;
  };
  membership: {
    id: string;
    role: UserRole;
    vendorId: string | null;
    approvalLimitMinor: bigint | null;
  };
  ip?: string;
  userAgent?: string;
};

export type Permission =
  | "manage_organization"
  | "manage_team"
  | "manage_integrations"
  | "view_audit"
  | "manage_invoices"
  | "manage_procurement"
  | "run_reconciliation"
  | "resolve_discrepancy"
  | "generate_evidence"
  | "create_settlement"
  | "approve_settlement"
  | "share_settlement"
  | "initiate_payment"
  | "view_reports"
  | "respond_vendor_settlement"
  | "view_own_vendor_history";

const rolePermissions: Record<UserRole, Permission[]> = {
  ADMIN: [
    "manage_organization",
    "manage_team",
    "manage_integrations",
    "view_audit",
    "manage_invoices",
    "manage_procurement",
    "run_reconciliation",
    "resolve_discrepancy",
    "generate_evidence",
    "create_settlement",
    "approve_settlement",
    "share_settlement",
    "initiate_payment",
    "view_reports",
  ],
  FINANCE_MANAGER: [
    "manage_invoices",
    "manage_procurement",
    "run_reconciliation",
    "resolve_discrepancy",
    "generate_evidence",
    "create_settlement",
    "approve_settlement",
    "share_settlement",
    "initiate_payment",
    "view_reports",
  ],
  VENDOR: ["respond_vendor_settlement", "view_own_vendor_history"],
};

export function can(ctx: AuthContext, permission: Permission): boolean {
  return rolePermissions[ctx.membership.role]?.includes(permission) ?? false;
}

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!can(ctx, permission)) {
    throw new ForbiddenError(
      `Your role (${ctx.membership.role.replaceAll("_", " ")}) cannot perform this action`,
    );
  }
}

export function requireRole(ctx: AuthContext, roles: UserRole[]): void {
  if (!roles.includes(ctx.membership.role)) {
    throw new ForbiddenError("Insufficient role for this action");
  }
}

export function isVendor(ctx: AuthContext): boolean {
  return ctx.membership.role === "VENDOR";
}

export function vendorScope(ctx: AuthContext): string {
  if (!isVendor(ctx) || !ctx.membership.vendorId) {
    throw new ForbiddenError("Vendor access is not linked to a vendor record");
  }
  return ctx.membership.vendorId;
}

export function canApproveAmount(
  ctx: AuthContext,
  amountMinor: bigint,
): { allowed: boolean; reason?: string } {
  if (ctx.membership.role === "ADMIN") return { allowed: true };
  if (ctx.membership.role !== "FINANCE_MANAGER") {
    return { allowed: false, reason: "This role cannot approve settlements" };
  }
  const limit = ctx.membership.approvalLimitMinor;
  if (limit === null) {
    return {
      allowed: false,
      reason:
        "No approval limit is assigned to your membership. Ask an administrator to set one.",
    };
  }
  if (amountMinor > limit) {
    return {
      allowed: false,
      reason:
        "The amount exceeds your assigned approval limit. An administrator must approve.",
    };
  }
  return { allowed: true };
}

export function requireApprovalAuthority(
  ctx: AuthContext,
  amountMinor: bigint,
): void {
  requirePermission(ctx, "approve_settlement");
  const result = canApproveAmount(ctx, amountMinor);
  if (!result.allowed) {
    throw new ForbiddenError(result.reason ?? "Approval not permitted");
  }
}

export const roleLabel: Record<UserRole, string> = {
  ADMIN: "Administrator",
  FINANCE_MANAGER: "Finance Manager",
  VENDOR: "Vendor",
};
