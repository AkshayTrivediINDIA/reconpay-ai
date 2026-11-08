"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch, ApiClientError } from "@/lib/client-api";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { formatQuantityPlain } from "@/lib/money";

type EntryItem = {
  id: string;
  description: string;
  sku: string | null;
  quantityMilli: string;
  previouslyReceivedMilli: string;
  remainingMilli: string;
};

export function GoodsReceiptForm({
  purchaseOrderId,
  poNumber,
  vendorName,
  items,
  defaultReceiptNumber,
  today,
}: {
  purchaseOrderId: string;
  poNumber: string;
  vendorName: string;
  items: EntryItem[];
  defaultReceiptNumber: string;
  today: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [receiptNumber, setReceiptNumber] = useState(defaultReceiptNumber);
  const [receivedDate, setReceivedDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState(
    items.map((item) => ({
      id: item.id,
      received: "",
      damaged: "0",
    })),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);

  function updateRow(index: number, key: "received" | "damaged", value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIssues([]);
    if (rows.every((row) => !row.received || Number(row.received) === 0)) {
      setError("Record a received quantity on at least one line.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ goodsReceipt: { id: string } }>("/api/goods-receipts", {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId,
          receiptNumber,
          receivedDate,
          notes: notes || null,
          items: rows.map((row) => ({
            purchaseOrderItemId: row.id,
            quantityReceived: row.received || "0",
            quantityDamaged: row.damaged || "0",
          })),
        }),
      });
      toast({
        tone: "success",
        title: "Goods receipt recorded",
        description: "Usable quantity is now available to the reconciliation engine.",
      });
      router.push(`/goods-receipts/${result.goodsReceipt.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setIssues(caught.issues ?? []);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not record goods receipt");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-900">
          {poNumber} · {vendorName}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Receive only against the remaining ordered quantity. Damaged units are excluded from
          usable stock but remain in the record.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="receiptNumber">Receipt number</Label>
          <Input
            id="receiptNumber"
            value={receiptNumber}
            onChange={(event) => setReceiptNumber(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="receivedDate">Received date</Label>
          <Input
            id="receivedDate"
            type="date"
            value={receivedDate}
            onChange={(event) => setReceivedDate(event.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium text-slate-800">Received quantities</p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <TableWrap>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Ordered</TH>
                <TH className="text-right">Previously received</TH>
                <TH className="text-right">Remaining</TH>
                <TH className="w-32">Received now</TH>
                <TH className="w-32">Damaged</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item, index) => (
                <TR key={item.id}>
                  <TD className="text-xs">
                    <p className="font-medium text-slate-800">{item.description}</p>
                    <p className="text-[10px] text-slate-500">{item.sku ?? "No SKU"}</p>
                  </TD>
                  <TD className="numeric text-right text-xs">
                    {formatQuantityPlain(BigInt(item.quantityMilli))}
                  </TD>
                  <TD className="numeric text-right text-xs">
                    {formatQuantityPlain(BigInt(item.previouslyReceivedMilli))}
                  </TD>
                  <TD className="numeric text-right text-xs font-medium">
                    {formatQuantityPlain(BigInt(item.remainingMilli))}
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Received now for ${item.description}`}
                      inputMode="decimal"
                      value={rows[index]?.received ?? ""}
                      onChange={(event) => updateRow(index, "received", event.target.value)}
                      placeholder="0"
                      className="h-8 text-xs"
                    />
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Damaged quantity for ${item.description}`}
                      inputMode="decimal"
                      value={rows[index]?.damaged ?? "0"}
                      onChange={(event) => updateRow(index, "damaged", event.target.value)}
                      className="h-8 text-xs"
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </div>
        <FieldHint>
          Received cannot exceed the remaining quantity. Damaged cannot exceed received.
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="gr-notes">Receipt notes</Label>
        <Textarea
          id="gr-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Condition on arrival, shortages observed, carrier details, etc."
        />
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p>{error}</p>
          {issues.length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <Link href={`/purchase-orders/${purchaseOrderId}`} className="text-xs text-slate-500 hover:text-slate-800">
          Cancel
        </Link>
        <Button type="submit" loading={loading}>
          <PackageCheck className="h-3.5 w-3.5" /> Record receipt
        </Button>
      </div>
    </form>
  );
}
