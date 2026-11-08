"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function IntegrationTestButton({
  provider,
  configured,
}: {
  provider: "PAYPAL" | "OPENAI" | "SUPABASE";
  configured: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ connected: boolean; message: string } | null>(null);

  async function test() {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch<{ connected: boolean; message: string }>(
        `/api/settings/integrations/${provider}/test`,
        { method: "POST", body: "{}" },
      );
      setResult(data);
      toast({
        tone: data.connected ? "success" : "error",
        title: data.connected ? "Connection verified" : "Connection not available",
        description: data.message,
      });
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Connectivity test failed";
      setResult({ connected: false, message });
      toast({ tone: "error", title: "Test failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size="sm" loading={loading} onClick={test}>
        <PlugZap className="h-3.5 w-3.5" /> Test connection
      </Button>
      {result ? (
        <p
          className={
            result.connected
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] leading-4 text-emerald-800"
              : "rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800"
          }
        >
          {result.message}
        </p>
      ) : !configured ? (
        <p className="text-[10px] leading-4 text-slate-500">
          Credentials are not configured. A test will not simulate success.
        </p>
      ) : null}
    </div>
  );
}
