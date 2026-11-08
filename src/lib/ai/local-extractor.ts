import type { ExtractedInvoice, ExtractedLineItem, ExtractionResult } from "./types";

type TextItem = {
  str?: string;
  transform?: number[];
};

type TextLine = { text: string; y: number };

async function extractPdfLines(buffer: Buffer): Promise<TextLine[]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (options: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: TextItem[] }>;
        }>;
      }>;
    };
  };
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const allLines: TextLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => typeof item.str === "string" && item.str.trim() !== "")
      .map((item) => ({
        str: String(item.str).trim(),
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const grouped: { y: number; items: { str: string; x: number }[] }[] = [];
    for (const item of items) {
      const target = grouped.find((line) => Math.abs(line.y - item.y) <= 2.5);
      if (target) {
        target.items.push({ str: item.str, x: item.x });
      } else {
        grouped.push({ y: item.y, items: [{ str: item.str, x: item.x }] });
      }
    }
    for (const line of grouped) {
      line.items.sort((a, b) => a.x - b.x);
      let text = "";
      let previousEnd = -1;
      for (const item of line.items) {
        if (previousEnd >= 0) {
          const gap = item.x - previousEnd;
          text += gap > 14 ? "  " : " ";
        }
        text += item.str;
        previousEnd = item.x + item.str.length * 5.4;
      }
      allLines.push({ text: text.replace(/\s+$/g, ""), y: line.y });
    }
  }
  return allLines;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const lines = await extractPdfLines(buffer);
  return lines.map((line) => line.text).join("\n");
}

function normalizeAmount(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/(?:INR|USD|EUR|GBP|₹|\$|€|£)/gi, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function normalizeQuantity(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").replace(/\s/g, "").trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(cleaned)) return null;
  return cleaned;
}

function normalizeTaxPercent(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace("%", "").replace(/\s/g, "");
  if (!/^\d+(?:\.\d{1,3})?$/.test(cleaned)) return null;
  return cleaned;
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : trimmed;
  }
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = dmy[1]!.padStart(2, "0");
    const month = dmy[2]!.padStart(2, "0");
    const candidate = `${dmy[3]}-${month}-${day}`;
    const date = new Date(`${candidate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : candidate;
  }
  const monthNames = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(trimmed);
  if (monthNames) {
    const months = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    const month = months.indexOf(monthNames[2]!.slice(0, 3).toLowerCase()) + 1;
    if (month > 0) {
      return `${monthNames[3]}-${String(month).padStart(2, "0")}-${monthNames[1]!.padStart(2, "0")}`;
    }
  }
  return null;
}

function field(lines: string[], patterns: RegExp[]): string | null {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

function amountField(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    if (!label.test(line)) continue;
    const matches = [...line.matchAll(/(\d[\d,]*\.\d{2})/g)];
    if (matches.length > 0) {
      return normalizeAmount(matches[0]![1]);
    }
  }
  return null;
}

function parseLineItems(lines: string[]): {
  items: ExtractedLineItem[];
  warnings: string[];
} {
  const headerIndex = lines.findIndex(
    (line) =>
      /description/i.test(line) &&
      /(qty|quantity)/i.test(line) &&
      /(unit|price)/i.test(line),
  );
  if (headerIndex < 0) return { items: [], warnings: ["No line-item table header found"] };

  const items: ExtractedLineItem[] = [];
  const warnings: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (/^(subtotal|tax|discount|shipping|total|amount due|notes?|terms?)\b/i.test(line)) {
      break;
    }
    if (/^(description|qty|quantity|unit price|amount)\b/i.test(line)) continue;

    let match =
      /^(?:\d+[.)]?\s+)?(.+?)\s{2,}([A-Z0-9][A-Z0-9._/-]{1,30})\s{2,}([\d,.]+)\s{2,}([\d,.]+)\s{2,}([\d,.]+)$/i.exec(
        line,
      );
    if (match) {
      const quantity = normalizeQuantity(match[3]);
      const unitPrice = normalizeAmount(match[4]);
      const lineTotal = normalizeAmount(match[5]);
      if (quantity && unitPrice) {
        items.push({
          description: match[1]!.trim(),
          sku: match[2]!.trim(),
          quantity,
          unitPrice,
          taxRatePercent: null,
          lineTotal,
        });
        continue;
      }
    }

    match = /^(?:\d+[.)]?\s+)?(.+?)\s{2,}([\d,.]+)\s{2,}([\d,.]+)\s{2,}([\d,.]+)$/.exec(
      line,
    );
    if (match) {
      const quantity = normalizeQuantity(match[2]);
      const unitPrice = normalizeAmount(match[3]);
      const lineTotal = normalizeAmount(match[4]);
      if (quantity && unitPrice) {
        items.push({
          description: match[1]!.trim(),
          sku: null,
          quantity,
          unitPrice,
          taxRatePercent: null,
          lineTotal,
        });
        continue;
      }
    }
    warnings.push(`Could not parse line item: ${line.slice(0, 120)}`);
  }
  return { items, warnings };
}

function emptyExtraction(notes: string): ExtractedInvoice {
  return {
    invoiceNumber: null,
    vendorName: null,
    vendorEmail: null,
    vendorPhone: null,
    vendorTaxId: null,
    issueDate: null,
    dueDate: null,
    currency: null,
    subtotal: null,
    tax: null,
    discount: null,
    shipping: null,
    total: null,
    poReference: null,
    lineItems: [],
    confidence: 0,
    missingFields: [
      "invoiceNumber",
      "vendorName",
      "issueDate",
      "currency",
      "total",
      "lineItems",
    ],
    notes,
  };
}

function inferCurrency(text: string): string | null {
  const explicit = /currency\s*:\s*([A-Z]{3})\b/i.exec(text);
  if (explicit) return explicit[1]!.toUpperCase();
  if (/₹|\bINR\b/i.test(text)) return "INR";
  if (/\bUSD\b|\$/.test(text)) return "USD";
  if (/\bEUR\b|€/.test(text)) return "EUR";
  if (/\bGBP\b|£/.test(text)) return "GBP";
  return null;
}

/**
 * Deterministic, dependency-light extraction for PDFs with an embedded text
 * layer. This is not OCR and makes no attempt to guess missing values. Images
 * require the configured OpenAI multimodal provider.
 */
export async function localExtractInvoice(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<ExtractionResult> {
  if (input.mimeType !== "application/pdf") {
    const extraction = emptyExtraction(
      "Image OCR is not available without an OpenAI API key. The document is stored securely; enter the invoice fields manually.",
    );
    return {
      extraction,
      engine: "LOCAL_HEURISTIC",
      model: null,
      warning: "Image text extraction requires OPENAI_API_KEY. Manual review is required.",
      rawText: null,
    };
  }

  let rawText = "";
  try {
    rawText = await extractPdfText(input.buffer);
  } catch (error) {
    return {
      extraction: emptyExtraction(
        "The PDF text layer could not be read. The document may be scanned. Manual entry is required.",
      ),
      engine: "LOCAL_HEURISTIC",
      model: null,
      warning: `PDF text extraction failed: ${error instanceof Error ? error.message : "unknown error"}`,
      rawText: null,
    };
  }

  const lines = rawText.split(/\r?\n/).filter((line) => line.trim() !== "");
  const joined = lines.join("\n");

  const invoiceNumber =
    field(lines, [
      /invoice\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]+)/i,
      /invoice\s*[:#]\s*([A-Z0-9][A-Z0-9._/-]+)/i,
    ]) ?? null;
  const vendorName =
    field(lines, [
      /^vendor\s*:\s*(.+)$/i,
      /^supplier\s*:\s*(.+)$/i,
      /^from\s*:\s*(.+)$/i,
      /^bill(?:ed)?\s+from\s*:\s*(.+)$/i,
    ]) ?? null;
  const vendorEmail =
    field(lines, [/(?:vendor\s+)?email\s*:\s*(\S+@\S+\.\S+)/i]) ??
    (/(\S+@\S+\.\S+)/.exec(joined)?.[1] ?? null);
  const vendorPhone = field(lines, [/(?:vendor\s+)?phone\s*:\s*([+\d][\d\s().-]{6,})/i]);
  const vendorTaxId = field(lines, [
    /(?:vendor\s+)?(?:tax\s*id|gstin|vat\s*(?:no|number))\s*:\s*([A-Z0-9-]+)/i,
  ]);
  const issueDate = toIsoDate(
    field(lines, [/invoice\s+date\s*:\s*(.+)$/i, /^date\s*:\s*(.+)$/i]),
  );
  const dueDate = toIsoDate(field(lines, [/due\s+date\s*:\s*(.+)$/i]));
  const currency = inferCurrency(joined);
  const poReference = field(lines, [
    /(?:po|purchase\s+order)\s*(?:reference|ref|no\.?|number|#)?\s*:\s*([A-Z0-9][A-Z0-9._/-]*)/i,
  ]);
  const subtotal = amountField(lines, /^subtotal\b/i);
  const tax = amountField(lines, /^(?:tax|gst|vat)\b/i);
  const discount = amountField(lines, /^discount\b/i);
  const shipping = amountField(lines, /^(?:shipping|freight|delivery)\b/i);
  const total = amountField(lines, /^(?:total|amount\s+due|grand\s+total)\b/i);

  const { items: lineItems, warnings } = parseLineItems(lines);

  const missingFields: string[] = [];
  if (!invoiceNumber) missingFields.push("invoiceNumber");
  if (!vendorName) missingFields.push("vendorName");
  if (!issueDate) missingFields.push("issueDate");
  if (!currency) missingFields.push("currency");
  if (!total) missingFields.push("total");
  if (lineItems.length === 0) missingFields.push("lineItems");

  let confidence = 0;
  for (const present of [invoiceNumber, vendorName, issueDate, currency, total]) {
    if (present) confidence += 16;
  }
  if (lineItems.length > 0) confidence += 20;
  confidence = Math.min(100, confidence);

  const notes: string[] = [];
  if (warnings.length > 0) notes.push(...warnings.slice(0, 5));
  if (subtotal && total) {
    const subtotalMinor = Math.round(Number(subtotal) * 100);
    const taxMinor = Math.round(Number(tax ?? "0") * 100);
    const shippingMinor = Math.round(Number(shipping ?? "0") * 100);
    const discountMinor = Math.round(Number(discount ?? "0") * 100);
    const expected = subtotalMinor + taxMinor + shippingMinor - discountMinor;
    if (Math.abs(expected - Math.round(Number(total) * 100)) > 1) {
      notes.push(
        "Arithmetic check failed: subtotal + tax + shipping - discount does not equal the stated total.",
      );
      confidence = Math.max(0, confidence - 15);
    }
  }
  if (lineItems.length > 0 && subtotal) {
    const lineSum = lineItems.reduce(
      (sum, item) => sum + Math.round(Number(item.lineTotal ?? "0") * 100),
      0,
    );
    if (lineSum > 0 && Math.abs(lineSum - Math.round(Number(subtotal) * 100)) > 1) {
      notes.push("Line-item totals do not add up to the stated subtotal.");
      confidence = Math.max(0, confidence - 10);
    }
  }
  notes.push(
    "Extracted by the local PDF text parser (no AI provider configured). Verify every field before approval.",
  );

  const extraction: ExtractedInvoice = {
    invoiceNumber,
    vendorName,
    vendorEmail,
    vendorPhone,
    vendorTaxId,
    issueDate,
    dueDate,
    currency,
    subtotal,
    tax,
    discount,
    shipping,
    total,
    poReference,
    lineItems,
    confidence,
    missingFields,
    notes: notes.join(" "),
  };

  return {
    extraction,
    engine: "LOCAL_HEURISTIC",
    model: null,
    warning:
      missingFields.length > 0
        ? `Missing or unreadable fields: ${missingFields.join(", ")}. Manual review required.`
        : null,
    rawText,
  };
}

export { normalizeAmount, normalizeQuantity, normalizeTaxPercent, toIsoDate };
