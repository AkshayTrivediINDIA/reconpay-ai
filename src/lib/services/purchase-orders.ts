import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  goodsReceiptItems,
  goodsReceipts,
  invoices,
  purchaseOrderItems,
  purchaseOrders,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  computeLineTotal,
  computeTax,
  parseMoneyInput,
  parseQuantityInput,
  sumMinor,
} from "@/lib/money";
import { listDocuments } from "@/lib/documents";
import type { poCreateSchema, poUpdateSchema } from "@/lib/validation";
import type { z } from "zod";

export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type PoUpdateInput = z.infer<typeof poUpdateSchema>;

function percentToBps(value: string): number {
  try {
    const milli = parseQuantityInput(value, "tax rate");
    const bps = milli / 10n;
    return Number(bps > 10_000n ? 10_000n : bps);
  } catch {
    return 0;
  }
}

export async function listPurchaseOrders(
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
  if (isVendor(ctx)) {
    throw new ForbiddenError("Vendors cannot access purchase-order records");
  }
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(purchaseOrders.organizationId, ctx.organization.id)];
  if (options.status && options.status !== "ALL") {
    if (
      ["DRAFT", "OPEN", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"].includes(
        options.status,
      )
    ) {
      clauses.push(eq(purchaseOrders.status, options.status as "OPEN"));
    }
  }
  if (options.vendorId) clauses.push(eq(purchaseOrders.vendorId, options.vendorId));
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(purchaseOrders.poNumber, term),
        ilike(vendors.name, term),
        ilike(purchaseOrders.notes, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        purchaseOrder: purchaseOrders,
        vendorName: vendors.name,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(where)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(where),
  ]);
  return { purchaseOrders: rows, total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getPurchaseOrder(
  ctx: AuthContext,
  poId: string,
): Promise<typeof purchaseOrders.$inferSelect> {
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access purchase orders");
  const db = await getDb();
  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, poId),
        eq(purchaseOrders.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Purchase order");
  return rows[0];
}

export async function getPurchaseOrderDetail(ctx: AuthContext, poId: string) {
  const po = await getPurchaseOrder(ctx, poId);
  const db = await getDb();
  const [items, vendorRows, receipts, receiptItems, linkedInvoices, documents] =
    await Promise.all([
      db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
        .orderBy(purchaseOrderItems.lineNumber),
      db.select().from(vendors).where(eq(vendors.id, po.vendorId)).limit(1),
      db
        .select()
        .from(goodsReceipts)
        .where(
          and(
            eq(goodsReceipts.organizationId, ctx.organization.id),
            eq(goodsReceipts.purchaseOrderId, po.id),
          ),
        )
        .orderBy(desc(goodsReceipts.receivedDate)),
      db
        .select()
        .from(goodsReceiptItems)
        .where(eq(goodsReceiptItems.organizationId, ctx.organization.id)),
      db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, ctx.organization.id),
            eq(invoices.poReference, po.poNumber),
          ),
        )
        .orderBy(desc(invoices.createdAt)),
      listDocuments(ctx, "PURCHASE_ORDER", po.id),
    ]);

  const relevantReceiptItems = receiptItems.filter((item) =>
    receipts.some((receipt) => receipt.id === item.goodsReceiptId),
  );
  const remaining = items.map((item) => {
    const received = relevantReceiptItems
      .filter(
        (ri) =>
          ri.purchaseOrderItemId === item.id &&
          receipts.find((r) => r.id === ri.goodsReceiptId)?.status !== "CANCELLED",
      )
      .reduce((sum, ri) => sum + ri.quantityReceivedMilli, 0n);
    return {
      item,
      receivedMilli: received,
      remainingMilli: item.quantityMilli > received ? item.quantityMilli - received : 0n,
    };
  });

  return {
    purchaseOrder: po,
    items,
    remaining,
    vendor: vendorRows[0] ?? null,
    receipts,
    receiptItems: relevantReceiptItems,
    invoices: linkedInvoices,
    documents,
  };
}

