"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";
import { useRouter } from "next/navigation";

export function ReprocessButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/invoices/${invoiceId}/reprocess`, { method: "POST", body: "{}" });
      toast({ tone: "success", title: "Extraction re-run", description: "Review the updated fields." });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reprocessing failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="h-3.5 w-3.5" /> Re-run extraction
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Re-run extraction?"
        description="This overwrites extracted invoice fields with a fresh extraction. Human-entered corrections will be replaced."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" loading={loading} onClick={run}>
              Re-run extraction
            </Button>
          </>
        }
      >
        <p className="text-xs leading-5 text-slate-600">
          The source document remains unchanged. If the source is stored in Supabase Storage, this
          build explains that reprocessing is unavailable and does not simulate a result.
        </p>
        {error ? (
          <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
