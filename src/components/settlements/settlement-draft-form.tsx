"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function EditSettlementButton({
  settlementId,
  proposedAmount,
  disputedAmount,
  reason,
  currency,
}: {
  settlementId: string;
  proposedAmount: string;
  disputedAmount: string;
  reason: string;
  currency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [proposed, setProposed] = useState(proposedAmount);
  const [disputed, setDisputed] = useState(disputedAmount);
  const [text, setText] = useState(reason);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/settlements/${settlementId}`, {
        method: "PATCH",
        body: JSON.stringify({
          proposedAmount: proposed,
          disputedAmount: disputed || "0",
          reason: text,
        }),
      });
      toast({
        tone: "success",
        title: "Draft updated",
        description: "Submit the revised proposal for internal approval.",
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the settlement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Edit draft
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit settlement proposal"
        description="Changes reset the proposal to draft. Internal approval must be recorded again."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-settlement-form" size="sm" loading={loading}>
              Save draft
            </Button>
          </>
        }
      >
        <form id="edit-settlement-form" className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="edit-proposed">Proposed amount ({currency})</Label>
            <Input
              id="edit-proposed"
              inputMode="decimal"
              value={proposed}
              onChange={(event) => setProposed(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-disputed">Disputed amount ({currency})</Label>
            <Input
              id="edit-disputed"
              inputMode="decimal"
              value={disputed}
              onChange={(event) => setDisputed(event.target.value)}
            />
            <FieldHint>Recorded separately; it is not an automatic deduction.</FieldHint>
          </div>
          <div>
            <Label htmlFor="edit-reason">Reason</Label>
            <Textarea
              id="edit-reason"
              value={text}
              onChange={(event) => setText(event.target.value)}
              required
            />
            <FieldHint>At least 10 characters.</FieldHint>
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
