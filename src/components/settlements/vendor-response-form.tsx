"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

type Action = "ACCEPT" | "REJECT" | "CLARIFY";

export function VendorResponseForm({
  endpoint,
  settlementStatus,
}: {
  endpoint: string;
  settlementStatus: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [action, setAction] = useState<Action>("ACCEPT");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const open = ["SHARED", "CLARIFICATION_REQUESTED"].includes(settlementStatus);

  if (!open) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
        {settlementStatus === "VENDOR_ACCEPTED"
          ? "You accepted this proposal. The buyer must complete internal controls before any payment."
          : settlementStatus === "VENDOR_REJECTED"
            ? "A rejection is recorded. Contact the buyer if the commercial position changes."
            : settlementStatus === "READY_FOR_PAYMENT"
              ? "This proposal has been accepted and is ready for payment processing."
              : settlementStatus === "PAID"
                ? "This settlement has been paid. No further response is required."
                : "Responding is not available at this stage."}
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
        Your response was recorded. You can close this page.
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (action !== "ACCEPT" && note.trim().length < 5) {
      setError("Add a note of at least 5 characters for this response.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ action, note: note || undefined }),
      });
      toast({ tone: "success", title: "Response recorded" });
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record the response");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="vendor-action">Your response</Label>
        <div className="grid gap-1.5">
          {(
            [
              ["ACCEPT", "Accept the proposal as stated"],
              ["CLARIFY", "Request clarification"],
              ["REJECT", "Reject the proposal"],
            ] as [Action, string][]
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-xs hover:bg-slate-50"
            >
              <input
                type="radio"
                name="vendor-action"
                value={value}
                checked={action === value}
                onChange={() => setAction(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="vendor-note">
          Note {action === "ACCEPT" ? "(optional)" : "(required)"}
        </Label>
        <Textarea
          id="vendor-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            action === "ACCEPT"
              ? "Optional note, e.g. accepted without prejudice."
              : "Explain your position or the clarification required."
          }
        />
      </div>
      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <Button type="submit" loading={loading} className="w-full">
        Record response
      </Button>
      <p className="text-[10px] leading-4 text-slate-500">
        Acceptance records a commercial position. It does not itself transfer funds.
      </p>
    </form>
  );
}
