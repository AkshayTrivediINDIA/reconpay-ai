import { z } from "zod";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const uuidSchema = z
  .string()
  .trim()
  .regex(uuidRegex, "Must be a valid UUID");

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD");

const nullableIsoDate = isoDate.nullable().optional();
const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value));

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number with up to 2 decimals")
  .max(30);

const quantityString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be positive with up to 3 decimals")
  .max(30);

const taxRateString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, "Tax rate must be between 0 and 100")
  .max(10)
  .default("0");

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(320),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200)
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number"),
  organizationName: z.string().trim().min(2).max(160),
});

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(320),
  password: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(320),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10)
    .max(200)
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number"),
});

export const switchOrgSchema = z.object({ organizationId: uuidSchema });

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,40}$/, "Code must use letters, numbers and hyphens"),
  email: nullableTrimmed(320),
  phone: nullableTrimmed(40),
  taxId: nullableTrimmed(80),
  address: nullableTrimmed(1000),
  currency,
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_HOLD"]).default("ACTIVE"),
  notes: nullableTrimmed(2000),
});

export const vendorUpdateSchema = vendorCreateSchema.partial();

export const lineItemInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  sku: nullableTrimmed(80),
  quantity: quantityString,
  unitPrice: moneyString,
  taxRatePercent: taxRateString,
});

export const invoiceUpdateSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(80),
  vendorId: uuidSchema.nullable().optional(),
  vendorNameRaw: nullableTrimmed(200),
  issueDate: nullableIsoDate,
  dueDate: nullableIsoDate,
  currency,
  poReference: nullableTrimmed(80),
  subtotal: moneyString,
  tax: moneyString,
  discount: moneyString.default("0"),
  shipping: moneyString.default("0"),
  total: moneyString,
  lineItems: z.array(lineItemInputSchema).max(200),
  verify: z.boolean().optional().default(false),
});

export const poCreateSchema = z.object({
  poNumber: z.string().trim().min(1).max(80),
  vendorId: uuidSchema,
  orderDate: isoDate,
  expectedDeliveryDate: nullableIsoDate,
  currency,
  notes: nullableTrimmed(2000),
  status: z.enum(["DRAFT", "OPEN"]).default("OPEN"),
  lineItems: z.array(lineItemInputSchema).min(1).max(200),
});

export const poUpdateSchema = z.object({
  expectedDeliveryDate: nullableIsoDate,
  notes: nullableTrimmed(2000),
  status: z.enum(["DRAFT", "OPEN", "CLOSED", "CANCELLED"]).optional(),
});

export const grCreateSchema = z.object({
  purchaseOrderId: uuidSchema,
  receiptNumber: z.string().trim().min(1).max(80),
  receivedDate: isoDate,
  notes: nullableTrimmed(2000),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: uuidSchema,
        quantityReceived: quantityString,
        quantityDamaged: z
          .string()
          .trim()
          .regex(/^\d+(\.\d{1,3})?$/, "Damaged quantity must be positive")
          .max(30)
          .default("0"),
      }),
    )
    .min(1)
    .max(200),
});

export const grUpdateSchema = z.object({
  notes: nullableTrimmed(2000),
  status: z.enum(["DRAFT", "RECEIVED", "INSPECTED", "CANCELLED"]).optional(),
});

export const reconcileSchema = z.object({
  purchaseOrderId: uuidSchema,
  goodsReceiptIds: z.array(uuidSchema).max(100).default([]),
});

export const discrepancyUpdateSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISPUTED", "WAIVED"]),
  note: z.string().trim().max(2000).optional(),
}).refine(
  (value) => value.status === "ACKNOWLEDGED" || (value.note?.trim().length ?? 0) >= 5,
  { message: "A note of at least 5 characters is required for this status", path: ["note"] },
);

export const settlementCreateSchema = z.object({
  invoiceId: uuidSchema,
  runId: uuidSchema.nullable().optional(),
  proposedAmount: moneyString,
  disputedAmount: moneyString.default("0"),
  reason: z.string().trim().min(10).max(2000),
  currency: currency.optional(),
});

export const settlementUpdateSchema = z.object({
  proposedAmount: moneyString,
  disputedAmount: moneyString.default("0"),
  reason: z.string().trim().min(10).max(2000),
});

export const settlementApprovalSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().trim().max(2000).optional(),
}).refine(
  (value) => value.decision === "APPROVED" || (value.comments?.trim().length ?? 0) >= 5,
  { message: "A rejection reason of at least 5 characters is required", path: ["comments"] },
);

export const shareSettlementSchema = z.object({
  expiryDays: z.coerce.number().int().min(1).max(30).default(14),
});

export const vendorResponseSchema = z
  .object({
    action: z.enum(["ACCEPT", "REJECT", "CLARIFY"]),
    note: z.string().trim().max(2000).optional(),
  })
  .refine(
    (value) => value.action === "ACCEPT" || (value.note?.trim().length ?? 0) >= 5,
    { message: "Please explain your response (at least 5 characters)", path: ["note"] },
  );

export const paymentCreateSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(120).optional(),
});

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  baseCurrency: currency,
});

export const teamInviteSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).max(320),
    role: z.enum(["ADMIN", "FINANCE_MANAGER", "VENDOR"]),
    approvalLimit: moneyString.optional(),
    vendorId: uuidSchema.nullable().optional(),
  })
  .refine(
    (value) => value.role !== "VENDOR" || Boolean(value.vendorId),
    { message: "A vendor membership must be linked to a vendor", path: ["vendorId"] },
  );

export const teamUpdateSchema = z.object({
  role: z.enum(["ADMIN", "FINANCE_MANAGER", "VENDOR"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  approvalLimit: moneyString.nullable().optional(),
  vendorId: uuidSchema.nullable().optional(),
});

export const notificationReadSchema = z.object({
  id: uuidSchema.optional(),
  all: z.boolean().optional(),
});

export const documentUploadSchema = z.object({
  entityType: z.enum(["INVOICE", "PURCHASE_ORDER", "GOODS_RECEIPT", "SETTLEMENT"]),
  entityId: uuidSchema,
  documentType: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z_]{2,40}$/),
  title: z.string().trim().max(200).optional(),
});

export type LineItemInput = z.infer<typeof lineItemInputSchema>;
