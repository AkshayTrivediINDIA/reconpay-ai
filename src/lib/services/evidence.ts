import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  evidenceDocuments,
  evidenceEvents,
  evidenceReports,
  invoices,
  purchaseOrders,
  reconciliationRuns,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { env } from "@/lib/env";
import { generateEvidenceSummary, type EvidenceSummaryInput } from "@/lib/ai";
import { formatMinorPlain, formatQuantityPlain } from "@/lib/money";
import { buildEvidencePdf } from "@/lib/reports/pdf";
import { getReconciliationDetail } from "./reconciliation";

export async function listEvidenceRuns(
  ctx: AuthContext,
  options: { page?: number; pageSize?: number } = {},
) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access the evidence center");
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const rows = await db
    .select({
      run: reconciliationRuns,
      invoiceNumber: invoices.invoiceNumber,
      poNumber: purchaseOrders.poNumber,
      vendorName: vendors.name,
      reportId: evidenceReports.id,
    })
    .from(reconciliationRuns)
    .innerJoin(invoices, eq(invoices.id, reconciliationRuns.invoiceId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, reconciliationRuns.purchaseOrderId))
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .leftJoin(evidenceReports, eq(evidenceReports.runId, reconciliationRuns.id))
    .where(
      and(
        eq(reconciliationRuns.organizationId, ctx.organization.id),
        eq(reconciliationRuns.status, "COMPLETED"),
      ),
    )
    .orderBy(desc(reconciliationRuns.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { runs: rows, page, pageSize };
}

function buildSummaryInput(
  ctx: AuthContext,
  detail: Awaited<ReturnType<typeof getReconciliationDetail>>,
): EvidenceSummaryInput {
  const { run, invoice, purchaseOrder, vendor, discrepancies, receipts, documents, timeline } =
    detail;
  return {
    organizationName: ctx.organization.name,
    invoiceNumber: invoice?.invoiceNumber ?? "Unknown invoice",
    invoiceTotal: formatMinorPlain(run.invoiceTotalMinor, invoice?.currency ?? "INR"),
    vendorName: vendor?.name ?? invoice?.vendorNameRaw ?? "Unknown vendor",
    poNumber: purchaseOrder?.poNumber ?? "Unknown PO",
    receiptNumbers: receipts.map((receipt) => receipt.receiptNumber),
    orderedQty: formatQuantityPlain(run.orderedQtyMilli),
    receivedQty: formatQuantityPlain(run.receivedQtyMilli),
    usableQty: formatQuantityPlain(run.usableQtyMilli),
    shortQty: formatQuantityPlain(run.shortQtyMilli),
    potentialQuantityExposure: formatMinorPlain(
      run.potentialQuantityExposureMinor,
      invoice?.currency ?? "INR",
    ),
    potentialImpact: formatMinorPlain(run.potentialImpactMinor, invoice?.currency ?? "INR"),
    currency: invoice?.currency ?? "INR",
    discrepancies: discrepancies.map((discrepancy) => ({
      ruleCode: discrepancy.ruleCode,
      severity: discrepancy.severity,
      title: discrepancy.title,
      description: discrepancy.description,
      calculation: discrepancy.calculation,
      status: discrepancy.status,
    })),
    evidenceEvents: timeline.map((event) => ({
      occurredAt: event.occurredAt.toISOString(),
      eventType: event.eventType,
      description: event.description,
      actorLabel: event.actorLabel,
      source: event.source,
    })),
    documents: documents.map((document) => ({
      title: document.title,
      documentType: document.documentType,
      fileName: document.fileName,
    })),
  };
}

export async function generateEvidenceReport(
  ctx: AuthContext,
  runId: string,
): Promise<{
  reportId: string;
  generatedBy: "OPENAI" | "RULES";
  warning: string | null;
}> {
  requirePermission(ctx, "generate_evidence");
  const detail = await getReconciliationDetail(ctx, runId);
  if (detail.run.status !== "COMPLETED") {
    throw new ForbiddenError("Evidence can only be generated for a completed reconciliation");
  }
  const input = buildSummaryInput(ctx, detail);
  const result = await generateEvidenceSummary({
    organizationId: ctx.organization.id,
    data: input,
  });
  const db = await getDb();
  const rows = await db
    .insert(evidenceReports)
    .values({
      organizationId: ctx.organization.id,
      runId,
      discrepancySummary: result.summary.discrepancySummary,
      evidenceSummary: result.summary.evidenceSummary,
      timelineSummary: result.summary.timelineSummary,
      nextActions: result.summary.nextActions,
      missingEvidence: result.summary.missingEvidence,
      generatedBy: result.generatedBy,
      model: result.model,
      createdBy: ctx.user.id,
    })
    .returning();
  const report = rows[0]!;
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "RECONCILIATION_RUN",
    entityId: runId,
    eventType: "EVIDENCE_REPORT_GENERATED",
    description: `Evidence report generated using ${result.generatedBy === "OPENAI" ? "the configured AI model" : "deterministic rules"}.`,
    actor: actorFromContext(ctx),
    source: "evidence_center",
    metadata: { reportId: report.id, generatedBy: result.generatedBy },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "EVIDENCE_REPORT_GENERATED",
    entityType: "reconciliation_run",
    entityId: runId,
    description: "Generated an evidence report",
    metadata: { reportId: report.id, generatedBy: result.generatedBy, model: result.model },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { reportId: report.id, generatedBy: result.generatedBy, warning: result.warning };
}

export async function getEvidenceDetail(ctx: AuthContext, runId: string) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access the evidence center");
  const detail = await getReconciliationDetail(ctx, runId);
  const db = await getDb();
  const reports = await db
    .select()
    .from(evidenceReports)
    .where(
      and(
        eq(evidenceReports.organizationId, ctx.organization.id),
        eq(evidenceReports.runId, runId),
      ),
    )
    .orderBy(desc(evidenceReports.createdAt));
  return { ...detail, reports, latestReport: reports[0] ?? null };
}

