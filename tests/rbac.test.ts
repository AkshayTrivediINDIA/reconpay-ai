import { describe, expect, it } from "vitest";
import { can, canApproveAmount, isVendor, vendorScope, requirePermission } from "@/lib/auth/rbac";
import type { AuthContext } from "@/lib/auth/rbac";

function ctx(role: "ADMIN" | "FINANCE_MANAGER" | "VENDOR", options?: {
  vendorId?: string | null;
  approvalLimitMinor?: bigint | null;
}): AuthContext {
  return {
    sessionId: "session",
    user: { id: "user", email: "user@test.example", name: "User" },
    organization: {
      id: "org",
      name: "Org",
      slug: "org",
      baseCurrency: "INR",
      isDemo: false,
    },
    membership: {
      id: "membership",
      role,
      vendorId: options?.vendorId ?? null,
      approvalLimitMinor:
        options?.approvalLimitMinor === undefined ? 10_000_000n : options.approvalLimitMinor,
    },
  };
}

describe("server-side RBAC policy", () => {
  it("grants administrators broad internal permissions but not vendor response", () => {
    const admin = ctx("ADMIN");
    expect(can(admin, "approve_settlement")).toBe(true);
    expect(can(admin, "initiate_payment")).toBe(true);
    expect(can(admin, "manage_team")).toBe(true);
    expect(can(admin, "respond_vendor_settlement")).toBe(false);
  });

  it("grants finance operational permissions without team management", () => {
    const finance = ctx("FINANCE_MANAGER");
    expect(can(finance, "create_settlement")).toBe(true);
    expect(can(finance, "run_reconciliation")).toBe(true);
    expect(can(finance, "manage_team")).toBe(false);
    expect(can(finance, "manage_organization")).toBe(false);
  });

  it("limits vendor memberships to their own history and responses", () => {
    const vendor = ctx("VENDOR", { vendorId: "vendor-1" });
    expect(isVendor(vendor)).toBe(true);
    expect(vendorScope(vendor)).toBe("vendor-1");
    expect(can(vendor, "view_own_vendor_history")).toBe(true);
    expect(can(vendor, "view_reports")).toBe(false);
    expect(can(vendor, "initiate_payment")).toBe(false);
    expect(() => requirePermission(vendor, "manage_invoices")).toThrow(
      /cannot perform this action/,
    );
  });

  it("requires a linked vendor record for a vendor scope", () => {
    expect(() => vendorScope(ctx("VENDOR", { vendorId: null }))).toThrow(
      /not linked to a vendor record/,
    );
  });

  it("enforces the finance approval limit exactly at the boundary", () => {
    const finance = ctx("FINANCE_MANAGER", { approvalLimitMinor: 5_000_000n });
    expect(canApproveAmount(finance, 4_999_999n).allowed).toBe(true);
    expect(canApproveAmount(finance, 5_000_000n).allowed).toBe(true);
    expect(canApproveAmount(finance, 5_000_001n).allowed).toBe(false);
  });

  it("refuses finance approval when no limit is assigned and allows admins", () => {
    expect(
      canApproveAmount(ctx("FINANCE_MANAGER", { approvalLimitMinor: null }), 1n)
        .allowed,
    ).toBe(false);
    expect(canApproveAmount(ctx("ADMIN"), 10_000_000_000n).allowed).toBe(true);
    expect(canApproveAmount(ctx("VENDOR", { vendorId: "v" }), 1n).allowed).toBe(false);
  });
});
