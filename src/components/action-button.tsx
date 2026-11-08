"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function ActionButton({
  endpoint,
  method = "POST",
  body,
  children,
  confirm,
  successMessage,
  redirectTo,
  refresh = true,
  onSuccess,
  ...props
}: {
  endpoint: string;
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  children: React.ReactNode;
  confirm?: string;
  successMessage?: string;
  redirectTo?: string;
  refresh?: boolean;
  onSuccess?: () => void;
} & Omit<ButtonProps, "onClick">) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setLoading(true);
    try {
      await apiFetch(endpoint, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      });
      toast({ tone: "success", title: successMessage ?? "Action completed" });
      onSuccess?.();
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      } else if (refresh) {
        router.refresh();
      }
    } catch (error) {
      toast({
        tone: "error",
        title: "Action failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" loading={loading} onClick={run} {...props}>
      {children}
    </Button>
  );
}
