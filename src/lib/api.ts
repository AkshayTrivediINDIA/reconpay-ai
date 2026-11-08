import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, ForbiddenError, ValidationError } from "./errors";
import { env } from "./env";
import type { AuthContext, Permission } from "./auth/rbac";
import { requirePermission } from "./auth/rbac";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details: details ?? undefined } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return jsonError(422, "VALIDATION_ERROR", "Request validation failed", {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  console.error("[api] unhandled error", error);
  return jsonError(
    500,
    "INTERNAL_ERROR",
    "An unexpected error occurred. The request was not completed.",
  );
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

/**
 * CSRF defense for cookie-authenticated mutations: require an Origin header
 * matching the configured app origin or the request's own origin. Browsers
 * always send Origin for cross-site and same-origin fetch POSTs; a missing
 * Origin is rejected.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    throw new ForbiddenError("Missing Origin header on a state-changing request");
  }
  const allowed = new Set<string>([env.appUrl, req.nextUrl.origin]);
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw new ForbiddenError("Invalid Origin header");
  }
  if (!allowed.has(normalized)) {
    throw new ForbiddenError("Cross-origin request rejected");
  }
}

export async function parseJson<T>(
  req: NextRequest,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Request validation failed", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function requireApiPermission(
  ctx: AuthContext,
  permission: Permission,
): void {
  requirePermission(ctx, permission);
}

export function rateLimitKey(
  req: NextRequest,
  scope: string,
  ctx?: AuthContext,
): string {
  return `${scope}:${ctx?.user.id ?? clientIp(req)}`;
}

export function appendQuery(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(path, env.appUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}
