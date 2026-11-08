import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listDiscrepancies } from "@/lib/services/reconciliation";
import { formatMinor } from "@/lib/money";
import { formatDateTime } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { DiscrepancyActions } from "@/components/discrepancies/discrepancy-actions";
import { can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discrepancies" };

export default async function DiscrepanciesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    severity?: string;
    page?: string;
  }>;
}) {
  const ctx = await requireInternalPage("resolve_discrepancy");
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { discrepancies, total } = await listDiscrepancies(ctx, {
    search: params.search,
    status: params.status ?? "ALL",
    severity: params.severity ?? "ALL",
    page,
    pageSize: 25,
  });
  const statuses = ["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED", "DISPUTED", "WAIVED"];
  const severities = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
  const canResolve = can(ctx, "resolve_discrepancy");

  return (
    <div>
      <PageHeader
        title="Discrepancies"
        description="Rule findings from deterministic reconciliation. Resolve or dispute each finding with a recorded reason; the original calculation is preserved."
        meta={
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            Flagged exposure is a review signal, not an amount owed
          </span>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4">
          <div className="flex flex-wrap gap-1">
            {statuses.map((status) => (
              <Link
                key={status}
                href={
                  status === "ALL"
                    ? "/discrepancies"
                    : `/discrepancies?status=${status}`
                }
                className={
                  (params.status ?? "ALL") === status
                    ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                }
              >
                {status.replaceAll("_", " ").toLowerCase()}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <form className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  name="search"
                  defaultValue={params.search}
                  placeholder="Title, rule, invoice, vendor"
                  aria-label="Search discrepancies"
                  className="h-8 w-56 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <select
                name="severity"
                defaultValue={params.severity ?? "ALL"}
                aria-label="Filter by severity"
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                {severities.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity === "ALL" ? "All severities" : severity}
                  </option>
                ))}
              </select>
              {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
              <button type="submit" className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Apply
              </button>
            </form>
            <p className="text-[11px] text-slate-500">{total} finding{total === 1 ? "" : "s"}</p>
          </div>
        </div>
        <CardContent className="px-0 pb-0">
          {discrepancies.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={AlertTriangle}
                title={params.search || params.severity ? "No matching findings" : "No discrepancies detected"}
                description={
                  params.search || params.severity
                    ? "Try a different search or severity filter."
                    : "Run a reconciliation on a verified invoice. If it matches cleanly, no findings are created."
                }
                action={{ href: "/invoices?status=VERIFIED", label: "Open verified invoices" }}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Finding</TH>
                  <TH>Invoice</TH>
                  <TH>Vendor</TH>
                  <TH>Severity</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Flagged impact</TH>
                  <TH aria-label="Actions" />
                </TR>
              </THead>
              <TBody>
                {discrepancies.map(({ discrepancy: item, invoiceNumber, vendorName, runId }) => (
                  <TR key={item.id}>
                    <TD>
                      <p className="text-xs font-medium text-slate-900">{item.title}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-500">{item.ruleCode}</p>
                      <p className="mt-0.5 max-w-lg text-[10px] leading-4 text-slate-500">
                        {item.description}
                      </p>
                      <p className="mt-0.5 text-[9px] text-slate-400">
                        {formatDateTime(item.createdAt)} ·{" "}
                        <Link href={`/reconciliation/${runId}`} className="text-indigo-700 hover:underline">
                          View run
                        </Link>
                      </p>
                    </TD>
                    <TD className="text-xs">
                      <Link href={`/invoices/${item.invoiceId}`} className="text-indigo-700 hover:underline">
                        {invoiceNumber || "Untitled"}
                      </Link>
                    </TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD><StatusBadge status={item.severity} /></TD>
                    <TD><StatusBadge status={item.status} /></TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {item.impactMinor !== null
                        ? formatMinor(item.impactMinor, item.currency)
                        : "—"}
                    </TD>
                    <TD className="text-right">
                      {canResolve ? (
                        <DiscrepancyActions discrepancyId={item.id} currentStatus={item.status} compact />
                      ) : (
                        <span className="text-[10px] text-slate-400">Read only</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            Page {page} · Original calculations are never edited by a status decision
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
