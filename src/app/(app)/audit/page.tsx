import Link from "next/link";
import { Download, ScrollText, Search } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listAuditLogs } from "@/lib/services/audit";
import { formatDateTime } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit trail" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const ctx = await requireInternalPage("view_audit");
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const { logs, total, actions } = await listAuditLogs(ctx, {
    search: params.search,
    action: params.action,
    from: params.from,
    to: params.to,
    page,
    pageSize: 40,
  });
  const pageCount = Math.max(1, Math.ceil(total / 40));
  function pageHref(next: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") search.set(key, value);
    }
    search.set("page", String(next));
    return `/audit?${search.toString()}`;
  }

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Append-only records of security-sensitive and financial actions. Entries include actor, entity, timestamp, and request context."
        meta={
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {total} entr{total === 1 ? "y" : "ies"} · admin access
          </span>
        }
        actions={
          <Link
            href={`/api/reports/audit${params.from ? `?from=${params.from}&to=${params.to ?? ""}` : ""}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Download className="h-3.5 w-3.5" /> Export audit CSV
          </Link>
        }
      />
      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="search"
                defaultValue={params.search}
                placeholder="Actor, action, description"
                aria-label="Search audit entries"
                className="h-8 w-56 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <select
              name="action"
              defaultValue={params.action ?? "ALL"}
              aria-label="Filter by action"
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="ALL">All actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="from"
              defaultValue={params.from}
              aria-label="From date"
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
            />
            <input
              type="date"
              name="to"
              defaultValue={params.to}
              aria-label="To date"
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
            />
            <button
              type="submit"
              className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Apply filters
            </button>
            <Link href="/audit" className="text-xs text-slate-500 hover:text-slate-800">
              Clear
            </Link>
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {logs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={ScrollText}
                title="No audit entries match"
                description="Try removing filters. Financial and administrative actions appear here automatically."
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Description</TH>
                  <TH>Context</TH>
                </TR>
              </THead>
              <TBody>
                {logs.map((log) => (
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap text-[10px] text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </TD>
                    <TD className="text-[11px]">
                      <p className="font-medium text-slate-800">{log.actorLabel}</p>
                      <p className="text-[9px] uppercase tracking-wide text-slate-400">
                        {log.actorType}
                      </p>
                    </TD>
                    <TD>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-700">
                        {log.action}
                      </span>
                    </TD>
                    <TD className="text-[10px] text-slate-500">
                      {log.entityType ?? "—"}
                      {log.entityId ? (
                        <p className="font-mono text-[9px] text-slate-400">
                          {log.entityId.slice(0, 8)}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="max-w-md text-[11px] leading-5 text-slate-600">
                      {log.description}
                    </TD>
                    <TD>
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-[10px] text-indigo-700">
                            Metadata
                          </summary>
                          <pre className="scrollbar-thin mt-1 max-h-40 max-w-xs overflow-auto rounded border border-slate-200 bg-slate-50 p-1.5 text-[9px] text-slate-600">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                      {log.ip ? (
                        <p className="mt-0.5 font-mono text-[9px] text-slate-400">{log.ip}</p>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            <span>
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-3">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="font-medium text-indigo-700 hover:underline">
                  Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className="font-medium text-indigo-700 hover:underline">
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
