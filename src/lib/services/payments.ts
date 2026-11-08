import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  invoices,
  paymentEvents,
  payments,
  settlements,
  vendors,
  webhookEvents,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { isVendor, requirePermission, vendorScope } from "@/lib/auth/rbac";
import { actorFromContext, recordEvidenceEvent, writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { parseMoneyInput, toMajorString } from "@/lib/money";
import { env, isPaypalSupportedCurrency, paypalConfigured } from "@/lib/env";
import {
  capturePaypalOrder,
  createPaypalOrder,
  getPaypalOrder,
  PaypalError,
  verifyPaypalWebhook,
  type PaypalOrder,
} from "@/lib/paypal/client";
import { getSettlement } from "./settlements";

type CaptureInfo = {
  captureId: string | null;
  captureStatus: string | null;
  orderStatus: string | null;
  amountMinor: bigint | null;
  currency: string | null;
  raw: Record<string, unknown>;
};

function captureInfoFromOrder(order: PaypalOrder): CaptureInfo {
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  const unit = units[0] as Record<string, unknown> | undefined;
  const paymentsBlock = unit?.payments as Record<string, unknown> | undefined;
  const captures = Array.isArray(paymentsBlock?.captures)
    ? (paymentsBlock!.captures as Record<string, unknown>[])
    : [];
  const capture = captures[0];
  const amount = capture?.amount as Record<string, unknown> | undefined;
  let amountMinor: bigint | null = null;
  if (typeof amount?.value === "string") {
    try {
      amountMinor = parseMoneyInput(amount.value, "PayPal amount");
    } catch {
      amountMinor = null;
    }
  }
  return {
    captureId: typeof capture?.id === "string" ? capture.id : null,
    captureStatus: typeof capture?.status === "string" ? capture.status : null,
    orderStatus: typeof order.status === "string" ? order.status : null,
    amountMinor,
    currency:
      typeof amount?.currency_code === "string"
        ? amount.currency_code.toUpperCase()
        : null,
    raw: {
      orderId: order.id,
      orderStatus: order.status,
      captureId: capture?.id ?? null,
      captureStatus: capture?.status ?? null,
      amount: amount?.value ?? null,
      currency: amount?.currency_code ?? null,
    },
  };
}

export async function listPayments(
  ctx: AuthContext,
  options: { page?: number; pageSize?: number } = {},
) {
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const clauses = [eq(payments.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) clauses.push(eq(settlements.vendorId, vendorScope(ctx)));
  const where = and(...clauses);
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        payment: payments,
        settlementNumber: settlements.settlementNumber,
        vendorName: vendors.name,
        settlementId: settlements.id,
      })
      .from(payments)
      .innerJoin(settlements, eq(settlements.id, payments.settlementId))
      .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(payments)
      .innerJoin(settlements, eq(settlements.id, payments.settlementId))
      .where(where),
  ]);
  return { payments: rows, total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getPaymentDetail(ctx: AuthContext, paymentId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      payment: payments,
      settlement: settlements,
      vendorName: vendors.name,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(payments)
    .innerJoin(settlements, eq(settlements.id, payments.settlementId))
    .innerJoin(vendors, eq(vendors.id, settlements.vendorId))
    .innerJoin(invoices, eq(invoices.id, settlements.invoiceId))
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Payment");
  if (isVendor(ctx) && row.settlement.vendorId !== ctx.membership.vendorId) {
    throw new NotFoundError("Payment");
  }
  const events = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.paymentId, row.payment.id))
    .orderBy(desc(paymentEvents.createdAt));
  return { ...row, events };
}

