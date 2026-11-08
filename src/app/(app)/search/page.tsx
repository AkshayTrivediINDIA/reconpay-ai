import Link from "next/link";
import { Search } from "lucide-react";
import { requireAppContext } from "@/lib/auth/session";
import { globalSearch } from "@/lib/services/search";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const query = params.q ?? "";
  const result = await globalSearch(ctx, query);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Search"
        description="Search only within your organization. Vendor users are restricted to their own invoices and settlements."
      />
      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <form action="/search" method="get" className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={query}
                autoFocus
                placeholder="Invoice number, PO, vendor, receipt, settlement"
                aria-label="Search records"
                className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-md bg-[var(--primary)] px-4 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Search
            </button>
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {query.trim().length < 2 ? (
            <div className="p-5">
              <EmptyState
                icon={Search}
                title="Enter at least two characters"
                description="Search across invoice numbers, purchase orders, goods receipts, settlements, and vendors."
              />
            </div>
          ) : result.total === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Search}
                title={`No results for “${result.query}”`}
                description="Try a shorter reference or a different record type. Search is organization-scoped."
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {result.groups.map((group) => (
                <section key={group.label} className="px-5 py-4">
                  <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </h2>
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li key={`${item.type}-${item.href}`}>
                        <Link
                          href={item.href}
                          className="flex items-center justify-between rounded-md border border-transparent px-2 py-2 hover:border-slate-200 hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-xs font-medium text-slate-900">{item.title}</p>
                            <p className="text-[10px] text-slate-500">{item.subtitle}</p>
                          </div>
                          <span className="text-[10px] capitalize text-slate-400">
                            {item.type.replaceAll("-", " ")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {query.trim().length >= 2 ? (
            <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
              {result.total} result{result.total === 1 ? "" : "s"} · exact database matches only
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
