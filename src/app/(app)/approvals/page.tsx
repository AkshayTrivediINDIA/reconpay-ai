import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listPendingApprovals } from "@/lib/services/settlements";
import { canApproveAmount } from "@/lib/auth/rbac";
import { formatMinor } from "@/lib/money";
import { formatDateTime } from "@/lib/ui";
import { PageHeader, StatCard } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireInternalPage("approve_settlement");
  const approvals = await listPendingApprovals(ctx);
  const totalAmount = approvals.reduce(
    (sum, row) => sum + row.settlement.proposedAmountMinor,
    0n,
  );

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Settlement proposals awaiting a recorded internal decision. Approval does not move money; it allows the proposal to be shared with the vendor."
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {ctx.membership.role.replaceAll("_", " ").toLowerCase()}
          </span>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Pending decisions"
          value={approvals.length}
          hint="Only proposals in PENDING_APPROVAL"
          icon={CheckSquare}
          tone={approvals.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Proposed amount under review"
          value={formatMinor(totalAmount, ctx.organization.baseCurrency)}
          hint="Not a payable or paid amount"
        />
      </div>
      <Card>
        <CardContent className="px-0 pb-0">
          {approvals.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={CheckSquare}
                title="No approvals waiting"
                description="Submitted settlements appear here. Approval requires the right role, amount authority, and separation from the creator."
                action={{ href: "/settlements", label: "Open settlements" }}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Settlement</TH>
                  <TH>Vendor</TH>
                  <TH>Submitted</TH>
                  <TH className="text-right">Proposed amount</TH>
                  <TH>Your authority</TH>
                  <TH aria-label="Review" />
                </TR>
              </THead>
              <TBody>
                {approvals.map(({ settlement, vendorName }) => {
                  const authority = canApproveAmount(ctx, settlement.proposedAmountMinor);
                  const self = settlement.createdBy === ctx.user.id;
                  return (
                    <TR key={settlement.id}>
                      <TD>
                        <Link
                          href={`/settlements/${settlement.id}`}
                          className="font-medium text-slate-900 hover:text-indigo-700"
                        >
                          {settlement.settlementNumber}
                        </Link>
                        <p className="max-w-md truncate text-[10px] text-slate-500">
                          {settlement.reason}
                        </p>
                      </TD>
                      <TD className="text-xs">{vendorName}</TD>
                      <TD className="text-xs">
                        {settlement.submittedAt ? formatDateTime(settlement.submittedAt) : "—"}
                      </TD>
                      <TD className="numeric text-right text-xs font-medium">
                        {formatMinor(settlement.proposedAmountMinor, settlement.currency)}
                      </TD>
                      <TD>
                        {self && ctx.membership.role !== "ADMIN" ? (
                          <span className="text-[10px] font-medium text-red-700">
                            Creator — cannot decide
                          </span>
                        ) : authority.allowed ? (
                          <span className="text-[10px] font-medium text-emerald-700">
                            Within your authority
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-amber-700">
                            {authority.reason ?? "Not permitted"}
                          </span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <Link
                          href={`/settlements/${settlement.id}`}
                          className="text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Review
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            Decisions are final per submission but can be revised only through a new controlled
            workflow. Statuses are shown exactly as stored.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
