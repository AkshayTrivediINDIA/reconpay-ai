"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function OrganizationSettingsForm({
  name,
  baseCurrency,
}: {
  name: string;
  baseCurrency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState({ name, baseCurrency });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      toast({ tone: "success", title: "Organization updated" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            required
          />
          <FieldHint>Must be unique across the platform.</FieldHint>
        </div>
        <div>
          <Label htmlFor="org-currency">Base currency</Label>
          <Input
            id="org-currency"
            maxLength={3}
            value={values.baseCurrency}
            onChange={(event) =>
              setValues((current) => ({ ...current, baseCurrency: event.target.value.toUpperCase() }))
            }
            required
          />
          <FieldHint>Three-letter ISO code. Existing records keep their own currency.</FieldHint>
        </div>
      </div>
      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <Button type="submit" size="sm" loading={loading}>
        <Save className="h-3.5 w-3.5" /> Save organization
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("The new password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast({
        tone: "success",
        title: "Password changed",
        description: result.message,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={10}
            required
          />
          <FieldHint>At least 10 characters with uppercase, lowercase, and a number.</FieldHint>
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>
      </div>
      {error ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" loading={loading}>
        Change password
      </Button>
      <p className="text-[10px] text-slate-500">
        Changing your password revokes your other active sessions.
      </p>
    </form>
  );
}
