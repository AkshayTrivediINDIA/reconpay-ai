import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatMinor, formatQuantityPlain } from "@/lib/money";
import type {
  EvidenceDocument,
  EvidenceEvent,
  EvidenceReport,
  Discrepancy,
} from "@/lib/db/schema";

type PdfData = {
  organizationName: string;
  organizationIsDemo: boolean;
  appUrl: string;
  invoiceNumber: string;
  invoiceTotalMinor: bigint;
  vendorName: string;
  poNumber: string;
  receiptNumbers: string[];
  currency: string;
  runStatus: string;
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

/* ---------------------------------------------------------------------------
 * Page geometry and palette
 * ------------------------------------------------------------------------- */

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 74;
const BODY_TOP = 772;

const NAVY = rgb(0.043, 0.071, 0.125);
const NAVY_SOFT = rgb(0.086, 0.114, 0.184);
const PRIMARY = rgb(0.263, 0.22, 0.792);
const PRIMARY_SOFT = rgb(0.933, 0.933, 0.996);
const SLATE_900 = rgb(0.067, 0.094, 0.153);
const SLATE_700 = rgb(0.2, 0.255, 0.333);
const SLATE_600 = rgb(0.278, 0.333, 0.412);
const SLATE_500 = rgb(0.392, 0.455, 0.545);
const SLATE_400 = rgb(0.58, 0.639, 0.722);
const BORDER = rgb(0.886, 0.91, 0.941);
const BORDER_SOFT = rgb(0.929, 0.945, 0.965);
const SURFACE = rgb(0.973, 0.98, 0.988);
const SURFACE_ALT = rgb(0.945, 0.961, 0.976);
const WHITE = rgb(1, 1, 1);
const SUCCESS = rgb(0.024, 0.463, 0.278);
const SUCCESS_BG = rgb(0.925, 0.992, 0.953);
const WARNING = rgb(0.71, 0.278, 0.031);
const WARNING_BG = rgb(1, 0.98, 0.922);
const DANGER = rgb(0.706, 0.137, 0.094);
const DANGER_BG = rgb(0.996, 0.953, 0.949);
const INFO = rgb(0.09, 0.361, 0.827);
const INFO_BG = rgb(0.937, 0.973, 1);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SECTIONS = [
  "Reconciliation quantities",
  "Assessment summary",
  "Recorded discrepancies",
  "Suggested next actions",
  "Missing evidence checklist",
  "Source documents",
  "Evidence timeline",
  "Document control",
] as const;

/* ---------------------------------------------------------------------------
 * Text helpers
 * ------------------------------------------------------------------------- */

function clean(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}\u{fe0f}]/gu, "")
    .replace(/\ufffd/g, "");
}

function formatDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = MONTHS[value.getUTCMonth()] ?? "Jan";
  const year = value.getUTCFullYear();
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* ---------------------------------------------------------------------------
 * Font loading (IBM Plex Sans + Plex Mono, SIL OFL, bundled with the app)
 * ------------------------------------------------------------------------- */

const FONT_FILES = {
  regular: "IBMPlexSans-Regular.ttf",
  medium: "IBMPlexSans-Medium.ttf",
  semibold: "IBMPlexSans-SemiBold.ttf",
  bold: "IBMPlexSans-Bold.ttf",
  italic: "IBMPlexSans-Italic.ttf",
  mono: "IBMPlexMono-Regular.ttf",
  monoSemibold: "IBMPlexMono-SemiBold.ttf",
} as const;

const fontBytesCache = new Map<string, Uint8Array>();

function readFontBytes(fileName: string): Uint8Array {
  const cached = fontBytesCache.get(fileName);
  if (cached) return cached;
  const filePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "reports",
    "fonts",
    fileName,
  );
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  fontBytesCache.set(fileName, bytes);
  return bytes;
}

type Fonts = {
  regular: PDFFont;
  medium: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
  monoSemibold: PDFFont;
};

/* ---------------------------------------------------------------------------
 * Document builder
 * ------------------------------------------------------------------------- */

class EvidencePdf {
  private doc!: PDFDocument;
  private fonts!: Fonts;
  private page!: PDFPage;
  private pages: PDFPage[] = [];
  private y = BODY_TOP;
  private sectionPages: number[] = [];

  constructor(
    private readonly meta: {
      organizationName: string;
      invoiceNumber: string;
      appUrl: string;
      isDemo: boolean;
      generatedAt: Date;
    },
  ) {}

  private async init(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.doc.registerFontkit(fontkit);
    const embed = async (fileName: string) =>
      this.doc.embedFont(readFontBytes(fileName), { subset: true });
    this.fonts = {
      regular: await embed(FONT_FILES.regular),
      medium: await embed(FONT_FILES.medium),
      semibold: await embed(FONT_FILES.semibold),
      bold: await embed(FONT_FILES.bold),
      italic: await embed(FONT_FILES.italic),
      mono: await embed(FONT_FILES.mono),
      monoSemibold: await embed(FONT_FILES.monoSemibold),
    };
    this.doc.setTitle(`ReconPay AI Evidence Report · ${this.meta.invoiceNumber}`);
    this.doc.setAuthor("ReconPay AI");
    this.doc.setCreator("ReconPay AI · Financial operations");
    this.doc.setProducer("ReconPay AI");
    this.doc.setSubject("Three-way reconciliation and dispute evidence pack");
    this.doc.setKeywords([
      "ReconPay",
      "evidence",
      "three-way match",
      this.meta.invoiceNumber,
    ]);
    this.addPage("cover");
  }

  /* ------------------------------ primitives ----------------------------- */

