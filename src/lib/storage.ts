import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, supabaseStorageConfigured } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];
export type DocumentKind = "pdf" | "png" | "jpg";

export type ValidatedFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: AllowedMime;
  kind: DocumentKind;
  extension: "pdf" | "png" | "jpg";
  sizeBytes: number;
  sha256: string;
};

const extensionForMime: Record<AllowedMime, "pdf" | "png" | "jpg"> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

const kindForMime: Record<AllowedMime, DocumentKind> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function hasPdfMagic(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
function hasPngMagic(buffer: Buffer): boolean {
  return buffer
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}
function hasJpegMagic(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export function validateUploadBuffer(input: {
  buffer: Buffer;
  fileName: string;
  declaredMime: string;
}): ValidatedFile {
  const { buffer, fileName } = input;
  if (buffer.length === 0) throw new ValidationError("The uploaded file is empty");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError("File exceeds the 15 MB limit");
  }
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  if (!["pdf", "png", "jpg", "jpeg"].includes(ext)) {
    throw new ValidationError("Only PDF, PNG and JPG files are accepted");
  }
  let mime = input.declaredMime.toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new ValidationError("Unsupported file content type");
  }
  const allowedMime = mime as AllowedMime;
  const expectedExt = extensionForMime[allowedMime];
  const suppliedExt = ext === "jpeg" ? "jpg" : ext;
  if (suppliedExt !== expectedExt) {
    throw new ValidationError("File extension does not match its content type");
  }
  const magicOk =
    (allowedMime === "application/pdf" && hasPdfMagic(buffer)) ||
    (allowedMime === "image/png" && hasPngMagic(buffer)) ||
    (allowedMime === "image/jpeg" && hasJpegMagic(buffer));
  if (!magicOk) {
    throw new ValidationError("File signature does not match the declared type");
  }
  return {
    buffer,
    fileName: path.basename(fileName).slice(0, 255),
    mimeType: allowedMime,
    kind: kindForMime[allowedMime],
    extension: expectedExt,
    sizeBytes: buffer.length,
    sha256: sha256Hex(buffer),
  };
}

export async function validateUploadFile(file: File): Promise<ValidatedFile> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new ValidationError("A document file is required");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return validateUploadBuffer({
    buffer,
    fileName: file.name || "upload",
    declaredMime: file.type || "application/octet-stream",
  });
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function storageRoot(): string {
  return path.resolve(env.storageDir);
}

function safeKey(key: string): string {
  const normalized = key.replaceAll("\\", "/");
  if (normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

export type StorageProvider = "LOCAL" | "SUPABASE";

export async function storeFile(input: {
  organizationId: string;
  extension: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ provider: StorageProvider; storageKey: string }> {
  const key = `${input.organizationId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${input.extension}`;
  if (supabaseStorageConfigured()) {
    const encodedPath = key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const response = await fetch(
      `${env.supabaseUrl}/storage/v1/object/${encodeURIComponent(env.supabaseBucket)}/${encodedPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.supabaseServiceKey}`,
          "Content-Type": input.mimeType,
          "x-upsert": "false",
        },
        body: new Uint8Array(input.buffer),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Supabase Storage upload failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }
    return { provider: "SUPABASE", storageKey: key };
  }

  const target = path.join(storageRoot(), safeKey(key));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, input.buffer, { mode: 0o600 });
  return { provider: "LOCAL", storageKey: key };
}

export async function readLocalFile(storageKey: string): Promise<Buffer> {
  return readFile(path.join(storageRoot(), safeKey(storageKey)));
}

export async function createSupabaseSignedUrl(
  storageKey: string,
  ttlSeconds = 300,
): Promise<string> {
  const encodedPath = storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(
    `${env.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(env.supabaseBucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Supabase signed URL failed (${response.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error("Supabase returned no signed URL");
  return data.signedURL.startsWith("http")
    ? data.signedURL
    : `${env.supabaseUrl}/storage/v1${data.signedURL}`;
}

export function storageProviderLabel(): string {
  return supabaseStorageConfigured() ? "Supabase Storage (private)" : "Local private storage";
}
