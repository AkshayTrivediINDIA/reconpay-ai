import {
  clampNonNegative,
  computeLineTotal,
  computeTax,
  divRoundHalfUp,
  formatMinor,
  formatQuantity,
} from "@/lib/money";

export const RECONCILIATION_ENGINE_VERSION = "1.0.0";

export type EngineInvoiceItem = {
  lineNumber: number;
  description: string;
  sku: string | null;
  quantityMilli: bigint;
  unitPriceMinor: bigint;
  taxRateBps: number;
  lineTotalMinor: bigint;
};

export type EngineInvoice = {
  id: string;
  invoiceNumber: string;
  vendorId: string | null;
  vendorName: string | null;
  poReference: string | null;
  currency: string;
  subtotalMinor: bigint;
  taxMinor: bigint;
  discountMinor: bigint;
  shippingMinor: bigint;
  totalMinor: bigint;
  items: EngineInvoiceItem[];
};

export type EnginePurchaseOrderItem = {
  id: string;
  lineNumber: number;
  description: string;
  sku: string | null;
  quantityMilli: bigint;
  unitPriceMinor: bigint;
  taxRateBps: number;
  lineTotalMinor: bigint;
};

export type EnginePurchaseOrder = {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  currency: string;
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  items: EnginePurchaseOrderItem[];
};

export type EngineReceipt = {
  id: string;
  receiptNumber: string;
  receivedDate: string;
  items: {
    purchaseOrderItemId: string;
    quantityReceivedMilli: bigint;
    quantityDamagedMilli: bigint;
  }[];
};

export type EngineDuplicate = {
  id: string;
  invoiceNumber: string;
  issueDate: string | null;
  totalMinor: bigint;
  currency: string;
};

export type EngineInput = {
  invoice: EngineInvoice;
  purchaseOrder: EnginePurchaseOrder;
  receipts: EngineReceipt[];
  duplicates: EngineDuplicate[];
};

export type EngineSourceRef = {
  type: "INVOICE" | "PURCHASE_ORDER" | "GOODS_RECEIPT";
  id: string;
  label: string;
  lineNumber?: number;
};

export type EngineDiscrepancy = {
  ruleCode: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  calculation: string;
  expectedValue: string | null;
  actualValue: string | null;
  impactMinor: bigint | null;
  sourceRefs: EngineSourceRef[];
};

export type EngineLineMatch = {
  invoiceLineNumber: number;
  poLineNumber: number | null;
  description: string;
  sku: string | null;
  invoicedQtyMilli: bigint;
  orderedQtyMilli: bigint;
  receivedQtyMilli: bigint;
  damagedQtyMilli: bigint;
  usableQtyMilli: bigint;
  shortQtyMilli: bigint;
  invoiceUnitPriceMinor: bigint;
  poUnitPriceMinor: bigint;
  priceVarianceMinor: bigint;
  receiptIds: string[];
};

