import { NextResponse, type NextRequest } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";

/** Wrap a route handler so domain errors become consistent JSON responses. */
export async function withApi(
  handler: () => Promise<NextResponse | Response>,
): Promise<NextResponse | Response> {
  try {
    return await handler();
  } catch (error) {
    return apiError(error);
  }
}

/** Reject cross-site state-changing requests before touching data. */
export function requireMutation(req: NextRequest): void {
  assertSameOrigin(req);
}

/**
 * Convert a domain object into JSON-safe data.
 *
 * Financial values are stored as bigint minor units. JavaScript's default
 * JSON serializer throws for bigint, so API responses expose them as exact
 * decimal strings rather than silently losing precision through Number.
 */
export function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

export function noStore(data: unknown, status = 200): NextResponse {
  return NextResponse.json(jsonSafe(data), {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
