import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoneyForPdf, formatQuantityPlain } from "@/lib/money";
import type { EvidenceReport, EvidenceEvent, Discrepancy, EvidenceDocument } from "@/lib/db/schema";

type PdfData = {
  organizationName: string;
  invoiceNumber: string;
  vendorName: string;
  poNumber: string;
  receiptNumbers: string[];
  currency: string;
  report: EvidenceReport;
  discrepancies: Discrepancy[];
  timeline: EvidenceEvent[];
  documents: EvidenceDocument[];
  runCreatedAt: Date;
  potentialImpactMinor: bigint;
  potentialQuantityExposureMinor: bigint;
  orderedQtyMilli: bigint;
  receivedQtyMilli: bigint;
  usableQtyMilli: bigint;
  shortQtyMilli: bigint;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

function ascii(value: string): string {
  return value
    .replace(/₹/g, "INR ")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n]/g, "");
}

class PdfBuilder {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  y = PAGE_HEIGHT - MARGIN;
  private pageNumber = 0;
  private pageNumbers: PDFPage[] = [];

  async init(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.addPage();
  }

  private addPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pageNumbers.push(this.page);
    this.pageNumber += 1;
    this.y = PAGE_HEIGHT - MARGIN;
    this.page.drawText("ReconPay AI — Evidence Report", {
      x: MARGIN,
      y: PAGE_HEIGHT - 30,
      size: 8,
      font: this.font,
      color: rgb(0.42, 0.45, 0.5),
    });
    this.page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 38 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 38 },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.9),
    });
  }

  ensureSpace(needed: number): void {
    if (this.y - needed < MARGIN + 20) this.addPage();
  }

  heading(text: string, size = 16): void {
    this.ensureSpace(size + 14);
    this.y -= size + 6;
    this.page.drawText(ascii(text), {
      x: MARGIN,
      y: this.y,
      size,
      font: this.bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    this.y -= 6;
  }

  subheading(text: string): void {
    this.heading(text, 11);
  }

  text(text: string, options: { size?: number; color?: [number, number, number]; gap?: number } = {}): void {
    const size = options.size ?? 9.5;
    const color = options.color ?? [0.18, 0.21, 0.27];
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
    const paragraphs = ascii(text).split("\n");
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === "") {
        this.y -= size * 0.8;
        continue;
      }
      const words = paragraph.split(/\s+/);
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          this.ensureSpace(size + 4);
          this.page.drawText(line, {
            x: MARGIN,
            y: this.y,
            size,
            font: this.font,
            color: rgb(...color),
          });
          this.y -= size + 3;
          this.ensureSpace(size + 4);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) {
        this.ensureSpace(size + 4);
        this.page.drawText(line, {
          x: MARGIN,
          y: this.y,
          size,
          font: this.font,
          color: rgb(...color),
        });
        this.y -= size + 3;
      }
    }
    this.y -= options.gap ?? 4;
  }

  keyValue(pairs: [string, string][]): void {
    for (const [key, value] of pairs) {
      this.ensureSpace(15);
      this.page.drawText(ascii(key), {
        x: MARGIN,
        y: this.y,
        size: 9,
        font: this.bold,
        color: rgb(0.3, 0.34, 0.4),
      });
      this.page.drawText(ascii(value), {
        x: MARGIN + 120,
        y: this.y,
        size: 9,
        font: this.font,
        color: rgb(0.1, 0.13, 0.18),
      });
      this.y -= 14;
    }
    this.y -= 4;
  }

  rule(): void {
    this.ensureSpace(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: rgb(0.87, 0.89, 0.92),
    });
    this.y -= 12;
  }

  bullets(items: string[]): void {
    for (const item of items) {
      this.ensureSpace(16);
      this.page.drawText("-", {
        x: MARGIN,
        y: this.y,
        size: 9.5,
        font: this.font,
        color: rgb(0.3, 0.34, 0.4),
      });
      this.y -= 0;
      const maxWidth = PAGE_WIDTH - MARGIN * 2 - 12;
      const words = ascii(item).split(/\s+/);
      let line = "";
      let first = true;
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.font.widthOfTextAtSize(candidate, 9.5) > maxWidth && line) {
          this.page.drawText(line, {
            x: MARGIN + 12,
            y: this.y,
            size: 9.5,
            font: this.font,
            color: rgb(0.18, 0.21, 0.27),
          });
          this.y -= 12;
          this.ensureSpace(14);
          line = word;
          first = false;
        } else {
          line = candidate;
        }
      }
      if (line) {
        this.page.drawText(line, {
          x: MARGIN + 12,
          y: this.y,
          size: 9.5,
          font: this.font,
          color: rgb(0.18, 0.21, 0.27),
        });
      }
      if (first) {
        this.y -= 14;
      } else {
        this.y -= 12;
      }
    }
    this.y -= 4;
  }

  async finish(): Promise<Uint8Array> {
    this.pageNumbers.forEach((page, index) => {
      const label = `Page ${index + 1} of ${this.pageNumbers.length}`;
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN - this.font.widthOfTextAtSize(label, 8),
        y: 24,
        size: 8,
        font: this.font,
        color: rgb(0.45, 0.48, 0.54),
      });
      page.drawText("Generated from stored ReconPay AI records. Not a legal or tax determination.", {
        x: MARGIN,
        y: 24,
        size: 7.5,
        font: this.font,
        color: rgb(0.45, 0.48, 0.54),
      });
    });
    return this.doc.save();
  }
}

