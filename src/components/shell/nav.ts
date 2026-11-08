import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Building2,
  CreditCard,
  FileBarChart,
  FileSearch,
  FileText,
  Handshake,
  LayoutDashboard,
  PackageCheck,
  ScrollText,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  roles?: string[];
};

export type NavSection = { label: string; items: NavItem[] };

export const internalNavigation: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Operations",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/purchase-orders", label: "Purchase orders", icon: ShoppingCart },
      { href: "/goods-receipts", label: "Goods receipts", icon: PackageCheck },
      { href: "/reconciliation", label: "Reconciliation", icon: FileSearch },
      { href: "/discrepancies", label: "Discrepancies", icon: AlertTriangle },
      { href: "/evidence", label: "Evidence center", icon: BadgeCheck },
    ],
  },
  {
    label: "Settlement",
    items: [
      { href: "/settlements", label: "Settlements", icon: Handshake },
      {
        href: "/approvals",
        label: "Approvals",
        icon: WalletCards,
        roles: ["ADMIN", "FINANCE_MANAGER"],
      },
      { href: "/payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/vendors", label: "Vendors", icon: Building2 },
      {
        href: "/reports",
        label: "Reports",
        icon: FileBarChart,
        roles: ["ADMIN", "FINANCE_MANAGER"],
      },
      { href: "/audit", label: "Audit trail", icon: ScrollText, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/team", label: "Team", icon: Users, roles: ["ADMIN"] },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const vendorNavigation: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Your account",
    items: [
      { href: "/invoices", label: "Your invoices", icon: FileText },
      { href: "/settlements", label: "Settlements", icon: Handshake },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Account settings", icon: Settings },
    ],
  },
];

export function navigationForRole(role: string): NavSection[] {
  if (role === "VENDOR") return vendorNavigation;
  return internalNavigation
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.includes(role),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
