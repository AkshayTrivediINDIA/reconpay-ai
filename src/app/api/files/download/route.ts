import type { NextRequest } from "next/server";
import { verifyFileToken } from "@/lib/auth/tokens";
import { getDb } from "@/lib/db";
import { evidenceDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { readLocalFile, createSupabaseSignedUrl } from "@/lib/storage";
import { supabaseStorageConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new Response("Missing file token", { status: 401 });
  const payload = verifyFileToken(token);
  if (!payload) return new Response("This file link is invalid or has expired", { status: 401 });
  const db = await getDb();
  const rows = await db
    .select()
    .from(evidenceDocuments)
    .where(eq(evidenceDocuments.id, payload.documentId))
    .limit(1);
  const document = rows[0];
  if (!document) return new Response("Document not found", { status: 404 });

  if (document.storageProvider === "SUPABASE" && supabaseStorageConfigured()) {
    const signedUrl = await createSupabaseSignedUrl(document.storageKey, 300);
    return Response.redirect(signedUrl, 302);
  }
  try {
    const bytes = await readLocalFile(document.storageKey);
    const disposition = payload.disposition === "attachment" ? "attachment" : "inline";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `${disposition}; filename="${document.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Stored file is unavailable", { status: 404 });
  }
}
