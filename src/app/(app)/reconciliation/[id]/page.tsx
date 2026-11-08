import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Download,
  ExternalLink,
  FileSearch,
  GitCompareArrows,
  ShieldCheck,
} from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getReconciliationDetail } from "@/lib/services/reconciliation";
import { formatMinor, formatQuantityPlain } from "@/lib/money";
import { can } from "@/lib/auth/rbac";
import { documentHref } from "@/lib/documents";
import { formatDateTime, humanize } from "@/lib/ui";
import { PageHeader, DescriptionList, StatCard } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { DiscrepancyActions } from "@/components/discrepancies/discrepancy-actions";
import { CreateSettlementButton } from "@/components/settlements/create-settlement-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliation run" };

export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireInternalPage("run_reconciliation");
  const { id } = await params;
  const detail = await getReconciliationDetail(ctx, id);
  const {
    run,
    invoice,
    purchaseOrder,
    vendor,
    receipts,
    discrepancies,
    report,
    documents,
    timeline,
    settlements,
  } = detail;
  const currency = invoice?.currency ?? "INR";
  const openCount = discrepancies.filter((item) => item.status === "OPEN").length;

  return (
    <div>
      <Link
        href="/reconciliation"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to reconciliation
      </Link>
      <PageHeader
        title={`Reconciliation ${run.id.slice(0, 8)}`}
        description={`${invoice?.invoiceNumber || "Invoice"} against ${purchaseOrder?.poNumber ?? "purchase order"} · ${vendor?.name ?? "Vendor"}`}
        meta={
          <>
            <StatusBadge status={run.status} />
            <span className="text-[11px] text-slate-500">
              Engine v{run.engineVersion} · {formatDateTime(run.createdAt)}
            </span>
            <span className="text-[11px] text-slate-500">
              {run.goodsReceiptIds.length} receipt{run.goodsReceiptIds.length === 1 ? "" : "s"} included
            </span>
          </>
        }
        actions={
          <>
            <Link
              href={`/invoices/${run.invoiceId}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <FileSearch className="h-3.5 w-3.5" /> Open invoice
            </Link>
            <a
              href={`/api/evidence/${run.id}/pdf`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Download className="h-3.5 w-3.5" /> Evidence PDF
            </a>
            {can(ctx, "create_settlement") && invoice?.status === "VERIFIED" ? (
              <CreateSettlementButton
                invoiceId={run.invoiceId}
                invoiceTotal={run.invoiceTotalMinor.toString()}
                currency={currency}
                runs={[{ id: run.id, createdAt: formatDateTime(run.createdAt) }]}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoice total"
          value={formatMinor(run.invoiceTotalMinor, currency)}
          hint={invoice?.invoiceNumber ?? "Invoice"}
          icon={FileSearch}
        />
        <StatCard
          label="Usable quantity"
          value={formatQuantityPlain(run.usableQtyMilli)}
          hint={`Received ${formatQuantityPlain(run.receivedQtyMilli)} of ${formatQuantityPlain(run.orderedQtyMilli)} ordered`}
          icon={BadgeCheck}
        />
        <StatCard
          label="Short quantity"
          value={formatQuantityPlain(run.shortQtyMilli)}
          hint={`${formatMinor(run.potentialQuantityExposureMinor, currency)} potential quantity exposure`}
          icon={AlertTriangle}
          tone={run.shortQtyMilli > 0n ? "warning" : "default"}
        />
        <StatCard
          label="Open findings"
          value={openCount}
          hint={`${run.discrepancyCount} total rule finding${run.discrepancyCount === 1 ? "" : "s"} · ${formatMinor(run.potentialImpactMinor, currency)} flagged`}
          icon={AlertTriangle}
          tone={openCount > 0 ? "warning" : "success"}
          href="/discrepancies"
        />
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[11px] leading-5 text-amber-900">
        <p className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> Review signals, not a statement of amount owed
        </p>
        <p className="mt-0.5">
          The engine compares quantities and prices. A short quantity or price variance creates a
          review signal. It does not by itself establish a vendor liability or a revised payable. A
          human decision and evidence are required before settlement.
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Deterministic findings</CardTitle>
                <CardDescription>
                  Each finding shows the rule code, exact calculation, and stored source references.
                </CardDescription>
              </div>
              <GitCompareArrows className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {discrepancies.length === 0 ? (
                <div className="px-5 pb-5">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
                    <p className="font-medium">No discrepancies detected</p>
                    <p className="mt-0.5">
                      The invoice matched the PO and selected receipts under every configured rule.
                      This is a computational result, not an approval to pay.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {discrepancies.map((item) => (
                    <li key={item.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={item.severity} />
                            <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="numeric text-xs font-medium text-slate-900">
                            {item.impactMinor !== null
                              ? formatMinor(item.impactMinor, item.currency)
                              : "No money impact"}
                          </span>
                          {can(ctx, "resolve_discrepancy") ? (
                            <DiscrepancyActions
                              discrepancyId={item.id}
                              currentStatus={item.status}
                              compact
                            />
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-md bg-slate-50 px-2.5 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            Calculation
                          </p>
                          <p className="numeric mt-0.5 break-words font-mono text-[11px] text-slate-700">
                            {item.calculation}
                          </p>
                        </div>
                        <div className="rounded-md bg-slate-50 px-2.5 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            Rule & values
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-700">
                            {item.ruleCode}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Expected {item.expectedValue ?? "—"} · Actual {item.actualValue ?? "—"}
                          </p>
                        </div>
                      </div>
                      {item.sourceRefs.length > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[10px] font-medium text-indigo-700">
                            Source references ({item.sourceRefs.length})
                          </summary>
                          <pre className="scrollbar-thin mt-1 max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-600">
                            {JSON.stringify(item.sourceRefs, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                      {item.resolutionNote ? (
                        <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] text-slate-600">
                          Decision note: {item.resolutionNote}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Match inputs</CardTitle>
                <CardDescription>Stored with the run so the result is reproducible.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: "Invoice",
                    value: invoice ? (
                      <Link href={`/invoices/${invoice.id}`} className="text-indigo-700 hover:underline">
                        {invoice.invoiceNumber || "Untitled"}
                      </Link>
                    ) : "—",
                  },
                  {
                    label: "Purchase order",
                    value: purchaseOrder ? (
                      <Link href={`/purchase-orders/${purchaseOrder.id}`} className="text-indigo-700 hover:underline">
                        {purchaseOrder.poNumber}
                      </Link>
                    ) : "—",
                  },
                  { label: "Vendor", value: vendor?.name ?? "—" },
                  { label: "Ordered", value: formatQuantityPlain(run.orderedQtyMilli) },
                  { label: "Received", value: formatQuantityPlain(run.receivedQtyMilli) },
                  { label: "Usable", value: formatQuantityPlain(run.usableQtyMilli) },
                  {
                    label: "Goods receipts",
                    value:
                      receipts.length === 0
                        ? "None"
                        : receipts.map((receipt) => receipt.receiptNumber).join(", "),
                  },
                  { label: "Currency", value: currency },
                  { label: "Completed", value: run.completedAt ? formatDateTime(run.completedAt) : "—" },
                ]}
              />
              <details className="mt-4">
                <summary className="cursor-pointer text-[10px] font-medium text-indigo-700">
                  Stored input snapshot
                </summary>
                <pre className="scrollbar-thin mt-1 max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
                  {JSON.stringify(run.inputSnapshot, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Evidence report</CardTitle>
                <CardDescription>
                  AI summarizes stored evidence. It cannot add facts or change the rules.
                </CardDescription>
              </div>
              <BadgeCheck className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {report ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500">
                      Generated {formatDateTime(report.createdAt)}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                      {report.generatedBy === "OPENAI" ? "OPENAI" : "RULES-BASED"}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-700">Evidence summary</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                      {report.evidenceSummary}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-700">Discrepancy summary</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                      {report.discrepancySummary}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-700">Timeline</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">
                      {report.timelineSummary}
                    </p>
                  </div>
                  {report.nextActions.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-medium text-slate-700">Suggested next actions</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] leading-5 text-slate-600">
                        {report.nextActions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[9px] text-slate-400">
                        Suggestions only. They do not approve or initiate payment.
                      </p>
                    </div>
                  ) : null}
                  {report.missingEvidence.length > 0 ? (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2.5">
                      <p className="text-[11px] font-medium text-amber-800">Missing evidence</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-[10px] text-amber-700">
                        {report.missingEvidence.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <a
                    href={`/api/evidence/${run.id}/pdf`}
                    className={buttonVariants({ variant: "secondary", size: "sm" }) + " w-full"}
                  >
                    <Download className="h-3.5 w-3.5" /> Download evidence PDF
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs leading-5 text-slate-600">
                    No evidence summary has been generated for this run. Generation is logged and
                    the output is stored with the run.
                  </p>
                  {can(ctx, "generate_evidence") ? (
                    <ActionButton
                      endpoint="/api/evidence"
                      method="POST"
                      body={{ runId: run.id }}
                      successMessage="Evidence report generated"
                      size="sm"
                      className="w-full"
                    >
                      Generate evidence report
                    </ActionButton>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Your role cannot generate evidence.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Source documents</CardTitle>
                <CardDescription>Invoice, PO, receipts, and settlement evidence.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-xs text-slate-500">No documents are linked to this match.</p>
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

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Evidence timeline</CardTitle>
                <CardDescription>Append-only events with source references.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-xs text-slate-500">No evidence events recorded.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                  {timeline.map((event) => (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-300" />
                      <p className="text-[11px] font-medium text-slate-800">
                        {humanize(event.eventType)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {formatDateTime(event.occurredAt)} · {event.source}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-4 text-slate-600">
                        {event.description}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Settlements from this run</CardTitle>
                <CardDescription>Proposals referencing this reconciliation.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <p className="text-xs text-slate-500">No settlement proposal yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {settlements.map((settlement) => (
                    <li key={settlement.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <Link
                          href={`/settlements/${settlement.id}`}
                          className="text-xs font-medium text-slate-800 hover:text-indigo-700"
                        >
                          {settlement.settlementNumber}
                        </Link>
                        <p className="text-[10px] text-slate-500">
                          {formatDateTime(settlement.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-xs font-medium">
                          {formatMinor(settlement.proposedAmountMinor, settlement.currency)}
                        </p>
                        <StatusBadge status={settlement.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500">
            <p className="flex items-center gap-1.5 font-medium text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Reproducibility
            </p>
            <p className="mt-1">
              This run stores its input snapshot, engine version, receipt IDs, and complete rule
              output. Re-running with the same inputs produces the same result.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <Link href="/discrepancies" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          All discrepancies
        </Link>
        <Link href="/evidence" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Evidence center
        </Link>
        {run.status === "COMPLETED" ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> Engine completed with stored output
          </span>
        ) : null}
      </div>
    </div>
  );
}
