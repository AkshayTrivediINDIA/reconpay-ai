import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------------------
 * Enum vocabulary
 * ------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "FINANCE_MANAGER",
  "VENDOR",
]);

export const memberStatusEnum = pgEnum("member_status", [
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
]);

export const vendorStatusEnum = pgEnum("vendor_status", [
  "ACTIVE",
  "INACTIVE",
  "ON_HOLD",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "UPLOADED",
  "PROCESSING",
  "NEEDS_REVIEW",
  "EXTRACTED",
  "VERIFIED",
  "FAILED",
]);

export const poStatusEnum = pgEnum("po_status", [
  "DRAFT",
  "OPEN",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
]);

export const grStatusEnum = pgEnum("gr_status", [
  "DRAFT",
  "RECEIVED",
  "INSPECTED",
  "CANCELLED",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export const discrepancySeverityEnum = pgEnum("discrepancy_severity", [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const discrepancyStatusEnum = pgEnum("discrepancy_status", [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
  "DISPUTED",
  "WAIVED",
]);

export const settlementStatusEnum = pgEnum("settlement_status", [
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
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
  "APPROVED",
  "REJECTED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "CREATED",
  "AWAITING_APPROVAL",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "PAYPAL",
  "OPENAI",
  "SUPABASE",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "NOT_CONFIGURED",
  "CONFIGURED",
  "CONNECTED",
  "ERROR",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "INFO",
  "ACTION_REQUIRED",
  "APPROVAL",
  "PAYMENT",
  "DISCREPANCY",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "USER",
  "SYSTEM",
  "VENDOR",
  "WEBHOOK",
]);

export const extractionEngineEnum = pgEnum("extraction_engine", [
  "OPENAI",
  "LOCAL_HEURISTIC",
  "MANUAL",
  "SEED",
]);

export const evidenceGeneratorEnum = pgEnum("evidence_generator", [
  "OPENAI",
  "RULES",
]);

export const webhookStatusEnum = pgEnum("webhook_status", [
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED",
  "REJECTED",
]);

/* ---------------------------------------------------------------------------
 * Tenancy and identity
 * ------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("INR"),
    country: varchar("country", { length: 2 }).notNull().default("IN"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    taxId: varchar("tax_id", { length: 80 }),
    address: text("address"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    status: vendorStatusEnum("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vendors_org_code_uq").on(t.organizationId, t.code),
    index("vendors_org_name_idx").on(t.organizationId, t.name),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    status: memberStatusEnum("status").notNull().default("ACTIVE"),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Internal approval ceiling in minor units. NULL = unlimited. */
    approvalLimitMinor: bigint("approval_limit_minor", { mode: "bigint" }),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_members_org_user_uq").on(t.organizationId, t.userId),
    index("org_members_user_idx").on(t.userId),
    index("org_members_org_role_idx").on(t.organizationId, t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: uuid("active_organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expiry_idx").on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_token_uq").on(t.tokenHash),
    index("password_reset_user_idx").on(t.userId),
  ],
);

/* ---------------------------------------------------------------------------
 * Evidence documents (referenced by invoices as source documents)
 * ------------------------------------------------------------------------- */

export const evidenceDocuments = pgTable(
  "evidence_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 40 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageProvider: varchar("storage_provider", { length: 20 }).notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("evidence_documents_org_entity_idx").on(
      t.organizationId,
      t.entityType,
      t.entityId,
    ),
    index("evidence_documents_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

/* ---------------------------------------------------------------------------
 * Procurement documents
 * ------------------------------------------------------------------------- */

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    poNumber: varchar("po_number", { length: 80 }).notNull(),
    orderDate: date("order_date", { mode: "string" }).notNull(),
    expectedDeliveryDate: date("expected_delivery_date", { mode: "string" }),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull().default(sql`0`),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    status: poStatusEnum("status").notNull().default("OPEN"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_orders_org_number_uq").on(t.organizationId, t.poNumber),
    index("purchase_orders_org_vendor_idx").on(t.organizationId, t.vendorId),
    check("po_subtotal_non_negative", sql`${t.subtotalMinor} >= 0`),
    check("po_total_non_negative", sql`${t.totalMinor} >= 0`),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    sku: varchar("sku", { length: 80 }),
    /** Quantity × 1000, exact integer representation. */
    quantityMilli: bigint("quantity_milli", { mode: "bigint" }).notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    lineTotalMinor: bigint("line_total_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("po_items_po_line_uq").on(t.purchaseOrderId, t.lineNumber),
    index("po_items_org_idx").on(t.organizationId),
    check("po_item_qty_positive", sql`${t.quantityMilli} > 0`),
    check("po_item_price_non_negative", sql`${t.unitPriceMinor} >= 0`),
  ],
);

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "restrict" }),
    receiptNumber: varchar("receipt_number", { length: 80 }).notNull(),
    receivedDate: date("received_date", { mode: "string" }).notNull(),
    status: grStatusEnum("status").notNull().default("RECEIVED"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goods_receipts_org_number_uq").on(t.organizationId, t.receiptNumber),
    index("goods_receipts_org_po_idx").on(t.organizationId, t.purchaseOrderId),
  ],
);

export const goodsReceiptItems = pgTable(
  "goods_receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    goodsReceiptId: uuid("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    purchaseOrderItemId: uuid("purchase_order_item_id")
      .notNull()
      .references(() => purchaseOrderItems.id, { onDelete: "restrict" }),
    quantityReceivedMilli: bigint("quantity_received_milli", {
      mode: "bigint",
    }).notNull(),
    quantityDamagedMilli: bigint("quantity_damaged_milli", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gr_items_receipt_poitem_uq").on(
      t.goodsReceiptId,
      t.purchaseOrderItemId,
    ),
    index("gr_items_org_idx").on(t.organizationId),
    check("gr_received_non_negative", sql`${t.quantityReceivedMilli} >= 0`),
    check("gr_damaged_non_negative", sql`${t.quantityDamagedMilli} >= 0`),
    check(
      "gr_damaged_lte_received",
      sql`${t.quantityDamagedMilli} <= ${t.quantityReceivedMilli}`,
    ),
  ],
);

