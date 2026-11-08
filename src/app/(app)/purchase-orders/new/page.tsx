import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getVendorOptions } from "@/lib/services/invoices";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { PurchaseOrderForm } from "@/components/purchase-orders/purchase-order-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  const ctx = await requireInternalPage("manage_procurement");
  const vendors = await getVendorOptions(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/purchase-orders"
        className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to purchase orders
      </Link>
      <PageHeader
        title="New purchase order"
        description="The PO fixes ordered quantities, unit prices, and currency for deterministic matching."
      />
      <Card>
        <CardContent className="pt-5">
          {vendors.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
              Add an active vendor before creating a purchase order.{" "}
              <Link href="/vendors" className="font-medium underline">
                Open vendors
              </Link>
            </div>
          ) : (
            <PurchaseOrderForm
              vendors={vendors}
              defaultCurrency={ctx.organization.baseCurrency}
              today={new Date().toISOString().slice(0, 10)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
