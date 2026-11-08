"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch, ApiClientError } from "@/lib/client-api";

type Line = {
  description: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  taxRatePercent: string;
};

const emptyLine: Line = {
  description: "",
  sku: "",
  quantity: "1",
  unitPrice: "0",
  taxRatePercent: "0",
};

export function PurchaseOrderForm({
  vendors,
  defaultCurrency,
  today,
}: {
  vendors: { id: string; name: string; code: string; currency: string }[];
  defaultCurrency: string;
  today: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [poNumber, setPoNumber] = useState("");
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [orderDate, setOrderDate] = useState(today);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [currency, setCurrency] = useState(
    vendors[0]?.currency ?? defaultCurrency,
  );
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"OPEN" | "DRAFT">("OPEN");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);

  function updateLine(index: number, key: keyof Line, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIssues([]);
    setLoading(true);
    try {
      const result = await apiFetch<{ purchaseOrder: { id: string } }>("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          poNumber,
          vendorId,
          orderDate,
          expectedDeliveryDate: expectedDeliveryDate || null,
          currency,
          notes: notes || null,
          status,
          lineItems: lines.map((line) => ({
            description: line.description,
            sku: line.sku || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRatePercent: line.taxRatePercent || "0",
          })),
        }),
      });
      toast({ tone: "success", title: "Purchase order created" });
      router.push(`/purchase-orders/${result.purchaseOrder.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setIssues(caught.issues ?? []);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not create purchase order");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="poNumber">Purchase order number</Label>
          <Input
            id="poNumber"
            value={poNumber}
            onChange={(event) => setPoNumber(event.target.value)}
            placeholder="PO-2026-002"
            required
          />
          <FieldHint>Must be unique within this organization.</FieldHint>
        </div>
        <div>
          <Label htmlFor="po-vendor">Vendor</Label>
          <Select
            id="po-vendor"
            value={vendorId}
            onChange={(event) => {
              setVendorId(event.target.value);
              const vendor = vendors.find((item) => item.id === event.target.value);
              if (vendor) setCurrency(vendor.currency);
            }}
            required
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name} ({vendor.code})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="orderDate">Order date</Label>
          <Input
            id="orderDate"
            type="date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="expectedDeliveryDate">Expected delivery</Label>
          <Input
            id="expectedDeliveryDate"
            type="date"
            value={expectedDeliveryDate}
            onChange={(event) => setExpectedDeliveryDate(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="po-currency">Currency</Label>
          <Input
            id="po-currency"
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            required
          />
          <FieldHint>Invoice reconciliation requires an exact currency match.</FieldHint>
        </div>
        <div>
          <Label htmlFor="po-status">Initial status</Label>
          <Select
            id="po-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as "OPEN" | "DRAFT")}
          >
            <option value="OPEN">Open</option>
            <option value="DRAFT">Draft</option>
          </Select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-slate-800">Ordered items</p>
            <p className="text-[11px] text-slate-500">
              Tax rates are stored in basis points. Quantities are exact to three decimals.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((current) => [...current, { ...emptyLine }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </Button>
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1.6fr_0.7fr_0.6fr_0.8fr_0.6fr_auto]"
            >
              <div>
                <Label htmlFor={`line-desc-${index}`}>Description</Label>
                <Input
                  id={`line-desc-${index}`}
                  value={line.description}
                  onChange={(event) => updateLine(index, "description", event.target.value)}
                  placeholder="Ergonomic mesh chair"
                  required
                />
              </div>
              <div>
                <Label htmlFor={`line-sku-${index}`}>SKU</Label>
                <Input
                  id={`line-sku-${index}`}
                  value={line.sku}
                  onChange={(event) => updateLine(index, "sku", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`line-qty-${index}`}>Qty</Label>
                <Input
                  id={`line-qty-${index}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, "quantity", event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`line-price-${index}`}>Unit price</Label>
                <Input
                  id={`line-price-${index}`}
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`line-tax-${index}`}>Tax %</Label>
                <Input
                  id={`line-tax-${index}`}
                  inputMode="decimal"
                  value={line.taxRatePercent}
                  onChange={(event) => updateLine(index, "taxRatePercent", event.target.value)}
                />
              </div>
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() =>
                    setLines((current) =>
                      current.length === 1 ? current : current.filter((_, i) => i !== index),
                    )
                  }
                  className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="po-notes">Internal notes</Label>
        <Textarea
          id="po-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Delivery instructions, internal approvals, or context."
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
        <Link href="/purchase-orders" className="text-xs text-slate-500 hover:text-slate-800">
          Cancel
        </Link>
        <Button type="submit" loading={loading}>
          Create purchase order
        </Button>
      </div>
    </form>
  );
}
