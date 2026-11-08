import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  goodsReceiptItems,
  goodsReceipts,
  purchaseOrderItems,
  purchaseOrders,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { parseQuantityInput } from "@/lib/money";
import { listDocuments } from "@/lib/documents";
import { refreshPurchaseOrderStatus } from "./purchase-orders";
import type { grCreateSchema, grUpdateSchema } from "@/lib/validation";
import type { z } from "zod";

export type GrCreateInput = z.infer<typeof grCreateSchema>;
export type GrUpdateInput = z.infer<typeof grUpdateSchema>;

export async function listGoodsReceipts(
  ctx: AuthContext,
  options: {
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access goods receipts");
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(goodsReceipts.organizationId, ctx.organization.id)];
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(goodsReceipts.receiptNumber, term),
        ilike(purchaseOrders.poNumber, term),
        ilike(vendors.name, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        receipt: goodsReceipts,
        poNumber: purchaseOrders.poNumber,
        vendorName: vendors.name,
      })
      .from(goodsReceipts)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(where)
      .orderBy(desc(goodsReceipts.receivedDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(goodsReceipts)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(where),
  ]);
  return { receipts: rows, total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getGoodsReceipt(
  ctx: AuthContext,
  receiptId: string,
): Promise<typeof goodsReceipts.$inferSelect> {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access goods receipts");
  const db = await getDb();
  const rows = await db
    .select()
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.id, receiptId),
        eq(goodsReceipts.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Goods receipt");
  return rows[0];
}

export async function getGoodsReceiptDetail(ctx: AuthContext, receiptId: string) {
  const receipt = await getGoodsReceipt(ctx, receiptId);
  const db = await getDb();
  const poRows = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, receipt.purchaseOrderId))
    .limit(1);
  const po = poRows[0]!;
  const [items, poItems, vendorRows, documents] = await Promise.all([
    db
      .select()
      .from(goodsReceiptItems)
      .where(eq(goodsReceiptItems.goodsReceiptId, receipt.id)),
    db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
      .orderBy(purchaseOrderItems.lineNumber),
    db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1),
    listDocuments(ctx, "GOODS_RECEIPT", receipt.id),
  ]);
  return {
    receipt,
    purchaseOrder: po,
    vendor: vendorRows[0] ?? null,
    items: items.map((item) => ({
      ...item,
      purchaseOrderItem: poItems.find((poItem) => poItem.id === item.purchaseOrderItemId) ?? null,
    })),
    documents,
  };
}

export async function getReceiptEntryData(ctx: AuthContext, poId: string) {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access goods receipts");
  const db = await getDb();
  const poRows = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, poId),
        eq(purchaseOrders.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const po = poRows[0];
  if (!po) throw new NotFoundError("Purchase order");
  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
    .orderBy(purchaseOrderItems.lineNumber);
  const receipts = await db
    .select()
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.organizationId, ctx.organization.id),
        eq(goodsReceipts.purchaseOrderId, po.id),
      ),
    );
  const receiptIds = new Set(receipts.map((r) => r.id));
  const receiptItems = await db
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.organizationId, ctx.organization.id));
  const activeReceiptIds = new Set(
    receipts.filter((r) => r.status !== "CANCELLED").map((r) => r.id),
  );
  const received = new Map<string, bigint>();
  for (const ri of receiptItems) {
    if (!receiptIds.has(ri.goodsReceiptId) || !activeReceiptIds.has(ri.goodsReceiptId)) continue;
    received.set(
      ri.purchaseOrderItemId,
      (received.get(ri.purchaseOrderItemId) ?? 0n) + ri.quantityReceivedMilli,
    );
  }
  const vendorRows = await db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1);
  return {
    purchaseOrder: po,
    vendor: vendorRows[0] ?? null,
    items: items.map((item) => ({
      ...item,
      previouslyReceivedMilli: received.get(item.id) ?? 0n,
      remainingMilli:
        item.quantityMilli > (received.get(item.id) ?? 0n)
          ? item.quantityMilli - (received.get(item.id) ?? 0n)
          : 0n,
    })),
  };
}

