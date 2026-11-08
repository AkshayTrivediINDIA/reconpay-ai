import Link from "next/link";
import { FileSearch, Search } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listReconciliationRuns } from "@/lib/services/reconciliation";
import { formatMinor } from "@/lib/money";
import { formatDateTime } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliation" };

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const ctx = await requireInternalPage("run_reconciliation");
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { runs } = await listReconciliationRuns(ctx, {
    search: params.search,
    page,
    pageSize: 25,
  });

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Deterministic three-way match runs. Each run stores its input snapshot, rules, source references, and exact arithmetic."
        actions={
          <Link
            href="/invoices?status=VERIFIED"
            className="text-xs font-medium text-indigo-700 hover:underline"
          >
            Choose a verified invoice
          </Link>
        }
      />
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="text-xs text-slate-500">
            Runs are immutable evidence. Resolve discrepancies on the run record; never edit the
            engine output.
          </p>
          <form className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Invoice or PO number"
              aria-label="Search reconciliation runs"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {runs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={FileSearch}
                title={params.search ? "No matching runs" : "No reconciliation runs yet"}
                description={
                  params.search
                    ? "Try a different invoice or purchase order number."
                    : "Open a verified invoice and run reconciliation against its purchase order and goods receipts."
                }
                action={{ href: "/invoices?status=VERIFIED", label: "Open verified invoices" }}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Run</TH>
                  <TH>Invoice</TH>
                  <TH>Purchase order</TH>
                  <TH>Vendor</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Findings</TH>
                  <TH className="text-right">Flagged exposure</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map(({ run, invoiceNumber, invoiceCurrency, poNumber, vendorName }) => (
                  <TR key={run.id}>
                    <TD>
                      <Link
                        href={`/reconciliation/${run.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        Run {run.id.slice(0, 8)}
                      </Link>
                      <p className="text-[10px] text-slate-500">
                        {formatDateTime(run.createdAt)} · engine v{run.engineVersion}
                      </p>
                    </TD>
                    <TD className="text-xs">{invoiceNumber || "Untitled"}</TD>
                    <TD className="text-xs">{poNumber}</TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD><StatusBadge status={run.status} /></TD>
                    <TD className="numeric text-right text-xs">{run.discrepancyCount}</TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {formatMinor(run.potentialImpactMinor, invoiceCurrency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            Page {page}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
