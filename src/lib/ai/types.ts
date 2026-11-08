export type ExtractedLineItem = {
  description: string | null;
  sku: string | null;
  quantity: string | null;
  unitPrice: string | null;
  taxRatePercent: string | null;
  lineTotal: string | null;
};

export type ExtractedInvoice = {
  invoiceNumber: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  vendorTaxId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  tax: string | null;
  discount: string | null;
  shipping: string | null;
  total: string | null;
  poReference: string | null;
  lineItems: ExtractedLineItem[];
  confidence: number;
  missingFields: string[];
  notes: string;
};

export type ExtractionResult = {
  extraction: ExtractedInvoice;
  engine: "OPENAI" | "LOCAL_HEURISTIC";
  model: string | null;
  warning: string | null;
  rawText: string | null;
};

export type EvidenceSummaryInput = {
  organizationName: string;
  invoiceNumber: string;
  invoiceTotal: string;
  vendorName: string;
  poNumber: string;
  receiptNumbers: string[];
  orderedQty: string;
  receivedQty: string;
  usableQty: string;
  shortQty: string;
  potentialQuantityExposure: string;
  potentialImpact: string;
  currency: string;
  discrepancies: {
    ruleCode: string;
    severity: string;
    title: string;
    description: string;
    calculation: string;
    status: string;
  }[];
  evidenceEvents: {
    occurredAt: string;
    eventType: string;
    description: string;
    actorLabel: string;
    source: string;
  }[];
  documents: {
    title: string;
    documentType: string;
    fileName: string;
  }[];
};

export type EvidenceSummary = {
  discrepancySummary: string;
  evidenceSummary: string;
  timelineSummary: string;
  nextActions: string[];
  missingEvidence: string[];
};