/* ---------------------------------------------------------------------------
 * Invoices
 * ------------------------------------------------------------------------- */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "restrict",
    }),
    invoiceNumber: varchar("invoice_number", { length: 80 }).notNull(),
    vendorNameRaw: varchar("vendor_name_raw", { length: 200 }),
    status: invoiceStatusEnum("status").notNull().default("UPLOADED"),
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }).notNull().default(sql`0`),
    taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull().default(sql`0`),
    discountMinor: bigint("discount_minor", { mode: "bigint" }).notNull().default(sql`0`),
    shippingMinor: bigint("shipping_minor", { mode: "bigint" }).notNull().default(sql`0`),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull().default(sql`0`),
    poReference: varchar("po_reference", { length: 80 }),
    sourceDocumentId: uuid("source_document_id").references(
      () => evidenceDocuments.id,
      { onDelete: "set null" },
    ),
    extractionEngine: extractionEngineEnum("extraction_engine")
      .notNull()
      .default("MANUAL"),
    extractionConfidence: integer("extraction_confidence"),
    extractionRaw: jsonb("extraction_raw").$type<Record<string, unknown>>(),
    needsReview: boolean("needs_review").notNull().default(true),
    processingError: text("processing_error"),
    duplicateOfInvoiceId: uuid("duplicate_of_invoice_id").references(
      (): AnyPgColumn => invoices.id,
      { onDelete: "set null" },
    ),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_org_status_idx").on(t.organizationId, t.status),
    index("invoices_org_vendor_number_idx").on(
      t.organizationId,
      t.vendorId,
      t.invoiceNumber,
    ),
    index("invoices_org_created_idx").on(t.organizationId, t.createdAt),
    check("invoice_total_non_negative", sql`${t.totalMinor} >= 0`),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    sku: varchar("sku", { length: 80 }),
    quantityMilli: bigint("quantity_milli", { mode: "bigint" }).notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    lineTotalMinor: bigint("line_total_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoice_items_invoice_line_uq").on(t.invoiceId, t.lineNumber),
    index("invoice_items_org_idx").on(t.organizationId),
    check("invoice_item_qty_positive", sql`${t.quantityMilli} > 0`),
    check("invoice_item_price_non_negative", sql`${t.unitPriceMinor} >= 0`),
  ],
);

