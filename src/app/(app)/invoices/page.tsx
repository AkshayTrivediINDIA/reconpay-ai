import Link from "next/link";
import { FileText, Plus, Search, Upload } from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { isVendor } from "@/lib/auth/rbac";
import { listInvoices, invoiceStatusCounts } from "@/lib/services/invoices";
import { formatMinor } from "@/lib/money";
import { formatDate, humanize, cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices" };

const statuses = ["ALL", "NEEDS_REVIEW", "EXTRACTED", "VERIFIED", "FAILED"] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const status = params.status ?? "ALL";
  const page = Number(params.page ?? "1");
  const [{ invoices, total }, counts] = await Promise.all([
    listInvoices(ctx, { search: params.search, status, page, pageSize: 25 }),
    invoiceStatusCounts(ctx),
  ]);
  const countFor = (key: string) =>
    key === "ALL"
      ? counts.reduce((sum, row) => sum + row.total, 0)
      : (counts.find((row) => row.status === key)?.total ?? 0);

  return (
    <div>
      <PageHeader
        title={isVendor(ctx) ? "Your invoices" : "Invoices"}
        description={
          isVendor(ctx)
            ? "Invoices from your organization that are being processed by this buyer."
            : "Upload, extract, verify, and reconcile vendor invoices. AI extraction never replaces human verification."
        }
        actions={
          !isVendor(ctx) ? (
            <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" /> Upload invoice
            </Link>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {statuses.map((item) => (
              <Link
                key={item}
                href={item === "ALL" ? "/invoices" : `/invoices?status=${item}`}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  status === item
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {humanize(item)} <span className="opacity-60">{countFor(item)}</span>
              </Link>
            ))}
          </div>
          <form className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Invoice, PO, or vendor"
              aria-label="Search invoices"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {invoices.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={FileText}
                title={params.search ? "No matching invoices" : "No invoices yet"}
                description={
                  params.search
                    ? "Try a different invoice number, purchase order reference, or vendor name."
                    : isVendor(ctx)
                      ? "No invoices from your organization have been uploaded yet."
                      : "Upload a PDF or image invoice. Extraction is validated and every field can be corrected before verification."
                }
                action={
                  !isVendor(ctx)
                    ? { href: "/invoices/new", label: "Upload invoice" }
                    : undefined
                }
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Vendor</TH>
                  <TH>Issue date</TH>
                  <TH>PO reference</TH>
                  <TH>Extraction</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {invoices.map(({ invoice, vendorName }) => (
                  <TR key={invoice.id}>
                    <TD>
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                        {invoice.invoiceNumber || "Untitled invoice"}
                      </Link>
                      <p className="text-[10px] text-slate-500">
                        Uploaded {formatDate(invoice.createdAt)}
                        {invoice.duplicateOfInvoiceId ? " · possible duplicate" : ""}
                      </p>
                    </TD>
                    <TD className="text-xs">
                      {vendorName ?? invoice.vendorNameRaw ?? (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </TD>
                    <TD className="text-xs">{invoice.issueDate ? formatDate(invoice.issueDate) : "—"}</TD>
                    <TD className="text-xs">{invoice.poReference ?? "—"}</TD>
                    <TD className="text-[11px]">
                      <span className="block">
                        {invoice.extractionEngine === "OPENAI"
                          ? "OpenAI"
                          : invoice.extractionEngine === "LOCAL_HEURISTIC"
                            ? "Local parser"
                            : humanize(invoice.extractionEngine)}
                      </span>
                      <span className="text-slate-400">
                        {invoice.extractionConfidence !== null
                          ? `${invoice.extractionConfidence}% confidence`
                          : "manual"}
                      </span>
                    </TD>
                    <TD><StatusBadge status={invoice.status} /></TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {formatMinor(invoice.totalMinor, invoice.currency)}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-xs font-medium text-indigo-700 hover:underline"
                      >
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            <span>{total} invoice{total === 1 ? "" : "s"}</span>
            <span>Page {page}</span>
          </div>
        </CardContent>
      </Card>

      {!isVendor(ctx) ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-500">
          <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Accepted files: PDF, PNG, JPG up to 15 MB. Files are signature-checked. Without an OpenAI
          key, a deterministic local PDF text parser is used and clearly labelled.
        </div>
      ) : null}
    </div>
  );
}
