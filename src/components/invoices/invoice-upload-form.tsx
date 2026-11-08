"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select, Input, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function InvoiceUploadForm({
  vendors,
  aiLabel,
}: {
  vendors: { id: string; name: string; code: string }[];
  aiLabel: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [poReference, setPoReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Select a PDF, PNG, or JPG invoice first.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    if (vendorId) form.set("vendorId", vendorId);
    if (poReference.trim()) form.set("poReference", poReference.trim());
    setLoading(true);
    try {
      const result = await apiFetch<{ invoiceId: string; status: string }>("/api/invoices", {
        method: "POST",
        body: form,
      });
      toast({
        tone: "success",
        title: "Invoice uploaded",
        description:
          result.status === "FAILED"
            ? "Extraction failed; the document is stored for manual entry."
            : "Extraction completed. Review every field before verification.",
      });
      router.push(`/invoices/${result.invoiceId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label htmlFor="invoice-file">Invoice document</Label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/30"
        >
          {file ? (
            <>
              <FileUp className="h-6 w-6 text-indigo-600" />
              <p className="mt-2 text-sm font-medium text-slate-900">{file.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {(file.size / 1024).toFixed(0)} KB · click to choose another file
              </p>
            </>
          ) : (
            <>
              <ScanText className="h-6 w-6 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-800">
                Choose a PDF, PNG, or JPG
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Up to 15 MB · signature checked</p>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          id="invoice-file"
          type="file"
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg"
          className="sr-only"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="vendorId">Vendor (optional)</Label>
          <Select id="vendorId" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Detect from the invoice</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name} ({vendor.code})
              </option>
            ))}
          </Select>
          <FieldHint>
            If omitted, the extracted vendor name must exactly match one vendor record.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="poReference">Purchase order reference (optional)</Label>
          <Input
            id="poReference"
            value={poReference}
            onChange={(event) => setPoReference(event.target.value)}
            placeholder="e.g. PO-2026-001"
          />
          <FieldHint>Overrides the extracted reference when supplied.</FieldHint>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
        <p className="font-medium text-slate-800">Extraction engine: {aiLabel}</p>
        <p className="mt-0.5">
          Extraction output is schema-validated and stored with confidence and engine provenance.
          Missing fields mark the invoice for review. Totals are always verified by a human before
          reconciliation.
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Link href="/invoices" className="text-xs text-slate-500 hover:text-slate-800">
          Cancel
        </Link>
        <Button type="submit" loading={loading}>
          {loading ? "Extracting…" : "Upload and extract"}
        </Button>
      </div>
    </form>
  );
}