  private addPage(kind: "cover" | "body"): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.drawWatermark();
    if (kind === "body") {
      this.drawContinuationHeader();
      this.y = BODY_TOP;
    }
  }

  private drawWatermark(): void {
    const label = this.meta.isDemo ? "DEMO · CONFIDENTIAL" : "CONFIDENTIAL";
    const size = 38;
    const width = this.textWidth(label, this.fonts.bold, size);
    const angle = (34 * Math.PI) / 180;
    const rotatedWidth = width * Math.cos(angle);
    const rotatedHeight = width * Math.sin(angle);
    this.page.drawText(label, {
      x: (PAGE_WIDTH - rotatedWidth) / 2,
      y: (PAGE_HEIGHT - rotatedHeight) / 2,
      size,
      font: this.fonts.bold,
      color: SLATE_900,
      opacity: 0.035,
      rotate: degrees(34),
    });
  }

  private ensure(space: number): void {
    if (this.y - space < CONTENT_BOTTOM) {
      this.addPage("body");
    }
  }

  private textWidth(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  private draw(
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color: RGB,
  ): void {
    this.page.drawText(clean(text), { x, y, size, font, color });
  }

  private drawRight(
    text: string,
    xRight: number,
    y: number,
    font: PDFFont,
    size: number,
    color: RGB,
  ): void {
    const value = clean(text);
    this.page.drawText(value, {
      x: xRight - this.textWidth(value, font, size),
      y,
      size,
      font,
      color,
    });
  }

  private trackedWidth(
    text: string,
    font: PDFFont,
    size: number,
    _tracking: number,
  ): number {
    // Letter-spacing is intentionally not applied: drawing glyph-by-glyph
    // breaks text selection and copy/paste in the exported PDF. Visual
    // hierarchy comes from weight, colour and uppercase instead.
    return this.textWidth(clean(text), font, size);
  }

  private drawTracked(
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color: RGB,
    _tracking: number,
  ): number {
    const value = clean(text);
    this.page.drawText(value, { x, y, size, font, color });
    return this.textWidth(value, font, size);
  }

  private drawTrackedRight(
    text: string,
    xRight: number,
    y: number,
    font: PDFFont,
    size: number,
    color: RGB,
    tracking: number,
  ): void {
    this.drawTracked(
      text,
      xRight - this.trackedWidth(text, font, size, tracking),
      y,
      font,
      size,
      color,
      tracking,
    );
  }

  private truncate(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
  ): string {
    const value = clean(text);
    if (this.textWidth(value, font, size) <= maxWidth) return value;
    let candidate = value;
    while (
      candidate.length > 1 &&
      this.textWidth(`${candidate}…`, font, size) > maxWidth
    ) {
      candidate = candidate.slice(0, -1);
    }
    return `${candidate}…`;
  }

  private wrap(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    for (const paragraph of clean(text).split("\n")) {
      if (paragraph.trim() === "") {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.textWidth(candidate, font, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines.length > 0 ? lines : [""];
  }

  private drawLines(
    lines: string[],
    x: number,
    top: number,
    font: PDFFont,
    size: number,
    color: RGB,
    leading: number,
  ): number {
    let cursor = top;
    for (const line of lines) {
      this.draw(line, x, cursor - size, font, size, color);
      cursor -= leading;
    }
    return cursor;
  }

  /* ------------------------------- chrome -------------------------------- */

  private drawBrandMark(
    page: PDFPage,
    centerX: number,
    centerY: number,
    radius: number,
    color: RGB,
    weight = 1.2,
  ): void {
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = (-90 + index * 60) * (Math.PI / 180);
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    });
    for (let index = 0; index < points.length; index += 1) {
      const from = points[index]!;
      const to = points[(index + 1) % points.length]!;
      page.drawLine({
        start: from,
        end: to,
        thickness: weight,
        color,
      });
    }
    page.drawLine({
      start: { x: centerX - radius * 0.42, y: centerY + radius * 0.02 },
      end: { x: centerX - radius * 0.08, y: centerY - radius * 0.34 },
      thickness: weight,
      color,
    });
    page.drawLine({
      start: { x: centerX - radius * 0.08, y: centerY - radius * 0.34 },
      end: { x: centerX + radius * 0.48, y: centerY + radius * 0.28 },
      thickness: weight,
      color,
    });
  }

  private drawContinuationHeader(): void {
    this.drawBrandMark(this.page, MARGIN + 6, PAGE_HEIGHT - 45, 6, PRIMARY, 1);
    this.draw(
      "ReconPay AI",
      MARGIN + 17,
      PAGE_HEIGHT - 48,
      this.fonts.semibold,
      8.4,
      SLATE_900,
    );
    this.draw(
      "Evidence report",
      MARGIN + 17,
      PAGE_HEIGHT - 58,
      this.fonts.regular,
      6.6,
      SLATE_500,
    );
    this.drawRight(
      `${this.meta.invoiceNumber} · ${this.meta.organizationName}`,
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 48,
      this.fonts.medium,
      7.4,
      SLATE_500,
    );
    this.page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 68 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 68 },
      thickness: 0.6,
      color: BORDER,
    });
  }

  private drawFooter(): void {
    const total = this.pages.length;
    const generated = formatDate(this.meta.generatedAt);
    this.pages.forEach((page, index) => {
      const pageNumber = index + 1;
      page.drawLine({
        start: { x: MARGIN, y: 64 },
        end: { x: PAGE_WIDTH - MARGIN, y: 64 },
        thickness: 0.6,
        color: BORDER,
      });
      this.drawBrandMark(page, MARGIN + 5, 50, 4.6, SLATE_400, 0.9);
      page.drawText("ReconPay AI", {
        x: MARGIN + 15,
        y: 47,
        size: 7.2,
        font: this.fonts.semibold,
        color: SLATE_500,
      });
      page.drawText("· Evidence report · Confidential", {
        x: MARGIN + 15 + this.textWidth("ReconPay AI", this.fonts.semibold, 7.2) + 4,
        y: 47,
        size: 7.2,
        font: this.fonts.regular,
        color: SLATE_400,
      });
      const pageLabel = `Page ${pageNumber} of ${total}`;
      page.drawText(pageLabel, {
        x:
          PAGE_WIDTH - MARGIN - this.textWidth(pageLabel, this.fonts.mono, 7.2),
        y: 47,
        size: 7.2,
        font: this.fonts.mono,
        color: SLATE_500,
      });
      page.drawText(`Generated ${generated}`, {
        x: MARGIN,
        y: 37,
        size: 6.5,
        font: this.fonts.mono,
        color: SLATE_400,
      });
      page.drawText(this.meta.appUrl, {
        x:
          PAGE_WIDTH -
          MARGIN -
          this.textWidth(this.meta.appUrl, this.fonts.regular, 6.5),
        y: 37,
        size: 6.5,
        font: this.fonts.regular,
        color: SLATE_400,
      });
      page.drawText(
        "Not a legal, tax or payment determination. Amounts are exact integer minor units. All timestamps UTC.",
        {
          x: MARGIN,
          y: 27,
          size: 6.2,
          font: this.fonts.regular,
          color: SLATE_400,
        },
      );
    });
  }

  /* ------------------------------ components ----------------------------- */

  private chip(
    text: string,
    x: number,
    top: number,
    options: {
      fg: RGB;
      bg: RGB;
      border?: RGB;
      size?: number;
      font?: PDFFont;
    },
  ): number {
    const size = options.size ?? 6.6;
    const font = options.font ?? this.fonts.semibold;
    const label = clean(text).toUpperCase();
    const paddingX = 5.5;
    const height = 13;
    const width = this.textWidth(label, font, size) + paddingX * 2;
    this.page.drawRectangle({
      x,
      y: top - height,
      width,
      height,
      color: options.bg,
      borderColor: options.border ?? options.bg,
      borderWidth: options.border ? 0.6 : 0,
    });
    this.draw(label, x + paddingX, top - height + 3.7, font, size, options.fg);
    return width;
  }

  private statusChip(
    label: string,
    x: number,
    top: number,
    tone: "success" | "warning" | "danger" | "info" | "neutral",
  ): number {
    const palette = {
      success: { fg: SUCCESS, bg: SUCCESS_BG },
      warning: { fg: WARNING, bg: WARNING_BG },
      danger: { fg: DANGER, bg: DANGER_BG },
      info: { fg: INFO, bg: INFO_BG },
      neutral: { fg: SLATE_600, bg: SURFACE_ALT },
    }[tone];
    return this.chip(label, x, top, { ...palette, size: 6.4 });
  }

  private chipWidth(text: string, size = 6.6): number {
    return (
      this.textWidth(clean(text).toUpperCase(), this.fonts.semibold, size) + 11
    );
  }

  private sectionTitle(index: number): void {
    const title = SECTIONS[index];
    if (!title) throw new Error(`Unknown PDF section index ${index}`);
    this.ensure(46);
    this.sectionPages[index] = this.pages.length;
    this.y -= 8;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 1,
      width: 3,
      height: 10,
      color: PRIMARY,
    });
    const label = `${String(index + 1).padStart(2, "0")}  ${title.toUpperCase()}`;
    const width = this.drawTracked(
      label,
      MARGIN + 10,
      this.y,
      this.fonts.semibold,
      8,
      SLATE_900,
      1.1,
    );
    const lineStart = MARGIN + 10 + width + 10;
    if (lineStart < PAGE_WIDTH - MARGIN) {
      this.page.drawLine({
        start: { x: lineStart, y: this.y + 3 },
        end: { x: PAGE_WIDTH - MARGIN, y: this.y + 3 },
        thickness: 0.6,
        color: BORDER_SOFT,
      });
    }
    this.y -= 18;
  }

  private contents(pages: number[] | null): void {
    this.y = BODY_TOP;
    this.drawTracked(
      "CONTENTS",
      MARGIN,
      this.y,
      this.fonts.semibold,
      9,
      SLATE_900,
      1.2,
    );
    this.drawRight(
      `Invoice ${this.meta.invoiceNumber} · Three-way reconciliation`,
      PAGE_WIDTH - MARGIN,
      this.y,
      this.fonts.regular,
      7.4,
      SLATE_500,
    );
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 10 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y - 10 },
      thickness: 0.7,
      color: BORDER,
    });
    this.y -= 34;

    SECTIONS.forEach((title, index) => {
      const rowTop = this.y;
      this.draw(
        String(index + 1).padStart(2, "0"),
        MARGIN,
        rowTop,
        this.fonts.mono,
        8.2,
        PRIMARY,
      );
      this.draw(
        title,
        MARGIN + 26,
        rowTop,
        this.fonts.medium,
        9.4,
        SLATE_900,
      );
      const titleWidth = this.textWidth(title, this.fonts.medium, 9.4);
      const pageLabel = pages?.[index] ? String(pages[index]) : "—";
      const pageWidth = this.textWidth(pageLabel, this.fonts.mono, 8.4);
      const leaderStart = MARGIN + 26 + titleWidth + 8;
      const leaderEnd = PAGE_WIDTH - MARGIN - pageWidth - 8;
      if (leaderEnd > leaderStart) {
        this.page.drawLine({
          start: { x: leaderStart, y: rowTop + 2.5 },
          end: { x: leaderEnd, y: rowTop + 2.5 },
          thickness: 0.6,
          color: SLATE_400,
          dashArray: [0.8, 2.6],
        });
      }
      this.drawRight(
        pageLabel,
        PAGE_WIDTH - MARGIN,
        rowTop,
        this.fonts.mono,
        8.4,
        SLATE_600,
      );
      this.y -= 26;
    });

    this.y -= 18;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.6,
      color: BORDER_SOFT,
    });
    this.y -= 20;
    this.drawTracked(
      "ABOUT THIS PACK",
      MARGIN,
      this.y,
      this.fonts.semibold,
      6.2,
      SLATE_500,
      1,
    );
    this.y -= 14;
    this.paragraph(
      "This pack records one deterministic three-way match between a purchase order, its goods receipts and a vendor invoice. Findings are review signals: they do not establish vendor liability, calculate a revised payable or authorise payment. Every figure is reproduced from stored records.",
      { size: 8.2, color: SLATE_600, leading: 11.2, gap: 4 },
    );

    this.y -= 10;
    const facts: [string, string][] = [
      ["Prepared for", this.meta.organizationName],
      ["Prepared by", "ReconPay AI · automated evidence service"],
      ["Generated", formatDate(this.meta.generatedAt)],
      ["Classification", this.meta.isDemo ? "Demo workspace · Confidential" : "Confidential"],
    ];
    facts.forEach(([label, value]) => {
      this.drawTracked(
        label.toUpperCase(),
        MARGIN,
        this.y,
        this.fonts.semibold,
        5.8,
        SLATE_400,
        0.8,
      );
      this.draw(value, MARGIN + 92, this.y, this.fonts.medium, 8.2, SLATE_700);
      this.y -= 15;
    });
  }

  getSectionPages(): number[] {
    return this.sectionPages;
  }

  private subLabel(text: string, color: RGB = SLATE_500): void {
    this.ensure(24);
    this.drawTracked(
      text.toUpperCase(),
      MARGIN,
      this.y,
      this.fonts.semibold,
      6.4,
      color,
      1,
    );
    this.y -= 12;
  }

  private paragraph(
    text: string,
    options: {
      size?: number;
      color?: RGB;
      leading?: number;
      gap?: number;
      x?: number;
      width?: number;
      font?: PDFFont;
    } = {},
  ): void {
    const size = options.size ?? 8.9;
    const leading = options.leading ?? size + 2.9;
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;
    const font = options.font ?? this.fonts.regular;
    const color = options.color ?? SLATE_600;
    const lines = this.wrap(text, font, size, width);
    for (const line of lines) {
      if (line === "") {
        this.y -= leading * 0.6;
        continue;
      }
      this.ensure(leading);
      this.draw(line, x, this.y - size, font, size, color);
      this.y -= leading;
    }
    this.y -= options.gap ?? 6;
  }

  private bullets(items: string[]): void {
    for (const item of items) {
      const lines = this.wrap(item, this.fonts.regular, 8.8, CONTENT_WIDTH - 16);
      this.ensure(lines.length * 11.6 + 6);
      this.page.drawCircle({
        x: MARGIN + 3.4,
        y: this.y - 5.2,
        size: 1.5,
        color: PRIMARY,
      });
      this.y = this.drawLines(
        lines,
        MARGIN + 13,
        this.y,
        this.fonts.regular,
        8.8,
        SLATE_600,
        11.6,
      );
      this.y -= 3.4;
    }
    this.y -= 5;
  }

  private note(text: string): void {
    const lines = this.wrap(text, this.fonts.regular, 7.7, CONTENT_WIDTH - 16);
    const height = lines.length * 10.4 + 12;
    this.ensure(height + 4);
    const top = this.y;
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: SURFACE,
      borderColor: BORDER_SOFT,
      borderWidth: 0.6,
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: 2.5,
      height,
      color: SLATE_400,
    });
    this.drawLines(
      lines,
      MARGIN + 11,
      top - 6,
      this.fonts.regular,
      7.7,
      SLATE_500,
      10.4,
    );
    this.y = top - height - 8;
  }

  private table(options: {
    headers: { label: string; align?: "left" | "right" }[];
    rows: {
      cells: string[];
      mono?: boolean;
      tone?: "danger" | "success" | "default";
    }[];
  }): void {
    const columns = options.headers.length;
    const width = CONTENT_WIDTH / columns;
    const headerHeight = 20;
    const rowHeight = 19;
    this.ensure(headerHeight + rowHeight * Math.min(2, options.rows.length) + 6);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - headerHeight,
      width: CONTENT_WIDTH,
      height: headerHeight,
      color: SURFACE_ALT,
    });
    options.headers.forEach((header, index) => {
      const x = MARGIN + index * width + 8;
      if ((header.align ?? "left") === "right") {
        this.drawTrackedRight(
          header.label.toUpperCase(),
          MARGIN + (index + 1) * width - 8,
          this.y - headerHeight + 7,
          this.fonts.semibold,
          6.2,
          SLATE_500,
          0.9,
        );
      } else {
        this.drawTracked(
          header.label.toUpperCase(),
          x,
          this.y - headerHeight + 7,
          this.fonts.semibold,
          6.2,
          SLATE_500,
          0.9,
        );
      }
    });
    this.y -= headerHeight;

    options.rows.forEach((row, rowIndex) => {
      this.ensure(rowHeight);
      const isLast = rowIndex === options.rows.length - 1;
      if (row.tone === "danger") {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - rowHeight,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: DANGER_BG,
        });
      } else if (rowIndex % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN,
          y: this.y - rowHeight,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: SURFACE,
        });
      }
      const color =
        row.tone === "danger"
          ? DANGER
          : row.tone === "success"
            ? SUCCESS
            : SLATE_700;
      const font = row.mono ? this.fonts.mono : this.fonts.regular;
      row.cells.forEach((cell, index) => {
        const header = options.headers[index];
        const maxWidth = width - 16;
        const value = this.truncate(cell, font, 8.5, maxWidth);
        if ((header?.align ?? "left") === "right") {
          this.drawRight(
            value,
            MARGIN + (index + 1) * width - 8,
            this.y - rowHeight + 6,
            font,
            8.5,
            color,
          );
        } else {
          this.draw(
            value,
            MARGIN + index * width + 8,
            this.y - rowHeight + 6,
            font,
            8.5,
            color,
          );
        }
      });
      if (!isLast || row.tone === "danger") {
        this.page.drawLine({
          start: { x: MARGIN, y: this.y - rowHeight },
          end: { x: PAGE_WIDTH - MARGIN, y: this.y - rowHeight },
          thickness: 0.5,
          color: row.tone === "danger" ? rgb(0.98, 0.886, 0.878) : BORDER_SOFT,
        });
      }
      this.y -= rowHeight;
    });
    this.y -= 10;
  }

  private rows(pairs: [string, string, "default" | "danger" | "success"][]): void {
    this.table({
      headers: [{ label: "Field" }, { label: "Value", align: "right" }],
      rows: pairs.map(([key, value, tone]) => ({
        cells: [key, value],
        mono: true,
        tone,
      })),
    });
  }

  /* --------------------------------- cover ------------------------------- */

  private cover(data: PdfData): void {
    const bandHeight = 164;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - bandHeight,
      width: PAGE_WIDTH,
      height: bandHeight,
      color: NAVY,
    });
    this.page.drawRectangle({
      x: PAGE_WIDTH - 150,
      y: PAGE_HEIGHT - bandHeight,
      width: 150,
      height: bandHeight,
      color: NAVY_SOFT,
    });
    this.page.drawRectangle({
      x: PAGE_WIDTH - 150,
      y: PAGE_HEIGHT - bandHeight,
      width: 2,
      height: bandHeight,
      color: PRIMARY,
    });

    this.drawBrandMark(this.page, MARGIN + 12, PAGE_HEIGHT - 50, 12, WHITE, 1.1);
    this.draw(
      "ReconPay",
      MARGIN + 32,
      PAGE_HEIGHT - 55,
      this.fonts.bold,
      16,
      WHITE,
    );
    this.draw(
      "AI",
      MARGIN + 32 + this.textWidth("ReconPay ", this.fonts.bold, 16) + 2,
      PAGE_HEIGHT - 55,
      this.fonts.regular,
      16,
      rgb(0.78, 0.8, 0.86),
    );
    this.drawTracked(
      "FINANCIAL OPERATIONS",
      MARGIN + 32,
      PAGE_HEIGHT - 68,
      this.fonts.medium,
      5.9,
      rgb(0.65, 0.7, 0.8),
      1.5,
    );

    this.drawTrackedRight(
      "EVIDENCE REPORT",
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 47,
      this.fonts.semibold,
      8.6,
      WHITE,
      1.9,
    );
    this.drawRight(
      "Three-way reconciliation pack",
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 60,
      this.fonts.regular,
      7.4,
      rgb(0.68, 0.73, 0.82),
    );

    this.page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 92 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 92 },
      thickness: 0.6,
      color: rgb(0.2, 0.24, 0.33),
    });

    this.drawTracked(
      "DOCUMENT REFERENCE",
      MARGIN,
      PAGE_HEIGHT - 112,
      this.fonts.medium,
      5.8,
      rgb(0.6, 0.66, 0.76),
      1.3,
    );
    this.draw(
      `RP-EVD-${data.invoiceNumber}-${data.report.id.slice(0, 8).toUpperCase()}`,
      MARGIN,
      PAGE_HEIGHT - 128,
      this.fonts.mono,
      8.6,
      WHITE,
    );
    this.drawRight(
      `Reconciliation run ${data.report.runId.slice(0, 8)}`,
      PAGE_WIDTH - MARGIN,
      PAGE_HEIGHT - 128,
      this.fonts.mono,
      7.4,
      rgb(0.68, 0.73, 0.82),
    );

    // Title block
    this.y = PAGE_HEIGHT - bandHeight - 38;
    this.drawTracked(
      "RECONCILIATION EVIDENCE",
      MARGIN,
      this.y,
      this.fonts.semibold,
      6.6,
      PRIMARY,
      1.4,
    );

    this.y -= 30;
    this.draw(
      `Invoice ${data.invoiceNumber}`,
      MARGIN,
      this.y,
      this.fonts.bold,
      22,
      SLATE_900,
    );

    const statusTone =
      data.runStatus === "COMPLETED"
        ? "success"
        : data.runStatus === "FAILED"
          ? "danger"
          : data.runStatus === "RUNNING"
            ? "info"
            : "warning";
    const statusLabel =
      data.runStatus === "COMPLETED"
        ? "Match completed"
        : data.runStatus === "FAILED"
          ? "Match failed"
          : humanize(data.runStatus);

    let chipRight = PAGE_WIDTH - MARGIN;
    const statusWidth = this.chipWidth(statusLabel);
    this.statusChip(statusLabel, chipRight - statusWidth, this.y + 19, statusTone);
    chipRight -= statusWidth + 6;
    if (data.organizationIsDemo) {
      const demoLabel = "DEMO WORKSPACE";
      const demoWidth = this.chipWidth(demoLabel);
      this.chip(demoLabel, chipRight - demoWidth, this.y + 19, {
        fg: WARNING,
        bg: WARNING_BG,
        size: 6.6,
      });
    }

    this.y -= 16;
    const subtitle = `Three-way match evidence · ${data.poNumber} · ${data.vendorName}`;
    this.draw(
      this.truncate(subtitle, this.fonts.regular, 9.2, CONTENT_WIDTH - 4),
      MARGIN,
      this.y,
      this.fonts.regular,
      9.2,
      SLATE_500,
    );

    // Meta grid
    this.y -= 28;
    const cellWidth = (CONTENT_WIDTH - 24) / 2;
    const metaItems: [string, string][] = [
      ["Vendor", data.vendorName],
      ["Organization", data.organizationName],
      ["Purchase order", data.poNumber],
      ["Goods receipts", data.receiptNumbers.join(", ") || "None linked"],
      ["Report generated", formatDate(this.meta.generatedAt)],
      [
        "Summary source",
        data.report.generatedBy === "OPENAI"
          ? `OpenAI · ${data.report.model ?? "configured model"}`
          : "Deterministic rules engine",
      ],
    ];
    metaItems.forEach(([label, value], index) => {
      const column = index % 2;
      const rowIndex = Math.floor(index / 2);
      const x = MARGIN + column * (cellWidth + 24);
      const top = this.y - rowIndex * 36;
      this.drawTracked(
        label.toUpperCase(),
        x,
        top,
        this.fonts.semibold,
        6,
        SLATE_400,
        1.1,
      );
      this.draw(
        this.truncate(value, this.fonts.medium, 9, cellWidth - 4),
        x,
        top - 13,
        this.fonts.medium,
        9,
        SLATE_900,
      );
    });
    this.y -= 36 * 3 + 6;

    // Key figures
    const tiles: { label: string; value: string; sub: string; accent: RGB }[] = [
      {
        label: "Invoice value",
        value: formatMinor(data.invoiceTotalMinor, data.currency),
        sub: data.invoiceNumber,
        accent: PRIMARY,
      },
      {
        label: "Ordered",
        value: `${formatQuantityPlain(data.orderedQtyMilli)} units`,
        sub: `PO ${data.poNumber}`,
        accent: INFO,
      },
      {
        label: "Usable received",
        value: `${formatQuantityPlain(data.usableQtyMilli)} units`,
        sub: `${formatQuantityPlain(data.shortQtyMilli)} units short`,
        accent: SUCCESS,
      },
      {
        label: "Flagged exposure",
        value: formatMinor(data.potentialImpactMinor, data.currency),
        sub: "Not an amount owed",
        accent: DANGER,
      },
    ];
    const gap = 9;
    const tileWidth = (CONTENT_WIDTH - gap * (tiles.length - 1)) / tiles.length;
    const tileHeight = 66;
    const tileTop = this.y;
    tiles.forEach((tile, index) => {
      const x = MARGIN + index * (tileWidth + gap);
      this.page.drawRectangle({
        x,
        y: tileTop - tileHeight,
        width: tileWidth,
        height: tileHeight,
        color: SURFACE,
        borderColor: BORDER,
        borderWidth: 0.6,
      });
      this.page.drawRectangle({
        x,
        y: tileTop - 2.4,
        width: tileWidth,
        height: 2.4,
        color: tile.accent,
      });
      this.drawTracked(
        tile.label.toUpperCase(),
        x + 9,
        tileTop - 15,
        this.fonts.semibold,
        5.7,
        SLATE_500,
        0.8,
      );
      this.draw(
        this.truncate(tile.value, this.fonts.monoSemibold, 11.4, tileWidth - 18),
        x + 9,
        tileTop - 36,
        this.fonts.monoSemibold,
        11.4,
        SLATE_900,
      );
      this.draw(
        this.truncate(tile.sub, this.fonts.regular, 6.5, tileWidth - 18),
        x + 9,
        tileTop - 52,
        this.fonts.regular,
        6.5,
        SLATE_400,
      );
    });
    this.y = tileTop - tileHeight - 14;
  }

  /* ------------------------------ content -------------------------------- */

  private discrepancies(items: Discrepancy[]): void {
    if (items.length === 0) {
      this.note(
        "No discrepancy rules fired for this reconciliation. The run still records its input snapshot, rule set and source references for audit.",
      );
      return;
    }

    const severityPalette: Record<
      string,
      { fg: RGB; bg: RGB; accent: RGB }
    > = {
      CRITICAL: { fg: DANGER, bg: DANGER_BG, accent: DANGER },
      HIGH: { fg: DANGER, bg: DANGER_BG, accent: DANGER },
      MEDIUM: { fg: WARNING, bg: WARNING_BG, accent: WARNING },
      LOW: { fg: INFO, bg: INFO_BG, accent: INFO },
      INFO: { fg: SLATE_600, bg: SURFACE_ALT, accent: SLATE_400 },
    };

    for (const item of items) {
      const palette = severityPalette[item.severity] ?? severityPalette.INFO!;
      const padding = 12;
      const innerX = MARGIN + padding + 5;
      const innerWidth = CONTENT_WIDTH - padding * 2 - 5;
      const titleLines = this.wrap(item.title, this.fonts.semibold, 10, innerWidth);
      const descriptionLines = this.wrap(
        item.description,
        this.fonts.regular,
        8.5,
        innerWidth,
      );
      const calculationLines = this.wrap(
        item.calculation,
        this.fonts.mono,
        7.3,
        innerWidth - 18,
      );
      const noteLines = item.resolutionNote
        ? this.wrap(
            `Reviewer note: ${item.resolutionNote}`,
            this.fonts.italic,
            8,
            innerWidth,
          )
        : [];
      const hasImpact = item.impactMinor !== null;
      const height =
        padding +
        13 +
        8 +
        titleLines.length * 13 +
        4 +
        descriptionLines.length * 11.4 +
        8 +
        calculationLines.length * 10 +
        10 +
        (hasImpact ? 14 : 0) +
        (noteLines.length > 0 ? noteLines.length * 10.2 + 4 : 0) +
        padding;

      this.ensure(height + 9);
      const top = this.y;
      const bottom = top - height;
      this.page.drawRectangle({
        x: MARGIN,
        y: bottom,
        width: CONTENT_WIDTH,
        height,
        color: WHITE,
        borderColor: BORDER,
        borderWidth: 0.6,
      });
      this.page.drawRectangle({
        x: MARGIN,
        y: bottom,
        width: 3,
        height,
        color: palette.accent,
      });

      let cursor = top - padding;
      const severityWidth = this.chip(item.severity, innerX, cursor + 13, {
        fg: palette.fg,
        bg: palette.bg,
        size: 6.3,
      });
      this.draw(
        item.ruleCode,
        innerX + severityWidth + 8,
        cursor + 4,
        this.fonts.mono,
        7.2,
        SLATE_500,
      );
      const statusLabel = humanize(item.status);
      const statusWidth =
        this.textWidth(statusLabel.toUpperCase(), this.fonts.semibold, 6.2) + 11;
      this.chip(statusLabel, PAGE_WIDTH - MARGIN - padding - statusWidth, cursor + 13, {
        fg: SLATE_600,
        bg: WHITE,
        border: BORDER,
        size: 6.2,
      });
      cursor -= 21;

      cursor = this.drawLines(
        titleLines,
        innerX,
        cursor,
        this.fonts.semibold,
        10,
        SLATE_900,
        13,
      );
      cursor -= 4;
      cursor = this.drawLines(
        descriptionLines,
        innerX,
        cursor,
        this.fonts.regular,
        8.5,
        SLATE_600,
        11.4,
      );
      cursor -= 8;

      const calcHeight = calculationLines.length * 10 + 10;
      this.page.drawRectangle({
        x: innerX,
        y: cursor - calcHeight,
        width: innerWidth,
        height: calcHeight,
        color: SURFACE,
        borderColor: BORDER_SOFT,
        borderWidth: 0.6,
      });
      this.drawLines(
        calculationLines,
        innerX + 9,
        cursor - 5,
        this.fonts.mono,
        7.3,
        SLATE_700,
        10,
      );
      cursor -= calcHeight + 8;

      if (hasImpact) {
        this.draw(
          "Potential impact",
          innerX,
          cursor - 8,
          this.fonts.semibold,
          7.6,
          SLATE_500,
        );
        this.draw(
          formatMinor(item.impactMinor!, item.currency),
          innerX + this.textWidth("Potential impact", this.fonts.semibold, 7.6) + 10,
          cursor - 8,
          this.fonts.monoSemibold,
          8.6,
          DANGER,
        );
        cursor -= 14;
      }

      if (noteLines.length > 0) {
        cursor = this.drawLines(
          noteLines,
          innerX,
          cursor,
          this.fonts.italic,
          8,
          SLATE_500,
          10.2,
        );
      }

      this.y = bottom - 9;
    }
  }

  private documents(items: EvidenceDocument[]): void {
    if (items.length === 0) {
      this.note("No supporting documents are stored for this reconciliation.");
      return;
    }
    for (const item of items) {
      this.ensure(42);
      const top = this.y;
      const badge = item.documentType.toUpperCase();
      const badgeWidth =
        this.textWidth(badge, this.fonts.semibold, 6.2) + 11;
      this.chip(badge, PAGE_WIDTH - MARGIN - badgeWidth, top, {
        fg: PRIMARY,
        bg: PRIMARY_SOFT,
        size: 6.2,
      });
      this.draw(
        this.truncate(item.title, this.fonts.semibold, 9.3, CONTENT_WIDTH - badgeWidth - 12),
        MARGIN,
        top - 8,
        this.fonts.semibold,
        9.3,
        SLATE_900,
      );
      this.y = top - 22;
      this.draw(
        this.truncate(
          `File ${item.fileName} · ${item.mimeType}`,
          this.fonts.regular,
          7.6,
          CONTENT_WIDTH,
        ),
        MARGIN,
        this.y,
        this.fonts.regular,
        7.6,
        SLATE_500,
      );
      this.y -= 11;
      this.draw(
        this.truncate(
          `SHA-256 ${item.sha256} · Document ${item.id}`,
          this.fonts.mono,
          6.8,
          CONTENT_WIDTH,
        ),
        MARGIN,
        this.y,
        this.fonts.mono,
        6.8,
        SLATE_400,
      );
      this.y -= 12;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_WIDTH - MARGIN, y: this.y },
        thickness: 0.5,
        color: BORDER_SOFT,
      });
      this.y -= 12;
    }
    this.y -= 4;
  }

  private timeline(items: EvidenceEvent[]): void {
    if (items.length === 0) {
      this.note("No evidence events are recorded for this reconciliation.");
      return;
    }
    const ordered = [...items].reverse();
    ordered.forEach((event, index) => {
      const descriptionLines = this.wrap(
        event.description,
        this.fonts.regular,
        8.6,
        CONTENT_WIDTH - 8,
      );
      const height = 13 + descriptionLines.length * 11.4 + 12;
      this.ensure(height + 8);
      const top = this.y;
      const timestamp = formatDate(event.occurredAt);
      this.draw(timestamp, MARGIN, top - 7, this.fonts.mono, 7.2, SLATE_500);
      const timeWidth = this.textWidth(timestamp, this.fonts.mono, 7.2);
      this.drawTracked(
        this.truncate(event.eventType, this.fonts.semibold, 6.1, CONTENT_WIDTH - timeWidth - 20),
        MARGIN + timeWidth + 12,
        top - 7,
        this.fonts.semibold,
        6.1,
        PRIMARY,
        0.9,
      );
      this.y = top - 13;
      this.y = this.drawLines(
        descriptionLines,
        MARGIN,
        this.y,
        this.fonts.regular,
        8.6,
        SLATE_700,
        11.4,
      );
      this.draw(
        this.truncate(
          `Actor ${event.actorLabel} · Source ${humanize(event.source)}`,
          this.fonts.regular,
          7.1,
          CONTENT_WIDTH,
        ),
        MARGIN,
        this.y - 8,
        this.fonts.regular,
        7.1,
        SLATE_400,
      );
      this.y -= 20;
      if (index < ordered.length - 1) {
        this.page.drawLine({
          start: { x: MARGIN, y: this.y + 6 },
          end: { x: PAGE_WIDTH - MARGIN, y: this.y + 6 },
          thickness: 0.5,
          color: BORDER_SOFT,
        });
      }
    });
    this.y -= 2;
  }

  private reportRecord(data: PdfData, fingerprint: string): void {
    const height = 114;
    this.ensure(height + 10);
    const top = this.y;
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_WIDTH,
      height,
      color: SURFACE,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: 3,
      height,
      color: PRIMARY,
    });
    this.drawTracked(
      "SNAPSHOT DETAILS",
      MARGIN + 12,
      top - 15,
      this.fonts.semibold,
      6.2,
      PRIMARY,
      1.2,
    );
    this.drawRight(
      "FINAL · IMMUTABLE SNAPSHOT",
      PAGE_WIDTH - MARGIN - 12,
      top - 15,
      this.fonts.mono,
      6,
      SLATE_400,
    );
    const columns: [string, string][] = [
      ["Report ID", data.report.id],
      ["Reconciliation run", data.report.runId],
      ["Run opened", formatDate(data.runCreatedAt)],
      ["Report generated", formatDate(data.report.createdAt)],
      [
        "Summary source",
        data.report.generatedBy === "OPENAI"
          ? `OpenAI · ${data.report.model ?? "configured model"}`
          : "Deterministic rules engine",
      ],
      ["Currency", data.currency],
    ];
    const cellWidth = (CONTENT_WIDTH - 24) / 2;
    columns.forEach(([label, value], index) => {
      const column = index % 2;
      const rowIndex = Math.floor(index / 2);
      const x = MARGIN + 12 + column * cellWidth;
      const lineTop = top - 31 - rowIndex * 17;
      this.drawTracked(
        label.toUpperCase(),
        x,
        lineTop,
        this.fonts.semibold,
        5.6,
        SLATE_400,
        0.8,
      );
      this.draw(
        this.truncate(value, this.fonts.mono, 7.1, cellWidth - 8),
        x,
        lineTop - 9,
        this.fonts.mono,
        7.1,
        SLATE_700,
      );
    });
    this.page.drawLine({
      start: { x: MARGIN + 12, y: top - 81 },
      end: { x: PAGE_WIDTH - MARGIN - 12, y: top - 81 },
      thickness: 0.5,
      color: BORDER,
    });
    this.drawTracked(
      "CONTENT FINGERPRINT · SHA-256",
      MARGIN + 12,
      top - 93,
      this.fonts.semibold,
      5.6,
      SLATE_400,
      0.8,
    );
    this.draw(
      fingerprint,
      MARGIN + 12,
      top - 104,
      this.fonts.mono,
      6.9,
      SLATE_600,
    );
    this.y = top - height - 12;
  }

  /* -------------------------------- finish ------------------------------- */

  private finish(data: PdfData): Promise<Uint8Array> {
    this.paragraph(
      `This evidence pack was generated by ReconPay AI for ${data.organizationName}. It reflects the stored reconciliation snapshot, rule findings and recorded events at the time of export. Generated summaries explain the records; they do not calculate amounts, decide disputes or authorise payment.`,
      { size: 7.7, color: SLATE_500, leading: 10.4, gap: 2 },
    );
    this.drawFooter();
    return this.doc.save();
  }

  /* -------------------------------- render ------------------------------- */

  async produce(data: PdfData, tocPages: number[] | null): Promise<Uint8Array> {
    await this.init();
    this.doc.setCreationDate(this.meta.generatedAt);
    this.doc.setModificationDate(this.meta.generatedAt);
    this.cover(data);
    this.addPage("body");
    this.contents(tocPages);
    this.addPage("body");

    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          reportId: data.report.id,
          runId: data.report.runId,
          invoice: data.invoiceNumber,
          vendor: data.vendorName,
          currency: data.currency,
          invoiceTotalMinor: data.invoiceTotalMinor.toString(),
          potentialImpactMinor: data.potentialImpactMinor.toString(),
          orderedQtyMilli: data.orderedQtyMilli.toString(),
          receivedQtyMilli: data.receivedQtyMilli.toString(),
          usableQtyMilli: data.usableQtyMilli.toString(),
          generatedAt: this.meta.generatedAt.toISOString(),
        }),
      )
      .digest("hex");

    this.sectionTitle(0);
    this.rows([
      [
        "Ordered quantity",
        `${formatQuantityPlain(data.orderedQtyMilli)} units`,
        "default",
      ],
      [
        "Received quantity",
        `${formatQuantityPlain(data.receivedQtyMilli)} units`,
        "default",
      ],
      [
        "Usable quantity",
        `${formatQuantityPlain(data.usableQtyMilli)} units`,
        "success",
      ],
      [
        "Short quantity",
        `${formatQuantityPlain(data.shortQtyMilli)} units`,
        data.shortQtyMilli > 0n ? "danger" : "default",
      ],
      [
        "Potential quantity exposure",
        formatMinor(data.potentialQuantityExposureMinor, data.currency),
        "default",
      ],
      [
        "Aggregate flagged exposure",
        formatMinor(data.potentialImpactMinor, data.currency),
        data.potentialImpactMinor > 0n ? "danger" : "default",
      ],
    ]);
    this.note(
      "Aggregate flagged exposure is the sum of non-overlapping line-level quantity and price exposure plus excess tax. It is not a determination that the vendor owes this amount and does not account for contract terms, credits, accepted partial deliveries or tax treatment.",
    );

    this.sectionTitle(1);
    this.subLabel("Discrepancy summary");
    this.paragraph(data.report.discrepancySummary);
    this.subLabel("Evidence summary");
    this.paragraph(data.report.evidenceSummary);
    this.subLabel("Chronological explanation");
    this.paragraph(data.report.timelineSummary);

    this.sectionTitle(2);
    this.discrepancies(data.discrepancies);

    this.sectionTitle(3);
    this.bullets(
      data.report.nextActions.length > 0
        ? data.report.nextActions
        : ["No next actions were proposed by the summary generator."],
    );

    this.sectionTitle(4);
    this.bullets(
      data.report.missingEvidence.length > 0
        ? data.report.missingEvidence
        : [
            "No required evidence items were identified as missing by the generator.",
          ],
    );

    this.sectionTitle(5);
    this.documents(data.documents);

    this.sectionTitle(6);
    this.timeline(data.timeline);

    this.sectionTitle(7);
    this.reportRecord(data, fingerprint);

    return this.finish(data);
  }
}

/* ---------------------------------------------------------------------------
 * Public entry point
 * ------------------------------------------------------------------------- */

export async function buildEvidencePdf(data: PdfData): Promise<Uint8Array> {
  const meta = {
    organizationName: data.organizationName,
    invoiceNumber: data.invoiceNumber,
    appUrl: data.appUrl,
    isDemo: data.organizationIsDemo,
    generatedAt: new Date(),
  };
  const probe = new EvidencePdf(meta);
  await probe.produce(data, null);
  const sectionPages = probe.getSectionPages();
  const final = new EvidencePdf(meta);
  return final.produce(data, sectionPages);
}

