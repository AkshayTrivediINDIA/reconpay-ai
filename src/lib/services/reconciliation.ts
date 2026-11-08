import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  discrepancies,
  evidenceDocuments,
  evidenceEvents,
  evidenceReports,
  goodsReceiptItems,
  goodsReceipts,
  invoiceLineItems,
  invoices,
  purchaseOrderItems,
  purchaseOrders,
  reconciliationRuns,
  settlements,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  reconcile,
  serializeEngineResult,
  type EngineInvoice,
  type EnginePurchaseOrder,
  type EngineReceipt,
} from "@/lib/reconciliation/engine";
import { findDuplicateInvoice } from "./invoices";
import { getInvoice } from "./invoices";
import type { discrepancyUpdateSchema } from "@/lib/validation";
import type { z } from "zod";

export type DiscrepancyUpdateInput = z.infer<typeof discrepancyUpdateSchema>;

export async function runReconciliation(
  ctx: AuthContext,
  input: {
    invoiceId: string;
    purchaseOrderId: string;
    goodsReceiptIds: string[];
  },
): Promise<{ runId: string; discrepancyCount: number; potentialImpactMinor: bigint }> {
  requirePermission(ctx, "run_reconciliation");
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot run reconciliation");
  const db = await getDb();

  const invoice = await getInvoice(ctx, input.invoiceId);
  if (invoice.status !== "VERIFIED") {
    throw new ConflictError(
      "Verify the invoice before running reconciliation. Human verification is required.",
    );
  }
  const poRows = await db
    .select({ po: purchaseOrders, vendorName: vendors.name })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(
      and(
        eq(purchaseOrders.id, input.purchaseOrderId),
        eq(purchaseOrders.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const poRow = poRows[0];
  if (!poRow) throw new NotFoundError("Purchase order");
  const po = poRow.po;

  const [invoiceItems, poItems] = await Promise.all([
    db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id))
      .orderBy(invoiceLineItems.lineNumber),
    db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
      .orderBy(purchaseOrderItems.lineNumber),
  ]);
  if (invoiceItems.length === 0) {
    throw new ValidationError("The invoice has no line items to reconcile");
  }

  const allReceipts = await db
    .select()
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.organizationId, ctx.organization.id),
        eq(goodsReceipts.purchaseOrderId, po.id),
        sql`${goodsReceipts.status} <> 'CANCELLED'`,
      ),
    );
  const selectedIds =
    input.goodsReceiptIds.length > 0
      ? input.goodsReceiptIds
      : allReceipts.map((receipt) => receipt.id);
  const receiptRows = allReceipts.filter((receipt) => selectedIds.includes(receipt.id));
  if (receiptRows.length !== selectedIds.length) {
    throw new ValidationError(
      "One or more selected goods receipts do not belong to this purchase order",
    );
  }
  const receiptIds = receiptRows.map((receipt) => receipt.id);
  const receiptItemRows =
    receiptIds.length > 0
      ? await db
          .select()
          .from(goodsReceiptItems)
          .where(inArray(goodsReceiptItems.goodsReceiptId, receiptIds))
      : [];

  const duplicate = await findDuplicateInvoice({
    organizationId: ctx.organization.id,
    vendorId: invoice.vendorId,
    vendorNameRaw: invoice.vendorNameRaw,
    invoiceNumber: invoice.invoiceNumber,
    excludeId: invoice.id,
  });

  const engineInvoice: EngineInvoice = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    vendorId: invoice.vendorId,
    vendorName: invoice.vendorNameRaw,
    poReference: invoice.poReference,
    currency: invoice.currency,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    discountMinor: invoice.discountMinor,
    shippingMinor: invoice.shippingMinor,
    totalMinor: invoice.totalMinor,
    items: invoiceItems.map((item) => ({
      lineNumber: item.lineNumber,
      description: item.description,
      sku: item.sku,
      quantityMilli: item.quantityMilli,
      unitPriceMinor: item.unitPriceMinor,
      taxRateBps: item.taxRateBps,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };
  const enginePo: EnginePurchaseOrder = {
    id: po.id,
    poNumber: po.poNumber,
    vendorId: po.vendorId,
    vendorName: poRow.vendorName,
    currency: po.currency,
    subtotalMinor: po.subtotalMinor,
    taxMinor: po.taxMinor,
    totalMinor: po.totalMinor,
    items: poItems.map((item) => ({
      id: item.id,
      lineNumber: item.lineNumber,
      description: item.description,
      sku: item.sku,
      quantityMilli: item.quantityMilli,
      unitPriceMinor: item.unitPriceMinor,
      taxRateBps: item.taxRateBps,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };
  const engineReceipts: EngineReceipt[] = receiptRows.map((receipt) => ({
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    receivedDate: receipt.receivedDate,
    items: receiptItemRows
      .filter((item) => item.goodsReceiptId === receipt.id)
      .map((item) => ({
        purchaseOrderItemId: item.purchaseOrderItemId,
        quantityReceivedMilli: item.quantityReceivedMilli,
        quantityDamagedMilli: item.quantityDamagedMilli,
      })),
  }));

  const inputSnapshot = {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorId: invoice.vendorId,
      vendorName: invoice.vendorNameRaw,
      poReference: invoice.poReference,
      currency: invoice.currency,
      subtotalMinor: invoice.subtotalMinor.toString(),
      taxMinor: invoice.taxMinor.toString(),
      discountMinor: invoice.discountMinor.toString(),
      shippingMinor: invoice.shippingMinor.toString(),
      totalMinor: invoice.totalMinor.toString(),
      lineItems: engineInvoice.items.map((item) => ({
        ...item,
        quantityMilli: item.quantityMilli.toString(),
        unitPriceMinor: item.unitPriceMinor.toString(),
        lineTotalMinor: item.lineTotalMinor.toString(),
      })),
    },
    purchaseOrder: {
      id: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      vendorName: poRow.vendorName,
      currency: po.currency,
      totalMinor: po.totalMinor.toString(),
      lineItems: enginePo.items.map((item) => ({
        ...item,
        quantityMilli: item.quantityMilli.toString(),
        unitPriceMinor: item.unitPriceMinor.toString(),
        lineTotalMinor: item.lineTotalMinor.toString(),
      })),
    },
    goodsReceipts: engineReceipts.map((receipt) => ({
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      receivedDate: receipt.receivedDate,
      items: receipt.items.map((item) => ({
        ...item,
        quantityReceivedMilli: item.quantityReceivedMilli.toString(),
        quantityDamagedMilli: item.quantityDamagedMilli.toString(),
      })),
    })),
    duplicateInvoiceId: duplicate?.id ?? null,
  };

  const runRows = await db
    .insert(reconciliationRuns)
    .values({
      organizationId: ctx.organization.id,
      invoiceId: invoice.id,
      purchaseOrderId: po.id,
      goodsReceiptIds: receiptIds,
      status: "RUNNING",
      engineVersion: "1.0.0",
      inputSnapshot,
      createdBy: ctx.user.id,
    })
    .returning();
  const run = runRows[0]!;

  try {
    const result = reconcile({
      invoice: engineInvoice,
      purchaseOrder: enginePo,
      receipts: engineReceipts,
      duplicates: duplicate
        ? [
            {
              id: duplicate.id,
              invoiceNumber: duplicate.invoiceNumber,
              issueDate: duplicate.issueDate,
              totalMinor: duplicate.totalMinor,
              currency: duplicate.currency,
            },
          ]
        : [],
    });

    await db.transaction(async (tx) => {
      await tx
        .update(reconciliationRuns)
        .set({
          status: "COMPLETED",
          resultSnapshot: serializeEngineResult(result),
          orderedQtyMilli: result.totals.orderedQtyMilli,
          receivedQtyMilli: result.totals.receivedQtyMilli,
          usableQtyMilli: result.totals.usableQtyMilli,
          shortQtyMilli: result.totals.shortQtyMilli,
          invoiceTotalMinor: result.totals.invoiceTotalMinor,
          potentialQuantityExposureMinor:
            result.totals.potentialQuantityExposureMinor,
          potentialImpactMinor: result.totals.potentialImpactMinor,
          discrepancyCount: result.discrepancies.length,
          completedAt: new Date(),
        })
        .where(eq(reconciliationRuns.id, run.id));

      if (result.discrepancies.length > 0) {
        await tx.insert(discrepancies).values(
          result.discrepancies.map((discrepancy) => ({
            organizationId: ctx.organization.id,
            runId: run.id,
            invoiceId: invoice.id,
            ruleCode: discrepancy.ruleCode,
            severity: discrepancy.severity,
            title: discrepancy.title,
            description: discrepancy.description,
            calculation: discrepancy.calculation,
            expectedValue: discrepancy.expectedValue,
            actualValue: discrepancy.actualValue,
            impactMinor: discrepancy.impactMinor,
            currency: invoice.currency,
            status: "OPEN" as const,
            sourceRefs: discrepancy.sourceRefs.map((ref) => ({ ...ref })),
          })),
        );
      }
    });

    await recordEvidenceEvent({
      organizationId: ctx.organization.id,
      entityType: "RECONCILIATION_RUN",
      entityId: run.id,
      eventType: "RECONCILIATION_COMPLETED",
      description: `Three-way reconciliation completed for invoice ${invoice.invoiceNumber} against ${po.poNumber} and ${receiptIds.length} goods receipt(s): ${result.discrepancies.length} discrepancy rule(s) fired.`,
      actor: actorFromContext(ctx),
      source: "reconciliation_engine",
      metadata: {
        engineVersion: result.engineVersion,
        discrepancyCount: result.discrepancies.length,
        potentialImpactMinor: result.totals.potentialImpactMinor.toString(),
        invoiceId: invoice.id,
        purchaseOrderId: po.id,
      },
    });
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "RECONCILIATION_RUN",
      entityType: "reconciliation_run",
      entityId: run.id,
      description: `Ran reconciliation for ${invoice.invoiceNumber} against ${po.poNumber}`,
      metadata: {
        invoiceId: invoice.id,
        purchaseOrderId: po.id,
        goodsReceiptIds: receiptIds,
        discrepancyCount: result.discrepancies.length,
        potentialImpactMinor: result.totals.potentialImpactMinor.toString(),
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const highSeverity = result.discrepancies.filter(
      (d) => d.severity === "HIGH" || d.severity === "CRITICAL",
    );
    if (highSeverity.length > 0) {
      await notify({
        organizationId: ctx.organization.id,
        type: "DISCREPANCY",
        title: `${highSeverity.length} high-severity discrepancy rule(s) found`,
        body: `Invoice ${invoice.invoiceNumber} vs ${po.poNumber}. Review the reconciliation before creating a settlement.`,
        entityType: "RECONCILIATION_RUN",
        entityId: run.id,
      });
    }

    return {
      runId: run.id,
      discrepancyCount: result.discrepancies.length,
      potentialImpactMinor: result.totals.potentialImpactMinor,
    };
  } catch (error) {
    await db
      .update(reconciliationRuns)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        resultSnapshot: {
          error: error instanceof Error ? error.message : "Unknown reconciliation error",
        },
      })
      .where(eq(reconciliationRuns.id, run.id));
    throw error;
  }
}

export async function listReconciliationRuns(
  ctx: AuthContext,
  options: { search?: string; page?: number; pageSize?: number } = {},
) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access reconciliation");
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(reconciliationRuns.organizationId, ctx.organization.id)];
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        sql`${reconciliationRuns.invoiceId}::text ilike ${term}`,
        sql`${reconciliationRuns.purchaseOrderId}::text ilike ${term}`,
        sql`exists (select 1 from ${invoices} i where i.id = ${reconciliationRuns.invoiceId} and i.invoice_number ilike ${term})`,
        sql`exists (select 1 from ${purchaseOrders} p where p.id = ${reconciliationRuns.purchaseOrderId} and p.po_number ilike ${term})`,
      )!,
    );
  }
  const where = and(...clauses);
  const rows = await db
    .select({
      run: reconciliationRuns,
      invoiceNumber: invoices.invoiceNumber,
      invoiceCurrency: invoices.currency,
      invoiceVendor: invoices.vendorNameRaw,
      poNumber: purchaseOrders.poNumber,
      vendorName: vendors.name,
    })
    .from(reconciliationRuns)
    .innerJoin(invoices, eq(invoices.id, reconciliationRuns.invoiceId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, reconciliationRuns.purchaseOrderId))
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(where)
    .orderBy(desc(reconciliationRuns.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { runs: rows, page, pageSize };
}

export async function getReconciliationRun(
  ctx: AuthContext,
  runId: string,
): Promise<typeof reconciliationRuns.$inferSelect> {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access reconciliation");
  const db = await getDb();
  const rows = await db
    .select()
    .from(reconciliationRuns)
    .where(
      and(
        eq(reconciliationRuns.id, runId),
        eq(reconciliationRuns.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Reconciliation run");
  return rows[0];
}

export async function getReconciliationDetail(ctx: AuthContext, runId: string) {
  const run = await getReconciliationRun(ctx, runId);
  const db = await getDb();
  const [invoiceRows, poRows, discrepancyRows, reports, documents, settlementRows, receiptRows] =
    await Promise.all([
      db.select().from(invoices).where(eq(invoices.id, run.invoiceId)).limit(1),
      db
        .select({ po: purchaseOrders, vendorName: vendors.name, vendorId: vendors.id })
        .from(purchaseOrders)
        .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
        .where(eq(purchaseOrders.id, run.purchaseOrderId))
        .limit(1),
      db
        .select()
        .from(discrepancies)
        .where(eq(discrepancies.runId, run.id))
        .orderBy(desc(discrepancies.impactMinor), discrepancies.createdAt),
      db
        .select()
        .from(evidenceReports)
        .where(eq(evidenceReports.runId, run.id))
        .orderBy(desc(evidenceReports.createdAt)),
      db
        .select()
        .from(evidenceDocuments)
        .where(
          and(
            eq(evidenceDocuments.organizationId, ctx.organization.id),
            inArray(evidenceDocuments.entityType, [
              "INVOICE",
              "PURCHASE_ORDER",
              "GOODS_RECEIPT",
              "SETTLEMENT",
            ]),
          ),
        ),
      db
        .select()
        .from(settlements)
        .where(
          and(
            eq(settlements.organizationId, ctx.organization.id),
            eq(settlements.invoiceId, run.invoiceId),
          ),
        )
        .orderBy(desc(settlements.createdAt)),
      run.goodsReceiptIds.length > 0
        ? db
            .select()
            .from(goodsReceipts)
            .where(inArray(goodsReceipts.id, run.goodsReceiptIds))
        : Promise.resolve([]),
    ]);

  const settlementIds = new Set(settlementRows.map((s) => s.id));
  const relevantDocuments = documents.filter(
    (doc) =>
      (doc.entityType === "INVOICE" && doc.entityId === run.invoiceId) ||
      (doc.entityType === "PURCHASE_ORDER" && doc.entityId === run.purchaseOrderId) ||
      (doc.entityType === "GOODS_RECEIPT" && run.goodsReceiptIds.includes(doc.entityId)) ||
      (doc.entityType === "SETTLEMENT" && settlementIds.has(doc.entityId)),
  );

  const entityConditions = [
    and(eq(evidenceEvents.entityType, "INVOICE"), eq(evidenceEvents.entityId, run.invoiceId)),
    and(
      eq(evidenceEvents.entityType, "PURCHASE_ORDER"),
      eq(evidenceEvents.entityId, run.purchaseOrderId),
    ),
    and(
      eq(evidenceEvents.entityType, "RECONCILIATION_RUN"),
      eq(evidenceEvents.entityId, run.id),
    ),
    ...run.goodsReceiptIds.map((id) =>
      and(eq(evidenceEvents.entityType, "GOODS_RECEIPT"), eq(evidenceEvents.entityId, id)),
    ),
  ];
  const timeline = await db
    .select()
    .from(evidenceEvents)
    .where(
      and(
        eq(evidenceEvents.organizationId, ctx.organization.id),
        or(...entityConditions),
      ),
    )
    .orderBy(desc(evidenceEvents.occurredAt));

  return {
    run,
    invoice: invoiceRows[0] ?? null,
    purchaseOrder: poRows[0]?.po ?? null,
    vendor: poRows[0]
      ? { id: poRows[0].vendorId, name: poRows[0].vendorName }
      : null,
    receipts: receiptRows,
    discrepancies: discrepancyRows,
    report: reports[0] ?? null,
    reports,
    documents: relevantDocuments,
    timeline,
    settlements: settlementRows,
  };
}

export async function updateDiscrepancy(
  ctx: AuthContext,
  discrepancyId: string,
  input: DiscrepancyUpdateInput,
): Promise<typeof discrepancies.$inferSelect> {
  requirePermission(ctx, "resolve_discrepancy");
  const db = await getDb();
  const rows = await db
    .select()
    .from(discrepancies)
    .where(
      and(
        eq(discrepancies.id, discrepancyId),
        eq(discrepancies.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const discrepancy = rows[0];
  if (!discrepancy) throw new NotFoundError("Discrepancy");
  if (["RESOLVED"].includes(discrepancy.status) && input.status === "RESOLVED") {
    throw new ConflictError("This discrepancy is already resolved");
  }
  const updatedRows = await db
    .update(discrepancies)
    .set({
      status: input.status,
      resolutionNote: input.note ?? null,
      resolvedBy: ctx.user.id,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discrepancies.id, discrepancy.id))
    .returning();
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "RECONCILIATION_RUN",
    entityId: discrepancy.runId,
    eventType: `DISCREPANCY_${input.status}`,
    description: `Discrepancy "${discrepancy.title}" marked ${input.status.toLowerCase()}${input.note ? `: ${input.note}` : ""}`,
    actor: actorFromContext(ctx),
    source: "discrepancy_review",
    metadata: { discrepancyId: discrepancy.id, ruleCode: discrepancy.ruleCode },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: `DISCREPANCY_${input.status}`,
    entityType: "discrepancy",
    entityId: discrepancy.id,
    description: `Marked discrepancy "${discrepancy.title}" as ${input.status}`,
    metadata: {
      runId: discrepancy.runId,
      ruleCode: discrepancy.ruleCode,
      note: input.note,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return updatedRows[0]!;
}

export async function listDiscrepancies(
  ctx: AuthContext,
  options: {
    search?: string;
    status?: string;
    severity?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access discrepancies");
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(discrepancies.organizationId, ctx.organization.id)];
  if (options.status && options.status !== "ALL") {
    if (
      ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISPUTED", "WAIVED"].includes(
        options.status,
      )
    ) {
      clauses.push(eq(discrepancies.status, options.status as "OPEN"));
    }
  }
  if (options.severity && options.severity !== "ALL") {
    if (["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(options.severity)) {
      clauses.push(eq(discrepancies.severity, options.severity as "HIGH"));
    }
  }
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(discrepancies.title, term),
        ilike(discrepancies.description, term),
        ilike(discrepancies.ruleCode, term),
        ilike(invoices.invoiceNumber, term),
        ilike(vendors.name, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        discrepancy: discrepancies,
        invoiceNumber: invoices.invoiceNumber,
        vendorName: vendors.name,
        runId: reconciliationRuns.id,
        runCreatedAt: reconciliationRuns.createdAt,
      })
      .from(discrepancies)
      .innerJoin(invoices, eq(invoices.id, discrepancies.invoiceId))
      .innerJoin(reconciliationRuns, eq(reconciliationRuns.id, discrepancies.runId))
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, reconciliationRuns.purchaseOrderId))
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(where)
      .orderBy(desc(discrepancies.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(discrepancies)
      .innerJoin(invoices, eq(invoices.id, discrepancies.invoiceId))
      .innerJoin(reconciliationRuns, eq(reconciliationRuns.id, discrepancies.runId))
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, reconciliationRuns.purchaseOrderId))
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(where),
  ]);
  return { discrepancies: rows, total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getOpenDiscrepancyStats(ctx: AuthContext) {
  if (isVendor(ctx)) return { count: 0, amountMinor: 0n };
  const db = await getDb();
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(case when ${discrepancies.impactMinor} > 0 then ${discrepancies.impactMinor} else 0 end), 0)::text`,
    })
    .from(discrepancies)
    .where(
      and(
        eq(discrepancies.organizationId, ctx.organization.id),
        inArray(discrepancies.status, ["OPEN", "ACKNOWLEDGED", "DISPUTED"]),
      ),
    );
  return {
    count: rows[0]?.count ?? 0,
    amountMinor: BigInt(rows[0]?.amount ?? "0"),
  };
}
