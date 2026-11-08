"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function DiscrepancyActions({
  discrepancyId,
  currentStatus,
  compact = false,
}: {
  discrepancyId: string;
  currentStatus: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<
    "ACKNOWLEDGED" | "RESOLVED" | "DISPUTED" | "WAIVED"
  >("ACKNOWLEDGED");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/discrepancies/${discrepancyId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note || undefined }),
      });
      toast({ tone: "success", title: "Discrepancy updated", description: "The decision is recorded in the audit trail." });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {currentStatus === "OPEN" ? "Review" : "Update"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a discrepancy decision"
        description="Decisions are retained with your identity and timestamp. They do not rewrite the rule calculation."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="discrepancy-form" size="sm" loading={loading}>
              Save decision
            </Button>
          </>
        }
      >
        <form id="discrepancy-form" className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor={`discrepancy-status-${discrepancyId}`}>Decision</Label>
            <Select
              id={`discrepancy-status-${discrepancyId}`}
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="ACKNOWLEDGED">Acknowledged — under review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISPUTED">Disputed with vendor</option>
              <option value="WAIVED">Waived</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`discrepancy-note-${discrepancyId}`}>Decision note</Label>
            <Textarea
              id={`discrepancy-note-${discrepancyId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Explain the evidence and commercial decision."
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Required (at least 5 characters) except for acknowledgement.
            </p>
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
