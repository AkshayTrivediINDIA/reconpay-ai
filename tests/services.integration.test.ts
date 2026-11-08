import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, getDb } from "@/lib/db";
import { discrepancies, payments, reconciliationRuns } from "@/lib/db/schema";
import { createMatchFixture, createSecondOrganizationContext, useTestDatabase } from "./helpers/fixtures";
import { findDuplicateInvoice, getInvoice, listInvoices } from "@/lib/services/invoices";
import { runReconciliation, getReconciliationDetail } from "@/lib/services/reconciliation";
import { createEvidencePdf, generateEvidenceReport } from "@/lib/services/evidence";
import {
  approveSettlement,
  createSettlement,
  getSettlement,
  markReadyForPayment,
  respondToVendorToken,
  shareSettlement,
  submitSettlement,
} from "@/lib/services/settlements";
import { createPaypalPayment } from "@/lib/services/payments";

describe("financial services integration", () => {
  beforeAll(async () => {
    await useTestDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("stores an exact 10-short-unit reconciliation and source references", async () => {
    const fixture = await createMatchFixture({ suffix: "match" });
    const result = await runReconciliation(fixture.admin, {
      invoiceId: fixture.invoiceId,
      purchaseOrderId: fixture.poId,
      goodsReceiptIds: [fixture.receiptId],
    });
    expect(result.discrepancyCount).toBeGreaterThanOrEqual(2);
    expect(result.potentialImpactMinor).toBe(5_000_000n);

    const detail = await getReconciliationDetail(fixture.admin, result.runId);
    expect(detail.run.status).toBe("COMPLETED");
    expect(detail.run.potentialQuantityExposureMinor).toBe(5_000_000n);
    expect(detail.run.shortQtyMilli).toBe(10_000n);
    const quantity = detail.discrepancies.find(
      (row) => row.ruleCode === "RECEIVED_QTY_MISMATCH",
    );
    expect(quantity?.impactMinor).toBe(5_000_000n);
    expect(quantity?.sourceRefs).toHaveLength(3);
    expect(quantity?.sourceRefs.map((ref) => ref.type)).toContain("GOODS_RECEIPT");

    const storedRuns = await (await getDb())
      .select()
      .from(reconciliationRuns)
      .where(eq(reconciliationRuns.id, result.runId));
    expect(storedRuns[0]?.resultSnapshot).toBeTruthy();
  });

  it("treats damaged units as a separate informational rule", async () => {
    const fixture = await createMatchFixture({
      suffix: "damaged",
      receivedMilli: 100_000n,
      damagedMilli: 10_000n,
    });
    const result = await runReconciliation(fixture.admin, {
      invoiceId: fixture.invoiceId,
      purchaseOrderId: fixture.poId,
      goodsReceiptIds: [fixture.receiptId],
    });
    expect(result.potentialImpactMinor).toBe(5_000_000n);
    const rows = await (await getDb())
      .select()
      .from(discrepancies)
      .where(eq(discrepancies.runId, result.runId));
    const damaged = rows.find((row) => row.ruleCode === "DAMAGED_GOODS");
    expect(damaged).toBeTruthy();
    expect(damaged?.impactMinor).toBeNull();
    expect(rows.filter((row) => row.ruleCode === "RECEIVED_QTY_MISMATCH")).toHaveLength(1);
  });

  it("detects duplicate invoice numbers for the same vendor", async () => {
    const fixture = await createMatchFixture({ suffix: "dup" });
    const duplicate = await findDuplicateInvoice({
      organizationId: fixture.organization.id,
      vendorId: fixture.vendorId,
      vendorNameRaw: fixture.vendorName,
      invoiceNumber: fixture.invoiceNumber.toLowerCase(),
    });
    expect(duplicate?.id).toBe(fixture.invoiceId);
    const excluding = await findDuplicateInvoice({
      organizationId: fixture.organization.id,
      vendorId: fixture.vendorId,
      vendorNameRaw: fixture.vendorName,
      invoiceNumber: fixture.invoiceNumber,
      excludeId: fixture.invoiceId,
    });
    expect(excluding).toBeNull();
  });

  it("enforces tenant and vendor isolation on reads and reconciliation", async () => {
    const fixture = await createMatchFixture({ suffix: "isolation" });
    const otherOrg = await createSecondOrganizationContext();
    await expect(getInvoice(otherOrg, fixture.invoiceId)).rejects.toThrow(/not found/i);
    await expect(
      runReconciliation(otherOrg, {
        invoiceId: fixture.invoiceId,
        purchaseOrderId: fixture.poId,
        goodsReceiptIds: [fixture.receiptId],
      }),
    ).rejects.toThrow(/not found/i);
    await expect(getInvoice(fixture.otherVendor, fixture.invoiceId)).rejects.toThrow(
      /not found/i,
    );
    const own = await listInvoices(fixture.vendor, { pageSize: 100 });
    const other = await listInvoices(fixture.otherVendor, { pageSize: 100 });
    expect(own.total).toBe(1);
    expect(other.total).toBe(0);
  });

  it("enforces segregation of duties and the vendor acceptance gate", async () => {
    const fixture = await createMatchFixture({ suffix: "approval" });
    await runReconciliation(fixture.admin, {
      invoiceId: fixture.invoiceId,
      purchaseOrderId: fixture.poId,
      goodsReceiptIds: [fixture.receiptId],
    });
    const settlement = await createSettlement(fixture.finance, {
      invoiceId: fixture.invoiceId,
      proposedAmount: "1000.00",
      disputedAmount: "0.00",
      reason: "Integration-test settlement proposal.",
      currency: "INR",
    });
    await submitSettlement(fixture.finance, settlement.id);

    await expect(
      approveSettlement(fixture.finance, settlement.id, {
        decision: "APPROVED",
        comments: "Self-approval must be blocked.",
      }),
    ).rejects.toThrow(/creator cannot approve/);
    await expect(
      approveSettlement(fixture.vendor, settlement.id, {
        decision: "APPROVED",
        comments: "Vendor cannot approve.",
      }),
    ).rejects.toThrow(/cannot perform this action/);
    await expect(
      markReadyForPayment(fixture.admin, settlement.id),
    ).rejects.toThrow(/vendor must accept/);

    await approveSettlement(fixture.admin, settlement.id, {
      decision: "APPROVED",
      comments: "Approved by administrator after review.",
    });
    const share = await shareSettlement(fixture.admin, settlement.id, 7);
    expect(share.url).toContain("/vendor/");
    await respondToVendorToken(share.token, {
      action: "ACCEPT",
      note: "Accepted in test.",
    });
    await markReadyForPayment(fixture.admin, settlement.id);
    const ready = await getSettlement(fixture.admin, settlement.id);
    expect(ready.status).toBe("READY_FOR_PAYMENT");
    expect(ready.vendorTokenHash).toBeTruthy();
  });

  it("blocks vendor payment initiation and unsupported INR PayPal execution", async () => {
    const fixture = await createMatchFixture({ suffix: "payment-guard" });
    const settlement = await createSettlement(fixture.finance, {
      invoiceId: fixture.invoiceId,
      proposedAmount: "1000.00",
      disputedAmount: "0.00",
      reason: "Payment guard test.",
      currency: "INR",
    });
    await submitSettlement(fixture.finance, settlement.id);
    await approveSettlement(fixture.admin, settlement.id, {
      decision: "APPROVED",
      comments: "Approved for payment-guard test.",
    });
    const share = await shareSettlement(fixture.admin, settlement.id, 7);
    await respondToVendorToken(share.token, { action: "ACCEPT" });
    await markReadyForPayment(fixture.admin, settlement.id);

    await expect(
      createPaypalPayment(fixture.vendor, settlement.id),
    ).rejects.toThrow(/cannot perform this action/);
    await expect(
      createPaypalPayment(fixture.admin, settlement.id),
    ).rejects.toThrow(/PayPal does not support payments in INR/);
    const rows = await (await getDb())
      .select()
      .from(payments)
      .where(eq(payments.settlementId, settlement.id));
    expect(rows).toHaveLength(0);
  });

  it("generates a rules-based evidence report and a real PDF", async () => {
    const fixture = await createMatchFixture({ suffix: "evidence" });
    const run = await runReconciliation(fixture.admin, {
      invoiceId: fixture.invoiceId,
      purchaseOrderId: fixture.poId,
      goodsReceiptIds: [fixture.receiptId],
    });
    const report = await generateEvidenceReport(fixture.admin, run.runId);
    expect(report.generatedBy).toBe("RULES");
    expect(report.warning).toContain("deterministically");
    const pdf = await createEvidencePdf(fixture.admin, run.runId);
    const header = Buffer.from(pdf.bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
    expect(pdf.bytes.length).toBeGreaterThan(1000);
    expect(pdf.fileName.endsWith(".pdf")).toBe(true);
  });

  it("prevents vendors from reading the evidence center", async () => {
    const fixture = await createMatchFixture({ suffix: "evidence-vendor" });
    const run = await runReconciliation(fixture.admin, {
      invoiceId: fixture.invoiceId,
      purchaseOrderId: fixture.poId,
      goodsReceiptIds: [fixture.receiptId],
    });
    await expect(generateEvidenceReport(fixture.vendor, run.runId)).rejects.toThrow(
      /cannot perform this action/,
    );
  });
});
