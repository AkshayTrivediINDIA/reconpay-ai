import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  PackageCheck,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getPurchaseOrderDetail } from "@/lib/services/purchase-orders";
import { formatMinor, formatQuantityPlain } from "@/lib/money";
import { documentHref } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/ui";
import { PageHeader, DescriptionList } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { UploadDocumentButton } from "@/components/documents/upload-document-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const { id } = await params;
  const detail = await getPurchaseOrderDetail(ctx, id);
  const { purchaseOrder, items, remaining, vendor, receipts, receiptItems, invoices, documents } =
    detail;

  return (
    <div>
      <Link
        href="/purchase-orders"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to purchase orders
      </Link>
      <PageHeader
        title={purchaseOrder.poNumber}
        description={`${vendor?.name ?? "Vendor"} · Ordered ${formatDate(purchaseOrder.orderDate)}`}
        meta={
          <>
            <StatusBadge status={purchaseOrder.status} />
            <span className="text-[11px] text-slate-500">
              {purchaseOrder.currency} · Created {formatDateTime(purchaseOrder.createdAt)}
            </span>
          </>
        }
        actions={
          <>
            <Link
              href={`/goods-receipts/new?po=${purchaseOrder.id}`}
              className={buttonVariants({ size: "sm" })}
            >
              <PackageCheck className="h-3.5 w-3.5" /> Record goods receipt
            </Link>
            <UploadDocumentButton entityType="PURCHASE_ORDER" entityId={purchaseOrder.id} />
            {purchaseOrder.status !== "CLOSED" && purchaseOrder.status !== "CANCELLED" ? (
              <ActionButton
                endpoint={`/api/purchase-orders/${purchaseOrder.id}`}
                method="PATCH"
                body={{ status: "CLOSED" }}
                confirm="Close this purchase order? No further receipts or matching should be expected."
                successMessage="Purchase order closed"
                variant="secondary"
                size="sm"
              >
                Close PO
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Authorized purchase order</CardTitle>
                <CardDescription>
                  Received quantity excludes cancelled receipts. Damaged quantities remain visible
                  to the reconciliation engine.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={4}
                items={[
                  { label: "Vendor", value: vendor?.name ?? "—" },
                  { label: "Vendor code", value: vendor?.code ?? "—" },
                  { label: "Order date", value: formatDate(purchaseOrder.orderDate) },
                  {
                    label: "Expected delivery",
                    value: purchaseOrder.expectedDeliveryDate
                      ? formatDate(purchaseOrder.expectedDeliveryDate)
                      : "—",
                  },
                  {
                    label: "Subtotal",
                    value: formatMinor(purchaseOrder.subtotalMinor, purchaseOrder.currency),
                  },
                  { label: "Tax", value: formatMinor(purchaseOrder.taxMinor, purchaseOrder.currency) },
                  {
                    label: "Total",
                    value: (
                      <span className="text-[15px] font-semibold">
                        {formatMinor(purchaseOrder.totalMinor, purchaseOrder.currency)}
                      </span>
                    ),
                  },
                  { label: "Currency", value: purchaseOrder.currency },
                ]}
              />
              {purchaseOrder.notes ? (
                <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
                  {purchaseOrder.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ordered items and receipts</CardTitle>
                <CardDescription>
                  Remaining quantity is an arithmetic difference, not a payable adjustment.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <TableWrap>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Description</TH>
                    <TH className="text-right">Ordered</TH>
                    <TH className="text-right">Received</TH>
                    <TH className="text-right">Remaining</TH>
                    <TH className="text-right">Unit price</TH>
                    <TH className="text-right">Line total</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((item, index) => {
                    const row = remaining[index];
                    return (
                      <TR key={item.id}>
                        <TD className="text-xs text-slate-400">{item.lineNumber}</TD>
                        <TD className="text-xs font-medium text-slate-800">
                          {item.description}
                          {item.sku ? (
                            <span className="ml-1 text-[10px] text-slate-400">({item.sku})</span>
                          ) : null}
                        </TD>
                        <TD className="numeric text-right text-xs">
                          {formatQuantityPlain(item.quantityMilli)}
                        </TD>
                        <TD className="numeric text-right text-xs text-emerald-700">
                          {formatQuantityPlain(row?.receivedMilli ?? 0n)}
                        </TD>
                        <TD className="numeric text-right text-xs font-medium text-amber-700">
                          {formatQuantityPlain(row?.remainingMilli ?? 0n)}
                        </TD>
                        <TD className="numeric text-right text-xs">
                          {formatMinor(item.unitPriceMinor, purchaseOrder.currency)}
                        </TD>
                        <TD className="numeric text-right text-xs font-medium">
                          {formatMinor(item.lineTotalMinor, purchaseOrder.currency)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </TableWrap>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Goods receipts</CardTitle>
                <CardDescription>
                  Each receipt is a dated source record with received and damaged quantities.
                </CardDescription>
              </div>
              <Link
                href={`/goods-receipts?search=${encodeURIComponent(purchaseOrder.poNumber)}`}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                All receipts
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {receipts.length === 0 ? (
                <div className="px-5 pb-5">
                  <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                    No goods receipt recorded. Reconcile only after the receipt evidence exists.
                  </div>
                </div>
              ) : (
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>Receipt</TH>
                      <TH>Received date</TH>
                      <TH>Status</TH>
                      <TH>Usable quantity</TH>
                      <TH aria-label="Open" />
                    </TR>
                  </THead>
                  <TBody>
                    {receipts.map((receipt) => {
                      const lines = receiptItems.filter(
                        (item) => item.goodsReceiptId === receipt.id,
                      );
                      const usable = lines.reduce(
                        (sum, item) =>
                          sum + item.quantityReceivedMilli - item.quantityDamagedMilli,
                        0n,
                      );
                      return (
                        <TR key={receipt.id}>
                          <TD>
                            <Link
                              href={`/goods-receipts/${receipt.id}`}
                              className="text-xs font-medium text-slate-900 hover:text-indigo-700"
                            >
                              {receipt.receiptNumber}
                            </Link>
                          </TD>
                          <TD className="text-xs">{formatDate(receipt.receivedDate)}</TD>
                          <TD><StatusBadge status={receipt.status} /></TD>
                          <TD className="numeric text-xs">{formatQuantityPlain(usable)}</TD>
                          <TD className="text-right">
                            <Link
                              href={`/goods-receipts/${receipt.id}`}
                              className="text-xs font-medium text-indigo-700 hover:underline"
                            >
                              Open
                            </Link>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Invoices referencing this PO</CardTitle>
                <CardDescription>Matched by the exact PO number reference.</CardDescription>
              </div>
              <FileText className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-xs text-slate-500">No invoice references this PO yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-xs font-medium text-slate-800 hover:text-indigo-700"
                        >
                          {invoice.invoiceNumber || "Untitled"}
                        </Link>
                        <p className="text-[10px] text-slate-500">
                          {formatDateTime(invoice.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-xs font-medium">
                          {formatMinor(invoice.totalMinor, invoice.currency)}
                        </p>
                        <StatusBadge status={invoice.status} />
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
                <CardTitle>Supporting documents</CardTitle>
                <CardDescription>Authorized PO, delivery notes, or approvals.</CardDescription>
              </div>
              <UploadDocumentButton entityType="PURCHASE_ORDER" entityId={purchaseOrder.id} label="Add" />
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-xs text-slate-500">No documents linked.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {documents.map((document) => (
                    <li key={document.id} className="py-2.5">
                      <a
                        href={documentHref(document.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-slate-800 hover:text-indigo-700"
                      >
                        <span className="truncate">{document.title || document.fileName}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <p className="text-[10px] text-slate-500">
                        {document.documentType.replaceAll("_", " ").toLowerCase()} ·{" "}
                        {formatDate(document.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="rounded-lg border border-slate-200 bg-white p-4 text-[11px] leading-5 text-slate-600">
            <p className="flex items-center gap-1.5 font-medium text-slate-800">
              <ShoppingCart className="h-3.5 w-3.5" /> Why this record matters
            </p>
            <p className="mt-1">
              The PO is immutable evidence of what was authorized. Reconciliation compares the
              invoice against this quantity and price baseline, then credits only the usable
              quantities recorded in goods receipts.
            </p>
            <Link
              href={`/goods-receipts/new?po=${purchaseOrder.id}`}
              className={buttonVariants({ variant: "secondary", size: "sm" }) + " mt-3"}
            >
              <Plus className="h-3.5 w-3.5" /> Record receipt
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
