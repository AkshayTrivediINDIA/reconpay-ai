import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  goodsReceipts,
  invoices,
  purchaseOrders,
  settlements,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, vendorScope } from "@/lib/auth/rbac";

export type SearchItem = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export type SearchGroup = {
  label: string;
  items: SearchItem[];
};

export async function globalSearch(
  ctx: AuthContext,
  rawQuery: string,
): Promise<{ query: string; groups: SearchGroup[]; total: number }> {
  const query = rawQuery.trim().slice(0, 120);
  if (query.length < 2) return { query, groups: [], total: 0 };
  const db = await getDb();
  const term = `%${query}%`;
  const organizationId = ctx.organization.id;

  if (isVendor(ctx)) {
    const vendorId = vendorScope(ctx);
    const [invoiceRows, settlementRows] = await Promise.all([
      db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.vendorId, vendorId),
            or(ilike(invoices.invoiceNumber, term), ilike(invoices.poReference, term))!,
          ),
        )
        .orderBy(desc(invoices.createdAt))
        .limit(8),
      db
        .select()
        .from(settlements)
        .where(
          and(
            eq(settlements.organizationId, organizationId),
            eq(settlements.vendorId, vendorId),
            or(
              ilike(settlements.settlementNumber, term),
              ilike(settlements.reason, term),
            )!,
          ),
        )
        .orderBy(desc(settlements.createdAt))
        .limit(8),
    ]);
    const groups: SearchGroup[] = [];
    if (invoiceRows.length > 0) {
      groups.push({
        label: "Invoices",
        items: invoiceRows.map((invoice) => ({
          type: "invoice",
          title: invoice.invoiceNumber || "Untitled invoice",
          subtitle: `${invoice.status.replaceAll("_", " ").toLowerCase()} · ${invoice.currency}`,
          href: `/invoices/${invoice.id}`,
        })),
      });
    }
    if (settlementRows.length > 0) {
      groups.push({
        label: "Settlements",
        items: settlementRows.map((settlement) => ({
          type: "settlement",
          title: settlement.settlementNumber,
          subtitle: settlement.status.replaceAll("_", " ").toLowerCase(),
          href: `/settlements/${settlement.id}`,
        })),
      });
    }
    return { query, groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) };
  }

  const [invoiceRows, poRows, grRows, settlementRows, vendorRows] = await Promise.all([
    db
      .select({
        invoice: invoices,
        vendorName: vendors.name,
      })
      .from(invoices)
      .leftJoin(vendors, eq(vendors.id, invoices.vendorId))
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          or(
            ilike(invoices.invoiceNumber, term),
            ilike(invoices.vendorNameRaw, term),
            ilike(invoices.poReference, term),
            ilike(vendors.name, term),
          )!,
        ),
      )
      .orderBy(desc(invoices.createdAt))
      .limit(8),
    db
      .select({ po: purchaseOrders, vendorName: vendors.name })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          or(ilike(purchaseOrders.poNumber, term), ilike(vendors.name, term))!,
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(8),
    db
      .select({ receipt: goodsReceipts })
      .from(goodsReceipts)
      .where(
        and(
          eq(goodsReceipts.organizationId, organizationId),
          ilike(goodsReceipts.receiptNumber, term),
        ),
      )
      .orderBy(desc(goodsReceipts.createdAt))
      .limit(8),
    db
      .select({
        settlement: settlements,
        vendorName: vendors.name,
      })
      .from(settlements)
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .where(
        and(
          eq(settlements.organizationId, organizationId),
          or(
            ilike(settlements.settlementNumber, term),
            ilike(settlements.reason, term),
            ilike(vendors.name, term),
          )!,
        ),
      )
      .orderBy(desc(settlements.createdAt))
      .limit(8),
    db
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.organizationId, organizationId),
          or(ilike(vendors.name, term), ilike(vendors.code, term))!,
        ),
      )
      .orderBy(vendors.name)
      .limit(8),
  ]);

  const groups: SearchGroup[] = [];
  if (invoiceRows.length > 0) {
    groups.push({
      label: "Invoices",
      items: invoiceRows.map(({ invoice, vendorName }) => ({
        type: "invoice",
        title: invoice.invoiceNumber || "Untitled invoice",
        subtitle: `${vendorName ?? invoice.vendorNameRaw ?? "Unassigned vendor"} · ${invoice.status.replaceAll("_", " ").toLowerCase()}`,
        href: `/invoices/${invoice.id}`,
      })),
    });
  }
  if (poRows.length > 0) {
    groups.push({
      label: "Purchase orders",
      items: poRows.map(({ po, vendorName }) => ({
        type: "purchase-order",
        title: po.poNumber,
        subtitle: `${vendorName} · ${po.status.replaceAll("_", " ").toLowerCase()}`,
        href: `/purchase-orders/${po.id}`,
      })),
    });
  }
  if (grRows.length > 0) {
    groups.push({
      label: "Goods receipts",
      items: grRows.map(({ receipt }) => ({
        type: "goods-receipt",
        title: receipt.receiptNumber,
        subtitle: `${receipt.receivedDate} · ${receipt.status.toLowerCase()}`,
        href: `/goods-receipts/${receipt.id}`,
      })),
    });
  }
  if (settlementRows.length > 0) {
    groups.push({
      label: "Settlements",
      items: settlementRows.map(({ settlement, vendorName }) => ({
        type: "settlement",
        title: settlement.settlementNumber,
        subtitle: `${vendorName} · ${settlement.status.replaceAll("_", " ").toLowerCase()}`,
        href: `/settlements/${settlement.id}`,
      })),
    });
  }
  if (vendorRows.length > 0) {
    groups.push({
      label: "Vendors",
      items: vendorRows.map((vendor) => ({
        type: "vendor",
        title: vendor.name,
        subtitle: `${vendor.code} · ${vendor.currency}`,
        href: `/vendors/${vendor.id}`,
      })),
    });
  }
  return { query, groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) };
}
