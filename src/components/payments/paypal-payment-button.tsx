"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pay-${crypto.randomUUID()}`;
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PaypalPaymentButton({
  settlementId,
  configured,
  currencySupported,
  environment,
  amountLabel,
  currency,
}: {
  settlementId: string;
  configured: boolean;
  currencySupported: boolean;
  environment: string;
  amountLabel: string;
  currency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [key] = useState(newKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [reused, setReused] = useState(false);

  const ready = configured && currencySupported;

  async function start() {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{
        paymentId: string;
        approvalUrl: string | null;
        status: string;
        reused: boolean;
      }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({ settlementId, idempotencyKey: key }),
      });
      setPaymentId(result.paymentId);
      setApprovalUrl(result.approvalUrl);
      setReused(result.reused);
      toast({
        tone: "success",
        title: result.reused ? "Existing payment order reused" : "PayPal order created",
        description: "Continue to PayPal to approve. No funds have moved yet.",
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the PayPal order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!ready}
        title={
          !configured
            ? "PayPal credentials are not configured"
            : !currencySupported
              ? `PayPal does not support ${currency}`
              : undefined
        }
      >
        <CreditCard className="h-3.5 w-3.5" /> Pay with PayPal
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        title="Pay with PayPal"
        description="Server-side order creation. Capture is confirmed by PayPal; the app does not simulate success."
        footer={
          approvalUrl ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <a
                href={approvalUrl}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                Continue to PayPal <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" loading={loading} onClick={start} disabled={!ready}>
                Create PayPal order
              </Button>
            </>
          )
        }
      >
        <div className="space-y-3 text-xs leading-5 text-slate-600">
          {!configured ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              PayPal is not configured. Add <code>PAYPAL_CLIENT_ID</code>,{" "}
              <code>PAYPAL_CLIENT_SECRET</code>, and <code>PAYPAL_WEBHOOK_ID</code> on the server.
              No fake payment can be created.
            </div>
          ) : !currencySupported ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              PayPal does not support {currency}. The settlement must use a PayPal-supported
              currency; this payment cannot be executed through PayPal.
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              PayPal {environment} is configured. This will create a live sandbox order for{" "}
              <strong className="numeric">
                {currency} {amountLabel}
              </strong>
              .
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">Idempotency key</dt>
              <dd className="mt-0.5 break-all font-mono text-[10px] text-slate-700">{key}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">State</dt>
              <dd className="mt-0.5">
                {approvalUrl
                  ? "Order created — awaiting buyer approval"
                  : "No order created yet"}
              </dd>
            </div>
          </dl>
          {approvalUrl ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p>
                PayPal order created. Click <strong>Continue to PayPal</strong> to approve. The app
                captures the order on return and verifies the provider amount before marking it paid.
              </p>
              {reused ? (
                <p className="mt-1 text-amber-700">
                  An existing order for this idempotency key was reused. Do not create a second
                  payment.
                </p>
              ) : null}
              {paymentId ? (
                <a
                  href={`/payments/${paymentId}`}
                  className="mt-2 inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
                >
                  Open payment record <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : null}
          <p className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Payment creation requires READY_FOR_PAYMENT, recorded approval, and vendor acceptance.
            Amounts remain integer minor units until sent to the provider.
          </p>
          {error ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
