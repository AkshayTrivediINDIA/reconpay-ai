import Link from "next/link";
import { ArrowLeft, Building2, FileText, Handshake, ShoppingCart } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getVendorDetail } from "@/lib/services/vendors";
import { formatMinor } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/ui";
import { PageHeader, DescriptionList, StatCard } from "@/components/ui/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { EditVendorButton } from "@/components/vendors/vendor-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendor" };

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireInternalPage("manage_procurement");
  const { id } = await params;
  const detail = await getVendorDetail(ctx, id);
  const { vendor, invoices, purchaseOrders, settlements, invoiceCount, invoiceTotalMinor, settlementCount } =
    detail;

  return (
    <div>
      <Link
        href="/vendors"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to vendors
      </Link>
      <PageHeader
        title={vendor.name}
        description={`${vendor.code} · ${vendor.currency} · ${vendor.paymentTermsDays}-day terms`}
        meta={
          <>
            <StatusBadge status={vendor.status} />
            <span className="text-[11px] text-slate-500">
              Created {formatDateTime(vendor.createdAt)}
            </span>
          </>
        }
        actions={
          <>
            <EditVendorButton vendorId={vendor.id} vendor={vendor} />
            <Link
              href={`/purchase-orders/new`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> New PO
            </Link>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Invoices"
          value={invoiceCount}
          hint={formatMinor(invoiceTotalMinor, vendor.currency) + " recorded across invoices"}
          icon={FileText}
        />
        <StatCard
          label="Purchase orders"
          value={purchaseOrders.length}
          hint="Most recent 20 shown below"
          icon={ShoppingCart}
        />
        <StatCard
          label="Settlements"
          value={settlementCount}
          hint="Proposals, not payments"
          icon={Handshake}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.7fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Vendor master</CardTitle>
              <CardDescription>
                Used for exact matching and evidence references.
              </CardDescription>
            </div>
            <Building2 className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <DescriptionList
              columns={1}
              items={[
                { label: "Legal name", value: vendor.name },
                { label: "Code", value: vendor.code },
                { label: "Email", value: vendor.email ?? "—" },
                { label: "Phone", value: vendor.phone ?? "—" },
                { label: "Tax ID", value: vendor.taxId ?? "—" },
                { label: "Address", value: vendor.address ?? "—" },
                { label: "Currency", value: vendor.currency },
                { label: "Payment terms", value: `${vendor.paymentTermsDays} days` },
                { label: "Status", value: <StatusBadge status={vendor.status} /> },
                { label: "Last updated", value: formatDateTime(vendor.updatedAt) },
              ]}
            />
            {vendor.notes ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
                {vendor.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent invoices</CardTitle>
                <CardDescription>Most recent 20 records for this vendor.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {invoices.length === 0 ? (
                <p className="px-5 pb-5 text-xs text-slate-500">No invoices recorded.</p>
              ) : (
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>Invoice</TH>
                      <TH>Status</TH>
                      <TH>Issue date</TH>
                      <TH className="text-right">Total</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {invoices.map((invoice) => (
                      <TR key={invoice.id}>
                        <TD>
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="text-xs font-medium text-slate-900 hover:text-indigo-700"
                          >
                            {invoice.invoiceNumber || "Untitled"}
                          </Link>
                        </TD>
                        <TD><StatusBadge status={invoice.status} /></TD>
                        <TD className="text-xs">
                          {invoice.issueDate ? formatDate(invoice.issueDate) : "—"}
                        </TD>
                        <TD className="numeric text-right text-xs">
                          {formatMinor(invoice.totalMinor, invoice.currency)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Purchase orders</CardTitle>
                <CardDescription>Authorized procurement records for this vendor.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {purchaseOrders.length === 0 ? (
                <p className="px-5 pb-5 text-xs text-slate-500">No purchase orders recorded.</p>
              ) : (
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>PO</TH>
                      <TH>Status</TH>
                      <TH>Order date</TH>
                      <TH className="text-right">Total</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {purchaseOrders.map((po) => (
                      <TR key={po.id}>
                        <TD>
                          <Link
                            href={`/purchase-orders/${po.id}`}
                            className="text-xs font-medium text-slate-900 hover:text-indigo-700"
                          >
                            {po.poNumber}
                          </Link>
                        </TD>
                        <TD><StatusBadge status={po.status} /></TD>
                        <TD className="text-xs">{formatDate(po.orderDate)}</TD>
                        <TD className="numeric text-right text-xs">
                          {formatMinor(po.totalMinor, po.currency)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Settlements</CardTitle>
                <CardDescription>Commercial proposals linked to this vendor.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {settlements.length === 0 ? (
                <p className="px-5 pb-5 text-xs text-slate-500">No settlements recorded.</p>
              ) : (
                <TableWrap>
                  <THead>
                    <TR>
                      <TH>Settlement</TH>
                      <TH>Status</TH>
                      <TH>Created</TH>
                      <TH className="text-right">Proposed</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {settlements.map((settlement) => (
                      <TR key={settlement.id}>
                        <TD>
                          <Link
                            href={`/settlements/${settlement.id}`}
                            className="text-xs font-medium text-slate-900 hover:text-indigo-700"
                          >
                            {settlement.settlementNumber}
                          </Link>
                        </TD>
                        <TD><StatusBadge status={settlement.status} /></TD>
                        <TD className="text-xs">{formatDate(settlement.createdAt)}</TD>
                        <TD className="numeric text-right text-xs">
                          {formatMinor(settlement.proposedAmountMinor, settlement.currency)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
