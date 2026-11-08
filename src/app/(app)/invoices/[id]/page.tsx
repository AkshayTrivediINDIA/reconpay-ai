import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  GitCompareArrows,
  History,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { can, isVendor } from "@/lib/auth/rbac";
import {
  getInvoiceDetail,
  getVendorOptions,
  invoiceActivity,
} from "@/lib/services/invoices";
import { formatMinor, formatQuantityPlain, toMajorString } from "@/lib/money";
import { documentHref } from "@/lib/documents";
import { formatDate, formatDateTime, humanize } from "@/lib/ui";
import { PageHeader, DescriptionList, SectionTitle } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { ReconcileForm } from "@/components/invoices/reconcile-form";
import { ReprocessButton } from "@/components/invoices/reprocess-button";
import { UploadDocumentButton } from "@/components/documents/upload-document-button";
import { CreateSettlementButton } from "@/components/settlements/create-settlement-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  const [detail, activity, vendorOptions] = await Promise.all([
    getInvoiceDetail(ctx, id),
    invoiceActivity(ctx, id),
    can(ctx, "manage_invoices") ? getVendorOptions(ctx) : Promise.resolve([]),
  ]);
  const {
    invoice,
    lineItems,
    vendor,
    runs,
    documents,
    settlements,
    purchaseOrderCandidates,
    duplicate,
    sourceDocument,
    sourceDocumentHref,
  } = detail;
  const vendorView = isVendor(ctx);
  const canEdit = !vendorView && can(ctx, "manage_invoices");
  const canSettle = !vendorView && can(ctx, "create_settlement");
  const vendorName = vendor?.name ?? invoice.vendorNameRaw ?? "Unassigned vendor";

  return (
    <div>
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to invoices
      </Link>

      <PageHeader
        title={invoice.invoiceNumber || "Untitled invoice"}
        description={`${vendorName} · ${invoice.currency} · Source document and extraction history are retained with this record.`}
        meta={
          <>
            <StatusBadge status={invoice.status} />
            {invoice.needsReview ? (
              <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Needs human review
              </span>
            ) : null}
            <span className="text-[11px] text-slate-500">
              Uploaded {formatDateTime(invoice.createdAt)}
            </span>
            <span className="text-[11px] text-slate-500">
              Extraction:{" "}
              {invoice.extractionEngine === "OPENAI"
                ? "OpenAI structured output"
                : invoice.extractionEngine === "LOCAL_HEURISTIC"
                  ? "Deterministic local parser"
                  : "Manual entry"}
              {invoice.extractionConfidence !== null
                ? ` · ${invoice.extractionConfidence}% confidence`
                : ""}
            </span>
          </>
        }
        actions={
          <>
            {canEdit && invoice.status !== "VERIFIED" && invoice.sourceDocumentId ? (
              <ReprocessButton invoiceId={invoice.id} />
            ) : null}
            {!vendorView ? (
              <UploadDocumentButton entityType="INVOICE" entityId={invoice.id} />
            ) : null}
            {canSettle && invoice.status === "VERIFIED" ? (
              <CreateSettlementButton
                invoiceId={invoice.id}
                invoiceTotal={toMajorString(invoice.totalMinor)}
                currency={invoice.currency}
                runs={runs.map((run) => ({
                  id: run.id,
                  createdAt: formatDateTime(run.createdAt),
                }))}
              />
            ) : null}
          </>
        }
      />

      {duplicate ? (
        <Alert
          tone="warning"
          title="Possible duplicate invoice"
          className="mb-4"
          action={{ href: `/invoices/${duplicate.id}`, label: "Open original invoice" }}
        >
          This invoice shares an invoice number and vendor with a record created{" "}
          {formatDateTime(duplicate.createdAt)}. Do not pay twice; resolve the duplicate before
          settlement.
        </Alert>
      ) : null}

      {invoice.status === "FAILED" ? (
        <Alert tone="danger" title="Extraction failed" className="mb-4">
          {invoice.processingError ??
            "The document is stored, but no fields were extracted. Enter the invoice manually and verify."}
        </Alert>
      ) : null}

      {invoice.status === "NEEDS_REVIEW" ? (
        <Alert tone="warning" title="Fields need verification" className="mb-4">
          Missing or low-confidence fields are marked for review. Verify the vendor, dates, totals,
          and every line item before reconciliation.
        </Alert>
      ) : null}

      {!invoice.vendorId ? (
        <Alert tone="warning" title="Vendor not assigned" className="mb-4">
          Choose a vendor in the editor and save. Reconciliation and settlements require a vendor
          with an exact organization-scoped match.
        </Alert>
      ) : null}

      {invoice.status === "VERIFIED" ? (
        <Alert tone="success" title="Verified for reconciliation" className="mb-4">
          Human verification was recorded. The deterministic engine may now compare this invoice
          with a purchase order and goods receipts.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Invoice summary</CardTitle>
                <CardDescription>
                  Values are stored as integer minor units. Display formatting does not change the
                  stored amount.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={3}
                items={[
                  { label: "Vendor", value: vendorName },
                  { label: "Vendor code", value: vendor?.code ?? "—" },
                  { label: "Vendor status", value: vendor ? vendor.status : "Unassigned" },
                  { label: "Invoice issue date", value: invoice.issueDate ? formatDate(invoice.issueDate) : "—" },
                  { label: "Due date", value: invoice.dueDate ? formatDate(invoice.dueDate) : "—" },
                  { label: "PO reference", value: invoice.poReference ?? "—" },
                  { label: "Currency", value: invoice.currency },
                  {
                    label: "Extraction engine",
                    value:
                      invoice.extractionEngine === "OPENAI"
                        ? "OpenAI"
                        : invoice.extractionEngine === "LOCAL_HEURISTIC"
                          ? "Local parser"
                          : humanize(invoice.extractionEngine),
                  },
                  {
                    label: "Source document",
                    value: sourceDocument ? (
                      <a
                        href={sourceDocumentHref ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                      >
                        Open file <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      "Not stored"
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Line items and totals</CardTitle>
                <CardDescription>
                  Line totals are computed by the service from quantity and unit price.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <TableWrap>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Description</TH>
                    <TH>SKU</TH>
                    <TH className="text-right">Quantity</TH>
                    <TH className="text-right">Unit price</TH>
                    <TH className="text-right">Tax %</TH>
                    <TH className="text-right">Line total</TH>
                  </TR>
                </THead>
                <TBody>
                  {lineItems.length === 0 ? (
                    <TR>
                      <TD colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        No line items recorded. Add them in the editor below.
                      </TD>
                    </TR>
                  ) : (
                    lineItems.map((line) => (
                      <TR key={line.id}>
                        <TD className="text-xs text-slate-400">{line.lineNumber}</TD>
                        <TD className="text-xs font-medium text-slate-800">{line.description}</TD>
                        <TD className="text-xs text-slate-500">{line.sku ?? "—"}</TD>
                        <TD className="numeric text-right text-xs">
                          {formatQuantityPlain(line.quantityMilli)}
                        </TD>
                        <TD className="numeric text-right text-xs">
                          {formatMinor(line.unitPriceMinor, invoice.currency)}
                        </TD>
                        <TD className="numeric text-right text-xs">
                          {(line.taxRateBps / 100).toFixed(2)}
                        </TD>
                        <TD className="numeric text-right text-xs font-medium">
                          {formatMinor(line.lineTotalMinor, invoice.currency)}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </TableWrap>
              <div className="flex justify-end border-t border-[var(--border)] p-4">
                <dl className="w-full max-w-xs space-y-1.5 text-xs">
                  {[
                    ["Subtotal", invoice.subtotalMinor],
                    ["Tax", invoice.taxMinor],
                    ["Discount", invoice.discountMinor],
                    ["Shipping", invoice.shippingMinor],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="numeric text-slate-700">
                        {formatMinor(value as bigint, invoice.currency)}
                      </dd>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[13px] font-semibold">
                    <dt className="text-slate-900">Invoice total</dt>
                    <dd className="numeric text-slate-950">
                      {formatMinor(invoice.totalMinor, invoice.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Correct extracted fields</CardTitle>
                  <CardDescription>
                    Human verification is required. Saving corrections does not bypass the
                    reconciliation rules.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <InvoiceEditor
                  invoiceId={invoice.id}
                  vendors={vendorOptions.map((item) => ({
                    id: item.id,
                    name: item.name,
                    code: item.code,
                  }))}
                  initialInvoice={{
                    invoiceNumber: invoice.invoiceNumber,
                    vendorId: invoice.vendorId,
                    vendorNameRaw: invoice.vendorNameRaw,
                    issueDate: invoice.issueDate,
                    dueDate: invoice.dueDate,
                    currency: invoice.currency,
                    poReference: invoice.poReference,
                    subtotal: toMajorString(invoice.subtotalMinor),
                    tax: toMajorString(invoice.taxMinor),
                    discount: toMajorString(invoice.discountMinor),
                    shipping: toMajorString(invoice.shippingMinor),
                    total: toMajorString(invoice.totalMinor),
                  }}
                  initialLines={lineItems.map((line) => ({
                    description: line.description,
                    sku: line.sku ?? "",
                    quantity: formatQuantityPlain(line.quantityMilli),
                    unitPrice: toMajorString(line.unitPriceMinor),
                    taxRatePercent: (line.taxRateBps / 100).toString(),
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" />
                <div>
                  <CardTitle>Record activity</CardTitle>
                  <CardDescription>
                    Audit entries written by server actions. Financial actions are never hidden.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-xs text-slate-500">No audit entries yet.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                  {activity.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-300" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-800">
                          {humanize(entry.action)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(entry.createdAt)} · {entry.actorLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                        {entry.description}
                      </p>
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
                <CardTitle>Evidence documents</CardTitle>
                <CardDescription>
                  Private files with hashes and access tokens. Links expire.
                </CardDescription>
              </div>
              {!vendorView ? (
                <UploadDocumentButton
                  entityType="INVOICE"
                  entityId={invoice.id}
                  label="Add"
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                  <Paperclip className="mx-auto mb-1.5 h-4 w-4 text-slate-400" />
                  No documents linked.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {documents.map((document) => (
                    <li key={document.id} className="flex items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <a
                          href={documentHref(document.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-slate-800 hover:text-indigo-700"
                        >
                          <span className="truncate">{document.title || document.fileName}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {document.documentType.replaceAll("_", " ").toLowerCase()} ·{" "}
                          {(document.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                          {formatDate(document.createdAt)}
                        </p>
                      </div>
                      {document.id === invoice.sourceDocumentId ? (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                          SOURCE
                        </span>
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
                <CardTitle>Reconciliation</CardTitle>
                <CardDescription>
                  Deterministic three-way match. AI cannot change the result.
                </CardDescription>
              </div>
              <GitCompareArrows className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {runs.length > 0 ? (
                <div className="mb-4">
                  <SectionTitle title="Previous runs" />
                  <ul className="divide-y divide-slate-100">
                    {runs.map((run) => (
                      <li key={run.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/reconciliation/${run.id}`}
                            className="text-xs font-medium text-indigo-700 hover:underline"
                          >
                            {formatDateTime(run.createdAt)}
                          </Link>
                          <StatusBadge status={run.status} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {run.discrepancyCount} finding{run.discrepancyCount === 1 ? "" : "s"} ·{" "}
                          {formatMinor(run.potentialImpactMinor, invoice.currency)} flagged exposure
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!vendorView && invoice.status === "VERIFIED" ? (
                <ReconcileForm
                  invoiceId={invoice.id}
                  purchaseOrders={purchaseOrderCandidates.map((po) => ({
                    id: po.id,
                    poNumber: po.poNumber,
                    vendorName: vendor?.name ?? "Vendor",
                    status: po.status,
                  }))}
                />
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
                  {vendorView
                    ? "Your buyer runs reconciliation internally. The resulting evidence may be shared through a settlement proposal."
                    : invoice.status === "VERIFIED"
                      ? "No eligible purchase orders were found for this vendor."
                      : "Verify the invoice before running reconciliation."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Settlements</CardTitle>
                <CardDescription>Approved commercial proposals linked to this invoice.</CardDescription>
              </div>
              <BadgeCheck className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                  No settlement proposal recorded.
                  {canSettle && invoice.status !== "VERIFIED" ? (
                    <span className="mt-1 block">Verify the invoice to enable proposals.</span>
                  ) : null}
                </div>
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
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Data integrity
            </p>
            <p className="mt-1">
              Original amounts remain available even after a correction. Verification and
              settlement actions are written to the audit trail with actor and timestamp.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <Link
          href="/invoices"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <FileText className="h-3.5 w-3.5" /> All invoices
        </Link>
        {sourceDocumentHref ? (
          <a
            href={sourceDocumentHref}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ExternalLink className="h-3.5 w-3.5" /> View source document
          </a>
        ) : null}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
          {invoice.status === "VERIFIED" ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Human-verified record
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3 text-amber-600" /> Not yet verified
            </>
          )}
        </span>
      </div>
    </div>
  );
}
