import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditLogs,
  discrepancies,
  invoices,
  payments,
  reconciliationRuns,
  settlements,
  vendors,
  purchaseOrders,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, writeAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/errors";
import { toMajorString, formatQuantityPlain } from "@/lib/money";

export type ReportType =
  | "invoices"
  | "discrepancies"
  | "reconciliation"
  | "settlements"
  | "payments"
  | "audit";

export const reportTypes: ReportType[] = [
  "invoices",
  "discrepancies",
  "reconciliation",
  "settlements",
  "payments",
  "audit",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Prevent spreadsheet formula injection in exported user-controlled text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function generateCsvReport(
  ctx: AuthContext,
  reportType: ReportType,
  options: { from?: string; to?: string } = {},
): Promise<{ csv: string; fileName: string }> {
  requirePermission(ctx, "view_reports");
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot export organization reports");
  const db = await getDb();
  const fromDate = options.from ? new Date(`${options.from}T00:00:00Z`) : null;
  const toDate = options.to ? new Date(`${options.to}T23:59:59Z`) : null;
  const stamp = new Date().toISOString().slice(0, 10);

  let csv = "";
  if (reportType === "invoices") {
    const clauses = [eq(invoices.organizationId, ctx.organization.id)];
    if (fromDate) clauses.push(gte(invoices.createdAt, fromDate));
    if (toDate) clauses.push(lte(invoices.createdAt, toDate));
    const rows = await db
      .select({ invoice: invoices, vendorName: vendors.name })
      .from(invoices)
      .leftJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(and(...clauses))
      .orderBy(desc(invoices.createdAt));
    csv = toCsv(
      ["Invoice number", "Vendor", "Status", "Issue date", "Due date", "Currency", "Subtotal", "Tax", "Discount", "Shipping", "Total", "PO reference", "Extraction engine", "Confidence", "Created at", "Invoice ID"],
      rows.map(({ invoice, vendorName }) => [
        invoice.invoiceNumber,
        vendorName ?? invoice.vendorNameRaw ?? "",
        invoice.status,
        invoice.issueDate ?? "",
        invoice.dueDate ?? "",
        invoice.currency,
        toMajorString(invoice.subtotalMinor),
        toMajorString(invoice.taxMinor),
        toMajorString(invoice.discountMinor),
        toMajorString(invoice.shippingMinor),
        toMajorString(invoice.totalMinor),
        invoice.poReference ?? "",
        invoice.extractionEngine,
        invoice.extractionConfidence ?? "",
        invoice.createdAt.toISOString(),
        invoice.id,
      ]),
    );
  } else if (reportType === "discrepancies") {
    const clauses = [eq(discrepancies.organizationId, ctx.organization.id)];
    if (fromDate) clauses.push(gte(discrepancies.createdAt, fromDate));
    if (toDate) clauses.push(lte(discrepancies.createdAt, toDate));
    const rows = await db
      .select({ discrepancy: discrepancies, invoiceNumber: invoices.invoiceNumber })
      .from(discrepancies)
      .innerJoin(invoices, eq(invoices.id, discrepancies.invoiceId))
      .where(and(...clauses))
      .orderBy(desc(discrepancies.createdAt));
    csv = toCsv(
      ["Invoice", "Rule", "Severity", "Title", "Description", "Calculation", "Expected", "Actual", "Flagged exposure", "Currency", "Status", "Reviewer note", "Created at", "Discrepancy ID"],
      rows.map(({ discrepancy, invoiceNumber }) => [
        invoiceNumber,
        discrepancy.ruleCode,
        discrepancy.severity,
        discrepancy.title,
        discrepancy.description,
        discrepancy.calculation,
        discrepancy.expectedValue ?? "",
        discrepancy.actualValue ?? "",
        discrepancy.impactMinor === null ? "" : toMajorString(discrepancy.impactMinor),
        discrepancy.currency,
        discrepancy.status,
        discrepancy.resolutionNote ?? "",
        discrepancy.createdAt.toISOString(),
        discrepancy.id,
      ]),
    );
  } else if (reportType === "reconciliation") {
    const clauses = [eq(reconciliationRuns.organizationId, ctx.organization.id)];
    if (fromDate) clauses.push(gte(reconciliationRuns.createdAt, fromDate));
    if (toDate) clauses.push(lte(reconciliationRuns.createdAt, toDate));
    const rows = await db
      .select({
        run: reconciliationRuns,
        invoiceNumber: invoices.invoiceNumber,
        poNumber: purchaseOrders.poNumber,
      })
      .from(reconciliationRuns)
      .innerJoin(invoices, eq(invoices.id, reconciliationRuns.invoiceId))
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, reconciliationRuns.purchaseOrderId))
      .where(and(...clauses))
      .orderBy(desc(reconciliationRuns.createdAt));
    csv = toCsv(
      ["Invoice", "Purchase order", "Status", "Engine version", "Discrepancies", "Ordered qty", "Received qty", "Usable qty", "Short qty", "Invoice total", "Potential quantity exposure", "Potential impact", "Completed at", "Run ID"],
      rows.map(({ run, invoiceNumber, poNumber }) => [
        invoiceNumber,
        poNumber,
        run.status,
        run.engineVersion,
        run.discrepancyCount,
        formatQuantityPlain(run.orderedQtyMilli),
        formatQuantityPlain(run.receivedQtyMilli),
        formatQuantityPlain(run.usableQtyMilli),
        formatQuantityPlain(run.shortQtyMilli),
        toMajorString(run.invoiceTotalMinor),
        toMajorString(run.potentialQuantityExposureMinor),
        toMajorString(run.potentialImpactMinor),
        run.completedAt?.toISOString() ?? "",
        run.id,
      ]),
    );
  } else if (reportType === "settlements") {
    const clauses = [eq(settlements.organizationId, ctx.organization.id)];
    if (fromDate) clauses.push(gte(settlements.createdAt, fromDate));
    if (toDate) clauses.push(lte(settlements.createdAt, toDate));
    const rows = await db
      .select({
        settlement: settlements,
        vendorName: vendors.name,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(settlements)
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .innerJoin(invoices, eq(invoices.id, settlements.invoiceId))
      .where(and(...clauses))
      .orderBy(desc(settlements.createdAt));
    csv = toCsv(
      ["Settlement", "Vendor", "Invoice", "Status", "Original amount", "Disputed amount", "Proposed amount", "Currency", "Reason", "Submitted at", "Approved at", "Vendor responded at", "Created at", "Settlement ID"],
      rows.map(({ settlement, vendorName, invoiceNumber }) => [
        settlement.settlementNumber,
        vendorName,
        invoiceNumber,
        settlement.status,
        toMajorString(settlement.originalAmountMinor),
        toMajorString(settlement.disputedAmountMinor),
        toMajorString(settlement.proposedAmountMinor),
        settlement.currency,
        settlement.reason,
        settlement.submittedAt?.toISOString() ?? "",
        settlement.approvedAt?.toISOString() ?? "",
        settlement.vendorRespondedAt?.toISOString() ?? "",
        settlement.createdAt.toISOString(),
        settlement.id,
      ]),
    );
  } else if (reportType === "payments") {
    const clauses = [eq(payments.organizationId, ctx.organization.id)];
    if (fromDate) clauses.push(gte(payments.createdAt, fromDate));
    if (toDate) clauses.push(lte(payments.createdAt, toDate));
    const rows = await db
      .select({
        payment: payments,
        settlementNumber: settlements.settlementNumber,
        vendorName: vendors.name,
      })
      .from(payments)
      .innerJoin(settlements, eq(settlements.id, payments.settlementId))
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .where(and(...clauses))
      .orderBy(desc(payments.createdAt));
    csv = toCsv(
      ["Settlement", "Vendor", "Provider", "Provider order", "Capture ID", "Amount", "Currency", "Status", "Failure reason", "Initiated at", "Confirmed at", "Payment ID"],
      rows.map(({ payment, settlementNumber, vendorName }) => [
        settlementNumber,
        vendorName,
        payment.provider,
        payment.providerOrderId ?? "",
        payment.providerCaptureId ?? "",
        toMajorString(payment.amountMinor),
        payment.currency,
        payment.status,
        payment.failureReason ?? "",
        payment.createdAt.toISOString(),
        payment.confirmedAt?.toISOString() ?? "",
        payment.id,
      ]),
    );
  } else {
    const clauses = [eq(auditLogs.organizationId, ctx.organization.id)];
    if (fromDate) clauses.push(gte(auditLogs.createdAt, fromDate));
    if (toDate) clauses.push(lte(auditLogs.createdAt, toDate));
    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...clauses))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20_000);
    csv = toCsv(
      ["Timestamp", "Actor type", "Actor", "Action", "Entity type", "Entity ID", "Description", "IP", "Audit ID"],
      rows.map((row) => [
        row.createdAt.toISOString(),
        row.actorType,
        row.actorLabel,
        row.action,
        row.entityType ?? "",
        row.entityId ?? "",
        row.description,
        row.ip ?? "",
        row.id,
      ]),
    );
  }

  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "REPORT_EXPORTED",
    entityType: "report",
    description: `Exported ${reportType} CSV report`,
    metadata: { reportType, from: options.from, to: options.to },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { csv, fileName: `ReconPay_${reportType}_${stamp}.csv` };
}

