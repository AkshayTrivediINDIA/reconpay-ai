import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  discrepancies,
  invoices,
  payments,
  reconciliationRuns,
  settlements,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, vendorScope } from "@/lib/auth/rbac";
import { listPendingApprovals } from "./settlements";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return keys;
}

export async function getDashboardData(ctx: AuthContext) {
  const db = await getDb();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
  sixMonthsAgo.setUTCDate(1);
  sixMonthsAgo.setUTCHours(0, 0, 0, 0);

  if (isVendor(ctx)) {
    const scopedVendor = vendorScope(ctx);
    const [invoiceRows, settlementRows, paymentRows] = await Promise.all([
      db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organization.id),
            eq(invoices.vendorId, scopedVendor),
          ),
        )
        .orderBy(desc(invoices.createdAt))
        .limit(50),
      db
        .select()
        .from(settlements)
        .where(
          and(
            eq(settlements.organizationId, ctx.organization.id),
            eq(settlements.vendorId, scopedVendor),
          ),
        )
        .orderBy(desc(settlements.createdAt))
        .limit(50),
      db
        .select({
          payment: payments,
          settlementNumber: settlements.settlementNumber,
        })
        .from(payments)
        .innerJoin(settlements, eq(settlements.id, payments.settlementId))
        .where(
          and(
            eq(payments.organizationId, ctx.organization.id),
            eq(settlements.vendorId, scopedVendor),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(20),
    ]);
    return {
      kind: "VENDOR" as const,
      invoiceCount: invoiceRows.length,
      openSettlements: settlementRows.filter((settlement) =>
        [
          "APPROVED",
          "SHARED",
          "CLARIFICATION_REQUESTED",
          "VENDOR_ACCEPTED",
          "READY_FOR_PAYMENT",
        ].includes(settlement.status),
      ),
      paidTotalMinor: paymentRows
        .filter((row) => row.payment.status === "SUCCEEDED")
        .reduce((sum, row) => sum + row.payment.amountMinor, 0n),
      recentSettlements: settlementRows.slice(0, 5),
      recentPayments: paymentRows.slice(0, 5),
    };
  }

  const [
    invoiceStatusRows,
    discrepancyRows,
    settlementRows,
    readyRows,
    paymentRows,
    recentInvoices,
    recentRuns,
    recentSettlements,
    approvals,
    invoiceTimeline,
    paymentTimeline,
    vendorExposure,
  ] = await Promise.all([
    db
      .select({
        status: invoices.status,
        total: count(),
        amount: sql<string>`coalesce(sum(${invoices.totalMinor}), 0)::text`,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, ctx.organization.id))
      .groupBy(invoices.status),
    db
      .select({
        total: count(),
        amount: sql<string>`coalesce(sum(case when ${discrepancies.impactMinor} > 0 then ${discrepancies.impactMinor} else 0 end), 0)::text`,
      })
      .from(discrepancies)
      .where(
        and(
          eq(discrepancies.organizationId, ctx.organization.id),
          inArray(discrepancies.status, ["OPEN", "ACKNOWLEDGED", "DISPUTED"]),
        ),
      ),
    db
      .select({
        status: settlements.status,
        total: count(),
        amount: sql<string>`coalesce(sum(${settlements.proposedAmountMinor}), 0)::text`,
      })
      .from(settlements)
      .where(eq(settlements.organizationId, ctx.organization.id))
      .groupBy(settlements.status),
    db
      .select({
        total: count(),
        amount: sql<string>`coalesce(sum(${settlements.proposedAmountMinor}), 0)::text`,
      })
      .from(settlements)
      .where(
        and(
          eq(settlements.organizationId, ctx.organization.id),
          eq(settlements.status, "READY_FOR_PAYMENT"),
        ),
      ),
    db
      .select({
        total: count(),
        amount: sql<string>`coalesce(sum(${payments.amountMinor}), 0)::text`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, ctx.organization.id),
          eq(payments.status, "SUCCEEDED"),
        ),
      ),
    db
      .select({
        invoice: invoices,
        vendorName: vendors.name,
      })
      .from(invoices)
      .leftJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(eq(invoices.organizationId, ctx.organization.id))
      .orderBy(desc(invoices.createdAt))
      .limit(6),
    db
      .select({
        run: reconciliationRuns,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(reconciliationRuns)
      .innerJoin(invoices, eq(invoices.id, reconciliationRuns.invoiceId))
      .where(eq(reconciliationRuns.organizationId, ctx.organization.id))
      .orderBy(desc(reconciliationRuns.createdAt))
      .limit(5),
    db
      .select({
        settlement: settlements,
        vendorName: vendors.name,
      })
      .from(settlements)
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .where(eq(settlements.organizationId, ctx.organization.id))
      .orderBy(desc(settlements.createdAt))
      .limit(5),
    listPendingApprovals(ctx),
    db
      .select({ createdAt: invoices.createdAt, totalMinor: invoices.totalMinor })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organization.id),
          gte(invoices.createdAt, sixMonthsAgo),
        ),
      ),
    db
      .select({ createdAt: payments.createdAt, amountMinor: payments.amountMinor })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, ctx.organization.id),
          eq(payments.status, "SUCCEEDED"),
          gte(payments.createdAt, sixMonthsAgo),
        ),
      ),
    db
      .select({
        vendorId: vendors.id,
        vendorName: vendors.name,
        exposure: sql<string>`coalesce(sum(case when ${discrepancies.impactMinor} > 0 then ${discrepancies.impactMinor} else 0 end), 0)::text`,
        count: count(),
      })
      .from(discrepancies)
      .innerJoin(invoices, eq(invoices.id, discrepancies.invoiceId))
      .innerJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(
        and(
          eq(discrepancies.organizationId, ctx.organization.id),
          inArray(discrepancies.status, ["OPEN", "ACKNOWLEDGED", "DISPUTED"]),
        ),
      )
      .groupBy(vendors.id, vendors.name)
      .orderBy(
        desc(
          sql`coalesce(sum(case when ${discrepancies.impactMinor} > 0 then ${discrepancies.impactMinor} else 0 end), 0)`,
        ),
      )
      .limit(5),
  ]);

  const invoiceStatus = invoiceStatusRows.map((row) => ({
    status: row.status,
    count: row.total,
    amountMinor: BigInt(row.amount),
  }));
  const verifiedAmount = invoiceStatus
    .filter((row) => row.status === "VERIFIED")
    .reduce((sum, row) => sum + row.amountMinor, 0n);
  const pendingReviewCount = invoiceStatus
    .filter((row) => ["NEEDS_REVIEW", "EXTRACTED", "PROCESSING", "UPLOADED"].includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
  const invoiceCount = invoiceStatus.reduce((sum, row) => sum + row.count, 0);
  const pendingApprovalCount = settlementRows
    .filter((row) => row.status === "PENDING_APPROVAL")
    .reduce((sum, row) => sum + row.total, 0);
  const pendingApprovalAmount = settlementRows
    .filter((row) => row.status === "PENDING_APPROVAL")
    .reduce((sum, row) => sum + BigInt(row.amount), 0n);

  const months = lastMonths(6);
  const monthly = months.map((month) => ({
    month,
    invoiceCount: invoiceTimeline.filter((row) => monthKey(row.createdAt) === month).length,
    invoiceValueMinor: invoiceTimeline
      .filter((row) => monthKey(row.createdAt) === month)
      .reduce((sum, row) => sum + row.totalMinor, 0n),
    paidValueMinor: paymentTimeline
      .filter((row) => monthKey(row.createdAt) === month)
      .reduce((sum, row) => sum + row.amountMinor, 0n),
  }));

  return {
    kind: "INTERNAL" as const,
    invoiceCount,
    pendingReviewCount,
    verifiedAmountMinor: verifiedAmount,
    openDiscrepancyCount: discrepancyRows[0]?.total ?? 0,
    openDiscrepancyAmountMinor: BigInt(discrepancyRows[0]?.amount ?? "0"),
    pendingApprovalCount,
    pendingApprovalAmountMinor: pendingApprovalAmount,
    readyForPaymentCount: readyRows[0]?.total ?? 0,
    readyForPaymentAmountMinor: BigInt(readyRows[0]?.amount ?? "0"),
    paidCount: paymentRows[0]?.total ?? 0,
    paidAmountMinor: BigInt(paymentRows[0]?.amount ?? "0"),
    invoiceStatus,
    recentInvoices,
    recentRuns,
    recentSettlements,
    approvals: approvals.slice(0, 5),
    monthly,
    vendorExposure: vendorExposure.map((row) => ({
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      exposureMinor: BigInt(row.exposure),
      openCount: row.count,
    })),
  };
}
