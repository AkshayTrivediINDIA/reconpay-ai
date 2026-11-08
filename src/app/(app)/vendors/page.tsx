import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { listVendors } from "@/lib/services/vendors";
import { formatDate, humanize, cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { CreateVendorButton } from "@/components/vendors/vendor-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors" };

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const params = await searchParams;
  const status = params.status ?? "ALL";
  const page = Number(params.page ?? "1");
  const { vendors, total } = await listVendors(ctx, {
    search: params.search,
    status,
    page,
    pageSize: 25,
  });
  const statuses = ["ALL", "ACTIVE", "ON_HOLD", "INACTIVE"];

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="The organization-scoped supplier master. Vendor assignment is required for reconciliation, settlements, and evidence traceability."
        actions={<CreateVendorButton defaultCurrency={ctx.organization.baseCurrency} />}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {statuses.map((item) => (
              <Link
                key={item}
                href={item === "ALL" ? "/vendors" : `/vendors?status=${item}`}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  status === item
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {humanize(item)}
              </Link>
            ))}
          </div>
          <form className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="search"
              defaultValue={params.search}
              placeholder="Name, code, or email"
              aria-label="Search vendors"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
          </form>
        </div>
        <CardContent className="px-0 pb-0">
          {vendors.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Building2}
                title={params.search ? "No matching vendors" : "No vendors yet"}
                description={
                  params.search
                    ? "Try a different name, code, or email address."
                    : "Create the vendor master before uploading or reconciling invoices."
                }
                action={{ href: "/vendors", label: "Vendors page" }}
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Vendor</TH>
                  <TH>Code</TH>
                  <TH>Contact</TH>
                  <TH>Currency</TH>
                  <TH>Terms</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH aria-label="Open" />
                </TR>
              </THead>
              <TBody>
                {vendors.map((vendor) => (
                  <TR key={vendor.id}>
                    <TD>
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {vendor.name}
                      </Link>
                    </TD>
                    <TD className="font-mono text-[11px] text-slate-600">{vendor.code}</TD>
                    <TD className="text-xs">
                      {vendor.email ?? vendor.phone ?? "—"}
                    </TD>
                    <TD className="text-xs">{vendor.currency}</TD>
                    <TD className="text-xs">{vendor.paymentTermsDays} days</TD>
                    <TD><StatusBadge status={vendor.status} /></TD>
                    <TD className="text-xs">{formatDate(vendor.createdAt)}</TD>
                    <TD className="text-right">
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="text-xs font-medium text-indigo-700 hover:underline"
                      >
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          <div className="border-t border-[var(--border)] px-4 py-2.5 text-[11px] text-slate-500">
            {total} vendor{total === 1 ? "" : "s"} · Page {page}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
