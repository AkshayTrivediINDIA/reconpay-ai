"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client-api";

export function NotificationReadButton({
  id,
  all = false,
}: {
  id?: string;
  all?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function mark() {
    setLoading(true);
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify(all ? { all: true } : { id }),
      });
      toast({ tone: "success", title: all ? "All notifications marked read" : "Marked read" });
      router.refresh();
    } catch (caught) {
      toast({
        tone: "error",
        title: "Could not update notifications",
        description: caught instanceof Error ? caught.message : "Please retry.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={all ? "secondary" : "ghost"}
      size="sm"
      loading={loading}
      onClick={mark}
    >
      {all ? (
        <>
          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
        </>
      ) : (
        "Mark read"
      )}
    </Button>
  );
}
