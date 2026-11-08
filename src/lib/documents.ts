import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  evidenceDocuments,
  goodsReceipts,
  invoices,
  purchaseOrders,
  settlements,
} from "@/lib/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { signedFileHref } from "@/lib/auth/tokens";
import {
  storeFile,
  validateUploadFile,
  type ValidatedFile,
} from "@/lib/storage";

export const DOCUMENT_ENTITY_TYPES = [
  "INVOICE",
  "PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "SETTLEMENT",
] as const;

export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

async function assertEntityInOrganization(
  ctx: AuthContext,
  entityType: DocumentEntityType,
  entityId: string,
): Promise<void> {
  const db = await getDb();
  const orgId = ctx.organization.id;
  if (entityType === "INVOICE") {
    const rows = await db
      .select({ id: invoices.id, vendorId: invoices.vendorId })
      .from(invoices)
      .where(and(eq(invoices.id, entityId), eq(invoices.organizationId, orgId)))
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Invoice");
    if (isVendor(ctx) && rows[0].vendorId !== ctx.membership.vendorId) {
      throw new ForbiddenError("You cannot access another vendor's documents");
    }
    return;
  }
  if (entityType === "PURCHASE_ORDER") {
    const rows = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, entityId),
          eq(purchaseOrders.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Purchase order");
    if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access purchase orders");
    return;
  }
  if (entityType === "GOODS_RECEIPT") {
    const rows = await db
      .select({ id: goodsReceipts.id })
      .from(goodsReceipts)
      .where(
        and(
          eq(goodsReceipts.id, entityId),
          eq(goodsReceipts.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundError("Goods receipt");
    if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access goods receipts");
    return;
  }
  const rows = await db
    .select({ id: settlements.id, vendorId: settlements.vendorId })
    .from(settlements)
    .where(
      and(
        eq(settlements.id, entityId),
        eq(settlements.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Settlement");
  if (isVendor(ctx) && rows[0].vendorId !== ctx.membership.vendorId) {
    throw new ForbiddenError("You cannot access another vendor's settlement");
  }
}

/** Store bytes + metadata + evidence event. Caller must have authorized the entity. */
export async function persistDocument(input: {
  ctx: AuthContext;
  file: ValidatedFile;
  documentType: string;
  entityType: DocumentEntityType;
  entityId: string;
  title: string;
  authorized?: boolean;
}): Promise<typeof evidenceDocuments.$inferSelect> {
  const { ctx, file } = input;
  if (!input.authorized) {
    await assertEntityInOrganization(ctx, input.entityType, input.entityId);
  }
  const stored = await storeFile({
    organizationId: ctx.organization.id,
    extension: file.extension,
    buffer: file.buffer,
    mimeType: file.mimeType,
  });
  const db = await getDb();
  const rows = await db
    .insert(evidenceDocuments)
    .values({
      organizationId: ctx.organization.id,
      documentType: input.documentType.slice(0, 40),
      title: input.title.slice(0, 200),
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storageProvider: stored.provider,
      storageKey: stored.storageKey,
      sha256: file.sha256,
      entityType: input.entityType,
      entityId: input.entityId,
      uploadedBy: ctx.user.id,
    })
    .returning();
  const document = rows[0]!;

  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: "DOCUMENT_UPLOADED",
    description: `${input.title} uploaded (${file.fileName}, ${Math.ceil(file.sizeBytes / 1024)} KB)`,
    actor: actorFromContext(ctx),
    source: "document_service",
    metadata: {
      documentId: document.id,
      sha256: file.sha256,
      mimeType: file.mimeType,
    },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "DOCUMENT_UPLOADED",
    entityType: input.entityType,
    entityId: input.entityId,
    description: `Uploaded document "${input.title}" (${file.fileName})`,
    metadata: { documentId: document.id, documentType: input.documentType },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return document;
}

export async function uploadDocumentForEntity(
  ctx: AuthContext,
  input: {
    file: File;
    documentType: string;
    entityType: DocumentEntityType;
    entityId: string;
    title?: string;
  },
) {
  if (!(DOCUMENT_ENTITY_TYPES as readonly string[]).includes(input.entityType)) {
    throw new ValidationError("Invalid document entity type");
  }
  const file = await validateUploadFile(input.file);
  return persistDocument({
    ctx,
    file,
    documentType: input.documentType,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title?.trim() || file.fileName,
  });
}

export async function listDocuments(
  ctx: AuthContext,
  entityType: DocumentEntityType,
  entityId: string,
) {
  await assertEntityInOrganization(ctx, entityType, entityId);
  const db = await getDb();
  return db
    .select()
    .from(evidenceDocuments)
    .where(
      and(
        eq(evidenceDocuments.organizationId, ctx.organization.id),
        eq(evidenceDocuments.entityType, entityType),
        eq(evidenceDocuments.entityId, entityId),
      ),
    )
    .orderBy(desc(evidenceDocuments.createdAt));
}

export async function getDocument(
  ctx: AuthContext,
  documentId: string,
): Promise<typeof evidenceDocuments.$inferSelect> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(evidenceDocuments)
    .where(
      and(
        eq(evidenceDocuments.id, documentId),
        eq(evidenceDocuments.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Document");
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access internal documents");
  return rows[0];
}

export function documentHref(documentId: string, download = false): string {
  return signedFileHref(documentId, 600, download ? "attachment" : "inline");
}

export async function listDocumentsForInvoiceIds(
  organizationId: string,
  invoiceIds: string[],
) {
  if (invoiceIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(evidenceDocuments)
    .where(
      and(
        eq(evidenceDocuments.organizationId, organizationId),
        eq(evidenceDocuments.entityType, "INVOICE"),
      ),
    );
  return rows.filter((row) => invoiceIds.includes(row.entityId));
}
