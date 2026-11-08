"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch, ApiClientError } from "@/lib/client-api";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";

export type EditableLine = {
  description: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  taxRatePercent: string;
};

export type EditableInvoice = {
  invoiceNumber: string;
  vendorId: string | null;
  vendorNameRaw: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  poReference: string | null;
  subtotal: string;
  tax: string;
  discount: string;
  shipping: string;
  total: string;
};

const emptyLine: EditableLine = {
  description: "",
  sku: "",
  quantity: "1",
  unitPrice: "0",
  taxRatePercent: "0",
};

export function InvoiceEditor({
  invoiceId,
  initialInvoice,
  initialLines,
  vendors,
  initialVerify = false,
}: {
  invoiceId: string;
  initialInvoice: EditableInvoice;
  initialLines: EditableLine[];
  vendors: { id: string; name: string; code: string }[];
  initialVerify?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState(initialInvoice);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length > 0 ? initialLines : [{ ...emptyLine }],
  );
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [saving, setSaving] = useState<"save" | "verify" | null>(null);

  function update<K extends keyof EditableInvoice>(key: K, value: EditableInvoice[K]) {
    setInvoice((current) => ({ ...current, [key]: value }));
  }

  function updateLine(index: number, key: keyof EditableLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    );
  }

  async function submit(verify: boolean) {
    setError(null);
    setIssues([]);
    if (verify) {
      if (!invoice.vendorId) {
        setError("Select the vendor before verifying.");
        return;
      }
      if (!invoice.issueDate) {
        setError("An issue date is required before verifying.");
        return;
      }
      if (lines.some((line) => !line.description.trim() || !line.quantity || !line.unitPrice)) {
        setError("Every line item needs a description, quantity, and unit price.");
        return;
      }
    }
    setSaving(verify ? "verify" : "save");
    try {
      await apiFetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...invoice,
          vendorId: invoice.vendorId || null,
          vendorNameRaw: invoice.vendorNameRaw || null,
          poReference: invoice.poReference || null,
          issueDate: invoice.issueDate || null,
          dueDate: invoice.dueDate || null,
          lineItems: lines.map((line) => ({
            description: line.description,
            sku: line.sku || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRatePercent: line.taxRatePercent || "0",
          })),
          verify,
        }),
      });
      toast({
        tone: "success",
        title: verify ? "Invoice verified" : "Invoice saved",
        description: verify
          ? "The invoice is now eligible for deterministic reconciliation."
          : "Fields saved for further review.",
      });
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
        setIssues(caught.issues ?? []);
      } else {
        setError(caught instanceof Error ? caught.message : "Save failed");
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="invoiceNumber">Invoice number</Label>
          <Input
            id="invoiceNumber"
            value={invoice.invoiceNumber}
            onChange={(event) => update("invoiceNumber", event.target.value)}
          />
          {issues.find((issue) => issue.path.includes("invoiceNumber")) ? (
            <p className="mt-1 text-[11px] text-red-600">
              {issues.find((issue) => issue.path.includes("invoiceNumber"))?.message}
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="vendorId">Vendor</Label>
          <Select
            id="vendorId"
            value={invoice.vendorId ?? ""}
            onChange={(event) => update("vendorId", event.target.value || null)}
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
          <Label htmlFor="vendorNameRaw">Vendor name on invoice</Label>
          <Input
            id="vendorNameRaw"
            value={invoice.vendorNameRaw ?? ""}
            onChange={(event) => update("vendorNameRaw", event.target.value || null)}
          />
        </div>
        <div>
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            type="date"
            value={invoice.issueDate ?? ""}
            onChange={(event) => update("issueDate", event.target.value || null)}
          />
        </div>
        <div>
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            type="date"
            value={invoice.dueDate ?? ""}
            onChange={(event) => update("dueDate", event.target.value || null)}
          />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            maxLength={3}
            value={invoice.currency}
            onChange={(event) => update("currency", event.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Label htmlFor="poReference">Purchase order reference</Label>
          <Input
            id="poReference"
            value={invoice.poReference ?? ""}
            onChange={(event) => update("poReference", event.target.value || null)}
          />
        </div>
        <div>
          <Label htmlFor="subtotal">Subtotal</Label>
          <Input
            id="subtotal"
            inputMode="decimal"
            value={invoice.subtotal}
            onChange={(event) => update("subtotal", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tax">Tax</Label>
          <Input
            id="tax"
            inputMode="decimal"
            value={invoice.tax}
            onChange={(event) => update("tax", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="discount">Discount</Label>
          <Input
            id="discount"
            inputMode="decimal"
            value={invoice.discount}
            onChange={(event) => update("discount", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="shipping">Shipping</Label>
          <Input
            id="shipping"
            inputMode="decimal"
            value={invoice.shipping}
            onChange={(event) => update("shipping", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="total">Invoice total</Label>
          <Input
            id="total"
            inputMode="decimal"
            value={invoice.total}
            onChange={(event) => update("total", event.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-slate-800">Line items</p>
            <p className="text-[11px] text-slate-500">
              Quantities accept up to three decimals. Values are stored as integers.
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
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <TableWrap>
            <THead>
              <TR>
                <TH className="w-8"><span className="sr-only">Order</span></TH>
                <TH>Description</TH>
                <TH>SKU</TH>
                <TH className="w-24">Qty</TH>
                <TH className="w-28">Unit price</TH>
                <TH className="w-24">Tax %</TH>
                <TH className="w-10"><span className="sr-only">Remove</span></TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((line, index) => (
                <TR key={index}>
                  <TD className="text-slate-300"><GripVertical className="h-3.5 w-3.5" /></TD>
                  <TD>
                    <Input
                      aria-label={`Line ${index + 1} description`}
                      value={line.description}
                      onChange={(event) => updateLine(index, "description", event.target.value)}
                      className="h-8 min-w-[180px] text-xs"
                    />
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Line ${index + 1} SKU`}
                      value={line.sku}
                      onChange={(event) => updateLine(index, "sku", event.target.value)}
                      className="h-8 w-24 text-xs"
                    />
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Line ${index + 1} quantity`}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, "quantity", event.target.value)}
                      className="h-8 w-20 text-xs"
                    />
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Line ${index + 1} unit price`}
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
                      className="h-8 w-24 text-xs"
                    />
                  </TD>
                  <TD>
                    <Input
                      aria-label={`Line ${index + 1} tax rate`}
                      inputMode="decimal"
                      value={line.taxRatePercent}
                      onChange={(event) => updateLine(index, "taxRatePercent", event.target.value)}
                      className="h-8 w-20 text-xs"
                    />
                  </TD>
                  <TD>
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() =>
                        setLines((current) =>
                          current.length === 1 ? current : current.filter((_, i) => i !== index),
                        )
                      }
                      className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </div>
        <FieldHint>
          The reconciliation engine independently checks line totals, tax, and the invoice total.
          Correcting fields does not bypass those checks.
        </FieldHint>
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

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="secondary"
          loading={saving === "save"}
          disabled={saving !== null}
          onClick={() => submit(false)}
        >
          Save changes
        </Button>
        <Button
          type="button"
          loading={saving === "verify"}
          disabled={saving !== null}
          onClick={() => submit(true)}
          autoFocus={initialVerify}
        >
          Save and verify
        </Button>
      </div>
    </div>
  );
}