export async function createPaypalPayment(
  ctx: AuthContext,
  settlementId: string,
  providedIdempotencyKey?: string,
): Promise<{
  paymentId: string;
  approvalUrl: string | null;
  status: string;
  reused: boolean;
}> {
  requirePermission(ctx, "initiate_payment");
  const settlement = await getSettlement(ctx, settlementId);
  if (isVendor(ctx)) throw new ForbiddenError("Vendors cannot initiate payments");

  // Idempotency is checked before mutable settlement-state checks. A client
  // retrying the same key must receive the original payment even though the
  // first request already moved the settlement to PAYMENT_PROCESSING.
  const db = await getDb();
  const idempotencyKey =
    providedIdempotencyKey ?? `pay-${settlement.id}-${crypto.randomUUID()}`;
  const existing = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, ctx.organization.id),
        eq(payments.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing[0]) {
    if (existing[0].settlementId !== settlement.id) {
      throw new ConflictError("This idempotency key was used for a different settlement");
    }
    return {
      paymentId: existing[0].id,
      approvalUrl: existing[0].providerApprovalUrl,
      status: existing[0].status,
      reused: true,
    };
  }

  if (settlement.status !== "READY_FOR_PAYMENT") {
    throw new ConflictError(
      "Payment can only be initiated for a settlement marked ready for payment",
    );
  }
  if (!settlement.approvedAt) {
    throw new ConflictError("Internal approval is missing");
  }
  if (!isPaypalSupportedCurrency(settlement.currency)) {
    throw new ValidationError(
      `PayPal does not support payments in ${settlement.currency}. This settlement cannot be executed through PayPal; use a supported payment rail or a settlement denominated in a PayPal-supported currency.`,
    );
  }
  if (!paypalConfigured()) {
    throw new PaypalError(
      "PAYPAL_NOT_CONFIGURED",
      "PayPal sandbox credentials are not configured. Add PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID, then retry. No payment has been initiated.",
      503,
    );
  }

  const invoiceRows = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(eq(invoices.id, settlement.invoiceId))
    .limit(1);
  const invoiceNumber = invoiceRows[0]?.invoiceNumber ?? "Invoice";

  let payment: typeof payments.$inferSelect;
  try {
    const rows = await db
      .insert(payments)
      .values({
        organizationId: ctx.organization.id,
        settlementId: settlement.id,
        provider: "PAYPAL",
        amountMinor: settlement.proposedAmountMinor,
        currency: settlement.currency,
        status: "CREATED",
        idempotencyKey,
        initiatedBy: ctx.user.id,
        requestSnapshot: {
          amount: toMajorString(settlement.proposedAmountMinor),
          currency: settlement.currency,
          settlementNumber: settlement.settlementNumber,
          environment: env.paypalEnv,
        },
      })
      .returning();
    payment = rows[0]!;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "23505"
    ) {
      const rows = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.organizationId, ctx.organization.id),
            eq(payments.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (rows[0]) {
        return {
          paymentId: rows[0].id,
          approvalUrl: rows[0].providerApprovalUrl,
          status: rows[0].status,
          reused: true,
        };
      }
    }
    throw error;
  }

  try {
    const returnUrl = `${env.appUrl}/api/payments/paypal/return?paymentId=${encodeURIComponent(payment.id)}`;
    const cancelUrl = `${env.appUrl}/api/payments/paypal/cancel?paymentId=${encodeURIComponent(payment.id)}`;
    const order = await createPaypalOrder({
      amount: toMajorString(settlement.proposedAmountMinor),
      currency: settlement.currency,
      settlementNumber: settlement.settlementNumber,
      invoiceNumber,
      returnUrl,
      cancelUrl,
      idempotencyKey,
    });
    const approveLink = order.links?.find(
      (link) => link.rel === "approve" || link.rel === "payer-action",
    );
    if (!approveLink?.href) {
      throw new PaypalError(
        "PAYPAL_NO_APPROVAL_LINK",
        "PayPal created an order but returned no buyer approval URL",
      );
    }
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          providerOrderId: order.id,
          providerApprovalUrl: approveLink.href,
          status: "AWAITING_APPROVAL",
          responseSnapshot: {
            orderId: order.id,
            orderStatus: order.status,
            approvalLinkPresent: true,
            environment: env.paypalEnv,
          },
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      await tx
        .update(settlements)
        .set({ status: "PAYMENT_PROCESSING", updatedAt: new Date() })
        .where(eq(settlements.id, settlement.id));
    });
    await recordEvidenceEvent({
      organizationId: ctx.organization.id,
      entityType: "SETTLEMENT",
      entityId: settlement.id,
      eventType: "PAYMENT_INITIATED",
      description: `PayPal sandbox order ${order.id} created for settlement ${settlement.settlementNumber}. Funds have not moved; buyer approval and capture are required.`,
      actor: actorFromContext(ctx),
      source: "paypal",
      metadata: { paymentId: payment.id, providerOrderId: order.id },
    });
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "PAYMENT_INITIATED",
      entityType: "payment",
      entityId: payment.id,
      description: `Created PayPal order ${order.id} for settlement ${settlement.settlementNumber}`,
      metadata: {
        provider: "PAYPAL",
        amountMinor: settlement.proposedAmountMinor.toString(),
        currency: settlement.currency,
        environment: env.paypalEnv,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      paymentId: payment.id,
      approvalUrl: approveLink.href,
      status: "AWAITING_APPROVAL",
      reused: false,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message.slice(0, 1000) : "PayPal order creation failed";
    await db
      .update(payments)
      .set({
        status: "FAILED",
        failureReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
    await db.insert(paymentEvents).values({
      organizationId: ctx.organization.id,
      paymentId: payment.id,
      eventType: "PAYMENT_CREATION_FAILED",
      payload: { reason: reason.slice(0, 300) },
    });
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "PAYMENT_CREATION_FAILED",
      entityType: "payment",
      entityId: payment.id,
      description: "PayPal order creation failed; no funds moved",
      metadata: { reason: reason.slice(0, 300) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    throw error;
  }
}

async function finalizeSuccessfulCapture(input: {
  payment: typeof payments.$inferSelect;
  settlement: typeof settlements.$inferSelect;
  capture: CaptureInfo;
  providerEventId: string;
  actorType: "USER" | "WEBHOOK";
  actorLabel: string;
  actorId?: string | null;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "SUCCEEDED",
        providerCaptureId: input.capture.captureId,
        confirmedAt: new Date(),
        responseSnapshot: input.capture.raw,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, input.payment.id));
    await tx
      .update(settlements)
      .set({ status: "PAID", updatedAt: new Date() })
      .where(eq(settlements.id, input.settlement.id));
    await tx
      .insert(paymentEvents)
      .values({
        organizationId: input.payment.organizationId,
        paymentId: input.payment.id,
        eventType: "PAYMENT_CAPTURED",
        providerEventId: input.providerEventId,
        payload: input.capture.raw,
      })
      .onConflictDoNothing();
  });

  const actor = {
    type: input.actorType,
    id: input.actorId ?? null,
    label: input.actorLabel,
  };
  await recordEvidenceEvent({
    organizationId: input.payment.organizationId,
    entityType: "SETTLEMENT",
    entityId: input.settlement.id,
    eventType: "PAYMENT_CONFIRMED",
    description: `PayPal capture ${input.capture.captureId ?? "(unknown capture)"} completed for ${input.settlement.currency} ${toMajorString(input.payment.amountMinor)}. Settlement marked paid after provider confirmation.`,
    actor,
    source: "paypal",
    metadata: {
      paymentId: input.payment.id,
      providerOrderId: input.payment.providerOrderId,
      captureId: input.capture.captureId,
    },
  });
  await writeAudit({
    organizationId: input.payment.organizationId,
    actor,
    action: "PAYMENT_CONFIRMED",
    entityType: "payment",
    entityId: input.payment.id,
    description: `PayPal confirmed capture for settlement ${input.settlement.settlementNumber}`,
    metadata: {
      providerCaptureId: input.capture.captureId,
      amountMinor: input.payment.amountMinor.toString(),
      currency: input.payment.currency,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  });
  await notify({
    organizationId: input.payment.organizationId,
    type: "PAYMENT",
    title: `Payment confirmed: ${input.settlement.settlementNumber}`,
    body: `PayPal confirmed ${input.payment.currency} ${toMajorString(input.payment.amountMinor)}. This status was recorded from the authoritative provider response.`,
    entityType: "SETTLEMENT",
    entityId: input.settlement.id,
  });
}