export async function createPurchaseOrder(
  ctx: AuthContext,
  input: PoCreateInput,
): Promise<typeof purchaseOrders.$inferSelect> {
  requirePermission(ctx, "manage_procurement");
  const db = await getDb();
  const vendorRows = await db
    .select({ id: vendors.id, currency: vendors.currency, name: vendors.name })
    .from(vendors)
    .where(
      and(
        eq(vendors.id, input.vendorId),
        eq(vendors.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const vendor = vendorRows[0];
  if (!vendor) throw new ValidationError("Vendor not found");

  const lines = input.lineItems.map((line) => {
    const quantity = parseQuantityInput(line.quantity);
    const unitPrice = parseMoneyInput(line.unitPrice);
    if (quantity <= 0n) throw new ValidationError("Line quantities must be greater than zero");
    const taxRateBps = percentToBps(line.taxRatePercent);
    return {
      description: line.description,
      sku: line.sku ?? null,
      quantity,
      unitPrice,
      taxRateBps,
      lineTotal: computeLineTotal(unitPrice, quantity),
      tax: computeTax(computeLineTotal(unitPrice, quantity), taxRateBps),
    };
  });
  const subtotal = sumMinor(lines.map((line) => line.lineTotal));
  const tax = sumMinor(lines.map((line) => line.tax));
  const total = subtotal + tax;

  try {
    const created = await db.transaction(async (tx) => {
      const poRows = await tx
        .insert(purchaseOrders)
        .values({
          organizationId: ctx.organization.id,
          vendorId: input.vendorId,
          poNumber: input.poNumber.trim().slice(0, 80),
          orderDate: input.orderDate,
          expectedDeliveryDate: input.expectedDeliveryDate ?? null,
          currency: input.currency,
          subtotalMinor: subtotal,
          taxMinor: tax,
          totalMinor: total,
          status: input.status,
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        })
        .returning();
      const po = poRows[0]!;
      await tx.insert(purchaseOrderItems).values(
        lines.map((line, index) => ({
          organizationId: ctx.organization.id,
          purchaseOrderId: po.id,
          lineNumber: index + 1,
          description: line.description,
          sku: line.sku,
          quantityMilli: line.quantity,
          unitPriceMinor: line.unitPrice,
          taxRateBps: line.taxRateBps,
          lineTotalMinor: line.lineTotal,
        })),
      );
      return po;
    });

    await recordEvidenceEvent({
      organizationId: ctx.organization.id,
      entityType: "PURCHASE_ORDER",
      entityId: created.id,
      eventType: "PURCHASE_ORDER_CREATED",
      description: `Purchase order ${created.poNumber} created for ${vendor.name} with ${lines.length} line item(s).`,
      actor: actorFromContext(ctx),
      source: "procurement",
      metadata: { totalMinor: total.toString(), currency: created.currency },
    });
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "PURCHASE_ORDER_CREATED",
      entityType: "purchase_order",
      entityId: created.id,
      description: `Created purchase order ${created.poNumber}`,
      metadata: { vendorId: vendor.id, totalMinor: total.toString(), lines: lines.length },
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
      throw new ConflictError("A purchase order with this number already exists");
    }
    throw error;
  }
}

export async function updatePurchaseOrder(
  ctx: AuthContext,
  poId: string,
  input: PoUpdateInput,
): Promise<typeof purchaseOrders.$inferSelect> {
  requirePermission(ctx, "manage_procurement");
  const po = await getPurchaseOrder(ctx, poId);
  if (po.status === "CANCELLED" && input.status !== undefined) {
    throw new ConflictError("A cancelled purchase order cannot be reopened");
  }
  if (po.status === "CLOSED" && input.status === "OPEN") {
    throw new ConflictError("A closed purchase order cannot be reopened");
  }
  const db = await getDb();
  const rows = await db
    .update(purchaseOrders)
    .set({
      expectedDeliveryDate:
        input.expectedDeliveryDate === undefined
          ? po.expectedDeliveryDate
          : input.expectedDeliveryDate,
      notes: input.notes === undefined ? po.notes : input.notes,
      status: input.status ?? po.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(purchaseOrders.id, poId),
        eq(purchaseOrders.organizationId, ctx.organization.id),
      ),
    )
    .returning();
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "PURCHASE_ORDER_UPDATED",
    entityType: "purchase_order",
    entityId: poId,
    description: `Updated purchase order ${po.poNumber}`,
    metadata: { previousStatus: po.status, newStatus: rows[0]?.status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return rows[0]!;
}

export async function refreshPurchaseOrderStatus(
  organizationId: string,
  purchaseOrderId: string,
): Promise<void> {
  const db = await getDb();
  const poRows = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, purchaseOrderId),
        eq(purchaseOrders.organizationId, organizationId),
      ),
    )
    .limit(1);
  const po = poRows[0];
  if (!po || ["DRAFT", "CLOSED", "CANCELLED"].includes(po.status)) return;

  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  const receipts = await db
    .select()
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.organizationId, organizationId),
        eq(goodsReceipts.purchaseOrderId, purchaseOrderId),
      ),
    );
  const activeReceiptIds = new Set(
    receipts.filter((r) => r.status !== "CANCELLED").map((r) => r.id),
  );
  const receiptItems = await db
    .select()
    .from(goodsReceiptItems)
    .where(eq(goodsReceiptItems.organizationId, organizationId));
  const receivedByPoItem = new Map<string, bigint>();
  for (const item of receiptItems) {
    if (!activeReceiptIds.has(item.goodsReceiptId)) continue;
    receivedByPoItem.set(
      item.purchaseOrderItemId,
      (receivedByPoItem.get(item.purchaseOrderItemId) ?? 0n) +
        item.quantityReceivedMilli,
    );
  }
  const fullyReceived = items.every(
    (item) => (receivedByPoItem.get(item.id) ?? 0n) >= item.quantityMilli,
  );
  const anyReceived = [...receivedByPoItem.values()].some((qty) => qty > 0n);
  const status = fullyReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "OPEN";
  if (status !== po.status) {
    await db
      .update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }
}

export async function getPurchaseOrderOptions(ctx: AuthContext) {
  const db = await getDb();
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      vendorId: purchaseOrders.vendorId,
      vendorName: vendors.name,
      currency: purchaseOrders.currency,
      totalMinor: purchaseOrders.totalMinor,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(
      and(
        eq(purchaseOrders.organizationId, ctx.organization.id),
        sql`${purchaseOrders.status} <> 'CANCELLED'`,
      ),
    )
    .orderBy(desc(purchaseOrders.orderDate))
    .limit(200);
}
