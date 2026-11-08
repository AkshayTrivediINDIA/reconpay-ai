import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import {
  auditLogs,
  discrepancies,
  evidenceDocuments,
  invoiceLineItems,
  invoices,
  purchaseOrders,
  reconciliationRuns,
  settlements,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission, vendorScope } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  computeLineTotal,
  parseMoneyInput,
  parseQuantityInput,
} from "@/lib/money";
import {
  persistDocument,
  listDocuments,
  documentHref,
} from "@/lib/documents";
import { validateUploadFile } from "@/lib/storage";
import { extractInvoiceDocument } from "@/lib/ai";
import type { ExtractedInvoice } from "@/lib/ai/types";
import type { invoiceUpdateSchema } from "@/lib/validation";
import type { z } from "zod";

export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function normalizeInvoiceNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function percentToBps(value: string | null): number {
  if (!value) return 0;
  try {
    const milliPercent = parseQuantityInput(value, "tax rate");
    const bps = milliPercent / 10n;
    if (bps < 0n || bps > 10_000n) return 0;
    return Number(bps);
  } catch {
    return 0;
  }
}

function amount(value: string | null): bigint {
  if (!value) return 0n;
  try {
    return parseMoneyInput(value, "amount");
  } catch {
    return 0n;
  }
}

async function resolveVendorByName(
  organizationId: string,
  vendorName: string | null,
): Promise<string | null> {
  if (!vendorName) return null;
  const db = await getDb();
  const normalized = vendorName.trim();
  if (!normalized) return null;
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, organizationId),
        ilike(vendors.name, normalized),
      ),
    )
    .limit(2);
  return rows.length === 1 ? rows[0]!.id : null;
}

export async function findDuplicateInvoice(input: {
  organizationId: string;
  vendorId: string | null;
  vendorNameRaw: string | null;
  invoiceNumber: string;
  excludeId?: string;
}): Promise<typeof invoices.$inferSelect | null> {
  const db = await getDb();
  const normalized = normalizeInvoiceNumber(input.invoiceNumber);
  if (!normalized) return null;
  const clauses = [
    eq(invoices.organizationId, input.organizationId),
    sql`upper(replace(${invoices.invoiceNumber}, ' ', '')) = ${normalized}`,
  ];
  if (input.vendorId) {
    clauses.push(eq(invoices.vendorId, input.vendorId));
  } else if (input.vendorNameRaw) {
    clauses.push(
      sql`lower(trim(${invoices.vendorNameRaw})) = ${input.vendorNameRaw.trim().toLowerCase()}`,
    );
  } else {
    return null;
  }
  if (input.excludeId) {
    clauses.push(sql`${invoices.id} <> ${input.excludeId}`);
  }
  const rows = await db
    .select()
    .from(invoices)
    .where(and(...clauses))
    .limit(1);
  return rows[0] ?? null;
}

export async function listInvoices(
  ctx: AuthContext,
  options: {
    search?: string;
    status?: string;
    vendorId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(invoices.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) clauses.push(eq(invoices.vendorId, vendorScope(ctx)));
  if (options.status && options.status !== "ALL") {
    const allowed = [
      "UPLOADED",
      "PROCESSING",
      "NEEDS_REVIEW",
      "EXTRACTED",
      "VERIFIED",
      "FAILED",
    ];
    if (allowed.includes(options.status)) {
      clauses.push(eq(invoices.status, options.status as "UPLOADED"));
    }
  }
  if (options.vendorId) {
    clauses.push(eq(invoices.vendorId, options.vendorId));
  }
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(invoices.invoiceNumber, term),
        ilike(invoices.vendorNameRaw, term),
        ilike(invoices.poReference, term),
        ilike(vendors.name, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        invoice: invoices,
        vendorName: vendors.name,
        vendorCode: vendors.code,
      })
      .from(invoices)
      .leftJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(invoices)
      .leftJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(where),
  ]);
  return { invoices: rows, total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getInvoice(
  ctx: AuthContext,
  invoiceId: string,
): Promise<typeof invoices.$inferSelect> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Invoice");
  if (isVendor(ctx) && rows[0].vendorId !== ctx.membership.vendorId) {
    throw new NotFoundError("Invoice");
  }
  return rows[0];
}

