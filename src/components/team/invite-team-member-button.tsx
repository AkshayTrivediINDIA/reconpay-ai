"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function InviteTeamMemberButton({
  vendors,
}: {
  vendors: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "FINANCE_MANAGER" | "VENDOR">(
    "FINANCE_MANAGER",
  );
  const [approvalLimit, setApprovalLimit] = useState("");
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [invitationSent, setInvitationSent] = useState<boolean | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{
        invitationSent: boolean;
        devSetPasswordUrl?: string;
      }>("/api/team", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          role,
          approvalLimit: role === "FINANCE_MANAGER" && approvalLimit ? approvalLimit : undefined,
          vendorId: role === "VENDOR" ? vendorId : null,
        }),
      });
      setInvitationSent(result.invitationSent);
      setDevUrl(result.devSetPasswordUrl ?? null);
      toast({ tone: "success", title: "Team member added" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add team member");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Invite member
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setDevUrl(null);
          setInvitationSent(null);
        }}
        title="Invite a team member"
        description="New users receive a one-time password setup link. Existing users are added without resetting their password."
        footer={
          devUrl || invitationSent !== null ? (
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="invite-form" size="sm" loading={loading}>
                Send invitation
              </Button>
            </>
          )
        }
      >
        {invitationSent !== null ? (
          <div className="space-y-3 text-xs leading-5 text-slate-600">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              {invitationSent
                ? "Invitation email sent through the configured email provider."
                : "The membership was created, but email delivery was not confirmed. Share the setup instructions out of band."}
            </div>
            {devUrl ? (
              <div>
                <Label htmlFor="dev-invite-link">Development password setup link</Label>
                <Input id="dev-invite-link" readOnly value={devUrl} onFocus={(event) => event.target.select()} />
                <FieldHint>
                  This is shown only outside production and only for a newly created user. It
                  expires in 7 days.
                </FieldHint>
              </div>
            ) : null}
          </div>
        ) : (
          <form id="invite-form" className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="invite-name">Full name</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  id="invite-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as typeof role)}
                >
                  <option value="FINANCE_MANAGER">Finance manager</option>
                  <option value="ADMIN">Administrator</option>
                  <option value="VENDOR">Vendor user</option>
                </Select>
              </div>
              {role === "FINANCE_MANAGER" ? (
                <div>
                  <Label htmlFor="invite-limit">Approval limit ({role === "FINANCE_MANAGER" ? "major units" : ""})</Label>
                  <Input
                    id="invite-limit"
                    inputMode="decimal"
                    value={approvalLimit}
                    onChange={(event) => setApprovalLimit(event.target.value)}
                    placeholder="50000.00"
                  />
                  <FieldHint>
                    Leave blank to block approvals until an administrator sets a limit.
                  </FieldHint>
                </div>
              ) : null}
              {role === "VENDOR" ? (
                <div>
                  <Label htmlFor="invite-vendor">Vendor</Label>
                  <Select
                    id="invite-vendor"
                    value={vendorId}
                    onChange={(event) => setVendorId(event.target.value)}
                    required
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.code})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
              Roles are enforced server-side. Vendor users can only access their linked vendor&apos;s
              invoices, settlements, and payments.
            </p>
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
