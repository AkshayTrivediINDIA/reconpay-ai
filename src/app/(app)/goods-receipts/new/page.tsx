import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getReceiptEntryData } from "@/lib/services/goods-receipts";
import { listPurchaseOrders } from "@/lib/services/purchase-orders";
import { formatMinor, formatQuantityPlain } from "@/lib/money";
import { formatDate } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { GoodsReceiptForm } from "@/components/goods-receipts/goods-receipt-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record goods receipt" };

export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  if (!params.po) {
    const { purchaseOrders } = await listPurchaseOrders(ctx, { pageSize: 100 });
    const eligible = purchaseOrders.filter(({ purchaseOrder }) =>
      ["OPEN", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status),
    );
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/goods-receipts"
          className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to goods receipts
        </Link>
        <PageHeader
          title="Record goods receipt"
          description="Choose the open purchase order that the delivery belongs to."
        />
        <Card>
          <CardContent className="pt-5">
            {eligible.length === 0 ? (
              <Alert tone="warning" title="No open purchase orders">
                Open or create a purchase order before recording a goods receipt.{" "}
                <Link href="/purchase-orders/new" className="font-medium underline">
                  Create purchase order
                </Link>
              </Alert>
            ) : (
              <form action="/goods-receipts/new" method="get" className="space-y-4">
                <div>
                  <label htmlFor="po-select" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Purchase order
                  </label>
                  <select
                    id="po-select"
                    name="po"
                    required
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Select an open purchase order</option>
                    {eligible.map(({ purchaseOrder, vendorName }) => (
                      <option key={purchaseOrder.id} value={purchaseOrder.id}>
                        {purchaseOrder.poNumber} · {vendorName} ·{" "}
                        {formatMinor(purchaseOrder.totalMinor, purchaseOrder.currency)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={buttonVariants({ size: "md" })}>
                  Continue
                </button>
              </form>
            )}
            <div className="mt-6">
              <p className="mb-2 text-[13px] font-medium text-slate-700">Open purchase orders</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {eligible.map(({ purchaseOrder, vendorName }) => (
                  <li key={purchaseOrder.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div>
                      <p className="text-xs font-medium text-slate-800">{purchaseOrder.poNumber}</p>
                      <p className="text-[10px] text-slate-500">
                        {vendorName} · ordered {formatDate(purchaseOrder.orderDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={purchaseOrder.status} />
                      <Link
                        href={`/goods-receipts/new?po=${purchaseOrder.id}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Record
                      </Link>
                    </div>
                  </li>
                ))}
                {eligible.length === 0 ? (
                  <li className="px-3 py-5 text-center text-xs text-slate-500">
                    Nothing eligible to receive.
                  </li>
                ) : null}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const entry = await getReceiptEntryData(ctx, params.po);
  const blocked = ["CLOSED", "CANCELLED", "DRAFT"].includes(entry.purchaseOrder.status);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/purchase-orders/${entry.purchaseOrder.id}`}
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to {entry.purchaseOrder.poNumber}
      </Link>
      <PageHeader
        title="Record goods receipt"
        description={`${entry.purchaseOrder.poNumber} · ${entry.vendor?.name ?? "Vendor"}`}
        meta={
          <>
            <StatusBadge status={entry.purchaseOrder.status} />
            <span className="text-[11px] text-slate-500">
              {entry.purchaseOrder.currency} · Total{" "}
              {formatMinor(entry.purchaseOrder.totalMinor, entry.purchaseOrder.currency)}
            </span>
            <span className="text-[11px] text-slate-500">
              {entry.items.length} line{entry.items.length === 1 ? "" : "s"} · remaining{" "}
              {formatQuantityPlain(
                entry.items.reduce((sum, item) => sum + item.remainingMilli, 0n),
              )} units
            </span>
          </>
        }
      />
      <Card>
        <CardContent className="pt-5">
          {blocked ? (
            <Alert tone="danger" title="This purchase order cannot receive goods">
              Its status is {entry.purchaseOrder.status.toLowerCase()}. Reopen or create a new
              purchase order before recording a receipt.
              <div className="mt-2">
                <Link
                  href={`/purchase-orders/${entry.purchaseOrder.id}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  View purchase order
                </Link>
              </div>
            </Alert>
          ) : entry.items.every((item) => item.remainingMilli === 0n) ? (
            <Alert tone="success" title="This purchase order is fully received">
              Every ordered line has a received quantity. Record only a new PO if additional goods
              were ordered.
            </Alert>
          ) : (
            <GoodsReceiptForm
              purchaseOrderId={entry.purchaseOrder.id}
              poNumber={entry.purchaseOrder.poNumber}
              vendorName={entry.vendor?.name ?? "Vendor"}
              today={today}
              defaultReceiptNumber={`GR-${entry.purchaseOrder.poNumber}-${today.replaceAll("-", "")}`}
              items={entry.items.map((item) => ({
                id: item.id,
                description: item.description,
                sku: item.sku,
                quantityMilli: item.quantityMilli.toString(),
                previouslyReceivedMilli: item.previouslyReceivedMilli.toString(),
                remainingMilli: item.remainingMilli.toString(),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
