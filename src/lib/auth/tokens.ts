import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHmac("sha256", env.authSecret || "dev-only-insecure-secret").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type FileTokenPayload = {
  documentId: string;
  expiresAt: number;
  disposition: "inline" | "attachment";
};

function signFilePayload(payload: string): string {
  return createHmac("sha256", env.authSecret || "dev-only-insecure-secret")
    .update(payload)
    .digest("base64url");
}

export function createFileToken(
  documentId: string,
  ttlSeconds = 600,
  disposition: "inline" | "attachment" = "inline",
): string {
  const payload: FileTokenPayload = {
    documentId,
    expiresAt: Date.now() + ttlSeconds * 1000,
    disposition,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signFilePayload(encoded)}`;
}

export function verifyFileToken(token: string): FileTokenPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = signFilePayload(encoded);
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as FileTokenPayload;
    if (
      typeof payload.documentId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }
    if (payload.disposition !== "inline" && payload.disposition !== "attachment") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function signedFileHref(
  documentId: string,
  ttlSeconds = 600,
  disposition: "inline" | "attachment" = "inline",
): string {
  return `/api/files/download?token=${encodeURIComponent(
    createFileToken(documentId, ttlSeconds, disposition),
  )}`;
}
