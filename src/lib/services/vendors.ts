import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoices,
  purchaseOrders,
  settlements,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission, vendorScope } from "@/lib/auth/rbac";
import { actorFromContext, writeAudit } from "@/lib/audit";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { z } from "zod";
import type { vendorCreateSchema, vendorUpdateSchema } from "@/lib/validation";

export type VendorInput = z.infer<typeof vendorCreateSchema>;
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>;

export async function listVendors(
  ctx: AuthContext,
  options: {
    search?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(vendors.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) {
    clauses.push(eq(vendors.id, vendorScope(ctx)));
  }
  if (options.status && ["ACTIVE", "INACTIVE", "ON_HOLD"].includes(options.status)) {
    clauses.push(eq(vendors.status, options.status as "ACTIVE"));
  }
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(vendors.name, term),
        ilike(vendors.code, term),
        ilike(vendors.email, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(vendors)
      .where(where)
      .orderBy(desc(vendors.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(vendors).where(where),
  ]);
  return {
    vendors: rows,
    total: totalRows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

export async function getVendor(
  ctx: AuthContext,
  vendorId: string,
): Promise<typeof vendors.$inferSelect> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vendors)
    .where(
      and(
        eq(vendors.id, vendorId),
        eq(vendors.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Vendor");
  if (isVendor(ctx) && rows[0].id !== ctx.membership.vendorId) {
    throw new NotFoundError("Vendor");
  }
  return rows[0];
}

export async function getVendorProfile(ctx: AuthContext, vendorId: string) {
  const vendor = await getVendor(ctx, vendorId);
  const db = await getDb();
  const [invoiceStats] = await db
    .select({
      invoiceCount: count(),
      invoiceTotal: sql<string>`coalesce(sum(${invoices.totalMinor}), 0)::text`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, ctx.organization.id),
        eq(invoices.vendorId, vendorId),
      ),
    );
  const [settlementStats] = await db
    .select({ settlementCount: count() })
    .from(settlements)
    .where(
      and(
        eq(settlements.organizationId, ctx.organization.id),
        eq(settlements.vendorId, vendorId),
      ),
    );
  return {
    vendor,
    invoiceCount: invoiceStats?.invoiceCount ?? 0,
    invoiceTotalMinor: BigInt(invoiceStats?.invoiceTotal ?? "0"),
    settlementCount: settlementStats?.settlementCount ?? 0,
  };
}

export async function getVendorDetail(ctx: AuthContext, vendorId: string) {
  const profile = await getVendorProfile(ctx, vendorId);
  const db = await getDb();
  const [invoiceRows, purchaseOrderRows, settlementRows] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organization.id),
          eq(invoices.vendorId, vendorId),
        ),
      )
      .orderBy(desc(invoices.createdAt))
      .limit(20),
    db
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, ctx.organization.id),
          eq(purchaseOrders.vendorId, vendorId),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(20),
    db
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.organizationId, ctx.organization.id),
          eq(settlements.vendorId, vendorId),
        ),
      )
      .orderBy(desc(settlements.createdAt))
      .limit(20),
  ]);
  return { ...profile, invoices: invoiceRows, purchaseOrders: purchaseOrderRows, settlements: settlementRows };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function createVendor(
  ctx: AuthContext,
  input: VendorInput,
): Promise<typeof vendors.$inferSelect> {
  requirePermission(ctx, "manage_procurement");
  const db = await getDb();
  try {
    const rows = await db
      .insert(vendors)
      .values({
        organizationId: ctx.organization.id,
        name: input.name,
        code: input.code,
        email: input.email ?? null,
        phone: input.phone ?? null,
        taxId: input.taxId ?? null,
        address: input.address ?? null,
        currency: input.currency,
        paymentTermsDays: input.paymentTermsDays,
        status: input.status,
        notes: input.notes ?? null,
      })
      .returning();
    const vendor = rows[0]!;
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "VENDOR_CREATED",
      entityType: "vendor",
      entityId: vendor.id,
      description: `Created vendor ${vendor.name} (${vendor.code})`,
      metadata: { currency: vendor.currency },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return vendor;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A vendor with this code already exists");
    }
    throw error;
  }
}

export async function updateVendor(
  ctx: AuthContext,
  vendorId: string,
  input: VendorUpdateInput,
): Promise<typeof vendors.$inferSelect> {
  requirePermission(ctx, "manage_procurement");
  const existing = await getVendor(ctx, vendorId);
  const db = await getDb();
  try {
    const rows = await db
      .update(vendors)
      .set({
        name: input.name ?? existing.name,
        code: input.code ?? existing.code,
        email: input.email === undefined ? existing.email : input.email,
        phone: input.phone === undefined ? existing.phone : input.phone,
        taxId: input.taxId === undefined ? existing.taxId : input.taxId,
        address: input.address === undefined ? existing.address : input.address,
        currency: input.currency ?? existing.currency,
        paymentTermsDays: input.paymentTermsDays ?? existing.paymentTermsDays,
        status: input.status ?? existing.status,
        notes: input.notes === undefined ? existing.notes : input.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vendors.id, vendorId),
          eq(vendors.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    const vendor = rows[0]!;
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "VENDOR_UPDATED",
      entityType: "vendor",
      entityId: vendor.id,
      description: `Updated vendor ${vendor.name}`,
      metadata: { status: vendor.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return vendor;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A vendor with this code already exists");
    }
    throw error;
  }
}
