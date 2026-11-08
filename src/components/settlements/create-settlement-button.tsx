"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch, ApiClientError } from "@/lib/client-api";

export function CreateSettlementButton({
  invoiceId,
  invoiceTotal,
  currency,
  runs,
}: {
  invoiceId: string;
  invoiceTotal: string;
  currency: string;
  runs: { id: string; createdAt: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [proposedAmount, setProposedAmount] = useState(invoiceTotal);
  const [disputedAmount, setDisputedAmount] = useState("0");
  const [runId, setRunId] = useState(runs[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ settlement: { id: string } }>("/api/settlements", {
        method: "POST",
        body: JSON.stringify({
          invoiceId,
          runId: runId || null,
          proposedAmount,
          disputedAmount: disputedAmount || "0",
          reason,
        }),
      });
      toast({
        tone: "success",
        title: "Draft settlement created",
        description: "Submit it for internal approval when ready.",
      });
      setOpen(false);
      router.push(`/settlements/${result.settlement.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) setError(caught.message);
      else setError(caught instanceof Error ? caught.message : "Could not create settlement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Create settlement
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a settlement proposal"
        description="This records a proposed commercial outcome. It does not move money."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="settlement-form" size="sm" loading={loading}>
              Create draft
            </Button>
          </>
        }
      >
        <form id="settlement-form" className="space-y-4" onSubmit={submit}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
            Original invoice total:{" "}
            <strong className="numeric text-slate-900">
              {currency} {invoiceTotal}
            </strong>
            . A settlement proposal requires later internal approval and vendor acceptance before
            payment can be considered.
          </div>
          <div>
            <Label htmlFor="proposedAmount">Proposed settlement amount ({currency})</Label>
            <Input
              id="proposedAmount"
              inputMode="decimal"
              value={proposedAmount}
              onChange={(event) => setProposedAmount(event.target.value)}
              required
            />
            <FieldHint>Must be greater than zero and no more than the invoice total.</FieldHint>
          </div>
          <div>
            <Label htmlFor="disputedAmount">Disputed amount ({currency})</Label>
            <Input
              id="disputedAmount"
              inputMode="decimal"
              value={disputedAmount}
              onChange={(event) => setDisputedAmount(event.target.value)}
            />
            <FieldHint>Record the portion under dispute; it is not deducted automatically.</FieldHint>
          </div>
          {runs.length > 0 ? (
            <div>
              <Label htmlFor="runId">Supporting reconciliation run</Label>
              <Select id="runId" value={runId} onChange={(event) => setRunId(event.target.value)}>
                <option value="">No linked run</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.createdAt}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="reason">Reason for the proposal</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain the commercial basis, with reference to the evidence."
              required
            />
            <FieldHint>At least 10 characters. Do not state an amount owed as fact.</FieldHint>
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
