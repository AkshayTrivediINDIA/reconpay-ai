"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function EditTeamMemberButton({
  memberId,
  name,
  member,
  vendors,
  self,
}: {
  memberId: string;
  name: string;
  member: {
    role: "ADMIN" | "FINANCE_MANAGER" | "VENDOR";
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
    vendorId: string | null;
    approvalLimitMinor: string | null;
  };
  vendors: { id: string; name: string; code: string }[];
  self: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState<"ACTIVE" | "SUSPENDED">(
    member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
  );
  const [vendorId, setVendorId] = useState(member.vendorId ?? "");
  const [approvalLimit, setApprovalLimit] = useState(
    member.approvalLimitMinor ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/team/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({
          role,
          status,
          vendorId: role === "VENDOR" ? vendorId || null : null,
          approvalLimit:
            role === "FINANCE_MANAGER"
              ? approvalLimit
                ? (Number(approvalLimit) / 100).toFixed(2)
                : null
              : null,
        }),
      });
      toast({ tone: "success", title: "Team member updated" });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="h-3.5 w-3.5" /> Manage
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Manage ${name}`}
        description="Role changes are audited. The last active administrator cannot be removed or demoted."
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-member-form" size="sm" loading={loading}>
              Save changes
            </Button>
          </>
        }
      >
        <form id="edit-member-form" className="space-y-4" onSubmit={submit}>
          {self ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              This is your own membership. You cannot suspend or demote yourself.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="member-role">Role</Label>
              <Select
                id="member-role"
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
              >
                <option value="FINANCE_MANAGER">Finance manager</option>
                <option value="ADMIN">Administrator</option>
                <option value="VENDOR">Vendor user</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="member-status">Status</Label>
              <Select
                id="member-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </div>
            {role === "FINANCE_MANAGER" ? (
              <div>
                <Label htmlFor="member-limit">Approval limit (minor units)</Label>
                <Input
                  id="member-limit"
                  inputMode="numeric"
                  value={approvalLimit}
                  onChange={(event) => setApprovalLimit(event.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="5000000"
                />
                <FieldHint>
                  Stored as exact minor units. Leave blank to block approvals. 5000000 = 50,000.00.
                </FieldHint>
              </div>
            ) : null}
            {role === "VENDOR" ? (
              <div>
                <Label htmlFor="member-vendor">Vendor</Label>
                <Select
                  id="member-vendor"
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
