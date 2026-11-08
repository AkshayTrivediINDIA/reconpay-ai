import Link from "next/link";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listPurchaseOrders } from "@/lib/services/purchase-orders";
import { formatMinor } from "@/lib/money";
import { formatDate, humanize, cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase orders" };

const statuses = ["ALL", "OPEN", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] as const;

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const params = await searchParams;
  const status = params.status ?? "ALL";
  const page = Number(params.page ?? "1");
  const { purchaseOrders, total } = await listPurchaseOrders(ctx, {
    search: params.search,
    status,
    page,
    pageSize: 25,
  });

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="The authorized quantity and price baseline. Goods receipts and invoices are matched against this record."
        actions={
          <Link href="/purchase-orders/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="h-3.5 w-3.5" /> New purchase order
          </Link>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {statuses.map((item) => (
              <Link
                key={item}
                href={item === "ALL" ? "/purchase-orders" : `/purchase-orders?status=${item}`}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  status === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {humanize(item)}
              </Link>
            ))}
          </div>
          <form className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="PO number, vendor, or notes"
              aria-label="Search purchase orders"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {purchaseOrders.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={ShoppingCart}
                title={params.search ? "No matching purchase orders" : "No purchase orders yet"}
                description={
                  params.search
                    ? "Try a different PO number or vendor name."
                    : "Create the authorized procurement baseline first. Goods receipts and invoices are reconciled against it."
                }
                action={{ href: "/purchase-orders/new", label: "Create purchase order" }}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>PO number</TH>
                  <TH>Vendor</TH>
                  <TH>Order date</TH>
                  <TH>Expected delivery</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {purchaseOrders.map(({ purchaseOrder, vendorName }) => (
                  <TR key={purchaseOrder.id}>
                    <TD>
                      <Link
                        href={`/purchase-orders/${purchaseOrder.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {purchaseOrder.poNumber}
                      </Link>
                      <p className="text-[10px] text-slate-500">
                        Created {formatDate(purchaseOrder.createdAt)}
                      </p>
                    </TD>
                    <TD className="text-xs">{vendorName}</TD>
                    <TD className="text-xs">{formatDate(purchaseOrder.orderDate)}</TD>
                    <TD className="text-xs">
                      {purchaseOrder.expectedDeliveryDate
                        ? formatDate(purchaseOrder.expectedDeliveryDate)
                        : "—"}
                    </TD>
                    <TD>
                      <StatusBadge status={purchaseOrder.status} />
                    </TD>
                    <TD className="numeric text-right text-xs font-medium">
                      {formatMinor(purchaseOrder.totalMinor, purchaseOrder.currency)}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/purchase-orders/${purchaseOrder.id}`}
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
            <span>{total} purchase order{total === 1 ? "" : "s"}</span>
            <span>Page {page}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
