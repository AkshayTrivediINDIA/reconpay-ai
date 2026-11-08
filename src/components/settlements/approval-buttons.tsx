"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function ApprovalButtons({ settlementId }: { settlementId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!open) return;
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/settlements/${settlementId}/approve`, {
        method: "POST",
        body: JSON.stringify({ decision: open, comments: comments || undefined }),
      });
      toast({
        tone: "success",
        title: open === "APPROVED" ? "Settlement approved" : "Settlement rejected",
        description: "The decision and comments were written to the audit trail.",
      });
      setOpen(null);
      setComments("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen("APPROVED")}>
        Approve
      </Button>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen("REJECTED")}>
        Reject
      </Button>
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === "APPROVED" ? "Approve settlement" : "Reject settlement"}
        description="Your decision is recorded with identity and timestamp. Approval does not move money."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="approval-form"
              size="sm"
              variant={open === "REJECTED" ? "danger" : "primary"}
              loading={loading}
            >
              {open === "APPROVED" ? "Record approval" : "Record rejection"}
            </Button>
          </>
        }
      >
        <form id="approval-form" className="space-y-4" onSubmit={submit}>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
            Segregation of duties applies: a non-admin creator cannot approve their own settlement.
            The amount must also be within your approval limit.
          </div>
          <div>
            <Label htmlFor="approval-comments">Comments</Label>
            <Textarea
              id="approval-comments"
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder={
                open === "APPROVED"
                  ? "Record the basis for approval and any conditions."
                  : "Explain why the settlement is rejected (at least 5 characters)."
              }
            />
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
