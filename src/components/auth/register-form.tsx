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
import { registerSchema } from "@/lib/validation";

type FormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", organizationName: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ tone: "success", title: "Workspace created", description: "Welcome to ReconPay AI." });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Registration failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Create a workspace</h1>
      <p className="mt-1 text-sm text-slate-500">
        You become the administrator of a new, isolated organization.
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {serverError}
          </div>
        ) : null}
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" autoComplete="name" placeholder="Asha Menon" {...register("name")} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="organizationName">Organization name</Label>
          <Input
            id="organizationName"
            autoComplete="organization"
            placeholder="Northstar Facilities"
            {...register("organizationName")}
          />
          <FieldError>{errors.organizationName?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            {...register("password")}
          />
          <FieldError>{errors.password?.message}</FieldError>
          <p className="mt-1 text-[11px] text-slate-500">
            Use at least 10 characters with uppercase, lowercase, and a number.
          </p>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">
          Create workspace
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
