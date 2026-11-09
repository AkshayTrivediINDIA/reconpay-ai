import { and, count, eq, sql } from "drizzle-orm";
import { getDatabaseInfo, getDb } from "@/lib/db";
import {
  integrationConnections,
  invoices,
  organizationMembers,
  organizations,
  vendors,
} from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/rbac";
import { actorFromContext, writeAudit } from "@/lib/audit";
import { ConflictError, ValidationError } from "@/lib/errors";
import { aiStatus } from "@/lib/ai";
import { storageProviderLabel } from "@/lib/storage";
import {
  env,
  paypalConfigured,
  aiConfigured,
  supabaseStorageConfigured,
} from "@/lib/env";
import { testPaypalConnection } from "@/lib/paypal/client";
import { DEMO_USERS } from "@/lib/demo";

type Provider = "PAYPAL" | "OPENAI" | "SUPABASE";

const providerLabels: Record<Provider, string> = {
  PAYPAL: "PayPal",
  OPENAI: "OpenAI",
  SUPABASE: "Supabase Storage",
};

function providerDefaults(provider: Provider) {
  if (provider === "OPENAI") {
    return {
      status: aiConfigured() ? ("CONFIGURED" as const) : ("NOT_CONFIGURED" as const),
      environment: "production",
      displayName: "OpenAI",
      config: { model: env.openaiModel },
    };
  }
  if (provider === "PAYPAL") {
    return {
      status: paypalConfigured() ? ("CONFIGURED" as const) : ("NOT_CONFIGURED" as const),
      environment: env.paypalEnv,
      displayName: "PayPal",
      config: { currencySupport: "USD, EUR, GBP and other PayPal-supported currencies" },
    };
  }
  return {
    status: supabaseStorageConfigured()
      ? ("CONFIGURED" as const)
      : ("NOT_CONFIGURED" as const),
    environment: "production",
    displayName: "Supabase Storage",
    config: { bucket: env.supabaseBucket, private: true },
  };
}

async function ensureIntegrations(organizationId: string) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, organizationId));
  const existingProviders = new Set(existing.map((row) => row.provider));
  const missing = (["OPENAI", "PAYPAL", "SUPABASE"] as Provider[]).filter(
    (provider) => !existingProviders.has(provider),
  );
  if (missing.length > 0) {
    await db
      .insert(integrationConnections)
      .values(
        missing.map((provider) => ({
          organizationId,
          provider,
          ...providerDefaults(provider),
        })),
      )
      .onConflictDoNothing();
  }
  return db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, organizationId));
}

export async function getOrganizationSettings(ctx: AuthContext) {
  const db = await getDb();
  const [orgRows, integrations, memberCount, vendorCount, invoiceCount] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, ctx.organization.id)).limit(1),
    ensureIntegrations(ctx.organization.id),
    db
      .select({ total: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, ctx.organization.id)),
    db
      .select({ total: count() })
      .from(vendors)
      .where(eq(vendors.organizationId, ctx.organization.id)),
    db
      .select({ total: count() })
      .from(invoices)
      .where(eq(invoices.organizationId, ctx.organization.id)),
  ]);
  const org = orgRows[0]!;
  return {
    organization: org,
    memberCount: memberCount[0]?.total ?? 0,
    vendorCount: vendorCount[0]?.total ?? 0,
    invoiceCount: invoiceCount[0]?.total ?? 0,
    integrations: integrations.map((row) => ({
      id: row.id,
      provider: row.provider,
      label: providerLabels[row.provider],
      status: row.status,
      environment: row.environment,
      displayName: row.displayName,
      config: row.config,
      lastCheckedAt: row.lastCheckedAt,
      lastError: row.lastError,
    })),
    ai: aiStatus(),
    storage: {
      provider: storageProviderLabel(),
      localConfigured: !supabaseStorageConfigured(),
      supabaseConfigured: supabaseStorageConfigured(),
      bucket: env.supabaseBucket,
    },
    runtime: {
      environment: env.nodeEnv,
      appUrl: env.appUrl,
      demoMode: env.demoMode,
      database: env.runMigrations ? "migrations on boot" : undefined,
    },
    demoCredentials:
      env.demoMode && org.isDemo ? DEMO_USERS.map((user) => ({ ...user })) : null,
  };
}

