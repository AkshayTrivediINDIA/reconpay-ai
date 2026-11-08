"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Label, Select, Input, FieldHint } from "@/components/ui/field";

const reports = [
  { value: "invoices", label: "Invoices" },
  { value: "discrepancies", label: "Discrepancies" },
  { value: "reconciliation", label: "Reconciliation runs" },
  { value: "settlements", label: "Settlements" },
  { value: "payments", label: "Payments" },
  { value: "audit", label: "Audit trail" },
];

export function ReportExportPanel() {
  const [type, setType] = useState("invoices");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  const href = `/api/reports/${type}${query ? `?${query}` : ""}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <div>
        <Label htmlFor="report-type">Report</Label>
        <Select id="report-type" value={type} onChange={(event) => setType(event.target.value)}>
          {reports.map((report) => (
            <option key={report.value} value={report.value}>
              {report.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="report-from">From (optional)</Label>
        <Input
          id="report-from"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="report-to">To (optional)</Label>
        <Input
          id="report-to"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <FieldHint>Applied to the record creation timestamp.</FieldHint>
      </div>
      <a
        href={href}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[var(--primary)] px-3 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
      >
        <Download className="h-3.5 w-3.5" /> Export CSV
      </a>
      <div className="sm:col-span-2 lg:col-span-4">
        <p className="flex items-start gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
          <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          Exports use UTF-8 with a byte-order mark and neutralize spreadsheet formulas in
          user-controlled text. The export itself is an audited event. Amounts are exported as
          exact major-unit strings derived from integer minor units.
        </p>
      </div>
    </div>
  );
}
