import * as React from "react";
import { cn, humanize } from "@/lib/ui";

const toneByStatus: Record<string, string> = {
  VERIFIED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  RECEIVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  INSPECTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  VENDOR_ACCEPTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  READY_FOR_PAYMENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  OPEN: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 ring-amber-600/20",
  AWAITING_APPROVAL: "bg-amber-50 text-amber-700 ring-amber-600/20",
  NEEDS_REVIEW: "bg-amber-50 text-amber-700 ring-amber-600/20",
  EXTRACTED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  PROCESSING: "bg-blue-50 text-blue-700 ring-blue-600/20",
  UPLOADED: "bg-slate-100 text-slate-700 ring-slate-600/20",
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-600/20",
  SHARED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  VENDOR_REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
  REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
  FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  PAYMENT_FAILED: "bg-red-50 text-red-700 ring-red-600/20",
  ERROR: "bg-red-50 text-red-700 ring-red-600/20",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-600/20",
  SUSPENDED: "bg-red-50 text-red-700 ring-red-600/20",
  NOT_CONFIGURED: "bg-slate-100 text-slate-600 ring-slate-600/20",
  CONFIGURED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-600/20",
  CRITICAL: "bg-red-50 text-red-700 ring-red-600/20",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-600/20",
  LOW: "bg-slate-100 text-slate-700 ring-slate-600/20",
  INFO: "bg-blue-50 text-blue-700 ring-blue-600/20",
  DISPUTED: "bg-orange-50 text-orange-700 ring-orange-600/20",
  ACKNOWLEDGED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  WAIVED: "bg-slate-100 text-slate-600 ring-slate-600/20",
};

export function StatusBadge({
  status,
  className,
  label,
}: {
  status: string;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        toneByStatus[status] ?? "bg-slate-100 text-slate-700 ring-slate-600/20",
        className,
      )}
    >
      {label ?? humanize(status)}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700",
        className,
      )}
    >
      {children}
    </span>
  );
}
