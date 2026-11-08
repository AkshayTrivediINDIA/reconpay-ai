import { getDb, setTestDatabase, createIsolatedDatabase } from "@/lib/db";
import {
  goodsReceiptItems,
  goodsReceipts,
  invoiceLineItems,
  invoices,
  organizationMembers,
  organizations,
  purchaseOrderItems,
  purchaseOrders,
  users,
  vendors,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import type { AuthContext } from "@/lib/auth/rbac";
import { computeLineTotal } from "@/lib/money";

export type TestDatabase = {
  close: () => Promise<void>;
};

export async function useTestDatabase(): Promise<TestDatabase> {
  const isolated = await createIsolatedDatabase({ memory: true });
  setTestDatabase({ db: isolated.db, kind: "pglite", close: isolated.close });
  return { close: isolated.close };
}

type Role = "ADMIN" | "FINANCE_MANAGER" | "VENDOR";

export function makeContext(input: {
  organization: {
    id: string;
    name: string;
    slug: string;
    baseCurrency: string;
    isDemo: boolean;
  };
  userId: string;
  name: string;
  email: string;
  membershipId: string;
  role: Role;
  vendorId?: string | null;
  approvalLimitMinor?: bigint | null;
}): AuthContext {
  return {
    sessionId: `test-session-${input.membershipId}`,
    user: { id: input.userId, email: input.email, name: input.name },
    organization: input.organization,
    membership: {
      id: input.membershipId,
      role: input.role,
      vendorId: input.vendorId ?? null,
      approvalLimitMinor: input.approvalLimitMinor ?? null,
    },
    ip: "127.0.0.1",
    userAgent: "Vitest",
  };
}

async function createUser(name: string, email: string) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    name,
    passwordHash: await hashPassword("TestPassword!2026"),
  });
  return { id, name, email };
}

export type MatchFixture = {
  organization: {
    id: string;
    name: string;
    slug: string;
    baseCurrency: string;
    isDemo: boolean;
  };
  vendorId: string;
  vendorName: string;
  otherVendorId: string;
  poId: string;
  poNumber: string;
  receiptId: string;
  invoiceId: string;
  invoiceNumber: string;
  admin: AuthContext;
  finance: AuthContext;
  vendor: AuthContext;
  otherVendor: AuthContext;
};

