"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function ShareSettlementButton({
  settlementId,
  hasActiveLink,
}: {
  settlementId: string;
  hasActiveLink: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState("14");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ url: string; expiresAt: string }>(
        `/api/settlements/${settlementId}/share`,
        {
          method: "POST",
          body: JSON.stringify({ expiryDays: Number(expiryDays) }),
        },
      );
      setResult(data);
      toast({ tone: "success", title: "Secure vendor link created" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the link");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast({ tone: "success", title: "Link copied" });
    } catch {
      toast({
        tone: "error",
        title: "Copy failed",
        description: "Select the link and copy it manually.",
      });
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5" /> {hasActiveLink ? "Replace vendor link" : "Share with vendor"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setResult(null);
        }}
        title="Share a secure vendor link"
        description="The link grants access only through an unguessable token. Previous links stop working."
        footer={
          result ? (
            <Button type="button" size="sm" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="share-settlement-form" size="sm" loading={loading}>
                Create link
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Link created. It expires {new Date(result.expiresAt).toLocaleString()}.
            </div>
            <div>
              <Label htmlFor="vendor-link">Vendor link</Label>
              <Input id="vendor-link" readOnly value={result.url} onFocus={(event) => event.target.select()} />
              <FieldHint>
                Send this only to the vendor contact. Anyone with the link can view the proposal and
                respond.
              </FieldHint>
            </div>
            <div className="flex items-start gap-2 text-[11px] leading-4 text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              The response is recorded against this settlement with the token&apos;s expiry time and
              the vendor&apos;s decision.
            </div>
          </div>
        ) : (
          <form id="share-settlement-form" className="space-y-4" onSubmit={submit}>
            <div>
              <Label htmlFor="expiryDays">Link lifetime</Label>
              <Select
                id="expiryDays"
                value={expiryDays}
                onChange={(event) => setExpiryDays(event.target.value)}
              >
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </Select>
              <FieldHint>The link cannot be extended once it expires; create a new one instead.</FieldHint>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
              Sharing does not authorize payment. The vendor must accept, and the settlement must be
              marked ready before payment can be initiated.
            </div>
            {error ? (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
          </form>
        )}
      </Modal>
    </>
  );
}