/* ---------------------------------------------------------------------------
 * Reconciliation and discrepancies
 * ------------------------------------------------------------------------- */

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "restrict" }),
    goodsReceiptIds: jsonb("goods_receipt_ids").$type<string[]>().notNull().default([]),
    status: reconciliationStatusEnum("status").notNull().default("QUEUED"),
    engineVersion: varchar("engine_version", { length: 20 }).notNull(),
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<string, unknown>>(),
    orderedQtyMilli: bigint("ordered_qty_milli", { mode: "bigint" }).notNull().default(sql`0`),
    receivedQtyMilli: bigint("received_qty_milli", { mode: "bigint" }).notNull().default(sql`0`),
    usableQtyMilli: bigint("usable_qty_milli", { mode: "bigint" }).notNull().default(sql`0`),
    shortQtyMilli: bigint("short_qty_milli", { mode: "bigint" }).notNull().default(sql`0`),
    invoiceTotalMinor: bigint("invoice_total_minor", { mode: "bigint" }).notNull().default(sql`0`),
    potentialQuantityExposureMinor: bigint("potential_quantity_exposure_minor", {
      mode: "bigint",
    })
      .notNull()
      .default(sql`0`),
    potentialImpactMinor: bigint("potential_impact_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    discrepancyCount: integer("discrepancy_count").notNull().default(0),
    aiSummary: text("ai_summary"),
    aiModel: varchar("ai_model", { length: 80 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recon_runs_org_created_idx").on(t.organizationId, t.createdAt),
    index("recon_runs_org_invoice_idx").on(t.organizationId, t.invoiceId),
    index("recon_runs_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const discrepancies = pgTable(
  "discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => reconciliationRuns.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    ruleCode: varchar("rule_code", { length: 60 }).notNull(),
    severity: discrepancySeverityEnum("severity").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    calculation: text("calculation").notNull(),
    expectedValue: varchar("expected_value", { length: 120 }),
    actualValue: varchar("actual_value", { length: 120 }),
    impactMinor: bigint("impact_minor", { mode: "bigint" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: discrepancyStatusEnum("status").notNull().default("OPEN"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    sourceRefs: jsonb("source_refs").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discrepancies_org_status_idx").on(t.organizationId, t.status),
    index("discrepancies_run_idx").on(t.runId),
    index("discrepancies_invoice_idx").on(t.invoiceId),
  ],
);

/* ---------------------------------------------------------------------------
 * Evidence timeline and generated reports
 * ------------------------------------------------------------------------- */

export const evidenceEvents = pgTable(
  "evidence_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    description: text("description").notNull(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    actorLabel: varchar("actor_label", { length: 160 }).notNull(),
    source: varchar("source", { length: 60 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("evidence_events_org_entity_idx").on(
      t.organizationId,
      t.entityType,
      t.entityId,
    ),
    index("evidence_events_org_time_idx").on(t.organizationId, t.occurredAt),
  ],
);

export const evidenceReports = pgTable(
  "evidence_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => reconciliationRuns.id, { onDelete: "cascade" }),
    discrepancySummary: text("discrepancy_summary").notNull(),
    evidenceSummary: text("evidence_summary").notNull(),
    timelineSummary: text("timeline_summary").notNull(),
    nextActions: jsonb("next_actions").$type<string[]>().notNull().default([]),
    missingEvidence: jsonb("missing_evidence").$type<string[]>().notNull().default([]),
    generatedBy: evidenceGeneratorEnum("generated_by").notNull(),
    model: varchar("model", { length: 80 }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evidence_reports_run_idx").on(t.runId)],
);

/* ---------------------------------------------------------------------------
 * Settlements, approvals, payments
 * ------------------------------------------------------------------------- */

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    runId: uuid("run_id").references(() => reconciliationRuns.id, {
      onDelete: "set null",
    }),
    settlementNumber: varchar("settlement_number", { length: 80 }).notNull(),
    originalAmountMinor: bigint("original_amount_minor", { mode: "bigint" }).notNull(),
    disputedAmountMinor: bigint("disputed_amount_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    proposedAmountMinor: bigint("proposed_amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    reason: text("reason").notNull(),
    status: settlementStatusEnum("status").notNull().default("DRAFT"),
    vendorResponse: text("vendor_response"),
    vendorRespondedAt: timestamp("vendor_responded_at", { withTimezone: true }),
    vendorTokenHash: varchar("vendor_token_hash", { length: 64 }),
    vendorTokenExpiresAt: timestamp("vendor_token_expires_at", { withTimezone: true }),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    readyForPaymentAt: timestamp("ready_for_payment_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("settlements_org_number_uq").on(t.organizationId, t.settlementNumber),
    uniqueIndex("settlements_vendor_token_uq").on(t.vendorTokenHash),
    index("settlements_org_status_idx").on(t.organizationId, t.status),
    index("settlements_org_vendor_idx").on(t.organizationId, t.vendorId),
    check("settlement_proposed_non_negative", sql`${t.proposedAmountMinor} >= 0`),
  ],
);

export const settlementApprovals = pgTable(
  "settlement_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    approverId: uuid("approver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approverRole: userRoleEnum("approver_role").notNull(),
    decision: approvalDecisionEnum("decision").notNull(),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("settlement_approvals_settlement_idx").on(t.settlementId),
    index("settlement_approvals_org_idx").on(t.organizationId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 30 }).notNull().default("PAYPAL"),
    providerOrderId: varchar("provider_order_id", { length: 120 }),
    providerCaptureId: varchar("provider_capture_id", { length: 120 }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: paymentStatusEnum("status").notNull().default("CREATED"),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    providerApprovalUrl: text("provider_approval_url"),
    failureReason: text("failure_reason"),
    requestSnapshot: jsonb("request_snapshot").$type<Record<string, unknown>>(),
    responseSnapshot: jsonb("response_snapshot").$type<Record<string, unknown>>(),
    initiatedBy: uuid("initiated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_org_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    index("payments_org_status_idx").on(t.organizationId, t.status),
    index("payments_provider_order_idx").on(t.providerOrderId),
    index("payments_settlement_idx").on(t.settlementId),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 120 }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_events_payment_idx").on(t.paymentId),
    uniqueIndex("payment_events_provider_event_uq").on(t.providerEventId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 30 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 120 }).notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    processingStatus: webhookStatusEnum("processing_status")
      .notNull()
      .default("RECEIVED"),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_uq").on(
      t.provider,
      t.providerEventId,
    ),
    index("webhook_events_received_idx").on(t.receivedAt),
  ],
);

/* ---------------------------------------------------------------------------
 * Integrations, notifications, audit, AI usage, idempotency
 * ------------------------------------------------------------------------- */

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    status: integrationStatusEnum("status").notNull().default("NOT_CONFIGURED"),
    environment: varchar("environment", { length: 20 }).notNull().default("sandbox"),
    displayName: varchar("display_name", { length: 160 }),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("integration_org_provider_uq").on(t.organizationId, t.provider),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull().default("INFO"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_org_user_idx").on(t.organizationId, t.userId, t.createdAt),
    index("notifications_org_unread_idx").on(t.organizationId, t.readAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    actorLabel: varchar("actor_label", { length: 160 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }),
    entityId: uuid("entity_id"),
    description: text("description").notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_logs_org_action_idx").on(t.organizationId, t.action),
    index("audit_logs_org_entity_idx").on(t.organizationId, t.entityType, t.entityId),
  ],
);

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    feature: varchar("feature", { length: 60 }).notNull(),
    provider: varchar("provider", { length: 40 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    estimatedCostMicros: bigint("estimated_cost_micros", { mode: "bigint" }),
    latencyMs: integer("latency_ms"),
    status: varchar("status", { length: 20 }).notNull(),
    errorCode: varchar("error_code", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_org_created_idx").on(t.organizationId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 120 }).notNull(),
    endpoint: varchar("endpoint", { length: 120 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("idempotency_org_key_endpoint_uq").on(
      t.organizationId,
      t.key,
      t.endpoint,
    ),
    index("idempotency_expiry_idx").on(t.expiresAt),
  ],
);

/* ---------------------------------------------------------------------------
 * Inferred types
 * ------------------------------------------------------------------------- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type GoodsReceiptItem = typeof goodsReceiptItems.$inferSelect;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type Discrepancy = typeof discrepancies.$inferSelect;
export type EvidenceDocument = typeof evidenceDocuments.$inferSelect;
export type EvidenceEvent = typeof evidenceEvents.$inferSelect;
export type EvidenceReport = typeof evidenceReports.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type SettlementApproval = typeof settlementApprovals.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
