import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for the hosting platform.
 *
 * This deliberately does not touch the database or any third-party service.
 * Render uses it to decide whether the HTTP process is up. The richer
 * /api/health endpoint still verifies the database and integrations, but a
 * slow or paused database must not keep a healthy process from being promoted.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
