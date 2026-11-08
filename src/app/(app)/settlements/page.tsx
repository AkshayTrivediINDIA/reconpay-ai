import Link from "next/link";
import { Handshake, Search } from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { isVendor } from "@/lib/auth/rbac";
import { listSettlements } from "@/lib/services/settlements";
import { formatMinor } from "@/lib/money";
import { formatDate } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settlements" };

const statuses = [
  "ALL",
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SHARED",
  "VENDOR_ACCEPTED",
  "READY_FOR_PAYMENT",
  "PAID",
];

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireAppContext();
  const vendorView = isVendor(ctx);
  const params = await searchParams;
  const status = params.status ?? "ALL";
  const page = Number(params.page ?? "1");
  const { settlements, total } = await listSettlements(ctx, {
    search: params.search,
    status,
    page,
    pageSize: 25,
  });

  return (
    <div>
      <PageHeader
        title={vendorView ? "Your settlements" : "Settlements"}
        description={
          vendorView
            ? "Commercial proposals shared with your organization. Responses are recorded, and payment only follows buyer approval."
            : "Controlled proposals that link verified evidence, internal approval, vendor acceptance, and payment readiness. Creating a proposal never moves money."
        }
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {total} record{total === 1 ? "" : "s"}
          </span>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {statuses.map((item) => (
              <Link
                key={item}
                href={item === "ALL" ? "/settlements" : `/settlements?status=${item}`}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium",
                  status === item
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {item.replaceAll("_", " ").toLowerCase()}
              </Link>
            ))}
          </div>
          <form className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Settlement, vendor, invoice, reason"
              aria-label="Search settlements"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {settlements.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Handshake}
                title={params.search ? "No matching settlements" : "No settlements yet"}
                description={
                  params.search
                    ? "Try a different settlement number, vendor, invoice, or reason."
                    : vendorView
                      ? "When the buyer shares a settlement proposal, it will appear here."
                      : "Open a verified invoice and create a settlement proposal after reconciliation."
                }
                {...(!vendorView
                  ? { action: { href: "/invoices?status=VERIFIED", label: "Open verified invoices" } }
                  : {})}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Settlement</TH>
                  <TH>Vendor</TH>
                  <TH>Invoice</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Proposed amount</TH>
                  <TH>Created</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {settlements.map(({ settlement, vendorName, invoiceNumber }) => (
                  <TR key={settlement.id}>
                    <TD>
                      <Link
                        href={`/settlements/${settlement.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {settlement.settlementNumber}
                      </Link>
                      <p className="max-w-xs truncate text-[10px] text-slate-500">
                        {settlement.reason}
                      </p>
                    </TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD className="text-xs">{invoiceNumber || "Untitled"}</TD>
                    <TD>
                      <StatusBadge status={settlement.status} />
                    </TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {formatMinor(settlement.proposedAmountMinor, settlement.currency)}
                      <p className="text-[9px] font-normal text-slate-400">
                        Original {formatMinor(settlement.originalAmountMinor, settlement.currency)}
                      </p>
                    </TD>
                    <TD className="text-xs">{formatDate(settlement.createdAt)}</TD>
                    <TD className="text-right">
                      <Link
                        href={`/settlements/${settlement.id}`}
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
            Page {page} · Proposed amounts are not payments
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
