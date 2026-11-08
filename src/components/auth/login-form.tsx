"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";
import { DEMO_USERS } from "@/lib/demo";
import { loginRequestSchema } from "@/lib/validation";

type FormValues = z.infer<typeof loginRequestSchema>;

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ tone: "success", title: "Signed in" });
      router.push(next || "/dashboard");
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Sign-in failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">
        Use your organization account. Access is resolved on the server.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {serverError}
          </div>
        ) : null}
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            {...register("email")}
          />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="mb-1.5 text-xs text-indigo-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            {...register("password")}
          />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-medium text-slate-700">Demo accounts</p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Fill a seeded account to inspect role-specific access.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEMO_USERS.map((user) => (
            <button
              key={user.email}
              type="button"
              onClick={() => {
                setValue("email", user.email, { shouldValidate: true });
                setValue("password", user.password, { shouldValidate: true });
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
            >
              {user.role === "ADMIN" ? "Admin" : user.role === "FINANCE_MANAGER" ? "Finance" : "Vendor"}
            </button>
          ))}
        </div>
        <FieldHint>Password for all seeded accounts: {DEMO_USERS[0].password}</FieldHint>
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        New to ReconPay?{" "}
        <Link href="/register" className="font-medium text-indigo-700 hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