export async function getReportSummary(ctx: AuthContext) {
  requirePermission(ctx, "view_reports");
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access organization reports");
  const db = await getDb();
  const [invoiceStats, discrepancyStats, settlementStats, paymentStats] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
        verified: sql<number>`count(*) filter (where ${invoices.status} = 'VERIFIED')::int`,
        total: sql<string>`coalesce(sum(${invoices.totalMinor}), 0)::text`,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, ctx.organization.id)),
    db
      .select({
        count: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${discrepancies.status} in ('OPEN','ACKNOWLEDGED','DISPUTED'))::int`,
        exposure: sql<string>`coalesce(sum(case when ${discrepancies.impactMinor} > 0 then ${discrepancies.impactMinor} else 0 end), 0)::text`,
      })
      .from(discrepancies)
      .where(eq(discrepancies.organizationId, ctx.organization.id)),
    db
      .select({
        count: sql<number>`count(*)::int`,
        paid: sql<number>`count(*) filter (where ${settlements.status} = 'PAID')::int`,
        proposed: sql<string>`coalesce(sum(${settlements.proposedAmountMinor}), 0)::text`,
      })
      .from(settlements)
      .where(eq(settlements.organizationId, ctx.organization.id)),
    db
      .select({
        succeeded: sql<number>`count(*) filter (where ${payments.status} = 'SUCCEEDED')::int`,
        amount: sql<string>`coalesce(sum(case when ${payments.status} = 'SUCCEEDED' then ${payments.amountMinor} else 0 end), 0)::text`,
      })
      .from(payments)
      .where(eq(payments.organizationId, ctx.organization.id)),
  ]);
  return {
    invoices: {
      count: invoiceStats[0]?.count ?? 0,
      verified: invoiceStats[0]?.verified ?? 0,
      totalMinor: BigInt(invoiceStats[0]?.total ?? "0"),
    },
    discrepancies: {
      count: discrepancyStats[0]?.count ?? 0,
      open: discrepancyStats[0]?.open ?? 0,
      exposureMinor: BigInt(discrepancyStats[0]?.exposure ?? "0"),
    },
    settlements: {
      count: settlementStats[0]?.count ?? 0,
      paid: settlementStats[0]?.paid ?? 0,
      proposedMinor: BigInt(settlementStats[0]?.proposed ?? "0"),
    },
    payments: {
      succeeded: paymentStats[0]?.succeeded ?? 0,
      amountMinor: BigInt(paymentStats[0]?.amount ?? "0"),
    },
  };
}
