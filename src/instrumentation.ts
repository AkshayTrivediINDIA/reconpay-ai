/**
 * Server startup checks.
 *
 * Keeping secrets validation here means a production server refuses to start
 * with a missing/short AUTH_SECRET, while local test/tooling imports do not
 * trigger the check.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionSecrets } = await import("./lib/env");
  assertProductionSecrets();
}
