import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { isVendor } from "@/lib/auth/rbac";
import { listPayments, getPaymentStats } from "@/lib/services/payments";
import { formatMinor } from "@/lib/money";
import { formatDate } from "@/lib/ui";
import { PageHeader, StatCard } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireAppContext();
  const vendorView = isVendor(ctx);
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const [{ payments, total }, stats] = await Promise.all([
    listPayments(ctx, { page, pageSize: 25 }),
    getPaymentStats(ctx),
  ]);
  const succeeded = stats.find((row) => row.status === "SUCCEEDED");
  const processing = stats
    .filter((row) => ["CREATED", "AWAITING_APPROVAL", "PROCESSING"].includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);

  return (
    <div>
      <PageHeader
        title={vendorView ? "Your payments" : "Payments"}
        description="Provider payment records created from settlements. A payment is only shown as succeeded after PayPal confirms the capture; nothing is simulated."
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {total} record{total === 1 ? "" : "s"}
          </span>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Confirmed paid"
          value={formatMinor(
            BigInt(succeeded?.amount ?? "0"),
            ctx.organization.baseCurrency,
          )}
          hint={`${succeeded?.count ?? 0} succeeded provider capture${succeeded?.count === 1 ? "" : "s"}`}
          icon={CreditCard}
          tone="success"
        />
        <StatCard
          label="In progress"
          value={processing}
          hint="Orders awaiting buyer approval or capture"
        />
        <StatCard
          label="Payment rail"
          value="PayPal"
          hint="Server-created orders · verified webhooks · idempotency"
        />
      </div>
      <Card>
        <CardContent className="px-0 pb-0">
          {payments.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description={
                  vendorView
                    ? "When the buyer initiates a payment for an accepted settlement, the provider record appears here."
                    : "Payments can only be initiated for a settlement that is approved, vendor-accepted, and marked ready."
                }
                {...(!vendorView
                  ? { action: { href: "/settlements", label: "Open settlements" } }
                  : {})}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Payment</TH>
                  <TH>Settlement</TH>
                  <TH>Vendor</TH>
                  <TH>Provider</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Created</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {payments.map(({ payment, settlementNumber, vendorName, settlementId }) => (
                  <TR key={payment.id}>
                    <TD>
                      <Link
                        href={`/payments/${payment.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {payment.id.slice(0, 8)}
                      </Link>
                      <p className="font-mono text-[9px] text-slate-400">
                        {payment.providerOrderId ?? "No provider order"}
                      </p>
                    </TD>
                    <TD>

                      <Link
                        href={`/settlements/${settlementId}`}
                        className="text-xs text-indigo-700 hover:underline"
                      >
                        {settlementNumber}
                      </Link>
                    </TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD className="text-xs">{payment.provider}</TD>
                    <TD>
                      <StatusBadge status={payment.status} />
                    </TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {formatMinor(payment.amountMinor, payment.currency)}
                    </TD>
                    <TD className="text-xs">{formatDate(payment.createdAt)}</TD>
                    <TD className="text-right">
                      <Link
                        href={`/payments/${payment.id}`}
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
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            Page {page} · Success is recorded only from a verified PayPal capture
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
