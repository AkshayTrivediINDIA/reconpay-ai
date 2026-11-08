import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { can, isVendor } from "@/lib/auth/rbac";
import { getPaymentDetail } from "@/lib/services/payments";
import { formatMinor } from "@/lib/money";
import { formatDateTime, humanize } from "@/lib/ui";
import { PageHeader, DescriptionList } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment" };

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ captured?: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getPaymentDetail(ctx, id);
  const { payment, settlement, vendorName, invoiceNumber, events } = detail;
  const vendorView = isVendor(ctx);
  const canCapture = !vendorView && can(ctx, "initiate_payment");

  return (
    <div>
      <Link
        href="/payments"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to payments
      </Link>
      <PageHeader
        title={`Payment ${payment.id.slice(0, 8)}`}
        description={`${vendorName} · ${settlement.settlementNumber} · ${invoiceNumber || "Invoice"}`}
        meta={
          <>
            <StatusBadge status={payment.status} />
            <span className="text-[11px] text-slate-500">
              {payment.provider} · created {formatDateTime(payment.createdAt)}
            </span>
            {payment.confirmedAt ? (
              <span className="text-[11px] text-emerald-700">
                Confirmed {formatDateTime(payment.confirmedAt)}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link
              href={`/settlements/${settlement.id}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <CreditCard className="h-3.5 w-3.5" /> Settlement
            </Link>
            {payment.status === "AWAITING_APPROVAL" && payment.providerApprovalUrl ? (
              <a
                href={payment.providerApprovalUrl}
                className={buttonVariants({ size: "sm" })}
              >
                Continue to PayPal <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {canCapture && payment.status === "AWAITING_APPROVAL" ? (
              <ActionButton
                endpoint={`/api/payments/${payment.id}`}
                method="POST"
                confirm="Ask PayPal to capture this order now? Only do this after buyer approval."
                successMessage="Capture verified with PayPal"
              >
                Capture now
              </ActionButton>
            ) : null}
          </>
        }
      />

      {query.captured === "1" && payment.status === "SUCCEEDED" ? (
        <Alert tone="success" title="PayPal capture verified" className="mb-4">
          The provider confirmed the exact amount and currency. This record was updated from that
          response, not from a client-side redirect alone.
        </Alert>
      ) : null}

      {payment.status === "FAILED" ? (
        <Alert tone="danger" title="Payment failed" className="mb-4">
          {payment.failureReason ?? "The provider did not confirm the capture. No payment is recorded as successful."}
        </Alert>
      ) : null}

      {payment.status === "CANCELLED" ? (
        <Alert tone="warning" title="Checkout cancelled" className="mb-4">
          The buyer cancelled at PayPal. No funds moved. The settlement can be returned to ready
          for payment by the controlled workflow.
        </Alert>
      ) : null}

      {payment.status === "SUCCEEDED" ? (
        <Alert tone="success" title="Authoritative provider confirmation recorded" className="mb-4">
          Capture ID: <span className="font-mono">{payment.providerCaptureId ?? "—"}</span>. The
          settlement is marked paid only because the verified capture matched the authorized amount.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payment facts</CardTitle>
                <CardDescription>
                  Amounts are integer minor units at rest and sent to PayPal as exact major-unit
                  strings.
                </CardDescription>
              </div>
              <CreditCard className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Authorized amount
                </p>
                <p className="numeric mt-1 text-2xl font-semibold text-slate-950">
                  {formatMinor(payment.amountMinor, payment.currency)}
                </p>
              </div>
              <DescriptionList
                columns={3}
                items={[
                  { label: "Provider", value: payment.provider },
                  { label: "Status", value: <StatusBadge status={payment.status} /> },
                  {
                    label: "Provider order",
                    value: payment.providerOrderId ?? "Not created",
                  },
                  {
                    label: "Provider capture",
                    value: payment.providerCaptureId ?? "Not captured",
                  },
                  {
                    label: "Idempotency key",
                    value: (
                      <span className="break-all font-mono text-[10px]">
                        {payment.idempotencyKey}
                      </span>
                    ),
                  },
                  {
                    label: "Initiated",
                    value: formatDateTime(payment.createdAt),
                  },
                  {
                    label: "Confirmed",
                    value: payment.confirmedAt
                      ? formatDateTime(payment.confirmedAt)
                      : "Not confirmed",
                  },
                  {
                    label: "Settlement",
                    value: (
                      <Link
                        href={`/settlements/${settlement.id}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {settlement.settlementNumber}
                      </Link>
                    ),
                  },
                  { label: "Invoice", value: invoiceNumber || "—" },
                ]}
              />
              {payment.failureReason ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] leading-5 text-red-800">
                  <p className="font-medium">Failure reason</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{payment.failureReason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Provider event history</CardTitle>
                <CardDescription>
                  Capture, cancellation, and webhook events recorded for this payment.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-xs text-slate-500">No provider events recorded yet.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                  {events.map((event) => (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-300" />
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-slate-800">
                          {humanize(event.eventType)}
                        </p>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      {event.providerEventId ? (
                        <p className="font-mono text-[10px] text-slate-500">
                          {event.providerEventId}
                        </p>
                      ) : null}
                      <pre className="scrollbar-thin mt-1 max-h-32 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[9px] text-slate-600">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Verified capture path</CardTitle>
                <CardDescription>What the server checks before marking paid.</CardDescription>
              </div>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-[11px] leading-5 text-slate-600">
                {[
                  "PayPal order returned must match the stored provider order ID",
                  "Order status and capture status must both be COMPLETED",
                  "Capture amount must equal the authorized amount exactly",
                  "Currency must match the settlement currency",
                  "Capture ID must be present and is stored",
                  "Confirmed capture is written in one database transaction",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Request snapshot</CardTitle>
                <CardDescription>Stored at order creation.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="scrollbar-thin max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
                {JSON.stringify(payment.requestSnapshot, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Provider response</CardTitle>
                <CardDescription>Only non-sensitive provider fields.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="scrollbar-thin max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600">
                {JSON.stringify(payment.responseSnapshot, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {payment.status === "FAILED" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] leading-5 text-red-800">
              <p className="flex items-center gap-1.5 font-medium">
                <XCircle className="h-3.5 w-3.5" /> No funds confirmed
              </p>
              <p className="mt-1">
                A failed payment is not retried automatically. The settlement status must be
                reviewed before a new payment attempt.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