export async function createGoodsReceipt(
  ctx: AuthContext,
  input: GrCreateInput,
): Promise<typeof goodsReceipts.$inferSelect> {
  requirePermission(ctx, "manage_procurement");
  const db = await getDb();
  const entry = await getReceiptEntryData(ctx, input.purchaseOrderId);
  if (["CANCELLED", "CLOSED"].includes(entry.purchaseOrder.status)) {
    throw new ConflictError("Goods cannot be received against a closed or cancelled PO");
  }
  if (entry.purchaseOrder.status === "DRAFT") {
    throw new ConflictError("Open the purchase order before recording receipts");
  }

  const itemsById = new Map(entry.items.map((item) => [item.id, item]));
  let totalNew = 0n;
  const normalized = input.items.map((item) => {
    const poItem = itemsById.get(item.purchaseOrderItemId);
    if (!poItem) {
      throw new ValidationError("A receipt line does not belong to the selected purchase order");
    }
    const received = parseQuantityInput(item.quantityReceived);
    const damaged = parseQuantityInput(item.quantityDamaged ?? "0");
    if (received < 0n || damaged < 0n) {
      throw new ValidationError("Quantities cannot be negative");
    }
    if (damaged > received) {
      throw new ValidationError("Damaged quantity cannot exceed received quantity");
    }
    if (received > poItem.remainingMilli) {
      throw new ValidationError(
        `Receipt of ${item.quantityReceived} for "${poItem.description}" exceeds the remaining ordered quantity`,
      );
    }
    totalNew += received;
    return { poItem, received, damaged, notes: null };
  });
  if (totalNew <= 0n) {
    throw new ValidationError("At least one line must record a received quantity");
  }

  try {
    const created = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(goodsReceipts)
        .values({
          organizationId: ctx.organization.id,
          purchaseOrderId: input.purchaseOrderId,
          receiptNumber: input.receiptNumber.trim().slice(0, 80),
          receivedDate: input.receivedDate,
          status: "RECEIVED",
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        })
        .returning();
      const receipt = rows[0]!;
      await tx.insert(goodsReceiptItems).values(
        normalized.map((item) => ({
          organizationId: ctx.organization.id,
          goodsReceiptId: receipt.id,
          purchaseOrderItemId: item.poItem.id,
          quantityReceivedMilli: item.received,
          quantityDamagedMilli: item.damaged,
          notes: item.notes,
        })),
      );
      return receipt;
    });

    await refreshPurchaseOrderStatus(ctx.organization.id, input.purchaseOrderId);
    await recordEvidenceEvent({
      organizationId: ctx.organization.id,
      entityType: "GOODS_RECEIPT",
      entityId: created.id,
      eventType: "GOODS_RECEIPT_CREATED",
      description: `Goods receipt ${created.receiptNumber} recorded against ${entry.purchaseOrder.poNumber}.`,
      actor: actorFromContext(ctx),
      source: "warehouse",
      metadata: { purchaseOrderId: input.purchaseOrderId },
    });
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "GOODS_RECEIPT_CREATED",
      entityType: "goods_receipt",
      entityId: created.id,
      description: `Created goods receipt ${created.receiptNumber} for ${entry.purchaseOrder.poNumber}`,
      metadata: {
        purchaseOrderId: input.purchaseOrderId,
        lineCount: normalized.length,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return created;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new ConflictError("A goods receipt with this number already exists");
    }
    throw error;
  }
}

export async function updateGoodsReceipt(
  ctx: AuthContext,
  receiptId: string,
  input: GrUpdateInput,
): Promise<typeof goodsReceipts.$inferSelect> {
  requirePermission(ctx, "manage_procurement");
  const receipt = await getGoodsReceipt(ctx, receiptId);
  if (receipt.status === "CANCELLED" && input.status !== undefined) {
    throw new ConflictError("A cancelled goods receipt cannot be changed");
  }
  const db = await getDb();
  const rows = await db
    .update(goodsReceipts)
    .set({
      notes: input.notes === undefined ? receipt.notes : input.notes,
      status: input.status ?? receipt.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(goodsReceipts.id, receiptId),
        eq(goodsReceipts.organizationId, ctx.organization.id),
      ),
    )
    .returning();
  await refreshPurchaseOrderStatus(ctx.organization.id, receipt.purchaseOrderId);
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "GOODS_RECEIPT_UPDATED",
    entityType: "goods_receipt",
    entityId: receiptId,
    description: `Updated goods receipt ${receipt.receiptNumber}`,
    metadata: { previousStatus: receipt.status, newStatus: rows[0]?.status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return rows[0]!;
}
