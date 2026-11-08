import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  ExternalLink,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getEvidenceDetail } from "@/lib/services/evidence";
import { formatMinor, formatQuantityPlain } from "@/lib/money";
import { documentHref } from "@/lib/documents";
import { formatDateTime, humanize } from "@/lib/ui";
import { PageHeader, DescriptionList } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence report" };

export default async function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireInternalPage("generate_evidence");
  const { id } = await params;
  const detail = await getEvidenceDetail(ctx, id);
  const { run, invoice, purchaseOrder, vendor, receipts, discrepancies, reports, latestReport, documents, timeline } =
    detail;
  const currency = invoice?.currency ?? "INR";

  return (
    <div>
      <Link
        href="/evidence"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to evidence center
      </Link>
      <PageHeader
        title={`Evidence · ${invoice?.invoiceNumber || "Invoice"}`}
        description={`${vendor?.name ?? "Vendor"} · ${purchaseOrder?.poNumber ?? "Purchase order"} · Run ${run.id.slice(0, 8)}`}
        meta={
          <>
            <StatusBadge status={run.status} />
            <span className="text-[11px] text-slate-500">
              Completed {run.completedAt ? formatDateTime(run.completedAt) : "—"}
            </span>
            <span className="text-[11px] text-slate-500">
              {run.discrepancyCount} finding{run.discrepancyCount === 1 ? "" : "s"}
            </span>
          </>
        }
        actions={
          <>
            <Link
              href={`/reconciliation/${run.id}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <FileText className="h-3.5 w-3.5" /> Open run
            </Link>
            {latestReport ? (
              <a
                href={`/api/evidence/${run.id}/pdf`}
                className={buttonVariants({ size: "sm" })}
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </a>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Ordered", formatQuantityPlain(run.orderedQtyMilli)],
          ["Usable", formatQuantityPlain(run.usableQtyMilli)],
          ["Short", formatQuantityPlain(run.shortQtyMilli)],
          ["Potential exposure", formatMinor(run.potentialQuantityExposureMinor, currency)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
            <p className="text-[11px] font-medium text-slate-500">{label}</p>
            <p className="numeric mt-1 text-lg font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {!latestReport ? (
        <Alert tone="warning" title="No evidence summary generated" className="mb-5">
          A PDF cannot be exported until a summary exists. Generate it from the stored run; the
          output is labelled with its generator.
          <div className="mt-2">
            <ActionButton
              endpoint="/api/evidence"
              method="POST"
              body={{ runId: run.id }}
              successMessage="Evidence report generated"
              size="sm"
            >
              Generate evidence report
            </ActionButton>
          </div>
        </Alert>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Evidence summary</CardTitle>
                  <CardDescription>
                    Generated {formatDateTime(latestReport.createdAt)} ·{" "}
                    {latestReport.generatedBy === "OPENAI" ? "OpenAI" : "Deterministic rules"}
                    {latestReport.model ? ` (${latestReport.model})` : ""}
                  </CardDescription>
                </div>
                <BadgeCheck className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent className="space-y-4">
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Evidence
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-slate-700">
                    {latestReport.evidenceSummary}
                  </p>
                </section>
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Discrepancies
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-slate-700">
                    {latestReport.discrepancySummary}
                  </p>
                </section>
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Timeline
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-slate-700">
                    {latestReport.timelineSummary}
                  </p>
                </section>
                {latestReport.nextActions.length > 0 ? (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Suggested next actions
                    </h3>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-[12px] leading-5 text-slate-700">
                      {latestReport.nextActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Suggestions are not decisions and do not initiate payment.
                    </p>
                  </section>
                ) : null}
                {latestReport.missingEvidence.length > 0 ? (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <h3 className="text-[11px] font-semibold text-amber-800">
                      Missing evidence flagged
                    </h3>
                    <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
                      {latestReport.missingEvidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Rule findings</CardTitle>
                  <CardDescription>Stored calculations from the engine run.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {discrepancies.length === 0 ? (
                  <p className="text-xs text-emerald-700">No findings; the match was clean.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {discrepancies.map((item) => (
                      <li key={item.id} className="py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-slate-800">{item.title}</p>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={item.severity} />
                            <span className="numeric text-xs text-slate-700">
                              {item.impactMinor !== null
                                ? formatMinor(item.impactMinor, item.currency)
                                : "No money impact"}
                            </span>
                          </div>
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                          {item.ruleCode} · {item.calculation}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>Append-only evidence events included in the report.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-xs text-slate-500">No timeline events.</p>
                ) : (
                  <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                    {timeline.map((event) => (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-300" />
                        <p className="text-[11px] font-medium text-slate-800">
                          {humanize(event.eventType)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {formatDateTime(event.occurredAt)} · {event.actorLabel} · {event.source}
                        </p>
                        <p className="text-[10px] leading-4 text-slate-600">{event.description}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Report versions</CardTitle>
                  <CardDescription>{reports.length} stored summary version{reports.length === 1 ? "" : "s"}.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-slate-100">
                  {reports.map((report) => (
                    <li key={report.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="text-[11px] font-medium text-slate-800">
                          {report.generatedBy === "OPENAI" ? "OpenAI summary" : "Rules-based summary"}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {formatDateTime(report.createdAt)}
                        </p>
                      </div>
                      {report.id === latestReport.id ? (
                        <StatusBadge status="READY" label="Latest" />
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[10px] font-medium text-slate-600">
                    Regenerate from current stored evidence
                  </p>
                  <ActionButton
                    endpoint="/api/evidence"
                    method="POST"
                    body={{ runId: run.id }}
                    successMessage="New evidence report generated"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    Generate new version
                  </ActionButton>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Included records</CardTitle>
                  <CardDescription>Exact sources referenced by the report.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <DescriptionList
                  columns={1}
                  items={[
                    {
                      label: "Invoice",
                      value: (
                        <Link href={`/invoices/${run.invoiceId}`} className="text-indigo-700 hover:underline">
                          {invoice?.invoiceNumber || "Untitled"}
                        </Link>
                      ),
                    },
                    {
                      label: "Purchase order",
                      value: (
                        <Link href={`/purchase-orders/${run.purchaseOrderId}`} className="text-indigo-700 hover:underline">
                          {purchaseOrder?.poNumber ?? "—"}
                        </Link>
                      ),
                    },
                    {
                      label: "Goods receipts",
                      value:
                        receipts.length === 0
                          ? "None"
                          : receipts.map((receipt) => receipt.receiptNumber).join(", "),
                    },
                    {
                      label: "Documents",
                      value: `${documents.length} linked source file${documents.length === 1 ? "" : "s"}`,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Source documents</CardTitle>
                  <CardDescription>Permalinks are signed and expire.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <p className="text-xs text-slate-500">No documents included.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {documents.map((document) => (
                      <li key={document.id} className="py-2.5">
                        <a
                          href={documentHref(document.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-slate-800 hover:text-indigo-700"
                        >
                          <span className="truncate">{document.title || document.fileName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        <p className="text-[10px] text-slate-500">
                          {document.entityType.replaceAll("_", " ").toLowerCase()} ·{" "}
                          {document.documentType.replaceAll("_", " ").toLowerCase()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500">
              <p className="flex items-center gap-1.5 font-medium text-slate-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Evidence integrity
              </p>
              <p className="mt-1">
                Generating and exporting are audit events. The PDF is built from stored data and the
                latest generated summary; it does not recalculate the match.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