export async function getInvoiceDetail(ctx: AuthContext, invoiceId: string) {
  const invoice = await getInvoice(ctx, invoiceId);
  const db = await getDb();
  const [lineItems, vendorRows, runs, documents, invoiceSettlements, purchaseOrderCandidates, duplicate] =
    await Promise.all([
      db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, invoice.id))
        .orderBy(invoiceLineItems.lineNumber),
      invoice.vendorId
        ? db.select().from(vendors).where(eq(vendors.id, invoice.vendorId)).limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(reconciliationRuns)
        .where(
          and(
            eq(reconciliationRuns.organizationId, ctx.organization.id),
            eq(reconciliationRuns.invoiceId, invoice.id),
          ),
        )
        .orderBy(desc(reconciliationRuns.createdAt))
        .limit(10),
      isVendor(ctx) ? Promise.resolve([]) : listDocuments(ctx, "INVOICE", invoice.id),
      db
        .select()
        .from(settlements)
        .where(
          and(
            eq(settlements.organizationId, ctx.organization.id),
            eq(settlements.invoiceId, invoice.id),
          ),
        )
        .orderBy(desc(settlements.createdAt)),
      db
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.organizationId, ctx.organization.id),
            invoice.vendorId
              ? eq(purchaseOrders.vendorId, invoice.vendorId)
              : sql`true`,
          ),
        )
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(50),
      invoice.duplicateOfInvoiceId
        ? db
            .select({
              id: invoices.id,
              invoiceNumber: invoices.invoiceNumber,
              createdAt: invoices.createdAt,
            })
            .from(invoices)
            .where(eq(invoices.id, invoice.duplicateOfInvoiceId))
            .limit(1)
        : Promise.resolve([]),
    ]);

  const sourceDocument = invoice.sourceDocumentId
    ? documents.find((doc) => doc.id === invoice.sourceDocumentId) ?? null
    : null;

  return {
    invoice,
    lineItems,
    vendor: vendorRows[0] ?? null,
    runs,
    documents,
    settlements: invoiceSettlements,
    purchaseOrderCandidates,
    duplicate: duplicate[0] ?? null,
    sourceDocument,
    sourceDocumentHref: sourceDocument ? documentHref(sourceDocument.id) : null,
  };
}

async function replaceLineItems(
  tx: DbTransaction,
  ctx: AuthContext,
  invoiceId: string,
  lines: {
    description: string;
    sku?: string | null;
    quantity: bigint;
    unitPrice: bigint;
    taxRateBps: number;
  }[],
): Promise<void> {
  await tx
    .delete(invoiceLineItems)
    .where(
      and(
        eq(invoiceLineItems.invoiceId, invoiceId),
        eq(invoiceLineItems.organizationId, ctx.organization.id),
      ),
    );
  if (lines.length === 0) return;
  await tx.insert(invoiceLineItems).values(
    lines.map((line, index) => ({
      organizationId: ctx.organization.id,
      invoiceId,
      lineNumber: index + 1,
      description: line.description,
      sku: line.sku ?? null,
      quantityMilli: line.quantity,
      unitPriceMinor: line.unitPrice,
      taxRateBps: line.taxRateBps,
      lineTotalMinor: computeLineTotal(line.unitPrice, line.quantity),
    })),
  );
}

function extractionToValues(extraction: ExtractedInvoice, baseCurrency: string) {
  const lines = extraction.lineItems
    .filter(
      (line) =>
        (line.description?.trim().length ?? 0) > 0 &&
        line.quantity !== null &&
        line.unitPrice !== null,
    )
    .map((line) => ({
      description: line.description!.trim().slice(0, 500),
      sku: line.sku?.trim().slice(0, 80) || null,
      quantity: parseQuantityInput(line.quantity!),
      unitPrice: parseMoneyInput(line.unitPrice!),
      taxRateBps: percentToBps(line.taxRatePercent),
    }));
  return {
    subtotal: amount(extraction.subtotal),
    tax: amount(extraction.tax),
    discount: amount(extraction.discount),
    shipping: amount(extraction.shipping),
    total: amount(extraction.total),
    currency: extraction.currency ?? baseCurrency,
    lines,
  };
}