export async function createMatchFixture(input?: {
  suffix?: string;
  orderedMilli?: bigint;
  receivedMilli?: bigint;
  damagedMilli?: bigint;
  poUnitPriceMinor?: bigint;
  invoiceUnitPriceMinor?: bigint;
  quantityMilli?: bigint;
  withReceipt?: boolean;
  currency?: string;
}): Promise<MatchFixture> {
  const db = await getDb();
  const suffix = input?.suffix ?? crypto.randomUUID().slice(0, 8);
  const orderedMilli = input?.orderedMilli ?? 100_000n;
  const receivedMilli = input?.receivedMilli ?? 90_000n;
  const damagedMilli = input?.damagedMilli ?? 0n;
  const poUnitPriceMinor = input?.poUnitPriceMinor ?? 500_000n;
  const invoiceUnitPriceMinor = input?.invoiceUnitPriceMinor ?? poUnitPriceMinor;
  const quantityMilli = input?.quantityMilli ?? orderedMilli;
  const currency = input?.currency ?? "INR";
  const withReceipt = input?.withReceipt ?? true;

  const orgId = crypto.randomUUID();
  const organization = {
    id: orgId,
    name: `Test Org ${suffix}`,
    slug: `test-org-${suffix}`.toLowerCase(),
    baseCurrency: currency,
    isDemo: false,
  };
  await db.insert(organizations).values({
    id: orgId,
    name: organization.name,
    slug: organization.slug,
    baseCurrency: currency,
    country: currency === "USD" ? "US" : "IN",
  });

  const vendorId = crypto.randomUUID();
  const otherVendorId = crypto.randomUUID();
  const vendorName = `ABC Office Supplies ${suffix}`;
  await db.insert(vendors).values([
    {
      id: vendorId,
      organizationId: orgId,
      name: vendorName,
      code: `ABC-${suffix}`,
      currency,
      status: "ACTIVE",
    },
    {
      id: otherVendorId,
      organizationId: orgId,
      name: `Other Vendor ${suffix}`,
      code: `OTHER-${suffix}`,
      currency,
      status: "ACTIVE",
    },
  ]);

  const adminUser = await createUser("Admin User", `admin-${suffix}@test.example`);
  const financeUser = await createUser("Finance User", `finance-${suffix}@test.example`);
  const vendorUser = await createUser("Vendor User", `vendor-${suffix}@test.example`);
  const otherVendorUser = await createUser("Other Vendor User", `other-${suffix}@test.example`);

  const adminMembershipId = crypto.randomUUID();
  const financeMembershipId = crypto.randomUUID();
  const vendorMembershipId = crypto.randomUUID();
  const otherMembershipId = crypto.randomUUID();
  await db.insert(organizationMembers).values([
    {
      id: adminMembershipId,
      organizationId: orgId,
      userId: adminUser.id,
      role: "ADMIN",
      status: "ACTIVE",
      approvalLimitMinor: null,
    },
    {
      id: financeMembershipId,
      organizationId: orgId,
      userId: financeUser.id,
      role: "FINANCE_MANAGER",
      status: "ACTIVE",
      approvalLimitMinor: 50_000_000n,
    },
    {
      id: vendorMembershipId,
      organizationId: orgId,
      userId: vendorUser.id,
      role: "VENDOR",
      status: "ACTIVE",
      vendorId,
    },
    {
      id: otherMembershipId,
      organizationId: orgId,
      userId: otherVendorUser.id,
      role: "VENDOR",
      status: "ACTIVE",
      vendorId: otherVendorId,
    },
  ]);

  const poId = crypto.randomUUID();
  const poNumber = `PO-TEST-${suffix}`;
  const poTotal = computeLineTotal(poUnitPriceMinor, orderedMilli);
  await db.insert(purchaseOrders).values({
    id: poId,
    organizationId: orgId,
    vendorId,
    poNumber,
    orderDate: "2026-10-01",
    expectedDeliveryDate: "2026-10-10",
    currency,
    subtotalMinor: poTotal,
    taxMinor: 0n,
    totalMinor: poTotal,
    status: withReceipt ? "PARTIALLY_RECEIVED" : "OPEN",
    createdBy: adminUser.id,
  });
  const poItemId = crypto.randomUUID();
  await db.insert(purchaseOrderItems).values({
    id: poItemId,
    organizationId: orgId,
    purchaseOrderId: poId,
    lineNumber: 1,
    description: "Ergonomic office chair",
    sku: "CHAIR-TEST-01",
    quantityMilli: orderedMilli,
    unitPriceMinor: poUnitPriceMinor,
    taxRateBps: 0,
    lineTotalMinor: poTotal,
  });

  const receiptId = crypto.randomUUID();
  if (withReceipt) {
    await db.insert(goodsReceipts).values({
      id: receiptId,
      organizationId: orgId,
      purchaseOrderId: poId,
      receiptNumber: `GR-TEST-${suffix}`,
      receivedDate: "2026-10-05",
      status: "INSPECTED",
      createdBy: adminUser.id,
    });
    await db.insert(goodsReceiptItems).values({
      organizationId: orgId,
      goodsReceiptId: receiptId,
      purchaseOrderItemId: poItemId,
      quantityReceivedMilli: receivedMilli,
      quantityDamagedMilli: damagedMilli,
    });
  }

  const invoiceId = crypto.randomUUID();
  const invoiceNumber = `INV-TEST-${suffix}`;
  const lineTotal = computeLineTotal(invoiceUnitPriceMinor, quantityMilli);
  await db.insert(invoices).values({
    id: invoiceId,
    organizationId: orgId,
    vendorId,
    invoiceNumber,
    vendorNameRaw: vendorName,
    status: "VERIFIED",
    issueDate: "2026-10-06",
    dueDate: "2026-11-05",
    currency,
    subtotalMinor: lineTotal,
    taxMinor: 0n,
    discountMinor: 0n,
    shippingMinor: 0n,
    totalMinor: lineTotal,
    poReference: poNumber,
    extractionEngine: "SEED",
    extractionConfidence: 100,
    needsReview: false,
    verifiedAt: new Date(),
    verifiedBy: adminUser.id,
    createdBy: adminUser.id,
  });
  await db.insert(invoiceLineItems).values({
    organizationId: orgId,
    invoiceId,
    lineNumber: 1,
    description: "Ergonomic office chair",
    sku: "CHAIR-TEST-01",
    quantityMilli,
    unitPriceMinor: invoiceUnitPriceMinor,
    taxRateBps: 0,
    lineTotalMinor: lineTotal,
  });

  return {
    organization,
    vendorId,
    vendorName,
    otherVendorId,
    poId,
    poNumber,
    receiptId: withReceipt ? receiptId : "",
    invoiceId,
    invoiceNumber,
    admin: makeContext({
      organization,
      userId: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      membershipId: adminMembershipId,
      role: "ADMIN",
    }),
    finance: makeContext({
      organization,
      userId: financeUser.id,
      name: financeUser.name,
      email: financeUser.email,
      membershipId: financeMembershipId,
      role: "FINANCE_MANAGER",
      approvalLimitMinor: 50_000_000n,
    }),
    vendor: makeContext({
      organization,
      userId: vendorUser.id,
      name: vendorUser.name,
      email: vendorUser.email,
      membershipId: vendorMembershipId,
      role: "VENDOR",
      vendorId,
    }),
    otherVendor: makeContext({
      organization,
      userId: otherVendorUser.id,
      name: otherVendorUser.name,
      email: otherVendorUser.email,
      membershipId: otherMembershipId,
      role: "VENDOR",
      vendorId: otherVendorId,
    }),
  };
}

export async function createSecondOrganizationContext(): Promise<AuthContext> {
  const db = await getDb();
  const suffix = crypto.randomUUID().slice(0, 8);
  const organization = {
    id: crypto.randomUUID(),
    name: `Second Org ${suffix}`,
    slug: `second-org-${suffix}`.toLowerCase(),
    baseCurrency: "INR",
    isDemo: false,
  };
  await db.insert(organizations).values({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    baseCurrency: "INR",
    country: "IN",
  });
  const user = await createUser("Second Admin", `second-${suffix}@test.example`);
  const membershipId = crypto.randomUUID();
  await db.insert(organizationMembers).values({
    id: membershipId,
    organizationId: organization.id,
    userId: user.id,
    role: "ADMIN",
    status: "ACTIVE",
    approvalLimitMinor: null,
  });
  return makeContext({
    organization,
    userId: user.id,
    name: user.name,
    email: user.email,
    membershipId,
    role: "ADMIN",
  });
}
