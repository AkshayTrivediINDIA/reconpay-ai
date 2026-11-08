import { Users } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listTeam } from "@/lib/services/team";
import { listVendors } from "@/lib/services/vendors";
import { formatMinor } from "@/lib/money";
import { formatDateTime, humanize } from "@/lib/ui";
import { PageHeader, StatCard } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { InviteTeamMemberButton } from "@/components/team/invite-team-member-button";
import { EditTeamMemberButton } from "@/components/team/edit-team-member-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireInternalPage("manage_team");
  const [{ members, activeAdmins }, { vendors }] = await Promise.all([
    listTeam(ctx),
    listVendors(ctx, { pageSize: 100, status: "ACTIVE" }),
  ]);
  const active = members.filter((row) => row.member.status === "ACTIVE").length;

  return (
    <div>
      <PageHeader
        title="Team"
        description="Organization membership, roles, approval limits, and vendor scope. Authorization is enforced on the server for every request."
        actions={
          <InviteTeamMemberButton
            vendors={vendors.map((vendor) => ({
              id: vendor.id,
              name: vendor.name,
              code: vendor.code,
            }))}
          />
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={members.length} hint={`${active} active`} icon={Users} />
        <StatCard label="Administrators" value={activeAdmins} hint="At least one must remain active" />
        <StatCard
          label="Vendor users"
          value={members.filter((row) => row.member.role === "VENDOR").length}
          hint="Scoped to a single vendor"
        />
      </div>
      <Card>
        <CardContent className="px-0 pb-0">
          <TableWrap>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Role</TH>
                <TH>Vendor scope</TH>
                <TH>Approval limit</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
                <TH aria-label="Manage" />
              </TR>
            </THead>
            <TBody>
              {members.map(({ member, userName, userEmail, lastLoginAt, vendorName }) => (
                <TR key={member.id}>
                  <TD>
                    <p className="text-xs font-medium text-slate-900">{userName}</p>
                    <p className="text-[10px] text-slate-500">{userEmail}</p>
                  </TD>
                  <TD className="text-xs">{humanize(member.role)}</TD>
                  <TD className="text-xs">{vendorName ?? "Organization-wide"}</TD>
                  <TD className="numeric text-xs">
                    {member.approvalLimitMinor !== null
                      ? formatMinor(member.approvalLimitMinor, ctx.organization.baseCurrency)
                      : "—"}
                  </TD>
                  <TD><StatusBadge status={member.status} /></TD>
                  <TD className="text-xs">{lastLoginAt ? formatDateTime(lastLoginAt) : "Never"}</TD>
                  <TD className="text-right">
                    <EditTeamMemberButton
                      memberId={member.id}
                      name={userName}
                      self={member.userId === ctx.user.id}
                      member={{
                        role: member.role,
                        status: member.status,
                        vendorId: member.vendorId,
                        approvalLimitMinor:
                          member.approvalLimitMinor !== null
                            ? member.approvalLimitMinor.toString()
                            : null,
                      }}
                      vendors={vendors.map((vendor) => ({
                        id: vendor.id,
                        name: vendor.name,
                        code: vendor.code,
                      }))}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            The API rejects self-suspension, self-demotion, and removal of the last active
            administrator.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