export async function uploadInvoice(
  ctx: AuthContext,
  input: {
    file: File;
    vendorId?: string | null;
    poReference?: string | null;
  },
): Promise<{ invoiceId: string; status: string }> {
  requirePermission(ctx, "manage_invoices");
  const file = await validateUploadFile(input.file);
  const db = await getDb();
  const invoiceId = crypto.randomUUID();
  const organizationId = ctx.organization.id;

  let vendorId = input.vendorId ?? null;
  if (vendorId) {
    const vendorRows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)),
      )
      .limit(1);
    if (!vendorRows[0]) throw new ValidationError("Selected vendor was not found");
  }

  await db.insert(invoices).values({
    id: invoiceId,
    organizationId,
    invoiceNumber: "",
    status: "PROCESSING",
    currency: ctx.organization.baseCurrency,
    subtotalMinor: 0n,
    taxMinor: 0n,
    discountMinor: 0n,
    shippingMinor: 0n,
    totalMinor: 0n,
    needsReview: true,
    createdBy: ctx.user.id,
  });

  const document = await persistDocument({
    ctx,
    file,
    documentType: "INVOICE",
    entityType: "INVOICE",
    entityId: invoiceId,
    title: `Invoice source document — ${file.fileName}`,
    authorized: true,
  });

  let result;
  try {
    result = await extractInvoiceDocument({
      organizationId,
      buffer: file.buffer,
      mimeType: file.mimeType,
      fileName: file.fileName,
    });
  } catch (error) {
    await db
      .update(invoices)
      .set({
        status: "FAILED",
        processingError: "Extraction failed. The document is stored; enter fields manually.",
        sourceDocumentId: document.id,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
    await writeAudit({
      organizationId,
      actor: actorFromContext(ctx),
      action: "INVOICE_EXTRACTION_FAILED",
      entityType: "invoice",
      entityId: invoiceId,
      description: "Invoice extraction failed; manual review required",
      metadata: { fileName: file.fileName },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    throw error;
  }

  const extraction = result.extraction;
  if (!vendorId) {
    vendorId = await resolveVendorByName(organizationId, extraction.vendorName);
  }
  const values = extractionToValues(extraction, ctx.organization.baseCurrency);
  const invoiceNumber = (extraction.invoiceNumber ?? "").trim().slice(0, 80);
  const vendorNameRaw = extraction.vendorName?.trim().slice(0, 200) ?? null;

  const duplicate = await findDuplicateInvoice({
    organizationId,
    vendorId,
    vendorNameRaw,
    invoiceNumber,
    excludeId: invoiceId,
  });

  const status =
    extraction.missingFields.length > 0 || extraction.confidence < 75
      ? "NEEDS_REVIEW"
      : "EXTRACTED";

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        vendorId,
        invoiceNumber,
        vendorNameRaw,
        status,
        issueDate: extraction.issueDate,
        dueDate: extraction.dueDate,
        currency: values.currency,
        subtotalMinor: values.subtotal,
        taxMinor: values.tax,
        discountMinor: values.discount,
        shippingMinor: values.shipping,
        totalMinor: values.total,
        poReference: input.poReference?.trim() || extraction.poReference,
        sourceDocumentId: document.id,
        extractionEngine: result.engine,
        extractionConfidence: extraction.confidence,
        extractionRaw: {
          ...extraction,
          engine: result.engine,
          model: result.model,
          warning: result.warning,
          rawTextStored: false,
        },
        needsReview: true,
        duplicateOfInvoiceId: duplicate?.id ?? null,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
    await replaceLineItems(tx, ctx, invoiceId, values.lines);
  });

  await recordEvidenceEvent({
    organizationId,
    entityType: "INVOICE",
    entityId: invoiceId,
    eventType: "INVOICE_EXTRACTED",
    description: `Invoice fields extracted using ${result.engine === "OPENAI" ? "OpenAI structured extraction" : "the local PDF text parser"}. Human verification is required before reconciliation${duplicate ? "; a possible duplicate invoice number was detected" : ""}.`,
    actor: actorFromContext(ctx),
    source: "invoice_intelligence",
    metadata: {
      engine: result.engine,
      confidence: extraction.confidence,
      missingFields: extraction.missingFields,
      duplicateOfInvoiceId: duplicate?.id ?? null,
    },
  });
  await writeAudit({
    organizationId,
    actor: actorFromContext(ctx),
    action: "INVOICE_UPLOADED",
    entityType: "invoice",
    entityId: invoiceId,
    description: `Uploaded invoice ${invoiceNumber || "(number not extracted)"} and extracted fields`,
    metadata: {
      fileName: file.fileName,
      engine: result.engine,
      confidence: extraction.confidence,
      duplicateDetected: Boolean(duplicate),
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  await notify({
    organizationId,
    type: duplicate ? "DISCREPANCY" : "ACTION_REQUIRED",
    title: duplicate
      ? `Possible duplicate invoice ${invoiceNumber || file.fileName}`
      : `Invoice ${invoiceNumber || file.fileName} needs verification`,
    body: duplicate
      ? "A matching invoice number already exists for this vendor. Review before any settlement."
      : "Extracted fields are ready for human verification.",
    entityType: "INVOICE",
    entityId: invoiceId,
  });

  return { invoiceId, status };
}

export async function reprocessInvoice(
  ctx: AuthContext,
  invoiceId: string,
): Promise<void> {
  requirePermission(ctx, "manage_invoices");
  const invoice = await getInvoice(ctx, invoiceId);
  if (invoice.status === "VERIFIED") {
    throw new ConflictError("A verified invoice cannot be reprocessed");
  }
  const db = await getDb();
  if (!invoice.sourceDocumentId) {
    throw new ValidationError("This invoice has no stored source document");
  }
  const docRows = await db
    .select()
    .from(evidenceDocuments)
    .where(
      and(
        eq(evidenceDocuments.id, invoice.sourceDocumentId),
        eq(evidenceDocuments.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const doc = docRows[0];
  if (!doc) throw new NotFoundError("Source document");
  const { readLocalFile, createSupabaseSignedUrl } = await import("@/lib/storage");
  void createSupabaseSignedUrl;
  if (doc.storageProvider === "SUPABASE") {
    const { supabaseStorageConfigured } = await import("@/lib/env");
    if (!supabaseStorageConfigured()) {
      throw new ValidationError("Supabase storage is not configured for this deployment");
    }
    throw new ValidationError(
      "Reprocessing from Supabase Storage is not available in this build; download and re-upload the document.",
    );
  }
  const buffer = await readLocalFile(doc.storageKey);
  const result = await extractInvoiceDocument({
    organizationId: ctx.organization.id,
    buffer,
    mimeType: doc.mimeType,
    fileName: doc.fileName,
  });
  const values = extractionToValues(result.extraction, ctx.organization.baseCurrency);
  const duplicate = await findDuplicateInvoice({
    organizationId: ctx.organization.id,
    vendorId: invoice.vendorId,
    vendorNameRaw: result.extraction.vendorName,
    invoiceNumber: result.extraction.invoiceNumber ?? "",
    excludeId: invoice.id,
  });
  const status =
    result.extraction.missingFields.length > 0 || result.extraction.confidence < 75
      ? "NEEDS_REVIEW"
      : "EXTRACTED";
  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        invoiceNumber: (result.extraction.invoiceNumber ?? "").trim().slice(0, 80),
        vendorNameRaw: result.extraction.vendorName?.slice(0, 200) ?? null,
        status,
        issueDate: result.extraction.issueDate,
        dueDate: result.extraction.dueDate,
        currency: values.currency,
        subtotalMinor: values.subtotal,
        taxMinor: values.tax,
        discountMinor: values.discount,
        shippingMinor: values.shipping,
        totalMinor: values.total,
        poReference: result.extraction.poReference,
        extractionEngine: result.engine,
        extractionConfidence: result.extraction.confidence,
        extractionRaw: {
          ...result.extraction,
          engine: result.engine,
          model: result.model,
          warning: result.warning,
          rawTextStored: false,
        },
        needsReview: true,
        duplicateOfInvoiceId: duplicate?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));
    await replaceLineItems(tx, ctx, invoice.id, values.lines);
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "INVOICE_REPROCESSED",
    entityType: "invoice",
    entityId: invoice.id,
    description: `Re-ran extraction for invoice ${invoice.invoiceNumber || invoice.id}`,
    metadata: { engine: result.engine, confidence: result.extraction.confidence },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function updateAndVerifyInvoice(
  ctx: AuthContext,
  invoiceId: string,
  input: InvoiceUpdateInput,
): Promise<typeof invoices.$inferSelect> {
  requirePermission(ctx, "manage_invoices");
  const existing = await getInvoice(ctx, invoiceId);
  if (existing.status === "PROCESSING") {
    throw new ConflictError("Extraction is still in progress");
  }
  const db = await getDb();

  if (input.vendorId) {
    const vendorRows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!vendorRows[0]) throw new ValidationError("Vendor not found");
  }

  const lines = input.lineItems.map((line) => ({
    description: line.description,
    sku: line.sku ?? null,
    quantity: parseQuantityInput(line.quantity),
    unitPrice: parseMoneyInput(line.unitPrice),
    taxRateBps: percentToBps(line.taxRatePercent),
  }));
  if (lines.some((line) => line.quantity <= 0n)) {
    throw new ValidationError("Line-item quantities must be greater than zero");
  }

  const subtotal = parseMoneyInput(input.subtotal, "subtotal");
  const tax = parseMoneyInput(input.tax, "tax");
  const discount = parseMoneyInput(input.discount ?? "0", "discount");
  const shipping = parseMoneyInput(input.shipping ?? "0", "shipping");
  const total = parseMoneyInput(input.total, "total");
  if (total <= 0n) throw new ValidationError("Invoice total must be greater than zero");

  const duplicate = await findDuplicateInvoice({
    organizationId: ctx.organization.id,
    vendorId: input.vendorId ?? null,
    vendorNameRaw: input.vendorNameRaw ?? null,
    invoiceNumber: input.invoiceNumber,
    excludeId: invoiceId,
  });

  const criticalComplete =
    input.invoiceNumber.trim().length > 0 &&
    Boolean(input.vendorId) &&
    Boolean(input.issueDate) &&
    lines.length > 0 &&
    total > 0n;

  if (input.verify && !criticalComplete) {
    throw new ValidationError(
      "To verify an invoice, provide the invoice number, vendor, invoice date, at least one line item, and a total greater than zero",
    );
  }
  const status = input.verify
    ? "VERIFIED"
    : criticalComplete && input.lineItems.length > 0
      ? "EXTRACTED"
      : "NEEDS_REVIEW";

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(invoices)
      .set({
        invoiceNumber: input.invoiceNumber.trim().slice(0, 80),
        vendorId: input.vendorId ?? null,
        vendorNameRaw: input.vendorNameRaw ?? null,
        issueDate: input.issueDate ?? null,
        dueDate: input.dueDate ?? null,
        currency: input.currency,
        subtotalMinor: subtotal,
        taxMinor: tax,
        discountMinor: discount,
        shippingMinor: shipping,
        totalMinor: total,
        poReference: input.poReference ?? null,
        status,
        needsReview: !input.verify,
        duplicateOfInvoiceId: duplicate?.id ?? null,
        verifiedAt: input.verify ? new Date() : existing.verifiedAt,
        verifiedBy: input.verify ? ctx.user.id : existing.verifiedBy,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    await replaceLineItems(tx, ctx, invoiceId, lines);
    return rows[0]!;
  });

  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "INVOICE",
    entityId: invoiceId,
    eventType: input.verify ? "INVOICE_VERIFIED" : "INVOICE_CORRECTED",
    description: input.verify
      ? `Invoice ${updated.invoiceNumber} verified by a human reviewer with ${lines.length} line item(s)`
      : `Invoice fields updated and saved by a human reviewer`,
    actor: actorFromContext(ctx),
    source: "invoice_intelligence",
    metadata: { totalMinor: total.toString(), currency: input.currency },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: input.verify ? "INVOICE_VERIFIED" : "INVOICE_CORRECTED",
    entityType: "invoice",
    entityId: invoiceId,
    description: input.verify
      ? `Verified invoice ${updated.invoiceNumber}`
      : `Corrected invoice ${updated.invoiceNumber || invoiceId}`,
    metadata: {
      previousStatus: existing.status,
      totalMinor: total.toString(),
      vendorId: input.vendorId,
      duplicateDetected: Boolean(duplicate),
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  if (duplicate) {
    await notify({
      organizationId: ctx.organization.id,
      type: "DISCREPANCY",
      title: `Possible duplicate invoice ${updated.invoiceNumber}`,
      body: "A matching invoice number already exists for this vendor.",
      entityType: "INVOICE",
      entityId: invoiceId,
    });
  }

  return updated;
}

export async function invoiceStatusCounts(ctx: AuthContext) {
  const db = await getDb();
  const clauses = [eq(invoices.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) clauses.push(eq(invoices.vendorId, vendorScope(ctx)));
  const rows = await db
    .select({ status: invoices.status, total: count() })
    .from(invoices)
    .where(and(...clauses))
    .groupBy(invoices.status);
  return rows;
}

export async function invoiceActivity(ctx: AuthContext, invoiceId: string) {
  const db = await getDb();
  return db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, ctx.organization.id),
        eq(auditLogs.entityType, "invoice"),
        eq(auditLogs.entityId, invoiceId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(30);
}

export async function invoiceOpenDiscrepancyTotal(
  ctx: AuthContext,
  invoiceId: string,
): Promise<bigint> {
  const db = await getDb();
  const rows = await db
    .select({ impact: discrepancies.impactMinor })
    .from(discrepancies)
    .where(
      and(
        eq(discrepancies.organizationId, ctx.organization.id),
        eq(discrepancies.invoiceId, invoiceId),
        eq(discrepancies.status, "OPEN"),
      ),
    );
  return rows.reduce((sum, row) => sum + (row.impact ?? 0n), 0n);
}

export async function getVendorOptions(ctx: AuthContext) {
  const db = await getDb();
  return db
    .select({ id: vendors.id, name: vendors.name, code: vendors.code, currency: vendors.currency })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, ctx.organization.id),
        eq(vendors.status, "ACTIVE"),
      ),
    )
    .orderBy(vendors.name);
}
