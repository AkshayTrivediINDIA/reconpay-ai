import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, ShieldCheck } from "lucide-react";
import { getVendorPortalData } from "@/lib/services/settlements";
import { formatMinor } from "@/lib/money";
import { formatDateTime } from "@/lib/ui";
import { Brand } from "@/components/brand";
import { StatusBadge } from "@/components/ui/badge";
import { VendorResponseForm } from "@/components/settlements/vendor-response-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Vendor settlement",
  robots: { index: false, follow: false },
};

export default async function VendorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getVendorPortalData(token);
  if (!data) notFound();

  if (data.expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
          <Clock className="mx-auto h-8 w-8 text-amber-600" />
          <h1 className="mt-3 text-lg font-semibold text-slate-950">This link has expired</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            The secure settlement link is no longer valid. Contact the buyer on your usual channel
            and ask them to issue a new link.
          </p>
          <div className="mt-5 flex justify-center">
            <Brand />
          </div>
        </div>
      </div>
    );
  }

  const { settlement, vendorName, invoiceNumber, organizationName, organizationId } = data.row;
  void organizationId;
  const responseOpen = ["SHARED", "CLARIFICATION_REQUESTED"].includes(settlement.status);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Brand />
          <span className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
            <ShieldCheck className="h-3 w-3" /> Secure vendor link
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
            {organizationName}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">
            Settlement proposal {settlement.settlementNumber}
          </h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Prepared for {vendorName} · Invoice {invoiceNumber || "—"} · This link expires{" "}
            {settlement.vendorTokenExpiresAt
              ? formatDateTime(settlement.vendorTokenExpiresAt)
              : "at an unknown time"}
            .
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={settlement.status} />
            <span className="text-[10px] text-slate-500">
              Your response is recorded against this proposal only.
            </span>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Original invoice
              </p>
              <p className="numeric mt-1 text-base font-semibold text-slate-900">
                {formatMinor(settlement.originalAmountMinor, settlement.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Amount in dispute
              </p>
              <p className="numeric mt-1 text-base font-semibold text-amber-700">
                {formatMinor(settlement.disputedAmountMinor, settlement.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-700">
                Proposed settlement
              </p>
              <p className="numeric mt-1 text-base font-semibold text-indigo-900">
                {formatMinor(settlement.proposedAmountMinor, settlement.currency)}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Buyer&apos;s reason
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-slate-700">
              {settlement.reason}
            </p>
          </div>

          {settlement.vendorResponse ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Latest recorded response
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">
                {settlement.vendorResponse}
              </p>
            </div>
          ) : null}
        </section>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Respond to this proposal</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            Accepting records your commercial position. It does not itself transfer funds; the
            buyer&apos;s internal approval and payment controls still apply.
          </p>
          <div className="mt-3">
            <VendorResponseForm
              endpoint={`/api/vendor/${encodeURIComponent(token)}/respond`}
              settlementStatus={settlement.status}
            />
          </div>
        </section>

        {responseOpen ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-500">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Responses are attributed to this secure link and recorded in the buyer&apos;s immutable
            trail. Do not forward the link; anyone holding it can view the proposal and respond.
          </div>
        ) : null}

        <p className="mt-6 text-center text-[10px] text-slate-400">
          ReconPay AI · Secure vendor portal · No sign-in required for this one-time link
        </p>
        <p className="mt-1 text-center text-[10px] text-slate-400">
          Need help? Contact {organizationName} through your existing commercial channel.{" "}
          <Link href="/" className="text-slate-500 underline">
            About ReconPay AI
          </Link>
        </p>
      </main>
    </div>
  );
}
