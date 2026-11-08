import { AlertTriangle, CreditCard, FileBarChart, FileText, Handshake } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getReportSummary } from "@/lib/services/reports";
import { formatMinor } from "@/lib/money";
import { PageHeader, StatCard } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReportExportPanel } from "@/components/reports/report-export-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireInternalPage("view_reports");
  const summary = await getReportSummary(ctx);
  const currency = ctx.organization.baseCurrency;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Organization-scoped operational reporting. Every export is generated from database records and written to the audit trail."
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            CSV · exact decimal strings · UTF-8 BOM
          </span>
        }
      />

      <div className="bg-white">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Invoices"
            value={summary.invoices.count}
            hint={`${summary.invoices.verified} verified · ${formatMinor(summary.invoices.totalMinor, currency)} recorded`}
            icon={FileText}
          />
          <StatCard
            label="Open discrepancies"
            value={summary.discrepancies.open}
            hint={`${formatMinor(summary.discrepancies.exposureMinor, currency)} flagged exposure`}
            icon={AlertTriangle}
            tone="warning"
          />
          <StatCard
            label="Settlements"
            value={summary.settlements.count}
            hint={`${summary.settlements.paid} paid · ${formatMinor(summary.settlements.proposedMinor, currency)} proposed`}
            icon={Handshake}
          />
          <StatCard
            label="Confirmed payments"
            value={summary.payments.succeeded}
            hint={formatMinor(summary.payments.amountMinor, currency)}
            icon={CreditCard}
            tone="success"
          />
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Export a report</CardTitle>
            <CardDescription>
              Choose a dataset and optional date range. Files download directly from the
              authenticated API; no report is generated client-side.
            </CardDescription>
          </div>
          <FileBarChart className="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent>
          <ReportExportPanel />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Available datasets</CardTitle>
            <CardDescription>What each export contains.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <dl className="divide-y divide-[var(--border)]">
            {[
              [
                "invoices",
                "Invoice register",
                "Invoice number, vendor, status, dates, currency, exact subtotal/tax/discount/shipping/total, PO reference, extraction engine, confidence, and IDs.",
              ],
              [
                "discrepancies",
                "Discrepancy register",
                "Rule code, severity, title, description, stored calculation, expected/actual values, flagged exposure, status, reviewer note, and IDs.",
              ],
              [
                "reconciliation",
                "Reconciliation register",
                "Invoice and PO numbers, engine version, ordered/received/usable/short quantities, invoice total, potential quantity exposure, potential impact, and run IDs.",
              ],
              [
                "settlements",
                "Settlement register",
                "Settlement number, vendor, invoice, status, original/disputed/proposed amounts, currency, reason, workflow timestamps, and IDs.",
              ],
              [
                "payments",
                "Payment register",
                "Provider, provider order and capture IDs, exact amount, currency, status, failure reason, confirmation timestamp, and IDs.",
              ],
              [
                "audit",
                "Audit trail",
                "Timestamp, actor type/label, action, entity, description, IP, and audit ID. Capped at 20,000 rows per export.",
              ],
            ].map(([key, title, description]) => (
              <div key={key} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr]">
                <dt className="font-mono text-[10px] text-slate-500">{key}</dt>
                <dd>
                  <p className="text-xs font-medium text-slate-800">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
