import Link from "next/link";
import { ArrowLeft, ExternalLink, PackageCheck, ShieldCheck } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getGoodsReceiptDetail } from "@/lib/services/goods-receipts";
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
import { Alert } from "@/components/ui/feedback";
import { ActionButton } from "@/components/action-button";
import { UploadDocumentButton } from "@/components/documents/upload-document-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goods receipt" };

export default async function GoodsReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const { id } = await params;
  const { receipt, purchaseOrder, vendor, items, documents } = await getGoodsReceiptDetail(
    ctx,
    id,
  );
  const totalReceived = items.reduce((sum, item) => sum + item.quantityReceivedMilli, 0n);
  const totalDamaged = items.reduce((sum, item) => sum + item.quantityDamagedMilli, 0n);
  const totalUsable = totalReceived - totalDamaged;

  return (
    <div>
      <Link
        href="/goods-receipts"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to goods receipts
      </Link>
      <PageHeader
        title={receipt.receiptNumber}
        description={`${purchaseOrder.poNumber} · ${vendor?.name ?? "Vendor"} · Received ${formatDate(receipt.receivedDate)}`}
        meta={
          <>
            <StatusBadge status={receipt.status} />
            <span className="text-[11px] text-slate-500">
              Recorded {formatDateTime(receipt.createdAt)}
            </span>
            <span className="text-[11px] text-slate-500">
              {formatQuantityPlain(totalUsable)} usable units
            </span>
          </>
        }
        actions={
          <>
            <UploadDocumentButton entityType="GOODS_RECEIPT" entityId={receipt.id} />
            {receipt.status === "RECEIVED" ? (
              <ActionButton
                endpoint={`/api/goods-receipts/${receipt.id}`}
                method="PATCH"
                body={{ status: "INSPECTED" }}
                successMessage="Receipt marked inspected"
                variant="secondary"
                size="sm"
              >
                Mark inspected
              </ActionButton>
            ) : null}
            {receipt.status !== "CANCELLED" ? (
              <ActionButton
                endpoint={`/api/goods-receipts/${receipt.id}`}
                method="PATCH"
                body={{ status: "CANCELLED" }}
                confirm="Cancel this goods receipt? Its quantities will no longer count toward received stock."
                successMessage="Goods receipt cancelled"
                variant="danger"
                size="sm"
              >
                Cancel receipt
              </ActionButton>
            ) : null}
          </>
        }
      />

      {receipt.status === "CANCELLED" ? (
        <Alert tone="warning" title="This receipt is cancelled" className="mb-4">
          Cancelled quantities are excluded from reconciliation and purchase-order progress. The
          record remains for audit.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Receipt lines</CardTitle>
              <CardDescription>
                Usable quantity = received − damaged. Both are stored as exact milli-units.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <TableWrap>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH className="text-right">Received</TH>
                  <TH className="text-right">Damaged</TH>
                  <TH className="text-right">Usable</TH>
                  <TH className="text-right">Unit price</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((item) => {
                  const poItem = item.purchaseOrderItem;
                  return (
                    <TR key={item.id}>
                      <TD className="text-xs">
                        <p className="font-medium text-slate-800">
                          {poItem?.description ?? "Unknown item"}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {poItem?.sku ?? "No SKU"} · ordered{" "}
                          {poItem ? formatQuantityPlain(poItem.quantityMilli) : "—"}
                        </p>
                      </TD>
                      <TD className="numeric text-right text-xs">
                        {formatQuantityPlain(item.quantityReceivedMilli)}
                      </TD>
                      <TD className="numeric text-right text-xs text-red-700">
                        {formatQuantityPlain(item.quantityDamagedMilli)}
                      </TD>
                      <TD className="numeric text-right text-xs font-medium text-emerald-700">
                        {formatQuantityPlain(
                          item.quantityReceivedMilli - item.quantityDamagedMilli,
                        )}
                      </TD>
                      <TD className="numeric text-right text-xs">
                        {poItem
                          ? formatMinor(poItem.unitPriceMinor, purchaseOrder.currency)
                          : "—"}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
            <div className="flex justify-end border-t border-[var(--border)] p-3">
              <div className="flex gap-6 text-xs">
                <span className="text-slate-500">
                  Received <strong className="numeric text-slate-800">{formatQuantityPlain(totalReceived)}</strong>
                </span>
                <span className="text-slate-500">
                  Damaged <strong className="numeric text-red-700">{formatQuantityPlain(totalDamaged)}</strong>
                </span>
                <span className="text-slate-500">
                  Usable <strong className="numeric text-emerald-700">{formatQuantityPlain(totalUsable)}</strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Receipt details</CardTitle>
                <CardDescription>Source links and recorded context.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={1}
                items={[
                  {
                    label: "Purchase order",
                    value: (
                      <Link
                        href={`/purchase-orders/${purchaseOrder.id}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {purchaseOrder.poNumber}
                      </Link>
                    ),
                  },
                  { label: "Vendor", value: vendor?.name ?? "—" },
                  { label: "Received date", value: formatDate(receipt.receivedDate) },
                  { label: "Status", value: <StatusBadge status={receipt.status} /> },
                  { label: "Recorded by", value: receipt.createdBy ? formatDateTime(receipt.createdAt) : "—" },
                ]}
              />
              {receipt.notes ? (
                <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
                  {receipt.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Delivery evidence</CardTitle>
                <CardDescription>Signed challans, inspection notes, photos.</CardDescription>
              </div>
              <UploadDocumentButton entityType="GOODS_RECEIPT" entityId={receipt.id} label="Add" />
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-xs text-slate-500">No documents linked to this receipt.</p>
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
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Receipt integrity
            </p>
            <p className="mt-1">
              Receipt quantities cannot exceed the remaining ordered quantity. A cancellation
              reverses the stock effect but never deletes the evidence record.
            </p>
            <Link href="/discrepancies" className="mt-2 inline-flex items-center gap-1 text-indigo-700 hover:underline">
              <PackageCheck className="h-3.5 w-3.5" /> Review related discrepancies
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
