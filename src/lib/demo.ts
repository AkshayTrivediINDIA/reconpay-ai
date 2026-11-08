/**
 * Demo data identifiers. The seed script and the settings screen share these
 * constants so the clearly-labelled demo organization can be reset
 * reproducibly. These are not production credentials.
 */
export const DEMO_ORGANIZATION = {
  name: "ReconPay Demo (INR)",
  slug: "reconpay-demo-inr",
  baseCurrency: "INR",
  country: "IN",
} as const;

export const DEMO_PASSWORD = "ReconPay!2026";

export const DEMO_USERS = [
  {
    name: "Asha Menon",
    email: "admin@demo.reconpay.ai",
    password: DEMO_PASSWORD,
    role: "ADMIN" as const,
    description: "Administrator — full access, including approvals and settings",
  },
  {
    name: "Rohan Kapoor",
    email: "finance@demo.reconpay.ai",
    password: DEMO_PASSWORD,
    role: "FINANCE_MANAGER" as const,
    description: "Finance Manager — ₹6,00,000 approval limit",
  },
  {
    name: "Priya Nair",
    email: "vendor@demo.reconpay.ai",
    password: DEMO_PASSWORD,
    role: "VENDOR" as const,
    description: "Vendor user for ABC Office Supplies",
  },
] as const;
