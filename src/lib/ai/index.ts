import { getDb } from "@/lib/db";
import { aiUsageLogs } from "@/lib/db/schema";
import { aiConfigured, env } from "@/lib/env";
import { localExtractInvoice } from "./local-extractor";
import {
  estimateCostMicros,
  openAiEvidenceSummary,
  openAiExtractInvoice,
  OpenAiError,
} from "./openai";
import type {
  EvidenceSummary,
  EvidenceSummaryInput,
  ExtractionResult,
} from "./types";

export type { EvidenceSummary, EvidenceSummaryInput, ExtractionResult };

async function logUsage(input: {
  organizationId: string;
  feature: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostMicros?: bigint;
  latencyMs: number;
  status: "SUCCESS" | "FAILED";
  errorCode?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(aiUsageLogs).values({
      organizationId: input.organizationId,
      feature: input.feature,
      provider: input.provider,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      estimatedCostMicros: input.estimatedCostMicros,
      latencyMs: input.latencyMs,
      status: input.status,
      errorCode: input.errorCode,
    });
  } catch (error) {
    console.error("[ai] failed to persist usage telemetry", error);
  }
}

export function aiStatus() {
  return {
    configured: aiConfigured(),
    provider: aiConfigured() ? "OpenAI" : "Local deterministic parser",
    model: aiConfigured() ? env.openaiModel : null,
    capabilities: aiConfigured()
      ? ["PDF/image extraction", "Evidence summaries", "Suggested next actions"]
      : [
          "PDF text-layer extraction",
          "Rules-based evidence summaries",
          "No image OCR",
        ],
  };
}

/**
 * Extraction with explicit provenance. If a configured provider fails, the
 * deterministic PDF parser is attempted and the warning is surfaced — the app
 * never presents a degraded result as an AI success.
 */
