import { describe, expect, it } from "vitest";
import {
  reconcile,
  type EngineInput,
  type EngineInvoice,
  type EnginePurchaseOrder,
  type EngineReceipt,
} from "@/lib/reconciliation/engine";

function baseInput(overrides?: {
  invoiceQuantity?: bigint;
  invoiceUnitPrice?: bigint;
  poQuantity?: bigint;
  poUnitPrice?: bigint;
  received?: bigint;
  damaged?: bigint;
  withReceipt?: boolean;
}): EngineInput {
  const poQuantity = overrides?.poQuantity ?? 100_000n;
  const poUnitPrice = overrides?.poUnitPrice ?? 500_000n;
  const invoiceQuantity = overrides?.invoiceQuantity ?? poQuantity;
  const invoiceUnitPrice = overrides?.invoiceUnitPrice ?? poUnitPrice;
  const received = overrides?.received ?? poQuantity;
  const damaged = overrides?.damaged ?? 0n;
  const withReceipt = overrides?.withReceipt ?? true;

  const invoice: EngineInvoice = {
    id: "invoice-1",
    invoiceNumber: "INV-2026-001",
    vendorId: "vendor-1",
    vendorName: "ABC Office Supplies",
    poReference: "PO-2026-001",
    currency: "INR",
    subtotalMinor: (invoiceQuantity * invoiceUnitPrice) / 1000n,
    taxMinor: 0n,
    discountMinor: 0n,
    shippingMinor: 0n,
    totalMinor: (invoiceQuantity * invoiceUnitPrice) / 1000n,
    items: [
      {
        lineNumber: 1,
        description: "Ergonomic office chair",
        sku: "CHAIR-01",
        quantityMilli: invoiceQuantity,
        unitPriceMinor: invoiceUnitPrice,
        taxRateBps: 0,
        lineTotalMinor: (invoiceQuantity * invoiceUnitPrice) / 1000n,
      },
    ],
  };
  const purchaseOrder: EnginePurchaseOrder = {
    id: "po-1",
    poNumber: "PO-2026-001",
    vendorId: "vendor-1",
    vendorName: "ABC Office Supplies",
    currency: "INR",
    subtotalMinor: (poQuantity * poUnitPrice) / 1000n,
    taxMinor: 0n,
    totalMinor: (poQuantity * poUnitPrice) / 1000n,
    items: [
      {
        id: "po-item-1",
        lineNumber: 1,
        description: "Ergonomic office chair",
        sku: "CHAIR-01",
        quantityMilli: poQuantity,
        unitPriceMinor: poUnitPrice,
        taxRateBps: 0,
        lineTotalMinor: (poQuantity * poUnitPrice) / 1000n,
      },
    ],
  };
  const receipts: EngineReceipt[] = withReceipt
    ? [
        {
          id: "gr-1",
          receiptNumber: "GR-2026-001",
          receivedDate: "2026-10-01",
          items: [
            {
              purchaseOrderItemId: "po-item-1",
              quantityReceivedMilli: received,
              quantityDamagedMilli: damaged,
            },
          ],
        },
      ]
    : [];
  return { invoice, purchaseOrder, receipts, duplicates: [] };
}

const codes = (result: ReturnType<typeof reconcile>) =>
  result.discrepancies.map((item) => item.ruleCode);

describe("deterministic three-way reconciliation engine", () => {
  it("returns no material discrepancy for an exact three-way match", () => {
    const result = reconcile(baseInput());
    expect(result.discrepancies).toEqual([]);
    expect(result.totals.potentialImpactMinor).toBe(0n);
    expect(result.totals.shortQtyMilli).toBe(0n);
    expect(result.totals.usableQtyMilli).toBe(100_000n);
  });

  it("calculates 10 short units at INR 5,000 as INR 50,000 exposure", () => {
    const result = reconcile(baseInput({ received: 90_000n }));
    expect(codes(result)).toContain("RECEIVED_QTY_MISMATCH");
    expect(codes(result)).toContain("PARTIAL_DELIVERY");
    expect(result.totals.shortQtyMilli).toBe(10_000n);
    expect(result.totals.potentialQuantityExposureMinor).toBe(5_000_000n);
    expect(result.totals.potentialImpactMinor).toBe(5_000_000n);
    const discrepancy = result.discrepancies.find(
      (item) => item.ruleCode === "RECEIVED_QTY_MISMATCH",
    );
    expect(discrepancy?.impactMinor).toBe(5_000_000n);
    expect(discrepancy?.description).toContain("not a conclusion that the vendor owes");
    expect(discrepancy?.sourceRefs.map((ref) => ref.type)).toEqual([
      "INVOICE",
      "PURCHASE_ORDER",
      "GOODS_RECEIPT",
    ]);
  });

  it("treats damaged units as unusable without double-counting exposure", () => {
    const result = reconcile(
      baseInput({ received: 100_000n, damaged: 10_000n }),
    );
    expect(codes(result)).toContain("RECEIVED_QTY_MISMATCH");
    expect(codes(result)).toContain("DAMAGED_GOODS");
    expect(result.totals.usableQtyMilli).toBe(90_000n);
    expect(result.totals.shortQtyMilli).toBe(10_000n);
    expect(result.totals.potentialQuantityExposureMinor).toBe(5_000_000n);
    expect(result.totals.potentialImpactMinor).toBe(5_000_000n);
    const damaged = result.discrepancies.find(
      (item) => item.ruleCode === "DAMAGED_GOODS",
    );
    expect(damaged?.impactMinor).toBeNull();
  });

  it("flags price variance on verifiable received units only", () => {
    const result = reconcile(
      baseInput({ received: 90_000n, invoiceUnitPrice: 550_000n }),
    );
    expect(codes(result)).toContain("UNIT_PRICE_MISMATCH");
    expect(result.totals.potentialPriceExposureMinor).toBe(4_500_000n);
    expect(result.totals.potentialQuantityExposureMinor).toBe(5_000_000n);
    expect(result.totals.potentialImpactMinor).toBe(9_500_000n);
  });

  it("does not assert quantity exposure when receipts are missing", () => {
    const result = reconcile(baseInput({ withReceipt: false }));
    expect(codes(result)).toContain("MISSING_GOODS");
    expect(result.totals.potentialQuantityExposureMinor).toBe(0n);
    expect(result.matches[0]?.shortQtyMilli).toBe(0n);
  });

  it("flags duplicates as critical and separate from financial exposure", () => {
    const input = baseInput();
    input.duplicates = [
      {
        id: "invoice-0",
        invoiceNumber: "INV-2026-001",
        issueDate: "2026-09-01",
        totalMinor: 50_000_000n,
        currency: "INR",
      },
    ];
    const result = reconcile(input);
    const duplicate = result.discrepancies.find(
      (item) => item.ruleCode === "DUPLICATE_INVOICE",
    );
    expect(duplicate?.severity).toBe("CRITICAL");
    expect(duplicate?.impactMinor).toBeNull();
    expect(result.totals.potentialImpactMinor).toBe(0n);
  });

  it("is deterministic across repeated runs", () => {
    const first = reconcile(baseInput({ received: 90_000n }));
    const second = reconcile(baseInput({ received: 90_000n }));
    expect(second).toEqual(first);
    expect(first.engineVersion).toBe("1.0.0");
  });
});
