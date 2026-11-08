import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireInternalPage } from "@/lib/page-auth";
import { getVendorOptions } from "@/lib/services/invoices";
import { aiStatus } from "@/lib/ai";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { InvoiceUploadForm } from "@/components/invoices/invoice-upload-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload invoice" };

export default async function NewInvoicePage() {
  const ctx = await requireInternalPage("manage_invoices");
  const vendors = await getVendorOptions(ctx);
  const ai = aiStatus();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/invoices" className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to invoices
      </Link>
      <PageHeader
        title="Upload invoice"
        description="The document is stored privately, extraction runs server-side, and all extracted values remain editable."
      />
      <Card>
        <CardContent className="pt-5">
          <InvoiceUploadForm
            vendors={vendors}
            aiLabel={
              ai.configured
                ? `OpenAI structured extraction (${ai.model})`
                : "Deterministic local PDF text parser (OpenAI not configured)"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
