import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission } from "@/lib/auth/rbac";
import { ForbiddenError } from "@/lib/errors";

export async function listAuditLogs(
  ctx: AuthContext,
  options: {
    search?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  requirePermission(ctx, "view_audit");
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot access the audit trail");
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 40));
  const clauses = [eq(auditLogs.organizationId, ctx.organization.id)];
  if (options.action && options.action !== "ALL") {
    clauses.push(eq(auditLogs.action, options.action));
  }
  if (options.from) clauses.push(gte(auditLogs.createdAt, new Date(`${options.from}T00:00:00Z`)));
  if (options.to) clauses.push(lte(auditLogs.createdAt, new Date(`${options.to}T23:59:59Z`)));
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(auditLogs.description, term),
        ilike(auditLogs.actorLabel, term),
        ilike(auditLogs.action, term),
        ilike(auditLogs.entityType, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows, actions] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
    db
      .selectDistinct({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, ctx.organization.id))
      .orderBy(auditLogs.action),
  ]);
  return {
    logs: rows,
    total: totalRows[0]?.total ?? 0,
    page,
    pageSize,
    actions: actions.map((row) => row.action),
  };
}