export async function buildEvidencePdf(data: PdfData): Promise<Uint8Array> {
  const pdf = new PdfBuilder();
  await pdf.init();
  pdf.heading("Evidence report", 20);
  pdf.text("Three-way reconciliation and dispute evidence pack", {
    size: 10,
    color: [0.42, 0.45, 0.5],
  });
  pdf.keyValue([
    ["Organization", data.organizationName],
    ["Invoice", data.invoiceNumber],
    ["Vendor", data.vendorName],
    ["Purchase order", data.poNumber],
    ["Goods receipts", data.receiptNumbers.join(", ") || "None linked"],
    ["Report generated", new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"],
    ["Summary generator", data.report.generatedBy === "OPENAI" ? `AI (${data.report.model ?? "OpenAI"})` : "Deterministic rules"],
  ]);

  pdf.rule();
  pdf.subheading("Reconciliation quantities");
  pdf.keyValue([
    ["Ordered", formatQuantityPlain(data.orderedQtyMilli)],
    ["Received", formatQuantityPlain(data.receivedQtyMilli)],
    ["Usable", formatQuantityPlain(data.usableQtyMilli)],
    ["Short", formatQuantityPlain(data.shortQtyMilli)],
    ["Potential quantity exposure", formatMoneyForPdf(data.potentialQuantityExposureMinor, data.currency)],
    ["Aggregate flagged exposure", formatMoneyForPdf(data.potentialImpactMinor, data.currency)],
  ]);
  pdf.text(
    "Aggregate flagged exposure is the sum of non-overlapping line-level quantity and price exposure plus excess tax. It is not a determination that the vendor owes this amount and does not account for contract terms, credits, accepted partial deliveries or tax treatment.",
    { size: 8.5, color: [0.4, 0.43, 0.49] },
  );

  pdf.rule();
  pdf.subheading("Discrepancy summary");
  pdf.text(data.report.discrepancySummary);
  pdf.subheading("Evidence summary");
  pdf.text(data.report.evidenceSummary);
  pdf.subheading("Chronological explanation");
  pdf.text(data.report.timelineSummary);

  pdf.rule();
  pdf.subheading("Recorded discrepancies");
  if (data.discrepancies.length === 0) {
    pdf.text("No discrepancy rules fired for this reconciliation.");
  } else {
    for (const discrepancy of data.discrepancies) {
      pdf.ensureSpace(60);
      pdf.text(`${discrepancy.severity} | ${discrepancy.ruleCode} | ${discrepancy.status}`, {
        size: 8,
        color: [0.42, 0.45, 0.5],
      });
      pdf.text(discrepancy.title, { size: 10.5, color: [0.06, 0.09, 0.16] });
      pdf.text(discrepancy.description, { size: 8.8 });
      pdf.text(discrepancy.calculation, { size: 8.5, color: [0.25, 0.28, 0.34] });
      if (discrepancy.impactMinor !== null) {
        pdf.text(
          `Potential impact: ${formatMoneyForPdf(discrepancy.impactMinor, discrepancy.currency)}`,
          { size: 8.5, color: [0.55, 0.2, 0.15] },
        );
      }
      if (discrepancy.resolutionNote) {
        pdf.text(`Reviewer note: ${discrepancy.resolutionNote}`, { size: 8.5 });
      }
      pdf.y -= 4;
    }
  }

  pdf.rule();
  pdf.subheading("Suggested next actions");
  pdf.bullets(data.report.nextActions);

  pdf.subheading("Missing evidence checklist");
  pdf.bullets(
    data.report.missingEvidence.length > 0
      ? data.report.missingEvidence
      : ["No required evidence items were identified as missing by the generator."],
  );

  pdf.rule();
  pdf.subheading("Source documents");
  if (data.documents.length === 0) {
    pdf.text("No supporting documents are stored for this reconciliation.");
  } else {
    for (const document of data.documents) {
      pdf.ensureSpace(34);
      pdf.text(`${document.title} (${document.documentType})`, { size: 9.5 });
      pdf.text(
        `File: ${document.fileName} | MIME: ${document.mimeType} | SHA-256: ${document.sha256.slice(0, 24)}... | Document ID: ${document.id}`,
        { size: 8, color: [0.42, 0.45, 0.5] },
      );
      pdf.y -= 2;
    }
  }

  pdf.rule();
  pdf.subheading("Evidence timeline");
  if (data.timeline.length === 0) {
    pdf.text("No events recorded.");
  } else {
    for (const event of [...data.timeline].reverse()) {
      pdf.ensureSpace(36);
      pdf.text(
        `${event.occurredAt.toISOString().replace("T", " ").slice(0, 19)} UTC | ${event.eventType}`,
        { size: 8, color: [0.42, 0.45, 0.5] },
      );
      pdf.text(event.description, { size: 9 });
      pdf.text(`Actor: ${event.actorLabel} | Source: ${event.source} | Event ID: ${event.id}`, {
        size: 7.8,
        color: [0.45, 0.48, 0.54],
      });
      pdf.y -= 3;
    }
  }

  pdf.rule();
  pdf.text(
    `Report ID: ${data.report.id} | Reconciliation run: ${data.report.runId} | Generated: ${data.report.createdAt.toISOString()}`,
    { size: 7.8, color: [0.45, 0.48, 0.54] },
  );

  return pdf.finish();
}
