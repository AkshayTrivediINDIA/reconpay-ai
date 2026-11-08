"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

const documentTypes = [
  "INVOICE",
  "PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "DELIVERY_NOTE",
  "PACKING_LIST",
  "INSPECTION_REPORT",
  "EMAIL_CORRESPONDENCE",
  "OTHER",
];

export function UploadDocumentButton({
  entityType,
  entityId,
  label = "Add document",
}: {
  entityType: "INVOICE" | "PURCHASE_ORDER" | "GOODS_RECEIPT" | "SETTLEMENT";
  entityId: string;
  label?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState(
    entityType === "INVOICE" ? "INVOICE" : entityType === "PURCHASE_ORDER" ? "PURCHASE_ORDER" : "OTHER",
  );
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a PDF, PNG, or JPG file.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    form.set("documentType", documentType);
    if (title.trim()) form.set("title", title.trim());
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/documents", { method: "POST", body: form });
      toast({ tone: "success", title: "Document stored", description: "Evidence is now linked to the record." });
      setOpen(false);
      setFile(null);
      setTitle("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Paperclip className="h-3.5 w-3.5" /> {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Store an evidence document"
        description="Files are private, signature-checked, hashed, and linked to this record."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="document-upload-form" size="sm" loading={loading}>
              Upload
            </Button>
          </>
        }
      >
        <form id="document-upload-form" className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="document-file">File</Label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-4 text-left text-xs text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/30"
            >
              <Upload className="h-4 w-4 text-slate-400" />
              {file ? (
                <span>
                  <span className="font-medium text-slate-800">{file.name}</span>{" "}
                  <span className="text-slate-500">({(file.size / 1024).toFixed(0)} KB)</span>
                </span>
              ) : (
                <span>Choose PDF, PNG, or JPG · up to 15 MB</span>
              )}
            </button>
            <input
              ref={inputRef}
              id="document-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="document-type">Document type</Label>
            <Select
              id="document-type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ").toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="document-title">Title (optional)</Label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Signed delivery challan"
            />
            <FieldHint>The original filename is preserved.</FieldHint>
          </div>
          {error ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
