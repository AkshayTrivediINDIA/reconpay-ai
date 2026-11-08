import type { NextRequest } from "next/server";
import { requireMutation, withApi, noStore } from "@/lib/http";
import { requireApiContext } from "@/lib/auth/session";
import { uploadDocumentForEntity, listDocuments } from "@/lib/documents";
import { ValidationError } from "@/lib/errors";
import type { DocumentEntityType } from "@/lib/documents";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return withApi(async () => {
    const ctx = await requireApiContext();
    const entityType = req.nextUrl.searchParams.get("entityType") ?? "";
    const entityId = uuidSchema.parse(req.nextUrl.searchParams.get("entityId"));
    if (!["INVOICE", "PURCHASE_ORDER", "GOODS_RECEIPT", "SETTLEMENT"].includes(entityType)) {
      throw new ValidationError("Invalid entity type");
    }
    return noStore({
      documents: await listDocuments(
        ctx,
        entityType as DocumentEntityType,
        entityId,
      ),
    });
  });
}

export function POST(req: NextRequest) {
  return withApi(async () => {
    requireMutation(req);
    const ctx = await requireApiContext();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("A document file is required");
    const entityType = String(form.get("entityType") ?? "");
    const entityId = uuidSchema.parse(String(form.get("entityId") ?? ""));
    const documentType = String(form.get("documentType") ?? "OTHER");
    const title = String(form.get("title") ?? "") || undefined;
    if (!["INVOICE", "PURCHASE_ORDER", "GOODS_RECEIPT", "SETTLEMENT"].includes(entityType)) {
      throw new ValidationError("Invalid entity type");
    }
    const document = await uploadDocumentForEntity(ctx, {
      file,
      entityType: entityType as DocumentEntityType,
      entityId,
      documentType,
      title,
    });
    return noStore({ ok: true, document }, 201);
  });
}
