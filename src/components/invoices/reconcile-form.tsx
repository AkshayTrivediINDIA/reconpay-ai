"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Label, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";
import { StatusBadge } from "@/components/ui/badge";

type Receipt = {
  id: string;
  receiptNumber: string;
  receivedDate: string;
  status: string;
};

type PoDetail = {
  purchaseOrder: { id: string; poNumber: string; vendorId: string };
  receipts: Receipt[];
};

export function ReconcileForm({
  invoiceId,
  purchaseOrders,
}: {
  invoiceId: string;
  purchaseOrders: { id: string; poNumber: string; vendorName: string; status: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [poId, setPoId] = useState(purchaseOrders[0]?.id ?? "");
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingPo, setLoadingPo] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!poId) {
      setDetail(null);
      return;
    }
    setLoadingPo(true);
    setError(null);
    apiFetch<PoDetail>(`/api/purchase-orders/${poId}`)
      .then((data) => {
        setDetail(data);
        setSelected(data.receipts.filter((receipt) => receipt.status !== "CANCELLED").map((receipt) => receipt.id));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load purchase order"))
      .finally(() => setLoadingPo(false));
  }, [poId]);

  const compatible = purchaseOrders;

  async function run() {
    if (!poId) {
      setError("Select a purchase order.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await apiFetch<{ runId: string; discrepancyCount: number; potentialImpactMinor: string }>(
        `/api/invoices/${invoiceId}/reconcile`,
        {
          method: "POST",
          body: JSON.stringify({ purchaseOrderId: poId, goodsReceiptIds: selected }),
        },
      );
      toast({
        tone: "success",
        title: "Reconciliation completed",
        description: `${result.discrepancyCount} discrepancy rule${result.discrepancyCount === 1 ? "" : "s"} fired.`,
      });
      router.push(`/reconciliation/${result.runId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reconciliation failed");
    } finally {
      setRunning(false);
    }
  }

  if (compatible.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Create a purchase order for this vendor before reconciling. Reconciliation requires an
        exact PO and at least one goods receipt.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="recon-po">Purchase order</Label>
        <Select id="recon-po" value={poId} onChange={(event) => setPoId(event.target.value)}>
          <option value="">Select purchase order</option>
          {compatible.map((po) => (
            <option key={po.id} value={po.id}>
              {po.poNumber} · {po.vendorName} · {po.status.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </Select>
      </div>

      {loadingPo ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading receipts…
        </p>
      ) : null}

      {detail ? (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-slate-700">Goods receipts to include</p>
          {detail.receipts.length === 0 ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
              No goods receipts exist for this purchase order. Record a receipt before running
              reconciliation.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {detail.receipts.map((receipt) => (
                <li key={receipt.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-xs hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(receipt.id)}
                        disabled={receipt.status === "CANCELLED"}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, receipt.id]
                              : current.filter((id) => id !== receipt.id),
                          )
                        }
                      />
                      <span>
                        <span className="font-medium text-slate-800">{receipt.receiptNumber}</span>
                        <span className="ml-2 text-slate-500">{receipt.receivedDate}</span>
                      </span>
                    </span>
                    <StatusBadge status={receipt.status} />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <FieldHint>
            Selecting no receipts reconciles against zero received quantity. Include every
            receipt that supports this invoice.
          </FieldHint>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <Button type="button" onClick={run} loading={running} disabled={loadingPo || !poId} className="w-full">
        <GitCompareArrows className="h-3.5 w-3.5" />
        Run deterministic reconciliation
      </Button>
      <p className="text-[10px] leading-4 text-slate-500">
        Quantities: integer milli-units. Money: integer minor units. The engine stores an input
        snapshot and rule calculations so the same inputs reproduce the same result.
      </p>
    </div>
  );
}
