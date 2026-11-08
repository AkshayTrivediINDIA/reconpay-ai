import Link from "next/link";
import { PackageCheck, Search } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listGoodsReceipts } from "@/lib/services/goods-receipts";
import { formatDate } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goods receipts" };

export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { receipts, total } = await listGoodsReceipts(ctx, {
    search: params.search,
    page,
    pageSize: 25,
  });

  return (
    <div>
      <PageHeader
        title="Goods receipts"
        description="Dated evidence of what actually arrived, including damaged units. Reconciliation credits usable quantities only."
        actions={
          <Link href="/goods-receipts/new" className={buttonVariants({ size: "sm" })}>
            <PackageCheck className="h-3.5 w-3.5" /> Record receipt
          </Link>
        }
      />
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="text-xs text-slate-500">
            {total} receipt{total === 1 ? "" : "s"} in this organization
          </p>
          <form className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Receipt, PO, or vendor"
              aria-label="Search goods receipts"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {receipts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={PackageCheck}
                title={params.search ? "No matching receipts" : "No goods receipts yet"}
                description={
                  params.search
                    ? "Try a different receipt number, PO number, or vendor."
                    : "Record a goods receipt against an open purchase order. Received and damaged quantities are stored separately."
                }
                action={{ href: "/goods-receipts/new", label: "Record goods receipt" }}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Receipt</TH>
                  <TH>Purchase order</TH>
                  <TH>Vendor</TH>
                  <TH>Received date</TH>
                  <TH>Status</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {receipts.map(({ receipt, poNumber, vendorName }) => (
                  <TR key={receipt.id}>
                    <TD>
                      <Link
                        href={`/goods-receipts/${receipt.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {receipt.receiptNumber}
                      </Link>
                      <p className="text-[10px] text-slate-500">
                        Recorded {formatDate(receipt.createdAt)}
                      </p>
                    </TD>
                    <TD className="text-xs">{poNumber}</TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD className="text-xs">{formatDate(receipt.receivedDate)}</TD>
                    <TD><StatusBadge status={receipt.status} /></TD>
                    <TD className="text-right">
                      <Link
                        href={`/goods-receipts/${receipt.id}`}
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
            Page {page}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