export type EngineResult = {
  engineVersion: string;
  matches: EngineLineMatch[];
  totals: {
    orderedQtyMilli: bigint;
    receivedQtyMilli: bigint;
    damagedQtyMilli: bigint;
    usableQtyMilli: bigint;
    invoicedQtyMilli: bigint;
    shortQtyMilli: bigint;
    invoiceSubtotalMinor: bigint;
    invoiceTaxMinor: bigint;
    invoiceDiscountMinor: bigint;
    invoiceShippingMinor: bigint;
    invoiceTotalMinor: bigint;
    poTotalMinor: bigint;
    computedLineSumMinor: bigint;
    expectedTaxMinor: bigint;
    potentialQuantityExposureMinor: bigint;
    potentialPriceExposureMinor: bigint;
    potentialTaxExposureMinor: bigint;
    potentialImpactMinor: bigint;
  };
  discrepancies: EngineDiscrepancy[];
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function lineKey(sku: string | null, description: string): string {
  const normalizedSku = normalize(sku).toUpperCase();
  if (normalizedSku) return `sku:${normalizedSku}`;
  return `desc:${normalize(description)}`;
}

function money(amount: bigint, currency: string): string {
  return formatMinor(amount, currency);
}

function findInvoiceMatch(
  invoiceItem: EngineInvoiceItem,
  poItemsByKey: Map<string, EnginePurchaseOrderItem>,
  poItemsByLine: Map<number, EnginePurchaseOrderItem>,
): EnginePurchaseOrderItem | null {
  return (
    poItemsByKey.get(lineKey(invoiceItem.sku, invoiceItem.description)) ??
    poItemsByLine.get(invoiceItem.lineNumber) ??
    null
  );
}

/**
 * Deterministic three-way match. No AI call, no randomness, no network.
 * The engine reports potential exposure and rule calculations; it deliberately
 * does not determine an amount owed or an amount payable.
 */
export function reconcile(input: EngineInput): EngineResult {
  const { invoice, purchaseOrder: po, receipts, duplicates } = input;
  const currency = invoice.currency;
  const discrepancies: EngineDiscrepancy[] = [];

  const poItemsByKey = new Map<string, EnginePurchaseOrderItem>();
  const poItemsByLine = new Map<number, EnginePurchaseOrderItem>();
  for (const item of po.items) {
    poItemsByKey.set(lineKey(item.sku, item.description), item);
    poItemsByLine.set(item.lineNumber, item);
  }

  const receiptByPoItem = new Map<
    string,
    { received: bigint; damaged: bigint; ids: string[] }
  >();
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const current = receiptByPoItem.get(item.purchaseOrderItemId) ?? {
        received: 0n,
        damaged: 0n,
        ids: [],
      };
      current.received += item.quantityReceivedMilli;
      current.damaged += item.quantityDamagedMilli;
      current.ids.push(receipt.id);
      receiptByPoItem.set(item.purchaseOrderItemId, current);
    }
  }

  if (receipts.length === 0) {
    discrepancies.push({
      ruleCode: "MISSING_GOODS",
      severity: "HIGH",
      title: "No goods receipt linked",
      description:
        "No goods receipt is linked to this reconciliation. Quantities received cannot be verified, so no received-quantity exposure has been calculated.",
      calculation: "Received quantity unavailable — impact not determinable",
      expectedValue: `${formatQuantity(po.items.reduce((s, i) => s + i.quantityMilli, 0n))} ordered`,
      actualValue: "No receipt",
      impactMinor: null,
      sourceRefs: [
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  }

  const matches: EngineLineMatch[] = [];
  let potentialQuantityExposure = 0n;
  let potentialPriceExposure = 0n;
  let computedLineSum = 0n;
  let expectedTax = 0n;

  for (const item of invoice.items) {
    const poItem = findInvoiceMatch(item, poItemsByKey, poItemsByLine);
    const computedLine = computeLineTotal(item.unitPriceMinor, item.quantityMilli);
    computedLineSum += computedLine;

    if (!poItem) {
      discrepancies.push({
        ruleCode: "INVOICE_LINE_UNMATCHED",
        severity: "MEDIUM",
        title: "Invoice line has no matching purchase-order line",
        description: `Line ${item.lineNumber} ("${item.description}") could not be matched by SKU, description, or line number. Quantities and prices for this line could not be verified.`,
        calculation: `${formatQuantity(item.quantityMilli)} × ${money(item.unitPriceMinor, currency)} = ${money(computedLine, currency)} unverified`,
        expectedValue: "Matching PO line",
        actualValue: item.description,
        impactMinor: null,
        sourceRefs: [
          {
            type: "INVOICE",
            id: invoice.id,
            label: invoice.invoiceNumber,
            lineNumber: item.lineNumber,
          },
        ],
      });
      matches.push({
        invoiceLineNumber: item.lineNumber,
        poLineNumber: null,
        description: item.description,
        sku: item.sku,
        invoicedQtyMilli: item.quantityMilli,
        orderedQtyMilli: 0n,
        receivedQtyMilli: 0n,
        damagedQtyMilli: 0n,
        usableQtyMilli: 0n,
        shortQtyMilli: 0n,
        invoiceUnitPriceMinor: item.unitPriceMinor,
        poUnitPriceMinor: 0n,
        priceVarianceMinor: 0n,
        receiptIds: [],
      });
      continue;
    }

    expectedTax += computeTax(
      computeLineTotal(poItem.unitPriceMinor, item.quantityMilli),
      poItem.taxRateBps,
    );

    const receipt = receiptByPoItem.get(poItem.id);
    const received = receipt?.received ?? 0n;
    const damaged = receipt?.damaged ?? 0n;
    const usable = received - damaged;
    const shortQty = receipt ? clampNonNegative(item.quantityMilli - usable) : 0n;
    const hasReceipt = Boolean(receipt);

    if (!hasReceipt && receipts.length > 0) {
      discrepancies.push({
        ruleCode: "MISSING_GOODS",
        severity: "HIGH",
        title: "No goods receipt for this purchase-order line",
        description: `Invoice line "${item.description}" has no corresponding goods receipt. The received quantity cannot be verified; no exposure is asserted for this line.`,
        calculation: `${formatQuantity(item.quantityMilli)} invoiced × ${money(poItem.unitPriceMinor, currency)} — receipt missing`,
        expectedValue: "Goods receipt",
        actualValue: "No receipt for line",
        impactMinor: null,
        sourceRefs: [
          { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber, lineNumber: item.lineNumber },
          { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber, lineNumber: poItem.lineNumber },
        ],
      });
    }

    if (item.quantityMilli !== poItem.quantityMilli) {
      const difference = item.quantityMilli - poItem.quantityMilli;
      discrepancies.push({
        ruleCode: "INVOICE_QTY_MISMATCH",
        severity: "MEDIUM",
        title: "Invoiced quantity differs from ordered quantity",
        description: `Invoice quantity for "${item.description}" is ${formatQuantity(item.quantityMilli)} but the purchase order ordered ${formatQuantity(poItem.quantityMilli)}. This rule is informational; received-quantity exposure is calculated separately to avoid double counting.`,
        calculation: `${formatQuantity(item.quantityMilli)} invoiced − ${formatQuantity(poItem.quantityMilli)} ordered = ${formatQuantity(difference)} difference`,
        expectedValue: `${formatQuantity(poItem.quantityMilli)} ordered`,
        actualValue: `${formatQuantity(item.quantityMilli)} invoiced`,
        impactMinor: null,
        sourceRefs: [
          { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber, lineNumber: item.lineNumber },
          { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber, lineNumber: poItem.lineNumber },
        ],
      });
    }

    if (hasReceipt && shortQty > 0n) {
      const impact = divRoundHalfUp(shortQty * poItem.unitPriceMinor, 1000n);
      potentialQuantityExposure += impact;
      discrepancies.push({
        ruleCode: "RECEIVED_QTY_MISMATCH",
        severity: impact > 0n ? "HIGH" : "MEDIUM",
        title: "Invoiced quantity exceeds usable received quantity",
        description: `Invoice bills ${formatQuantity(item.quantityMilli)} units of "${item.description}". Goods receipts record ${formatQuantity(received)} received, of which ${formatQuantity(damaged)} are damaged, leaving ${formatQuantity(usable)} usable. The ${formatQuantity(shortQty)} unit difference is flagged as potential exposure. It is not a conclusion that the vendor owes this amount.`,
        calculation: `(${formatQuantity(item.quantityMilli)} invoiced − ${formatQuantity(usable)} usable) × ${money(poItem.unitPriceMinor, currency)} = ${money(impact, currency)} potential quantity exposure`,
        expectedValue: `${formatQuantity(usable)} usable received`,
        actualValue: `${formatQuantity(item.quantityMilli)} invoiced`,
        impactMinor: impact,
        sourceRefs: [
          { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber, lineNumber: item.lineNumber },
          { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber, lineNumber: poItem.lineNumber },
          ...(receipt?.ids.map((id) => ({
            type: "GOODS_RECEIPT" as const,
            id,
            label: receipts.find((r) => r.id === id)?.receiptNumber ?? "Goods receipt",
          })) ?? []),
        ],
      });
    }

    if (hasReceipt && damaged > 0n) {
      const damagedValue = divRoundHalfUp(damaged * poItem.unitPriceMinor, 1000n);
      discrepancies.push({
        ruleCode: "DAMAGED_GOODS",
        severity: "HIGH",
        title: "Damaged goods recorded",
        description: `${formatQuantity(damaged)} unit(s) of "${item.description}" were recorded as damaged and excluded from usable stock. The value shown is included in the received-quantity exposure where applicable and is not added again to the aggregate.`,
        calculation: `${formatQuantity(damaged)} damaged × ${money(poItem.unitPriceMinor, currency)} = ${money(damagedValue, currency)} (informational; not added separately)`,
        expectedValue: "No damaged units",
        actualValue: `${formatQuantity(damaged)} damaged`,
        impactMinor: null,
        sourceRefs: [
          { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber, lineNumber: poItem.lineNumber },
          ...(receipt?.ids.map((id) => ({
            type: "GOODS_RECEIPT" as const,
            id,
            label: receipts.find((r) => r.id === id)?.receiptNumber ?? "Goods receipt",
          })) ?? []),
        ],
      });
    }

    if (item.unitPriceMinor !== poItem.unitPriceMinor) {
      const priceDifference = item.unitPriceMinor - poItem.unitPriceMinor;
      const quantityForExposure = hasReceipt
        ? (item.quantityMilli < usable ? item.quantityMilli : usable)
        : item.quantityMilli;
      const impact =
        priceDifference > 0n
          ? divRoundHalfUp(priceDifference * quantityForExposure, 1000n)
          : 0n;
      potentialPriceExposure += impact;
      discrepancies.push({
        ruleCode: "UNIT_PRICE_MISMATCH",
        severity: priceDifference > 0n ? "HIGH" : "MEDIUM",
        title: "Unit price differs from the purchase order",
        description: `Invoice price for "${item.description}" is ${money(item.unitPriceMinor, currency)} per unit versus ${money(poItem.unitPriceMinor, currency)} on the purchase order. ${priceDifference > 0n ? "The excess over PO price is flagged as potential exposure on verifiable units." : "The invoiced price is lower than the PO price; this is informational."}`,
        calculation: `${money(item.unitPriceMinor, currency)} invoiced − ${money(poItem.unitPriceMinor, currency)} PO = ${money(priceDifference, currency)} per unit; ${formatQuantity(quantityForExposure)} units considered; ${money(impact, currency)} potential price exposure`,
        expectedValue: `${money(poItem.unitPriceMinor, currency)} / unit`,
        actualValue: `${money(item.unitPriceMinor, currency)} / unit`,
        impactMinor: impact,
        sourceRefs: [
          { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber, lineNumber: item.lineNumber },
          { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber, lineNumber: poItem.lineNumber },
        ],
      });
    }

    if (item.lineTotalMinor !== computedLine && item.lineTotalMinor !== 0n) {
      discrepancies.push({
        ruleCode: "LINE_TOTAL_MISMATCH",
        severity: "MEDIUM",
        title: "Line amount does not equal quantity × unit price",
        description: `The printed line total for "${item.description}" does not match the exact multiplication of quantity and unit price.`,
        calculation: `${formatQuantity(item.quantityMilli)} × ${money(item.unitPriceMinor, currency)} = ${money(computedLine, currency)}; document states ${money(item.lineTotalMinor, currency)}; difference ${money(item.lineTotalMinor - computedLine, currency)}`,
        expectedValue: money(computedLine, currency),
        actualValue: money(item.lineTotalMinor, currency),
        impactMinor: null,
        sourceRefs: [
          { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber, lineNumber: item.lineNumber },
        ],
      });
    }

    matches.push({
      invoiceLineNumber: item.lineNumber,
      poLineNumber: poItem.lineNumber,
      description: item.description,
      sku: item.sku ?? poItem.sku,
      invoicedQtyMilli: item.quantityMilli,
      orderedQtyMilli: poItem.quantityMilli,
      receivedQtyMilli: received,
      damagedQtyMilli: damaged,
      usableQtyMilli: usable,
      shortQtyMilli: shortQty,
      invoiceUnitPriceMinor: item.unitPriceMinor,
      poUnitPriceMinor: poItem.unitPriceMinor,
      priceVarianceMinor: item.unitPriceMinor - poItem.unitPriceMinor,
      receiptIds: receipt?.ids ?? [],
    });
  }

  // Taxes: compare the invoice tax line with tax at the PO's contractual rates
  // on the invoiced quantities. The result is exposure only when the invoice
  // charges more tax than the PO rates imply.
  const taxDifference = invoice.taxMinor - expectedTax;
  let potentialTaxExposure = 0n;
  if (taxDifference !== 0n) {
    potentialTaxExposure = taxDifference > 0n ? taxDifference : 0n;
    discrepancies.push({
      ruleCode: "TAX_MISMATCH",
      severity: taxDifference > 0n ? "HIGH" : "MEDIUM",
      title: "Tax amount differs from purchase-order tax basis",
      description: `Invoice tax is ${money(invoice.taxMinor, currency)}. Applying the purchase-order tax rates to the invoiced quantities produces ${money(expectedTax, currency)}. Confirm tax treatment, exemptions and rounding before settlement.`,
      calculation: `${money(invoice.taxMinor, currency)} invoiced tax − ${money(expectedTax, currency)} expected = ${money(taxDifference, currency)} variance; ${money(potentialTaxExposure, currency)} potential excess`,
      expectedValue: money(expectedTax, currency),
      actualValue: money(invoice.taxMinor, currency),
      impactMinor: potentialTaxExposure,
      sourceRefs: [
        { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber },
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  }

  const subtotalDifference = invoice.subtotalMinor - computedLineSum;
  if (subtotalDifference !== 0n) {
    discrepancies.push({
      ruleCode: "SUBTOTAL_MISMATCH",
      severity: "HIGH",
      title: "Invoice subtotal does not equal the sum of line items",
      description:
        "The invoice's stated subtotal differs from the exact sum of its line items. This is an arithmetic inconsistency in the document and does not by itself establish an amount owed.",
      calculation: `${money(invoice.subtotalMinor, currency)} stated subtotal − ${money(computedLineSum, currency)} line-item sum = ${money(subtotalDifference, currency)} difference`,
      expectedValue: money(computedLineSum, currency),
      actualValue: money(invoice.subtotalMinor, currency),
      impactMinor: null,
      sourceRefs: [{ type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber }],
    });
  }

  const computedTotal =
    invoice.subtotalMinor - invoice.discountMinor + invoice.shippingMinor + invoice.taxMinor;
  const totalDifference = invoice.totalMinor - computedTotal;
  if (totalDifference !== 0n) {
    discrepancies.push({
      ruleCode: "TOTAL_MISMATCH",
      severity: "HIGH",
      title: "Invoice total does not equal subtotal, tax, shipping and discount",
      description:
        "The stated invoice total cannot be reproduced from its own component amounts. This is an arithmetic inconsistency; selected line-level rules carry any calculated exposure.",
      calculation: `${money(invoice.subtotalMinor, currency)} subtotal − ${money(invoice.discountMinor, currency)} discount + ${money(invoice.taxMinor, currency)} tax + ${money(invoice.shippingMinor, currency)} shipping = ${money(computedTotal, currency)}; document states ${money(invoice.totalMinor, currency)}; difference ${money(totalDifference, currency)}`,
      expectedValue: money(computedTotal, currency),
      actualValue: money(invoice.totalMinor, currency),
      impactMinor: null,
      sourceRefs: [{ type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber }],
    });
  } else if (
    invoice.totalMinor !== po.totalMinor &&
    !discrepancies.some((d) =>
      ["UNIT_PRICE_MISMATCH", "INVOICE_QTY_MISMATCH", "TAX_MISMATCH", "SUBTOTAL_MISMATCH"].includes(
        d.ruleCode,
      ),
    )
  ) {
    discrepancies.push({
      ruleCode: "TOTAL_MISMATCH",
      severity: "MEDIUM",
      title: "Invoice total differs from purchase-order total",
      description:
        "The invoice arithmetic is internally consistent, but its total differs from the purchase order total with no line-level rule explaining the difference. Review shipping, discount, and order changes.",
      calculation: `${money(invoice.totalMinor, currency)} invoice total − ${money(po.totalMinor, currency)} PO total = ${money(invoice.totalMinor - po.totalMinor, currency)} variance`,
      expectedValue: money(po.totalMinor, currency),
      actualValue: money(invoice.totalMinor, currency),
      impactMinor: null,
      sourceRefs: [
        { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber },
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  }

  const vendorIdMismatch =
    invoice.vendorId !== null && invoice.vendorId !== po.vendorId;
  const vendorNameMismatch =
    invoice.vendorName !== null &&
    normalize(invoice.vendorName) !== normalize(po.vendorName) &&
    !vendorIdMismatch;
  if (vendorIdMismatch || vendorNameMismatch) {
    discrepancies.push({
      ruleCode: "VENDOR_MISMATCH",
      severity: "HIGH",
      title: "Invoice vendor does not match the purchase order",
      description: `The invoice names "${invoice.vendorName ?? "an unknown vendor"}" while the purchase order belongs to "${po.vendorName}". Confirm the legal entity and bank details before any settlement.`,
      calculation: `${invoice.vendorName ?? "Unknown"} ≠ ${po.vendorName}`,
      expectedValue: po.vendorName,
      actualValue: invoice.vendorName ?? "Not stated",
      impactMinor: null,
      sourceRefs: [
        { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber },
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  }

  if (!invoice.poReference) {
    discrepancies.push({
      ruleCode: "PO_REFERENCE_MISMATCH",
      severity: "LOW",
      title: "Invoice does not state a purchase-order reference",
      description: `The invoice has no purchase-order reference. It was matched to ${po.poNumber} manually; confirm the match before settlement.`,
      calculation: `Invoice reference: not stated; selected PO: ${po.poNumber}`,
      expectedValue: po.poNumber,
      actualValue: "Not stated",
      impactMinor: null,
      sourceRefs: [
        { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber },
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  } else if (normalize(invoice.poReference) !== normalize(po.poNumber)) {
    discrepancies.push({
      ruleCode: "PO_REFERENCE_MISMATCH",
      severity: "HIGH",
      title: "Invoice purchase-order reference differs from the selected PO",
      description: `The invoice references "${invoice.poReference}", but reconciliation was run against "${po.poNumber}". Confirm which order is correct and whether another invoice already covers this PO.`,
      calculation: `Invoice reference "${invoice.poReference}" ≠ selected PO "${po.poNumber}"`,
      expectedValue: po.poNumber,
      actualValue: invoice.poReference,
      impactMinor: null,
      sourceRefs: [
        { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber },
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  }

  if (normalize(invoice.currency) !== normalize(po.currency)) {
    discrepancies.push({
      ruleCode: "CURRENCY_MISMATCH",
      severity: "HIGH",
      title: "Invoice and purchase order currencies differ",
      description: "Amounts cannot be compared or paid safely without resolving the currency difference.",
      calculation: `${invoice.currency} invoice ≠ ${po.currency} purchase order`,
      expectedValue: po.currency,
      actualValue: invoice.currency,
      impactMinor: null,
      sourceRefs: [
        { type: "INVOICE", id: invoice.id, label: invoice.invoiceNumber },
        { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
      ],
    });
  }

  if (receipts.length > 0) {
    const orderedQty = po.items.reduce((sum, item) => sum + item.quantityMilli, 0n);
    const receivedQty = [...receiptByPoItem.values()].reduce(
      (sum, value) => sum + value.received,
      0n,
    );
    if (receivedQty < orderedQty) {
      discrepancies.push({
        ruleCode: "PARTIAL_DELIVERY",
        severity: "MEDIUM",
        title: "Partial delivery recorded",
        description: `The linked goods receipts cover ${formatQuantity(receivedQty)} of ${formatQuantity(orderedQty)} ordered units. Partial delivery is not, by itself, a financial discrepancy; it is relevant where the invoice bills the full order.`,
        calculation: `${formatQuantity(orderedQty)} ordered − ${formatQuantity(receivedQty)} received = ${formatQuantity(orderedQty - receivedQty)} not yet received`,
        expectedValue: `${formatQuantity(orderedQty)} ordered`,
        actualValue: `${formatQuantity(receivedQty)} received`,
        impactMinor: null,
        sourceRefs: [
          { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber },
          ...receipts.map((receipt) => ({
            type: "GOODS_RECEIPT" as const,
            id: receipt.id,
            label: receipt.receiptNumber,
          })),
        ],
      });
    }
    for (const [poItemId, value] of receiptByPoItem) {
      const poItem = po.items.find((item) => item.id === poItemId);
      if (!poItem) continue;
      if (value.received > poItem.quantityMilli) {
        discrepancies.push({
          ruleCode: "RECEIPT_EXCEEDS_ORDER",
          severity: "MEDIUM",
          title: "Goods receipt exceeds ordered quantity",
          description: `Receipts for "${poItem.description}" total ${formatQuantity(value.received)}, which is more than the ${formatQuantity(poItem.quantityMilli)} ordered. Review whether an order amendment exists.`,
          calculation: `${formatQuantity(value.received)} received − ${formatQuantity(poItem.quantityMilli)} ordered = ${formatQuantity(value.received - poItem.quantityMilli)} excess`,
          expectedValue: `${formatQuantity(poItem.quantityMilli)} ordered`,
          actualValue: `${formatQuantity(value.received)} received`,
          impactMinor: null,
          sourceRefs: [
            { type: "PURCHASE_ORDER", id: po.id, label: po.poNumber, lineNumber: poItem.lineNumber },
          ],
        });
      }
    }
  }

  for (const duplicate of duplicates) {
    discrepancies.push({
      ruleCode: "DUPLICATE_INVOICE",
      severity: "CRITICAL",
      title: "Possible duplicate invoice",
      description: `Invoice number "${duplicate.invoiceNumber}" already exists for this vendor in this organization. Do not pay until the duplicate is resolved.`,
      calculation: `Existing invoice ${duplicate.invoiceNumber}${duplicate.issueDate ? ` dated ${duplicate.issueDate}` : ""} for ${money(duplicate.totalMinor, duplicate.currency)}`,
      expectedValue: "Unique invoice number",
      actualValue: `${duplicate.invoiceNumber} (existing)`,
      impactMinor: null,
      sourceRefs: [{ type: "INVOICE", id: duplicate.id, label: duplicate.invoiceNumber }],
    });
  }

  const orderedQty = po.items.reduce((sum, item) => sum + item.quantityMilli, 0n);
  const receivedQty = [...receiptByPoItem.values()].reduce(
    (sum, value) => sum + value.received,
    0n,
  );
  const damagedQty = [...receiptByPoItem.values()].reduce(
    (sum, value) => sum + value.damaged,
    0n,
  );
  const usableQty = receivedQty - damagedQty;
  const invoicedQty = invoice.items.reduce((sum, item) => sum + item.quantityMilli, 0n);

  // Compute short quantity directly from matched lines, which already accounts
  // for invoice quantity and usable received quantity.
  const shortFromMatches = matches.reduce((sum, match) => sum + match.shortQtyMilli, 0n);

  return {
    engineVersion: RECONCILIATION_ENGINE_VERSION,
    matches,
    totals: {
      orderedQtyMilli: orderedQty,
      receivedQtyMilli: receivedQty,
      damagedQtyMilli: damagedQty,
      usableQtyMilli: usableQty,
      invoicedQtyMilli: invoicedQty,
      shortQtyMilli: shortFromMatches,
      invoiceSubtotalMinor: invoice.subtotalMinor,
      invoiceTaxMinor: invoice.taxMinor,
      invoiceDiscountMinor: invoice.discountMinor,
      invoiceShippingMinor: invoice.shippingMinor,
      invoiceTotalMinor: invoice.totalMinor,
      poTotalMinor: po.totalMinor,
      computedLineSumMinor: computedLineSum,
      expectedTaxMinor: expectedTax,
      potentialQuantityExposureMinor: potentialQuantityExposure,
      potentialPriceExposureMinor: potentialPriceExposure,
      potentialTaxExposureMinor: potentialTaxExposure,
      potentialImpactMinor:
        potentialQuantityExposure + potentialPriceExposure + potentialTaxExposure,
    },
    discrepancies,
  };
}

/** Convert the engine result to JSON-safe strings for storage/transport. */
export function serializeEngineResult(result: EngineResult): Record<string, unknown> {
  return {
    engineVersion: result.engineVersion,
    matches: result.matches.map((match) => ({
      ...match,
      invoicedQtyMilli: match.invoicedQtyMilli.toString(),
      orderedQtyMilli: match.orderedQtyMilli.toString(),
      receivedQtyMilli: match.receivedQtyMilli.toString(),
      damagedQtyMilli: match.damagedQtyMilli.toString(),
      usableQtyMilli: match.usableQtyMilli.toString(),
      shortQtyMilli: match.shortQtyMilli.toString(),
      invoiceUnitPriceMinor: match.invoiceUnitPriceMinor.toString(),
      poUnitPriceMinor: match.poUnitPriceMinor.toString(),
      priceVarianceMinor: match.priceVarianceMinor.toString(),
      receiptIds: match.receiptIds,
    })),
    totals: Object.fromEntries(
      Object.entries(result.totals).map(([key, value]) => [key, value.toString()]),
    ),
    discrepancies: result.discrepancies.map((discrepancy) => ({
      ...discrepancy,
      impactMinor: discrepancy.impactMinor === null ? null : discrepancy.impactMinor.toString(),
    })),
  };
}