function verifyCaptureMatches(
  payment: typeof payments.$inferSelect,
  capture: CaptureInfo,
): string | null {
  if (capture.orderStatus !== "COMPLETED" || capture.captureStatus !== "COMPLETED") {
    return "PayPal did not report a completed capture";
  }
  if (!capture.captureId) return "PayPal did not return a capture ID";
  if (!capture.amountMinor || capture.currency !== payment.currency) {
    return "PayPal capture currency or amount could not be verified";
  }
  if (capture.amountMinor !== payment.amountMinor) {
    return "PayPal capture amount did not match the authorized settlement amount";
  }
  return null;
}

export async function capturePaypalPayment(
  ctx: AuthContext,
  paymentId: string,
  orderIdFromReturn?: string,
): Promise<{ status: string; settlementId: string; captureId: string | null }> {
  requirePermission(ctx, "initiate_payment");
  const db = await getDb();
  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const payment = paymentRows[0];
  if (!payment) throw new NotFoundError("Payment");
  if (payment.status === "SUCCEEDED") {
    return {
      status: "SUCCEEDED",
      settlementId: payment.settlementId,
      captureId: payment.providerCaptureId,
    };
  }
  if (!payment.providerOrderId) {
    throw new ConflictError("This payment has no PayPal order to capture");
  }
  if (orderIdFromReturn && orderIdFromReturn !== payment.providerOrderId) {
    throw new ConflictError("PayPal returned an order that does not match this payment");
  }
  const settlement = await getSettlement(ctx, payment.settlementId);

  let order: PaypalOrder;
  try {
    order = await capturePaypalOrder(
      payment.providerOrderId,
      `capture-${payment.id}`,
    );
  } catch (error) {
    if (
      error instanceof PaypalError &&
      error.details &&
      typeof error.details === "object" &&
      (error.details as { issue?: string }).issue === "ORDER_ALREADY_CAPTURED"
    ) {
      order = await getPaypalOrder(payment.providerOrderId);
    } else {
      const reason =
        error instanceof Error ? error.message.slice(0, 1000) : "PayPal capture failed";
      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({ status: "FAILED", failureReason: reason, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
        await tx
          .update(settlements)
          .set({ status: "PAYMENT_FAILED", updatedAt: new Date() })
          .where(eq(settlements.id, settlement.id));
        await tx.insert(paymentEvents).values({
          organizationId: ctx.organization.id,
          paymentId: payment.id,
          eventType: "PAYMENT_CAPTURE_FAILED",
          payload: { reason: reason.slice(0, 300) },
        });
      });
      await writeAudit({
        organizationId: ctx.organization.id,
        actor: actorFromContext(ctx),
        action: "PAYMENT_CAPTURE_FAILED",
        entityType: "payment",
        entityId: payment.id,
        description: "PayPal capture failed; settlement not marked paid",
        metadata: { reason: reason.slice(0, 300) },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw error;
    }
  }

  const capture = captureInfoFromOrder(order);
  const verificationError = verifyCaptureMatches(payment, capture);
  if (verificationError) {
    await db
      .update(payments)
      .set({
        status: "FAILED",
        failureReason: verificationError,
        responseSnapshot: capture.raw,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
    await db
      .update(settlements)
      .set({ status: "PAYMENT_FAILED", updatedAt: new Date() })
      .where(eq(settlements.id, settlement.id));
    await writeAudit({
      organizationId: ctx.organization.id,
      actor: actorFromContext(ctx),
      action: "PAYMENT_VERIFICATION_FAILED",
      entityType: "payment",
      entityId: payment.id,
      description: verificationError,
      metadata: { ...capture.raw },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    throw new ValidationError(verificationError);
  }

  await finalizeSuccessfulCapture({
    payment,
    settlement,
    capture,
    providerEventId: `capture:${capture.captureId}`,
    actorType: "USER",
    actorLabel: `${ctx.user.name} <${ctx.user.email}> via PayPal return`,
    actorId: ctx.user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return {
    status: "SUCCEEDED",
    settlementId: settlement.id,
    captureId: capture.captureId,
  };
}

export async function cancelPaypalPayment(
  ctx: AuthContext,
  paymentId: string,
): Promise<void> {
  requirePermission(ctx, "initiate_payment");
  const db = await getDb();
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.id, paymentId),
        eq(payments.organizationId, ctx.organization.id),
      ),
    )
    .limit(1);
  const payment = rows[0];
  if (!payment) throw new NotFoundError("Payment");
  if (payment.status === "SUCCEEDED") {
    throw new ConflictError("A confirmed payment cannot be cancelled");
  }
  const settlement = await getSettlement(ctx, payment.settlementId);
  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ status: "CANCELLED", failureReason: "Cancelled by buyer", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await tx
      .update(settlements)
      .set({ status: "READY_FOR_PAYMENT", updatedAt: new Date() })
      .where(eq(settlements.id, settlement.id));
    await tx.insert(paymentEvents).values({
      organizationId: ctx.organization.id,
      paymentId: payment.id,
      eventType: "PAYMENT_CANCELLED",
      payload: { reason: "Buyer cancelled at PayPal" },
    });
  });
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "PAYMENT_CANCELLED",
    entityType: "payment",
    entityId: payment.id,
    description: "PayPal checkout cancelled by the buyer; no funds moved",
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export type PaypalWebhookResult = {
  status: "PROCESSED" | "IGNORED" | "REJECTED" | "DUPLICATE";
  message: string;
};

export async function handlePaypalWebhook(input: {
  rawBody: string;
  headers: Record<string, string | null>;
}): Promise<PaypalWebhookResult> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { status: "REJECTED", message: "Invalid JSON body" };
  }
  const eventId = typeof body.id === "string" ? body.id : "";
  const eventType = typeof body.event_type === "string" ? body.event_type : "";
  if (!eventId || !eventType) {
    return { status: "REJECTED", message: "Missing webhook event id or type" };
  }
  const db = await getDb();
  const existing = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "PAYPAL"),
        eq(webhookEvents.providerEventId, eventId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { status: "DUPLICATE", message: "Webhook event already received" };
  }

  const resource = (body.resource ?? {}) as Record<string, unknown>;
  const summaryPayload = {
    id: eventId,
    event_type: eventType,
    resource_type: body.resource_type ?? null,
    resource_id: resource.id ?? null,
    order_id: extractOrderIdFromResource(resource),
    amount: resource.amount ?? null,
  };

  let verified = false;
  let verifyError: string | null = null;
  try {
    verified = await verifyPaypalWebhook({ headers: input.headers, body });
  } catch (error) {
    verifyError = error instanceof Error ? error.message : "Signature verification failed";
  }

  if (!verified) {
    await db.insert(webhookEvents).values({
      provider: "PAYPAL",
      providerEventId: eventId,
      eventType,
      payload: summaryPayload,
      signatureVerified: false,
      processingStatus: "REJECTED",
      error: verifyError ?? "Signature verification returned FAILURE",
      processedAt: new Date(),
    });
    return {
      status: "REJECTED",
      message: verifyError ?? "Webhook signature verification failed",
    };
  }

  const insertedRows = await db
    .insert(webhookEvents)
    .values({
      provider: "PAYPAL",
      providerEventId: eventId,
      eventType,
      payload: summaryPayload,
      signatureVerified: true,
      processingStatus: "RECEIVED",
    })
    .returning();
  const webhookRow = insertedRows[0]!;

  try {
    const result = await processPaypalEvent(eventType, resource, eventId);
    await db
      .update(webhookEvents)
      .set({
        processingStatus: result.status === "PROCESSED" ? "PROCESSED" : result.status === "IGNORED" ? "IGNORED" : "FAILED",
        processedAt: new Date(),
        error: result.status === "PROCESSED" || result.status === "IGNORED" ? null : result.message,
      })
      .where(eq(webhookEvents.id, webhookRow.id));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    await db
      .update(webhookEvents)
      .set({ processingStatus: "FAILED", processedAt: new Date(), error: message.slice(0, 1000) })
      .where(eq(webhookEvents.id, webhookRow.id));
    throw error;
  }
}

function extractOrderIdFromResource(resource: Record<string, unknown>): string | null {
  const supplementary = resource.supplementary_data as Record<string, unknown> | undefined;
  const related = supplementary?.related_ids as Record<string, unknown> | undefined;
  if (typeof related?.order_id === "string") return related.order_id;
  return null;
}

async function processPaypalEvent(
  eventType: string,
  resource: Record<string, unknown>,
  providerEventId: string,
): Promise<PaypalWebhookResult> {
  if (
    ![
      "PAYMENT.CAPTURE.COMPLETED",
      "PAYMENT.CAPTURE.DENIED",
      "PAYMENT.CAPTURE.REFUNDED",
    ].includes(eventType)
  ) {
    return { status: "IGNORED", message: `Event type ${eventType} is not handled` };
  }
  const orderId = extractOrderIdFromResource(resource);
  if (!orderId) {
    return { status: "IGNORED", message: "No matching order ID on the capture resource" };
  }
  const db = await getDb();
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.providerOrderId, orderId))
    .limit(1);
  const payment = paymentRows[0];
  if (!payment) {
    return { status: "IGNORED", message: "No local payment matches this PayPal order" };
  }
  const settlementRows = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, payment.settlementId))
    .limit(1);
  const settlement = settlementRows[0];
  if (!settlement) return { status: "IGNORED", message: "Settlement not found" };

  const amount = resource.amount as Record<string, unknown> | undefined;
  let amountMinor: bigint | null = null;
  if (typeof amount?.value === "string") {
    try {
      amountMinor = parseMoneyInput(amount.value, "PayPal amount");
    } catch {
      amountMinor = null;
    }
  }
  const currency =
    typeof amount?.currency_code === "string"
      ? amount.currency_code.toUpperCase()
      : null;
  const capture: CaptureInfo = {
    captureId: typeof resource.id === "string" ? resource.id : null,
    captureStatus: typeof resource.status === "string" ? resource.status : null,
    orderStatus: "COMPLETED",
    amountMinor,
    currency,
    raw: {
      orderId,
      captureId: resource.id ?? null,
      captureStatus: resource.status ?? null,
      amount: amount?.value ?? null,
      currency: amount?.currency_code ?? null,
      eventType,
    },
  };

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    if (payment.status === "SUCCEEDED") {
      return { status: "PROCESSED", message: "Payment was already confirmed" };
    }
    const verificationError = verifyCaptureMatches(payment, capture);
    if (verificationError) {
      await db
        .update(payments)
        .set({
          status: "FAILED",
          failureReason: `Webhook verification failed: ${verificationError}`,
          responseSnapshot: capture.raw,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
      await db
        .update(settlements)
        .set({ status: "PAYMENT_FAILED", updatedAt: new Date() })
        .where(eq(settlements.id, settlement.id));
      return { status: "IGNORED", message: verificationError };
    }
    await finalizeSuccessfulCapture({
      payment,
      settlement,
      capture,
      providerEventId: `capture:${capture.captureId ?? providerEventId}`,
      actorType: "WEBHOOK",
      actorLabel: "PayPal verified webhook",
    });
    return { status: "PROCESSED", message: "Payment confirmed from verified webhook" };
  }

  if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "PAYMENT.CAPTURE.REFUNDED") {
    const status = eventType.endsWith("REFUNDED") ? "REFUNDED" : "FAILED";
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status, failureReason: `PayPal event ${eventType}`, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      await tx
        .update(settlements)
        .set({ status: status === "REFUNDED" ? "PAID" : "PAYMENT_FAILED", updatedAt: new Date() })
        .where(eq(settlements.id, settlement.id));
      await tx
        .insert(paymentEvents)
        .values({
          organizationId: payment.organizationId,
          paymentId: payment.id,
          eventType,
          providerEventId,
          payload: capture.raw,
        })
        .onConflictDoNothing();
    });
    await writeAudit({
      organizationId: payment.organizationId,
      actor: { type: "WEBHOOK", id: null, label: "PayPal verified webhook" },
      action: eventType,
      entityType: "payment",
      entityId: payment.id,
      description: `PayPal reported ${eventType}`,
      metadata: { captureId: capture.captureId, amountMinor: payment.amountMinor.toString() },
    });
    return { status: "PROCESSED", message: `Recorded ${eventType}` };
  }

  return { status: "IGNORED", message: "Unhandled capture event" };
}

export async function getPaymentStats(ctx: AuthContext) {
  const db = await getDb();
  const clauses = [eq(payments.organizationId, ctx.organization.id)];
  if (isVendor(ctx)) clauses.push(eq(settlements.vendorId, vendorScope(ctx)));
  const rows = await db
    .select({
      status: payments.status,
      count: count(),
      amount: sql<string>`coalesce(sum(${payments.amountMinor}), 0)::text`,
    })
    .from(payments)
    .innerJoin(settlements, eq(settlements.id, payments.settlementId))
    .where(and(...clauses))
    .groupBy(payments.status);
  return rows;
}

export async function listRecentWebhooks(ctx: AuthContext) {
  requirePermission(ctx, "manage_integrations");
  const db = await getDb();
  return db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(20);
}