export async function createEvidencePdf(
  ctx: AuthContext,
  runId: string,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  requirePermission(ctx, "generate_evidence");
  const detail = await getEvidenceDetail(ctx, runId);
  const report = detail.latestReport;
  if (!report) {
    throw new NotFoundError(
      "Evidence report. Generate the evidence summary before exporting a PDF.",
    );
  }
  const invoice = detail.invoice!;
  const po = detail.purchaseOrder!;
  const bytes = await buildEvidencePdf({
    organizationName: ctx.organization.name,
    organizationIsDemo: ctx.organization.isDemo,
    appUrl: env.appUrl,
    invoiceNumber: invoice.invoiceNumber,
    invoiceTotalMinor: invoice.totalMinor,
    vendorName: detail.vendor?.name ?? invoice.vendorNameRaw ?? "Unknown vendor",
    poNumber: po.poNumber,
    receiptNumbers: detail.receipts.map((receipt) => receipt.receiptNumber),
    currency: invoice.currency,
    runStatus: detail.run.status,
    report,
    discrepancies: detail.discrepancies,
    timeline: detail.timeline,
    documents: detail.documents,
    runCreatedAt: detail.run.createdAt,
    potentialImpactMinor: detail.run.potentialImpactMinor,
    potentialQuantityExposureMinor: detail.run.potentialQuantityExposureMinor,
    orderedQtyMilli: detail.run.orderedQtyMilli,
    receivedQtyMilli: detail.run.receivedQtyMilli,
    usableQtyMilli: detail.run.usableQtyMilli,
    shortQtyMilli: detail.run.shortQtyMilli,
  });
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "RECONCILIATION_RUN",
    entityId: runId,
    eventType: "EVIDENCE_PDF_EXPORTED",
    description: "Evidence report exported as PDF.",
    actor: actorFromContext(ctx),
    source: "evidence_center",
    metadata: { reportId: report.id },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "EVIDENCE_PDF_EXPORTED",
    entityType: "reconciliation_run",
    entityId: runId,
    description: "Exported evidence report PDF",
    metadata: { reportId: report.id },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  const safeInvoice = invoice.invoiceNumber.replace(/[^A-Za-z0-9._-]/g, "_") || "invoice";
  return {
    bytes,
    fileName: `ReconPay_Evidence_${safeInvoice}_${runId.slice(0, 8)}.pdf`,
  };
}

export async function listRunEvidenceDocuments(
  ctx: AuthContext,
  runId: string,
) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access evidence documents");
  const db = await getDb();
  const detail = await getReconciliationDetail(ctx, runId);
  const ids = [
    detail.invoice?.id,
    detail.purchaseOrder?.id,
    ...detail.receipts.map((receipt) => receipt.id),
  ].filter(Boolean) as string[];
  return db
    .select()
    .from(evidenceDocuments)
    .where(
      and(
        eq(evidenceDocuments.organizationId, ctx.organization.id),
        inArray(evidenceDocuments.entityId, ids),
      ),
    )
    .orderBy(desc(evidenceDocuments.createdAt));
}

export async function listTimelineForRun(ctx: AuthContext, runId: string) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access evidence timelines");
  const db = await getDb();
  return db
    .select()
    .from(evidenceEvents)
    .where(
      and(
        eq(evidenceEvents.organizationId, ctx.organization.id),
        or(
          and(eq(evidenceEvents.entityType, "RECONCILIATION_RUN"), eq(evidenceEvents.entityId, runId)),
          eq(evidenceEvents.entityType, "INVOICE"),
        ),
      ),
    )
    .orderBy(desc(evidenceEvents.occurredAt))
    .limit(100);
}
