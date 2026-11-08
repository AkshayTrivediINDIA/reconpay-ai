import Link from "next/link";
import { BadgeCheck, FileSearch } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listEvidenceRuns } from "@/lib/services/evidence";
import { formatMinor } from "@/lib/money";
import { formatDateTime } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence center" };

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireInternalPage("generate_evidence");
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { runs } = await listEvidenceRuns(ctx, { page, pageSize: 25 });

  return (
    <div>
      <PageHeader
        title="Evidence center"
        description="Completed reconciliation runs with generated evidence summaries and exportable PDF reports. Source documents and timeline events remain linked to the run."
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            AI summarizes stored evidence · it does not decide
          </span>
        }
      />
      <Card>
        <CardContent className="px-0 pb-0">
          {runs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={BadgeCheck}
                title="No completed reconciliation runs"
                description="Finish a reconciliation first. The evidence center only exposes completed runs and their stored source references."
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
                  <TH>Completed</TH>
                  <TH>Report</TH>
                  <TH className="text-right">Flagged</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {runs.map(({ run, invoiceNumber, poNumber, vendorName, reportId }) => (
                  <TR key={run.id}>
                    <TD>
                      <Link
                        href={`/evidence/${run.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        Run {run.id.slice(0, 8)}
                      </Link>
                      <p className="text-[10px] text-slate-500">engine v{run.engineVersion}</p>
                    </TD>
                    <TD className="text-xs">{invoiceNumber || "Untitled"}</TD>
                    <TD className="text-xs">{poNumber}</TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD className="text-xs">
                      {run.completedAt ? formatDateTime(run.completedAt) : "—"}
                    </TD>
                    <TD>
                      {reportId ? (
                        <StatusBadge status="READY" label="Generated" />
                      ) : (
                        <StatusBadge status="NOT_CONFIGURED" label="Not generated" />
                      )}
                    </TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {formatMinor(run.potentialImpactMinor, "INR")}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/evidence/${run.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
                      >
                        <FileSearch className="h-3 w-3" /> Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            Page {page} · PDF export requires a generated evidence summary
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
