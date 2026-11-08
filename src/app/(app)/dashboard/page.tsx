import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  Clock,
  FileText,
  Handshake,
  Plus,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/services/dashboard";
import { formatMinor } from "@/lib/money";
import { formatDateTime, humanize } from "@/lib/ui";
import { PageHeader, StatCard, DescriptionList } from "@/components/ui/page";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD, TDEmpty } from "@/components/ui/table";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";
import { buttonVariants } from "@/components/ui/button";
import { isVendor } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const ctx = await requireAppContext();
  const { denied } = await searchParams;
  const data = await getDashboardData(ctx);

  if (isVendor(ctx) && data.kind === "VENDOR") {
    return (
      <div>
        <PageHeader
          title={`Welcome, ${ctx.user.name.split(" ")[0]}`}
          description="Your invoices, settlement proposals, and confirmed payments from this buyer."
          meta={<StatusBadge status="VENDOR" label="Vendor portal" />}
        />
        {denied ? (
          <Alert tone="warning" title="That area is restricted for your role" className="mb-5">
            The server refused access to <code className="font-mono text-[11px]">{humanize(denied)}</code>.
            Ask the buyer if you need a different role.
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Your invoices" value={data.invoiceCount} icon={FileText} href="/invoices" />
          <StatCard
            label="Open settlements"
            value={data.openSettlements.length}
            icon={Handshake}
            href="/settlements"
          />
          <StatCard
            label="Confirmed paid"
            value={formatMinor(data.paidTotalMinor, data.recentSettlements[0]?.currency ?? "INR")}
            icon={CircleDollarSign}
            href="/payments"
            tone="success"
          />
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent settlements</CardTitle>
                <CardDescription>Proposals shared with your organization.</CardDescription>
              </div>
              <Link href="/settlements" className="text-xs font-medium text-indigo-700 hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {data.recentSettlements.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">No settlements yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentSettlements.map((settlement) => (
                    <li key={settlement.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/settlements/${settlement.id}`} className="text-xs font-medium text-slate-900 hover:text-indigo-700">
                          {settlement.settlementNumber}
                        </Link>
                        <p className="text-[10px] text-slate-500">{formatDateTime(settlement.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-xs font-medium text-slate-900">
                          {formatMinor(settlement.proposedAmountMinor, settlement.currency)}
                        </p>
                        <StatusBadge status={settlement.status} className="mt-0.5" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Confirmed payments</CardTitle>
                <CardDescription>Recorded only from a PayPal confirmation.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {data.recentPayments.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">No payments recorded.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentPayments.map((row) => (
                    <li key={row.payment.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/payments/${row.payment.id}`} className="text-xs font-medium text-slate-900 hover:text-indigo-700">
                          {row.settlementNumber}
                        </Link>
                        <p className="text-[10px] text-slate-500">{formatDateTime(row.payment.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-xs font-medium text-slate-900">
                          {formatMinor(row.payment.amountMinor, row.payment.currency)}
                        </p>
                        <StatusBadge status={row.payment.status} className="mt-0.5" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (data.kind !== "INTERNAL") return null;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${ctx.user.name.split(" ")[0]}`}
        description="A live view of invoice exposure, reconciliation exceptions, approvals, and confirmed payments."
        actions={
          <>
            <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" /> Upload invoice
            </Link>
            <Link href="/reconciliation" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Reconciliations
            </Link>
          </>
        }
        meta={
          <>
            <StatusBadge status={ctx.membership.role} />
            <span className="text-[11px] text-slate-500">{ctx.organization.name}</span>
            {ctx.organization.isDemo ? (
              <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Demo data — reset with npm run db:reset
              </span>
            ) : null}
          </>
        }
      />

      {denied ? (
        <Alert tone="warning" title="That area is restricted for your role" className="mb-5">
          The server refused access to <code className="font-mono text-[11px]">{humanize(denied)}</code>.
          Ask an administrator if you need a different role or approval limit.
        </Alert>
      ) : null}

      {ctx.organization.isDemo ? (
        <Alert tone="info" title="You are in the labelled demo workspace" className="mb-5">
          Seeded records are reset with <code className="font-mono text-[11px]">npm run db:reset</code>.
          Amounts are exact seeded examples. Payment execution requires PayPal sandbox credentials
          and a PayPal-supported currency.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoice value in system"
          value={formatMinor(
            data.invoiceStatus.reduce((sum, row) => sum + row.amountMinor, 0n),
            ctx.organization.baseCurrency,
          )}
          hint={`${data.invoiceCount} invoice${data.invoiceCount === 1 ? "" : "s"} · ${data.pendingReviewCount} awaiting review`}
          icon={FileText}
          href="/invoices"
        />
        <StatCard
          label="Verified invoice value"
          value={formatMinor(data.verifiedAmountMinor, ctx.organization.baseCurrency)}
          hint="Human-verified records only"
          icon={BadgeCheck}
          href="/invoices?status=VERIFIED"
          tone="success"
        />
        <StatCard
          label="Open discrepancy exposure"
          value={formatMinor(data.openDiscrepancyAmountMinor, ctx.organization.baseCurrency)}
          hint={`${data.openDiscrepancyCount} open rule finding${data.openDiscrepancyCount === 1 ? "" : "s"} · not an amount owed`}
          icon={AlertTriangle}
          href="/discrepancies"
          tone={data.openDiscrepancyCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Awaiting internal approval"
          value={formatMinor(data.pendingApprovalAmountMinor, ctx.organization.baseCurrency)}
          hint={`${data.pendingApprovalCount} settlement proposal${data.pendingApprovalCount === 1 ? "" : "s"}`}
          icon={WalletCards}
          href="/approvals"
          tone={data.pendingApprovalCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Ready for payment"
          value={formatMinor(data.readyForPaymentAmountMinor, ctx.organization.baseCurrency)}
          hint={`${data.readyForPaymentCount} approved and accepted`}
          icon={Banknote}
          href="/settlements"
        />
        <StatCard
          label="Confirmed paid"
          value={formatMinor(data.paidAmountMinor, ctx.organization.baseCurrency)}
          hint={`${data.paidCount} provider-confirmed capture${data.paidCount === 1 ? "" : "s"}`}
          icon={CircleDollarSign}
          href="/payments"
          tone="success"
        />
        <StatCard
          label="Pending review"
          value={data.pendingReviewCount}
          hint="Extraction and verification queue"
          icon={Clock}
          href="/invoices?status=NEEDS_REVIEW"
        />
        <StatCard
          label="Vendors on record"
          value={data.vendorExposure.length ? data.vendorExposure.length : "—"}
          hint="Vendors with open flagged exposure shown below"
          icon={Handshake}
          href="/vendors"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invoice value and confirmed payments</CardTitle>
              <CardDescription>Last six months, based on records in this workspace.</CardDescription>
            </div>
            <span className="text-[10px] text-slate-400">Display chart · exact values in tables</span>
          </CardHeader>
          <CardContent>
            <MonthlyChart
              currency={ctx.organization.baseCurrency}
              data={data.monthly.map((row) => ({
                month: row.month,
                invoiceValueMinor: row.invoiceValueMinor.toString(),
                paidValueMinor: row.paidValueMinor.toString(),
                invoiceCount: row.invoiceCount,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Exception exposure by vendor</CardTitle>
              <CardDescription>Positive flagged impact on open findings.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data.vendorExposure.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">
                No open discrepancy exposure. Run a reconciliation to populate this view.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.vendorExposure.map((vendor) => (
                  <li key={vendor.vendorId}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <Link
                        href={`/vendors/${vendor.vendorId}`}
                        className="truncate font-medium text-slate-800 hover:text-indigo-700"
                      >
                        {vendor.vendorName}
                      </Link>
                      <span className="numeric shrink-0 font-medium text-slate-900">
                        {formatMinor(vendor.exposureMinor, ctx.organization.baseCurrency)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{
                          width: `${Math.max(
                            4,
                            Math.min(
                              100,
                              (Number(vendor.exposureMinor) /
                                Math.max(
                                  1,
                                  Number(data.vendorExposure[0]?.exposureMinor ?? 1n),
                                )) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {vendor.openCount} open finding{vendor.openCount === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500">
              Flagged exposure is the rule engine&apos;s positive impact calculation. It does not
              establish an amount owed or a revised payable.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent invoices</CardTitle>
              <CardDescription>Every status requires human action before money moves.</CardDescription>
            </div>
            <Link href="/invoices" className="text-xs font-medium text-indigo-700 hover:underline">
              All invoices
            </Link>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <TableWrap>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Vendor</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {data.recentInvoices.length === 0 ? (
                  <TDEmpty
                    colSpan={4}
                    title="No invoices yet"
                    description="Upload the first invoice to begin extraction and verification."
                    action={
                      <Link href="/invoices/new" className={buttonVariants({ size: "sm" })}>
                        Upload invoice
                      </Link>
                    }
                  />
                ) : (
                  data.recentInvoices.map(({ invoice, vendorName }) => (
                    <TR key={invoice.id}>
                      <TD>
                        <Link href={`/invoices/${invoice.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                          {invoice.invoiceNumber || "Untitled"}
                        </Link>
                        <p className="text-[10px] text-slate-500">{formatDateTime(invoice.createdAt)}</p>
                      </TD>
                      <TD className="text-xs">{vendorName ?? invoice.vendorNameRaw ?? "Unassigned"}</TD>
                      <TD><StatusBadge status={invoice.status} /></TD>
                      <TD className="numeric text-right text-xs font-medium">
                        {formatMinor(invoice.totalMinor, invoice.currency)}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </TableWrap>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent reconciliations</CardTitle>
              <CardDescription>Deterministic engine runs with stored snapshots.</CardDescription>
            </div>
            <Link href="/reconciliation" className="text-xs font-medium text-indigo-700 hover:underline">
              All runs
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentRuns.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No reconciliation runs yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentRuns.map(({ run, invoiceNumber }) => (
                  <li key={run.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/reconciliation/${run.id}`} className="text-xs font-medium text-slate-900 hover:text-indigo-700">
                        {invoiceNumber}
                      </Link>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{run.discrepancyCount} finding{run.discrepancyCount === 1 ? "" : "s"}</span>
                      <span className="numeric">{formatMinor(run.potentialImpactMinor, ctx.organization.baseCurrency)} flagged</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {data.approvals.length > 0 ? (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Approvals waiting</CardTitle>
                <CardDescription>
                  Segregation of duties applies: a non-admin creator cannot approve their own settlement.
                </CardDescription>
              </div>
              <Link href="/approvals" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Open approvals <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={2}
                items={data.approvals.slice(0, 4).map(({ settlement, vendorName }) => ({
                  label: `${settlement.settlementNumber} · ${vendorName}`,
                  value: (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="numeric">{formatMinor(settlement.proposedAmountMinor, settlement.currency)}</span>
                      <StatusBadge status={settlement.status} />
                      <Link href={`/settlements/${settlement.id}`} className="text-xs font-medium text-indigo-700 hover:underline">
                        Review
                      </Link>
                    </span>
                  ),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        Dashboard figures are generated from live workspace queries. No sample numbers are shown
        when the workspace is empty.
      </div>
    </div>
  );
}