export async function updateOrganization(
  ctx: AuthContext,
  input: { name: string; baseCurrency: string },
): Promise<void> {
  requirePermission(ctx, "manage_organization");
  const db = await getDb();
  await db
    .update(organizations)
    .set({
      name: input.name.trim().slice(0, 160),
      baseCurrency: input.baseCurrency.toUpperCase(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, ctx.organization.id));
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "ORGANIZATION_UPDATED",
    entityType: "organization",
    entityId: ctx.organization.id,
    description: "Updated organization profile",
    metadata: { name: input.name, baseCurrency: input.baseCurrency },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

async function setIntegrationStatus(
  ctx: AuthContext,
  provider: Provider,
  status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED",
  error: string | null,
) {
  const db = await getDb();
  await db
    .update(integrationConnections)
    .set({
      status,
      lastCheckedAt: new Date(),
      lastError: error,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationConnections.organizationId, ctx.organization.id),
        eq(integrationConnections.provider, provider),
      ),
    );
}

export async function testIntegration(
  ctx: AuthContext,
  provider: Provider,
): Promise<{ connected: boolean; message: string }> {
  requirePermission(ctx, "manage_integrations");
  await ensureIntegrations(ctx.organization.id);

  let connected = false;
  let message = "";
  let status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED" = "NOT_CONFIGURED";

  if (provider === "OPENAI") {
    if (!aiConfigured()) {
      message =
        "OPENAI_API_KEY is not set. Add it to the server environment and restart the application.";
    } else {
      try {
        const response = await fetch("https://api.openai.com/v1/models?limit=1", {
          headers: { Authorization: `Bearer ${env.openaiKey}` },
          signal: AbortSignal.timeout(15_000),
        });
        connected = response.ok;
        status = response.ok ? "CONNECTED" : "ERROR";
        message = response.ok
          ? `OpenAI reachable. Extraction model: ${env.openaiModel}.`
          : `OpenAI returned HTTP ${response.status}. Verify the API key and project permissions.`;
      } catch (error) {
        status = "ERROR";
        message = error instanceof Error ? error.message : "OpenAI connectivity test failed";
      }
    }
  } else if (provider === "PAYPAL") {
    if (!paypalConfigured()) {
      message =
        "PayPal client ID or secret is missing. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.";
    } else {
      const result = await testPaypalConnection();
      connected = result.connected;
      status = result.connected ? "CONNECTED" : "ERROR";
      message = result.message;
    }
  } else {
    if (!supabaseStorageConfigured()) {
      message =
        "Supabase URL or service-role key is missing. Local private storage is being used instead.";
    } else {
      try {
        const response = await fetch(
          `${env.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(env.supabaseBucket)}`,
          {
            headers: {
              Authorization: `Bearer ${env.supabaseServiceKey}`,
              apikey: env.supabaseServiceKey,
            },
            signal: AbortSignal.timeout(15_000),
          },
        );
        connected = response.ok;
        status = response.ok ? "CONNECTED" : "ERROR";
        message = response.ok
          ? `Private bucket "${env.supabaseBucket}" is reachable.`
          : `Supabase Storage returned HTTP ${response.status}. Confirm the bucket exists and is private.`;
      } catch (error) {
        status = "ERROR";
        message =
          error instanceof Error ? error.message : "Supabase connectivity test failed";
      }
    }
  }

  await setIntegrationStatus(ctx, provider, status, connected ? null : message);
  await writeAudit({
    organizationId: ctx.organization.id,
    actor: actorFromContext(ctx),
    action: "INTEGRATION_TESTED",
    entityType: "integration",
    description: `Tested ${providerLabels[provider]} connectivity`,
    metadata: { provider, connected, status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { connected, message };
}

async function withHealthTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getHealthStatus() {
  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  let databaseOk = false;
  let error: string | null = null;
  const startedAt = Date.now();
  try {
    db = await withHealthTimeout(
      getDb(),
      10_000,
      "Database initialization timed out after 10 seconds",
    );
    await withHealthTimeout(
      db.execute(sql`select 1`),
      10_000,
      "Database query timed out after 10 seconds",
    );
    databaseOk = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Database check failed";
    console.error("[health] database check failed", caught);
  }
  console.log(
    `[health] database=${databaseOk ? "ok" : "error"} in ${Date.now() - startedAt}ms`,
  );
  const databaseInfo = await getDatabaseInfo();
  return {
    ok: databaseOk,
    database: databaseOk ? "connected" : "error",
    databaseKind: databaseInfo.kind,
    databaseError: error,
    storage: storageProviderLabel(),
    ai: aiConfigured() ? "configured" : "local fallback",
    paypal: paypalConfigured() ? `configured (${env.paypalEnv})` : "not configured",
    supabaseStorage: supabaseStorageConfigured() ? "configured" : "local fallback",
    timestamp: new Date().toISOString(),
  };
}

export async function assertOrganizationNameAvailable(
  name: string,
  organizationId: string,
): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, name))
    .limit(1);
  if (rows[0] && rows[0].id !== organizationId) {
    throw new ConflictError("An organization with this name already exists");
  }
}

export async function updateOrganizationSafe(
  ctx: AuthContext,
  input: { name: string; baseCurrency: string },
): Promise<void> {
  await assertOrganizationNameAvailable(input.name, ctx.organization.id);
  if (!/^[A-Z]{3}$/i.test(input.baseCurrency)) {
    throw new ValidationError("Base currency must be a 3-letter ISO code");
  }
  await updateOrganization(ctx, input);
}
