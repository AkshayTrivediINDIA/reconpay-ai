"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";
import { resetPasswordSchema } from "@/lib/validation";

type FormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token ?? "", newPassword: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ tone: "success", title: "Password reset", description: "Sign in with your new password." });
      router.push("/login");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Reset failed");
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Invalid reset link</h1>
        <p className="mt-2 text-sm text-slate-500">
          This page needs a reset token. Request a new link to continue.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium text-indigo-700 hover:underline">
          Request a password reset
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Resetting your password revokes every existing session for this account.
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {serverError}
          </div>
        ) : null}
        <input type="hidden" {...register("token")} />
        <div>
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
          />
          <FieldError>{errors.newPassword?.message}</FieldError>
          <p className="mt-1 text-[11px] text-slate-500">
            At least 10 characters with uppercase, lowercase, and a number.
          </p>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">
          Reset password
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">
        <Link href="/login" className="font-medium text-indigo-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