export async function extractInvoiceDocument(input: {
  organizationId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<ExtractionResult> {
  if (aiConfigured()) {
    const started = Date.now();
    try {
      const result = await openAiExtractInvoice(input);
      await logUsage({
        organizationId: input.organizationId,
        feature: "invoice_extraction",
        provider: "openai",
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCostMicros: estimateCostMicros(
          result.model,
          result.usage.promptTokens,
          result.usage.completionTokens,
        ),
        latencyMs: Date.now() - started,
        status: "SUCCESS",
      });
      return {
        extraction: result.extraction,
        engine: "OPENAI",
        model: result.model,
        warning:
          result.extraction.missingFields.length > 0
            ? `The AI could not read: ${result.extraction.missingFields.join(", ")}. Manual review is required.`
            : null,
        rawText: null,
      };
    } catch (error) {
      const code = error instanceof OpenAiError ? error.code : "AI_REQUEST_FAILED";
      await logUsage({
        organizationId: input.organizationId,
        feature: "invoice_extraction",
        provider: "openai",
        model: env.openaiModel,
        latencyMs: Date.now() - started,
        status: "FAILED",
        errorCode: code,
      });
      const fallback = await localExtractInvoice(input);
      return {
        ...fallback,
        warning: `AI extraction failed (${code}). ${fallback.warning ?? "A deterministic fallback was used; verify all fields."}`,
      };
    }
  }

  const started = Date.now();
  const fallback = await localExtractInvoice(input);
  await logUsage({
    organizationId: input.organizationId,
    feature: "invoice_extraction",
    provider: "local",
    model: "pdf-text-v1",
    latencyMs: Date.now() - started,
    status: "SUCCESS",
  });
  return fallback;
}

function rulesBasedSummary(input: EvidenceSummaryInput): EvidenceSummary {
  const open = input.discrepancies.filter(
    (d) => d.status === "OPEN" || d.status === "ACKNOWLEDGED" || d.status === "DISPUTED",
  );
  const high = input.discrepancies.filter(
    (d) => d.severity === "HIGH" || d.severity === "CRITICAL",
  );

  const discrepancySummary =
    input.discrepancies.length === 0
      ? `No discrepancies were recorded for invoice ${input.invoiceNumber} against purchase order ${input.poNumber}. The three-way comparison matched on the checked rules.`
      : `${input.discrepancies.length} discrepancy rule(s) fired for invoice ${input.invoiceNumber} against purchase order ${input.poNumber}. ${high.length} are high or critical severity. Documented calculations: ${input.discrepancies
          .slice(0, 4)
          .map((d) => `${d.title} — ${d.calculation}`)
          .join(" | ")}. These figures describe potential exposure, not a determination that any amount is owed.`;

  const documentSummary =
    input.documents.length === 0
      ? "No supporting documents are stored for this reconciliation."
      : `${input.documents.length} supporting document(s) are stored: ${input.documents
          .map((d) => `${d.title} (${d.documentType})`)
          .join(", ")}.`;

  const evidenceSummary = `${documentSummary} The timeline contains ${input.evidenceEvents.length} recorded event(s). ${open.length} discrepancy record(s) remain open or under review. The evidence set is limited to records and documents stored in ReconPay; it does not include external correspondence that has not been uploaded.`;

  const timelineSummary =
    input.evidenceEvents.length === 0
      ? "No evidence events have been recorded yet."
      : input.evidenceEvents
          .slice()
          .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
          .map(
            (event) =>
              `${event.occurredAt.slice(0, 16).replace("T", " ")} — ${event.description} (${event.actorLabel}; ${event.source})`,
          )
          .join("\n");

  const missingEvidence: string[] = [];
  const types = new Set(input.documents.map((d) => d.documentType.toUpperCase()));
  if (!types.has("INVOICE")) missingEvidence.push("Original invoice document");
  if (!types.has("PURCHASE_ORDER")) missingEvidence.push("Signed purchase order or contract");
  if (!types.has("GOODS_RECEIPT") && !types.has("DELIVERY_NOTE")) {
    missingEvidence.push("Goods receipt or signed delivery note");
  }
  if (!types.has("VENDOR_CORRESPONDENCE") && open.length > 0) {
    missingEvidence.push("Vendor correspondence about the discrepancy");
  }

  const nextActions: string[] = [];
  const qtyExposure = input.discrepancies.find((d) =>
    d.ruleCode.includes("RECEIVED_QTY"),
  );
  if (qtyExposure) {
    nextActions.push(
      "Confirm the usable received quantity with the warehouse and attach a signed delivery note.",
    );
    nextActions.push(
      "Ask the vendor to explain the difference or issue a credit note before any payment is released.",
    );
  }
  if (input.discrepancies.some((d) => d.ruleCode === "UNIT_PRICE_MISMATCH")) {
    nextActions.push(
      "Compare the invoiced unit price with the agreed purchase-order price and request a corrected invoice if confirmed.",
    );
  }
  if (input.discrepancies.some((d) => d.ruleCode === "DUPLICATE_INVOICE")) {
    nextActions.push("Place a hold on payment while duplicate-invoice evidence is reviewed.");
  }
  if (open.length === 0 && input.discrepancies.length > 0) {
    nextActions.push("All recorded discrepancies are closed; re-run reconciliation before settlement.");
  }
  if (open.length === 0 && input.discrepancies.length === 0) {
    nextActions.push("Proceed with the normal approval workflow; retain the evidence report with the payment record.");
  }
  if (missingEvidence.length > 0) {
    nextActions.push(`Upload the missing evidence: ${missingEvidence.join(", ")}.`);
  }
  nextActions.push(
    "Do not treat the flagged exposure as an amount owed. Apply contract terms, tax treatment, credits and accepted partial deliveries.",
  );

  return {
    discrepancySummary,
    evidenceSummary,
    timelineSummary,
    nextActions: [...new Set(nextActions)].slice(0, 8),
    missingEvidence,
  };
}

export async function generateEvidenceSummary(input: {
  organizationId: string;
  data: EvidenceSummaryInput;
}): Promise<{
  summary: EvidenceSummary;
  generatedBy: "OPENAI" | "RULES";
  model: string | null;
  warning: string | null;
}> {
  if (!aiConfigured()) {
    return {
      summary: rulesBasedSummary(input.data),
      generatedBy: "RULES",
      model: null,
      warning:
        "No AI provider is configured. This summary was generated deterministically from stored records.",
    };
  }

  const started = Date.now();
  try {
    const result = await openAiEvidenceSummary(JSON.stringify(input.data, null, 2));
    await logUsage({
      organizationId: input.organizationId,
      feature: "evidence_summary",
      provider: "openai",
      model: result.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      estimatedCostMicros: estimateCostMicros(
        result.model,
        result.usage.promptTokens,
        result.usage.completionTokens,
      ),
      latencyMs: Date.now() - started,
      status: "SUCCESS",
    });
    return {
      summary: result.summary,
      generatedBy: "OPENAI",
      model: result.model,
      warning: null,
    };
  } catch (error) {
    const code = error instanceof OpenAiError ? error.code : "AI_REQUEST_FAILED";
    await logUsage({
      organizationId: input.organizationId,
      feature: "evidence_summary",
      provider: "openai",
      model: env.openaiModel,
      latencyMs: Date.now() - started,
      status: "FAILED",
      errorCode: code,
    });
    return {
      summary: rulesBasedSummary(input.data),
      generatedBy: "RULES",
      model: null,
      warning: `AI summary failed (${code}). A deterministic summary was generated instead.`,
    };
  }
}

export { rulesBasedSummary };
