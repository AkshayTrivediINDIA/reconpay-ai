import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoices,
  payments,
  reconciliationRuns,
  settlementApprovals,
  settlements,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import {
  canApproveAmount,
  isVendor,
  requirePermission,
  vendorScope,
} from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { parseMoneyInput } from "@/lib/money";
import { generateOpaqueToken, sha256 } from "@/lib/auth/tokens";
import { env, isPaypalSupportedCurrency } from "@/lib/env";
import type {
  settlementApprovalSchema,
  settlementCreateSchema,
  settlementUpdateSchema,
  vendorResponseSchema,
} from "@/lib/validation";
import type { z } from "zod";

export type SettlementCreateInput = z.infer<typeof settlementCreateSchema>;
export type SettlementUpdateInput = z.infer<typeof settlementUpdateSchema>;
export type SettlementApprovalInput = z.infer<typeof settlementApprovalSchema>;
export type VendorResponseInput = z.infer<typeof vendorResponseSchema>;

async function generateSettlementNumber(organizationId: string): Promise<string> {
  const db = await getDb();
  const year = new Date().getFullYear();
  const prefix = `STL-${year}-`;
  const rows = await db
    .select({ total: count() })
    .from(settlements)
    .where(
      and(
        eq(settlements.organizationId, organizationId),
        ilike(settlements.settlementNumber, `${prefix}%`),
      ),
    );
  const next = (rows[0]?.total ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function listSettlements(
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
  const clauses = [eq(settlements.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) clauses.push(eq(settlements.vendorId, vendorScope(ctx)));
  if (options.status && options.status !== "ALL") {
    const allowed = [
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "REJECTED",
      "SHARED",
      "VENDOR_ACCEPTED",
      "VENDOR_REJECTED",
      "CLARIFICATION_REQUESTED",
      "READY_FOR_PAYMENT",
      "PAYMENT_PROCESSING",
      "PAID",
      "PAYMENT_FAILED",
      "CANCELLED",
    ];
    if (allowed.includes(options.status)) {
      clauses.push(eq(settlements.status, options.status as "DRAFT"));
    }
  }
  if (options.search) {
    const term = `%${options.search.trim()}%`;
    clauses.push(
      or(
        ilike(settlements.settlementNumber, term),
        ilike(settlements.reason, term),
        ilike(vendors.name, term),
        ilike(invoices.invoiceNumber, term),
      )!,
    );
  }
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        settlement: settlements,
        vendorName: vendors.name,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(settlements)
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .innerJoin(invoices, eq(invoices.id, settlements.invoiceId))
      .where(where)
      .orderBy(desc(settlements.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(settlements)
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .innerJoin(invoices, eq(invoices.id, settlements.invoiceId))
      .where(where),
  ]);
  return { settlements: rows, total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getSettlement(
  ctx: AuthContext,
  settlementId: string,
): Promise<typeof settlements.$inferSelect> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(settlements)
    .where(
      and(
        eq(settlements.id, settlementId),
        eq(settlements.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Settlement");
  if (isVendor(ctx) && rows[0].vendorId !== ctx.membership.vendorId) {
    throw new NotFoundError("Settlement");
  }
  return rows[0];
}

export async function getSettlementDetail(ctx: AuthContext, settlementId: string) {
  const settlement = await getSettlement(ctx, settlementId);
  const db = await getDb();
  const [invoiceRows, vendorRows, runRows, approvals, paymentRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.id, settlement.invoiceId)).limit(1),
    db.select().from(vendors).where(eq(vendors.id, settlement.vendorId)).limit(1),
    settlement.runId
      ? db
          .select()
          .from(reconciliationRuns)
          .where(eq(reconciliationRuns.id, settlement.runId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        approval: settlementApprovals,
        approverName: sql<string>`coalesce((select name from users u where u.id = ${settlementApprovals.approverId}), 'Unknown user')`,
      })
      .from(settlementApprovals)
      .where(eq(settlementApprovals.settlementId, settlement.id))
      .orderBy(settlementApprovals.createdAt),
    db
      .select()
      .from(payments)
      .where(eq(payments.settlementId, settlement.id))
      .orderBy(desc(payments.createdAt)),
  ]);
  return {
    settlement,
    invoice: invoiceRows[0] ?? null,
    vendor: vendorRows[0] ?? null,
    run: runRows[0] ?? null,
    approvals,
    payments: paymentRows,
    paypal: {
      configured: Boolean(env.paypalClientId && env.paypalClientSecret),
      currencySupported: isPaypalSupportedCurrency(settlement.currency),
      environment: env.paypalEnv,
    },
  };
}

export async function createSettlement(
  ctx: AuthContext,
  input: SettlementCreateInput,
): Promise<typeof settlements.$inferSelect> {
  requirePermission(ctx, "create_settlement");
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot create settlements");
  const db = await getDb();
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, input.invoiceId),
        eq(invoices.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const invoice = invoiceRows[0];
  if (!invoice) throw new NotFoundError("Invoice");
  if (invoice.status !== "VERIFIED") {
    throw new ConflictError("Only a verified invoice can have a settlement proposal");
  }
  if (!invoice.vendorId) {
    throw new ValidationError("Assign a vendor to the invoice before creating a settlement");
  }

  let runId: string | null = null;
  if (input.runId) {
    const runRows = await db
      .select()
      .from(reconciliationRuns)
      .where(
        and(
          eq(reconciliationRuns.id, input.runId),
          eq(reconciliationRuns.organizationId, ctx.organization.id),
          eq(reconciliationRuns.invoiceId, invoice.id),
        ),
      )
      .limit(1);
    if (!runRows[0]) throw new NotFoundError("Reconciliation run");
    if (runRows[0].status !== "COMPLETED") {
      throw new ConflictError("The reconciliation run is not completed");
    }
    runId = runRows[0].id;
  }

  const proposed = parseMoneyInput(input.proposedAmount, "proposed amount");
  const disputed = parseMoneyInput(input.disputedAmount ?? "0", "disputed amount");
  if (proposed <= 0n) throw new ValidationError("Proposed amount must be greater than zero");
  if (proposed > invoice.totalMinor) {
    throw new ValidationError("Proposed settlement cannot exceed the original invoice amount");
  }
  if (disputed > invoice.totalMinor) {
    throw new ValidationError("Disputed amount cannot exceed the original invoice amount");
  }

  let created: typeof settlements.$inferSelect | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      const number = await generateSettlementNumber(ctx.organization.id);
      const rows = await db
        .insert(settlements)
        .values({
          organizationId: ctx.organization.id,
          vendorId: invoice.vendorId,
          invoiceId: invoice.id,
          runId,
          settlementNumber: number,
          originalAmountMinor: invoice.totalMinor,
          disputedAmountMinor: disputed,
          proposedAmountMinor: proposed,
          currency: input.currency ?? invoice.currency,
          reason: input.reason,
          status: "DRAFT",
          createdBy: ctx.user.id,
        })
        .returning();
      created = rows[0]!;
    } catch (error) {
      lastError = error;
      if (
        typeof error !== "object" ||
        error === null ||
        (error as { code?: string }).code !== "23505"
      ) {
        throw error;
      }
    }
  }
  if (!created) throw lastError instanceof Error ? lastError : new ConflictError("Could not allocate a settlement number");

  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "SETTLEMENT",
    entityId: created.id,
    eventType: "SETTLEMENT_CREATED",
    description: `Settlement ${created.settlementNumber} created as a draft for invoice ${invoice.invoiceNumber}.`,
    actor: actorFromContext(ctx),
    source: "settlement_workflow",
    metadata: {
      invoiceId: invoice.id,
      runId,
      proposedAmountMinor: proposed.toString(),
    },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "SETTLEMENT_CREATED",
    entityType: "settlement",
    entityId: created.id,
    description: `Created draft settlement ${created.settlementNumber}`,
    metadata: {
      invoiceId: invoice.id,
      originalAmountMinor: invoice.totalMinor.toString(),
      proposedAmountMinor: proposed.toString(),
      disputedAmountMinor: disputed.toString(),
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return created;
}

export async function updateSettlement(
  ctx: AuthContext,
  settlementId: string,
  input: SettlementUpdateInput,
): Promise<typeof settlements.$inferSelect> {
  requirePermission(ctx, "create_settlement");
  const settlement = await getSettlement(ctx, settlementId);
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot edit settlements");
  if (!["DRAFT", "REJECTED"].includes(settlement.status)) {
    throw new ConflictError("Only draft or rejected settlements can be edited");
  }
  const proposed = parseMoneyInput(input.proposedAmount, "proposed amount");
  const disputed = parseMoneyInput(input.disputedAmount ?? "0", "disputed amount");
  if (proposed <= 0n || proposed > settlement.originalAmountMinor) {
    throw new ValidationError("Proposed amount must be greater than zero and no more than the invoice amount");
  }
  if (disputed > settlement.originalAmountMinor) {
    throw new ValidationError("Disputed amount cannot exceed the invoice amount");
  }
  const db = await getDb();
  const rows = await db
    .update(settlements)
    .set({
      proposedAmountMinor: proposed,
      disputedAmountMinor: disputed,
      reason: input.reason,
      status: "DRAFT",
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id))
    .returning();
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "SETTLEMENT_UPDATED",
    entityType: "settlement",
    entityId: settlement.id,
    description: `Updated draft settlement ${settlement.settlementNumber}`,
    metadata: {
      previousProposedMinor: settlement.proposedAmountMinor.toString(),
      proposedAmountMinor: proposed.toString(),
      previousStatus: settlement.status,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return rows[0]!;
}

export async function submitSettlement(
  ctx: AuthContext,
  settlementId: string,
): Promise<void> {
  requirePermission(ctx, "create_settlement");
  const settlement = await getSettlement(ctx, settlementId);
  if (!["DRAFT", "REJECTED"].includes(settlement.status)) {
    throw new ConflictError("Only draft or rejected settlements can be submitted");
  }
  if (settlement.proposedAmountMinor <= 0n) {
    throw new ValidationError("Proposed amount must be greater than zero");
  }
  const db = await getDb();
  await db
    .update(settlements)
    .set({
      status: "PENDING_APPROVAL",
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id));
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
    eventType: "SETTLEMENT_SUBMITTED",
    description: `Settlement ${settlement.settlementNumber} submitted for internal approval.`,
    actor: actorFromContext(ctx),
    source: "settlement_workflow",
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "SETTLEMENT_SUBMITTED",
    entityType: "settlement",
    entityId: settlement.id,
    description: `Submitted settlement ${settlement.settlementNumber} for approval`,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  await notify({
    organizationId: ctx.organization.id,
    type: "APPROVAL",
    title: `Approval required: ${settlement.settlementNumber}`,
    body: `A settlement proposal for ${settlement.currency} ${(Number(settlement.proposedAmountMinor) / 100).toFixed(2)} is awaiting internal approval.`,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
  });
}

export async function approveSettlement(
  ctx: AuthContext,
  settlementId: string,
  input: SettlementApprovalInput,
): Promise<void> {
  requirePermission(ctx, "approve_settlement");
  const settlement = await getSettlement(ctx, settlementId);
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot approve settlements");
  if (settlement.status !== "PENDING_APPROVAL") {
    throw new ConflictError("Only a settlement pending approval can be decided");
  }
  if (settlement.createdBy === ctx.user.id && ctx.membership.role !== "ADMIN") {
    throw new ForbiddenError(
      "Segregation of duties: the creator cannot approve their own settlement",
    );
  }
  const authority = canApproveAmount(ctx, settlement.proposedAmountMinor);
  if (!authority.allowed) {
    throw new ForbiddenError(authority.reason ?? "Approval not permitted");
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(settlementApprovals).values({
      organizationId: ctx.organization.id,
      settlementId: settlement.id,
      approverId: ctx.user.id,
      approverRole: ctx.membership.role,
      decision: input.decision,
      comments: input.comments ?? null,
    });
    await tx
      .update(settlements)
      .set(
        input.decision === "APPROVED"
          ? {
              status: "APPROVED",
              approvedAt: new Date(),
              approvedBy: ctx.user.id,
              updatedAt: new Date(),
            }
          : {
              status: "REJECTED",
              approvedAt: null,
              approvedBy: null,
              vendorResponse: input.comments ?? null,
              updatedAt: new Date(),
            },
      )
      .where(eq(settlements.id, settlement.id));
  });
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
    eventType: input.decision === "APPROVED" ? "SETTLEMENT_APPROVED" : "SETTLEMENT_REJECTED",
    description:
      input.decision === "APPROVED"
        ? `Settlement ${settlement.settlementNumber} approved by ${ctx.user.name}${input.comments ? `: ${input.comments}` : ""}`
        : `Settlement ${settlement.settlementNumber} rejected by ${ctx.user.name}: ${input.comments}`,
    actor: actorFromContext(ctx),
    source: "approval_workflow",
    metadata: { decision: input.decision },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: input.decision === "APPROVED" ? "SETTLEMENT_APPROVED" : "SETTLEMENT_REJECTED",
    entityType: "settlement",
    entityId: settlement.id,
    description: `${input.decision === "APPROVED" ? "Approved" : "Rejected"} settlement ${settlement.settlementNumber}`,
    metadata: {
      proposedAmountMinor: settlement.proposedAmountMinor.toString(),
      comments: input.comments,
      approverRole: ctx.membership.role,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  await notify({
    organizationId: ctx.organization.id,
    type: input.decision === "APPROVED" ? "APPROVAL" : "ACTION_REQUIRED",
    title: `Settlement ${settlement.settlementNumber} ${input.decision.toLowerCase()}`,
    body:
      input.decision === "APPROVED"
        ? "The settlement is approved and can now be shared with the vendor."
        : `The settlement was rejected. ${input.comments ?? ""}`,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
  });
}

export async function shareSettlement(
  ctx: AuthContext,
  settlementId: string,
  expiryDays: number,
): Promise<{ token: string; url: string; expiresAt: Date }> {
  requirePermission(ctx, "share_settlement");
  const settlement = await getSettlement(ctx, settlementId);
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot share settlements");
  if (!["APPROVED", "SHARED", "CLARIFICATION_REQUESTED"].includes(settlement.status)) {
    throw new ConflictError("Only an approved or shared settlement can be sent to the vendor");
  }
  if (!settlement.approvedAt) {
    throw new ConflictError("Internal approval must be recorded before sharing");
  }
  const token = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  const db = await getDb();
  await db
    .update(settlements)
    .set({
      vendorTokenHash: sha256(token),
      vendorTokenExpiresAt: expiresAt,
      status:
        settlement.status === "APPROVED" || settlement.status === "SHARED"
          ? "SHARED"
          : settlement.status,
      sharedAt: settlement.sharedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id));
  const url = `${env.appUrl}/vendor/${encodeURIComponent(token)}`;
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
    eventType: "SETTLEMENT_SHARED",
    description: `Settlement ${settlement.settlementNumber} shared with the vendor through a secure expiring link.`,
    actor: actorFromContext(ctx),
    source: "settlement_workflow",
    metadata: { expiresAt: expiresAt.toISOString() },
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "SETTLEMENT_SHARED",
    entityType: "settlement",
    entityId: settlement.id,
    description: `Shared settlement ${settlement.settlementNumber} with the vendor`,
    metadata: { expiresAt: expiresAt.toISOString() },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { token, url, expiresAt };
}

async function applyVendorResponse(input: {
  organizationId: string;
  settlement: typeof settlements.$inferSelect;
  action: "ACCEPT" | "REJECT" | "CLARIFY";
  note?: string;
  actorLabel: string;
  actorId?: string;
}): Promise<void> {
  const { settlement, action } = input;
  if (!["SHARED", "CLARIFICATION_REQUESTED"].includes(settlement.status)) {
    throw new ConflictError("This settlement is not awaiting a vendor response");
  }
  const status =
    action === "ACCEPT"
      ? "VENDOR_ACCEPTED"
      : action === "REJECT"
        ? "VENDOR_REJECTED"
        : "CLARIFICATION_REQUESTED";
  const db = await getDb();
  await db
    .update(settlements)
    .set({
      status,
      vendorResponse: input.note ?? (action === "ACCEPT" ? "Accepted by vendor" : null),
      vendorRespondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id));
  const actor = {
    type: "VENDOR" as const,
    id: input.actorId ?? null,
    label: input.actorLabel,
  };
  await recordEvidenceEvent({
    organizationId: input.organizationId,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
    eventType: `VENDOR_${action}`,
    description:
      action === "ACCEPT"
        ? `Vendor accepted settlement ${settlement.settlementNumber}${input.note ? `: ${input.note}` : ""}`
        : action === "REJECT"
          ? `Vendor rejected settlement ${settlement.settlementNumber}: ${input.note}`
          : `Vendor requested clarification on settlement ${settlement.settlementNumber}: ${input.note}`,
    actor,
    source: "vendor_portal",
    metadata: { status },
  });
  await writeAudit({
    organizationId: input.organizationId,
    actor,
    action: `VENDOR_${action}`,
    entityType: "settlement",
    entityId: settlement.id,
    description: `Vendor response recorded: ${action}`,
    metadata: { status, hasNote: Boolean(input.note) },
  });
  await notify({
    organizationId: input.organizationId,
    type: "ACTION_REQUIRED",
    title:
      action === "ACCEPT"
        ? `Vendor accepted ${settlement.settlementNumber}`
        : action === "REJECT"
          ? `Vendor rejected ${settlement.settlementNumber}`
          : `Clarification requested on ${settlement.settlementNumber}`,
    body:
      input.note ??
      "Review the vendor response and continue the controlled settlement workflow.",
    entityType: "SETTLEMENT",
    entityId: settlement.id,
  });
}

export async function respondAsVendorUser(
  ctx: AuthContext,
  settlementId: string,
  input: VendorResponseInput,
): Promise<void> {
  if (!isVendor(ctx)) {
    throw new ForbiddenError("Only a vendor user can respond through this endpoint");
  }
  const settlement = await getSettlement(ctx, settlementId);
  if (settlement.vendorId !== ctx.membership.vendorId) {
    throw new NotFoundError("Settlement");
  }
  const action = input.action === "ACCEPT" ? "ACCEPT" : input.action === "REJECT" ? "REJECT" : "CLARIFY";
  await applyVendorResponse({
    organizationId: ctx.organization.id,
    settlement,
    action,
    note: input.note,
    actorLabel: `${ctx.user.name} <${ctx.user.email}> (vendor)`,
    actorId: ctx.user.id,
  });
}

export async function getVendorPortalData(token: string) {
  const db = await getDb();
  const rows = await db
    .select({
      settlement: settlements,
      vendorName: vendors.name,
      invoiceNumber: invoices.invoiceNumber,
      organizationName: sql<string>`(select name from organizations o where o.id = ${settlements.organizationId})`,
      organizationId: settlements.organizationId,
    })
    .from(settlements)
    .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
    .innerJoin(invoices, eq(invoices.id, settlements.invoiceId))
    .where(eq(settlements.vendorTokenHash, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.settlement.vendorTokenExpiresAt || row.settlement.vendorTokenExpiresAt.getTime() < Date.now()) {
    return { expired: true as const, row };
  }
  return { expired: false as const, row };
}

export async function respondToVendorToken(
  token: string,
  input: VendorResponseInput,
): Promise<void> {
  const portal = await getVendorPortalData(token);
  if (!portal) throw new NotFoundError("Settlement link");
  if (portal.expired) throw new ConflictError("This settlement link has expired");
  if (!["SHARED", "CLARIFICATION_REQUESTED"].includes(portal.row.settlement.status)) {
    throw new ConflictError("This settlement is no longer awaiting a vendor response");
  }
  const action = input.action === "ACCEPT" ? "ACCEPT" : input.action === "REJECT" ? "REJECT" : "CLARIFY";
  await applyVendorResponse({
    organizationId: portal.row.organizationId,
    settlement: portal.row.settlement,
    action,
    note: input.note,
    actorLabel: `${portal.row.vendorName} via secure link`,
  });
}

export async function markReadyForPayment(
  ctx: AuthContext,
  settlementId: string,
): Promise<void> {
  requirePermission(ctx, "initiate_payment");
  const settlement = await getSettlement(ctx, settlementId);
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot authorize payment");
  if (!["VENDOR_ACCEPTED", "PAYMENT_FAILED"].includes(settlement.status)) {
    throw new ConflictError(
      "The vendor must accept an approved settlement before payment can be retried",
    );
  }
  if (!settlement.approvedAt) {
    throw new ConflictError("Internal approval is missing");
  }
  const db = await getDb();
  const approvalRows = await db
    .select({ decision: settlementApprovals.decision })
    .from(settlementApprovals)
    .where(eq(settlementApprovals.settlementId, settlement.id));
  if (!approvalRows.some((row) => row.decision === "APPROVED")) {
    throw new ConflictError("A recorded internal approval is required");
  }
  if (approvalRows.some((row) => row.decision === "REJECTED")) {
    throw new ConflictError("A rejection is recorded for this settlement");
  }
  await db
    .update(settlements)
    .set({
      status: "READY_FOR_PAYMENT",
      readyForPaymentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id));
  await recordEvidenceEvent({
    organizationId: ctx.organization.id,
    entityType: "SETTLEMENT",
    entityId: settlement.id,
    eventType: "SETTLEMENT_READY_FOR_PAYMENT",
    description: `Settlement ${settlement.settlementNumber} marked ready for payment after internal approval and vendor acceptance. No funds have moved.`,
    actor: actorFromContext(ctx),
    source: "payment_workflow",
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "SETTLEMENT_READY_FOR_PAYMENT",
    entityType: "settlement",
    entityId: settlement.id,
    description: `Marked settlement ${settlement.settlementNumber} ready for payment`,
    metadata: { amountMinor: settlement.proposedAmountMinor.toString(), currency: settlement.currency },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function getSettlementStats(ctx: AuthContext) {
  const db = await getDb();
  const clauses = [eq(settlements.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) clauses.push(eq(settlements.vendorId, vendorScope(ctx)));
  const rows = await db
    .select({
      status: settlements.status,
      total: count(),
      amount: sql<string>`coalesce(sum(${settlements.proposedAmountMinor}), 0)::text`,
    })
    .from(settlements)
    .where(and(...clauses))
    .groupBy(settlements.status);
  return rows;
}

export async function listVendorSettlements(ctx: AuthContext) {
  if (!isVendor(ctx)) throw new ForbiddenError("Vendor access required");
  return listSettlements(ctx, { pageSize: 100 });
}

export async function listPendingApprovals(ctx: AuthContext) {
  const db = await getDb();
  return db
    .select({ settlement: settlements, vendorName: vendors.name })
    .from(settlements)
    .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
    .where(
      and(
        eq(settlements.organizationId, ctx.organization.id),
        eq(settlements.status, "PENDING_APPROVAL"),
      ),
    )
    .orderBy(desc(settlements.submittedAt));
}

export async function expireVendorToken(ctx: AuthContext, settlementId: string) {
  requirePermission(ctx, "share_settlement");
  const settlement = await getSettlement(ctx, settlementId);
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot manage links");
  const db = await getDb();
  await db
    .update(settlements)
    .set({
      vendorTokenHash: null,
      vendorTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id));
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "SETTLEMENT_LINK_REVOKED",
    entityType: "settlement",
    entityId: settlement.id,
    description: `Revoked vendor link for ${settlement.settlementNumber}`,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function clearVendorTokenIfUnused(settlementId: string) {
  const db = await getDb();
  await db
    .update(settlements)
    .set({ vendorTokenHash: null, vendorTokenExpiresAt: null })
    .where(and(eq(settlements.id, settlementId), isNull(settlements.vendorTokenHash)));
}
