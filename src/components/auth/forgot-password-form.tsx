"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/field";
import { apiFetch } from "@/lib/client-api";
import { forgotPasswordSchema } from "@/lib/validation";

type FormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setMessage(null);
    try {
      const result = await apiFetch<{ message: string; devResetUrl?: string }>(
        "/api/auth/forgot-password",
        { method: "POST", body: JSON.stringify(values) },
      );
      setMessage(result.message);
      setDevResetUrl(result.devResetUrl ?? null);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Request failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your account email. The response is identical whether or not an account exists.
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {serverError}
          </div>
        ) : null}
        {message ? (
          <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {message}
            {devResetUrl ? (
              <p className="mt-2 break-all">
                Development reset link:{" "}
                <Link href={devResetUrl} className="font-medium underline">
                  {devResetUrl}
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-indigo-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
