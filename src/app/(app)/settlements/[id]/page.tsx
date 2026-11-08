import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  CreditCard,
  FileSearch,
  Handshake,
  Link2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { can, canApproveAmount, isVendor } from "@/lib/auth/rbac";
import { getSettlementDetail } from "@/lib/services/settlements";
import { formatMinor, toMajorString } from "@/lib/money";
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
import { ApprovalButtons } from "@/components/settlements/approval-buttons";
import { EditSettlementButton } from "@/components/settlements/settlement-draft-form";
import { ShareSettlementButton } from "@/components/settlements/share-settlement-button";
import { VendorResponseForm } from "@/components/settlements/vendor-response-form";
import { PaypalPaymentButton } from "@/components/payments/paypal-payment-button";
import { UploadDocumentButton } from "@/components/documents/upload-document-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settlement" };

const workflow: { status: string; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "PENDING_APPROVAL", label: "Approval" },
  { status: "APPROVED", label: "Approved" },
  { status: "SHARED", label: "Vendor" },
  { status: "VENDOR_ACCEPTED", label: "Accepted" },
  { status: "READY_FOR_PAYMENT", label: "Ready" },
  { status: "PAID", label: "Paid" },
];

function workflowIndex(status: string): number {
  if (status === "REJECTED") return 1;
  if (status === "VENDOR_REJECTED") return 3;
  if (status === "CLARIFICATION_REQUESTED") return 3;
  if (status === "PAYMENT_PROCESSING") return 5;
  if (status === "PAYMENT_FAILED") return 5;
  if (status === "CANCELLED") return 0;
  const index = workflow.findIndex((step) => step.status === status);
  return index === -1 ? 0 : index;
}

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAppContext();
  const { id } = await params;
  const detail = await getSettlementDetail(ctx, id);
  const { settlement, invoice, vendor, run, approvals, payments, paypal } = detail;
  const vendorView = isVendor(ctx);
  const canApprove = can(ctx, "approve_settlement");
  const canShare = can(ctx, "share_settlement");
  const canPay = can(ctx, "initiate_payment");
  const canEdit = can(ctx, "create_settlement") && !vendorView;
  const selfCreated = settlement.createdBy === ctx.user.id;
  const authority = canApproveAmount(ctx, settlement.proposedAmountMinor);
  const approvalBlocked =
    selfCreated && ctx.membership.role !== "ADMIN"
      ? "You created this proposal. Segregation of duties requires a different approver."
      : !authority.allowed
        ? (authority.reason ?? "Approval not permitted")
        : null;
  const current = workflowIndex(settlement.status);
  const latestPayment = payments[0];
  const activeLink =
    Boolean(settlement.vendorTokenHash) &&
    Boolean(
      settlement.vendorTokenExpiresAt &&
        settlement.vendorTokenExpiresAt.getTime() > Date.now(),
    );

  return (
    <div>
      <Link
        href="/settlements"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to settlements
      </Link>
      <PageHeader
        title={settlement.settlementNumber}
        description={`${vendor?.name ?? "Vendor"} · ${invoice?.invoiceNumber || "Invoice"} · Proposed ${formatMinor(settlement.proposedAmountMinor, settlement.currency)}`}
        meta={
          <>
            <StatusBadge status={settlement.status} />
            <span className="text-[11px] text-slate-500">
              Created {formatDateTime(settlement.createdAt)}
            </span>
            {settlement.approvedAt ? (
              <span className="text-[11px] text-emerald-700">
                Approved {formatDateTime(settlement.approvedAt)}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            {canEdit && ["DRAFT", "REJECTED"].includes(settlement.status) ? (
              <EditSettlementButton
                settlementId={settlement.id}
                proposedAmount={toMajorString(settlement.proposedAmountMinor)}
                disputedAmount={toMajorString(settlement.disputedAmountMinor)}
                reason={settlement.reason}
                currency={settlement.currency}
              />
            ) : null}
            {canEdit && ["DRAFT", "REJECTED"].includes(settlement.status) ? (
              <ActionButton
                endpoint={`/api/settlements/${settlement.id}/submit`}
                method="POST"
                successMessage="Submitted for internal approval"
                confirm="Submit this proposal for internal approval?"
              >
                Submit for approval
              </ActionButton>
            ) : null}
            {!vendorView && canShare &&
            ["APPROVED", "SHARED", "CLARIFICATION_REQUESTED"].includes(settlement.status) ? (
              <ShareSettlementButton
                settlementId={settlement.id}
                hasActiveLink={activeLink}
              />
            ) : null}
            {!vendorView && canPay && settlement.status === "VENDOR_ACCEPTED" ? (
              <ActionButton
                endpoint={`/api/settlements/${settlement.id}/ready`}
                method="POST"
                successMessage="Settlement marked ready for payment"
                confirm="Confirm internal approval and vendor acceptance are recorded. Mark ready for payment?"
              >
                Mark ready for payment
              </ActionButton>
            ) : null}
            {!vendorView && canPay && settlement.status === "READY_FOR_PAYMENT" ? (
              <PaypalPaymentButton
                settlementId={settlement.id}
                configured={paypal.configured}
                currencySupported={paypal.currencySupported}
                environment={paypal.environment}
                amountLabel={toMajorString(settlement.proposedAmountMinor)}
                currency={settlement.currency}
              />
            ) : null}
          </>
        }
      />

      {vendorView && ["SHARED", "CLARIFICATION_REQUESTED"].includes(settlement.status) ? (
        <Alert tone="warning" title="Your response is required" className="mb-4">
          Review the proposal and evidence below, then accept, reject, or request clarification.
          Your response is recorded with this secure link.
        </Alert>
      ) : null}

      {settlement.status === "REJECTED" ? (
        <Alert tone="danger" title="Rejected internally" className="mb-4">
          {settlement.vendorResponse
            ? `Reviewer comment: ${settlement.vendorResponse}`
            : "The proposal was rejected. Edit the draft and resubmit if appropriate."}
        </Alert>
      ) : null}

      {settlement.status === "PAYMENT_FAILED" ? (
        <Alert tone="danger" title="The last payment attempt failed" className="mb-4">
          {latestPayment?.failureReason ??
            "No funds were confirmed. Review the payment record before retrying."}{" "}
          {latestPayment ? (
            <Link
              href={`/payments/${latestPayment.id}`}
              className="font-medium underline"
            >
              Open payment {latestPayment.id.slice(0, 8)}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {settlement.status === "PAID" ? (
        <Alert tone="success" title="Payment confirmed by PayPal" className="mb-4">
          The settlement is paid. Only an authoritative provider response can set this status.
          {latestPayment ? (
            <span>
              {" "}
              <Link href={`/payments/${latestPayment.id}`} className="font-medium underline">
                Open payment record
              </Link>
              .
            </span>
          ) : null}
        </Alert>
      ) : null}

      <Card className="mb-5">
        <CardContent className="py-4">
          <ol className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {workflow.map((step, index) => {
              const complete = index < current || settlement.status === "PAID";
              const active = index === current && settlement.status !== "PAID";
              return (
                <li key={step.status} className="flex items-center gap-2">
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : active ? (
                    <Circle className="h-4 w-4 shrink-0 fill-indigo-100 text-indigo-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                  )}
                  <div>
                    <p
                      className={
                        complete || active
                          ? "text-[11px] font-medium text-slate-800"
                          : "text-[11px] text-slate-400"
                      }
                    >
                      {step.label}
                    </p>
                    {active ? (
                      <p className="text-[9px] text-indigo-600">Current stage</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {["VENDOR_REJECTED", "CLARIFICATION_REQUESTED", "PAYMENT_FAILED", "CANCELLED"].includes(
            settlement.status,
          ) ? (
            <p className="mt-2 text-[10px] text-amber-700">
              Current exception: {humanize(settlement.status)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Proposed commercial outcome</CardTitle>
                <CardDescription>
                  Original invoice, disputed portion, and proposal are stored separately as integer
                  minor units.
                </CardDescription>
              </div>
              <Handshake className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Original invoice",
                    value: formatMinor(settlement.originalAmountMinor, settlement.currency),
                    tone: "text-slate-900",
                  },
                  {
                    label: "Disputed portion",
                    value: formatMinor(settlement.disputedAmountMinor, settlement.currency),
                    tone: "text-amber-700",
                  },
                  {
                    label: "Proposed settlement",
                    value: formatMinor(settlement.proposedAmountMinor, settlement.currency),
                    tone: "text-indigo-700",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {item.label}
                    </p>
                    <p className={`numeric mt-1 text-[17px] font-semibold ${item.tone}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Reason for proposal
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-slate-700">
                  {settlement.reason}
                </p>
              </div>
              <div className="mt-4">
                <DescriptionList
                  columns={3}
                  items={[
                    { label: "Currency", value: settlement.currency },
                    {
                      label: "Invoice",
                      value: invoice ? (
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-indigo-700 hover:underline"
                        >
                          {invoice.invoiceNumber || "Untitled"}
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      label: "Reconciliation run",
                      value: run ? (
                        <Link
                          href={`/reconciliation/${run.id}`}
                          className="text-indigo-700 hover:underline"
                        >
                          View run {run.id.slice(0, 8)}
                        </Link>
                      ) : (
                        "Not linked"
                      ),
                    },
                    {
                      label: "Submitted",
                      value: settlement.submittedAt
                        ? formatDateTime(settlement.submittedAt)
                        : "Not submitted",
                    },
                    {
                      label: "Vendor responded",
                      value: settlement.vendorRespondedAt
                        ? formatDateTime(settlement.vendorRespondedAt)
                        : "No response",
                    },
                    {
                      label: "Ready for payment",
                      value: settlement.readyForPaymentAt
                        ? formatDateTime(settlement.readyForPaymentAt)
                        : "Not ready",
                    },
                  ]}
                />
              </div>
              {settlement.vendorResponse ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Latest recorded response
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">
                    {settlement.vendorResponse}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Approval and response history</CardTitle>
                <CardDescription>
                  Every decision has an actor, role, and timestamp. There is no silent override.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {approvals.length === 0 ? (
                <p className="text-xs text-slate-500">No internal approval decision recorded.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {approvals.map(({ approval, approverName }) => (
                    <li key={approval.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="flex items-start gap-2">
                        {approval.decision === "APPROVED" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                        )}
                        <div>
                          <p className="text-xs font-medium text-slate-800">
                            {approval.decision.toLowerCase()} by {approverName}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {approval.approverRole.replaceAll("_", " ").toLowerCase()} ·{" "}
                            {formatDateTime(approval.createdAt)}
                          </p>
                          {approval.comments ? (
                            <p className="mt-1 text-[11px] leading-4 text-slate-600">
                              {approval.comments}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {vendorView ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Your response</CardTitle>
                  <CardDescription>
                    Accepting records a commercial position; it does not itself transfer funds.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <VendorResponseForm
                  endpoint={`/api/settlements/${settlement.id}/respond`}
                  settlementStatus={settlement.status}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {!vendorView && settlement.status === "PENDING_APPROVAL" ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Internal approval</CardTitle>
                  <CardDescription>
                    Approval requires authority for this amount and separation from the creator.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {!canApprove ? (
                  <p className="text-xs text-slate-500">
                    Your role cannot approve settlements. An administrator or authorized finance
                    manager must decide.
                  </p>
                ) : approvalBlocked ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                    {approvalBlocked}
                  </div>
                ) : (
                  <ApprovalButtons settlementId={settlement.id} />
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Vendor link</CardTitle>
                <CardDescription>
                  The secure link is hashed at rest and expires automatically.
                </CardDescription>
              </div>
              <Link2 className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {activeLink ? (
                <div className="space-y-2">
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                    Active until {formatDateTime(settlement.vendorTokenExpiresAt!)}. The raw token is
                    not recoverable; create a new link to resend it.
                  </p>
                  {!vendorView && canShare ? (
                    <ActionButton
                      endpoint={`/api/settlements/${settlement.id}/share`}
                      method="DELETE"
                      confirm="Revoke the vendor link? Anyone holding it will lose access."
                      successMessage="Vendor link revoked"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                    >
                      Revoke link
                    </ActionButton>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No active vendor link.{" "}
                  {settlement.sharedAt
                    ? `Last shared ${formatDateTime(settlement.sharedAt)}.`
                    : "Approve the proposal before sharing."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payments</CardTitle>
                <CardDescription>Provider records linked to this settlement.</CardDescription>
              </div>
              <CreditCard className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No payment has been initiated. Approval, vendor acceptance, and READY_FOR_PAYMENT
                  are required first.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <Link
                          href={`/payments/${payment.id}`}
                          className="text-xs font-medium text-slate-800 hover:text-indigo-700"
                        >
                          {payment.provider} · {payment.id.slice(0, 8)}
                        </Link>
                        <p className="text-[10px] text-slate-500">
                          {formatDateTime(payment.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-xs font-medium">
                          {formatMinor(payment.amountMinor, payment.currency)}
                        </p>
                        <StatusBadge status={payment.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Evidence documents</CardTitle>
                <CardDescription>Correspondence, approvals, or supporting files.</CardDescription>
              </div>
              {!vendorView ? (
                <UploadDocumentButton entityType="SETTLEMENT" entityId={settlement.id} label="Add" />
              ) : null}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">
                Linked files can also be viewed from the invoice and evidence center. Signed links
                expire and are re-issued on each view.
              </p>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500">
            <p className="flex items-center gap-1.5 font-medium text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Controls applied
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>Creator cannot approve unless administrator</li>
              <li>Approval limit enforced server-side</li>
              <li>Payment requires vendor acceptance and READY_FOR_PAYMENT</li>
              <li>PayPal capture must match amount and currency exactly</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/payments"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <CreditCard className="h-3.5 w-3.5" /> All payments
            </Link>
            {invoice ? (
              <Link
                href={`/invoices/${invoice.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <FileSearch className="h-3.5 w-3.5" /> Invoice
              </Link>
            ) : null}
            {run ? (
              <Link
                href={`/reconciliation/${run.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <BadgeCheck className="h-3.5 w-3.5" /> Evidence
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
