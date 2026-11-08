import { getDb } from "@/lib/db";
import { auditLogs, evidenceEvents } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/auth/rbac";
import type { auditActorTypeEnum } from "@/lib/db/schema";

type ActorType = (typeof auditActorTypeEnum.enumValues)[number];

export type AuditActor = {
  type: ActorType;
  id?: string | null;
  label: string;
};

export function actorFromContext(ctx: AuthContext): AuditActor {
  return {
    type: ctx.membership.role === "VENDOR" ? "VENDOR" : "USER",
    id: ctx.user.id,
    label: `${ctx.user.name} <${ctx.user.email}>`,
  };
}

export const systemActor: AuditActor = {
  type: "SYSTEM",
  id: null,
  label: "ReconPay system",
};

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "secret",
  "clientsecret",
  "authorization",
  "apikey",
  "api_key",
  "servicerolekey",
  "accesstoken",
  "refreshtoken",
]);

/** Convert arbitrary metadata to JSON-safe, redacted data before persistence. */
export function sanitizeMetadata(
  value: unknown,
  depth = 0,
): Record<string, unknown> {
  if (depth > 5 || value === null || typeof value !== "object") {
    if (typeof value === "bigint") return { value: value.toString() };
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof raw === "bigint") {
      out[key] = raw.toString();
    } else if (Array.isArray(raw)) {
      out[key] = raw.slice(0, 50).map((entry) => {
        if (typeof entry === "bigint") return entry.toString();
        if (entry && typeof entry === "object") return sanitizeMetadata(entry, depth + 1);
        return entry;
      });
    } else if (raw && typeof raw === "object") {
      out[key] = sanitizeMetadata(raw, depth + 1);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

export async function writeAudit(input: {
  organizationId: string;
  actor: AuditActor;
  action: string;
  entityType?: string;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorType: input.actor.type,
    actorId: input.actor.id ?? null,
    actorLabel: input.actor.label.slice(0, 160),
    action: input.action.slice(0, 80),
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    description: input.description,
    metadata: input.metadata ? sanitizeMetadata(input.metadata) : null,
    ip: input.ip?.slice(0, 64),
    userAgent: input.userAgent?.slice(0, 1000),
  });
}

export async function recordEvidenceEvent(input: {
  organizationId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  description: string;
  actor: AuditActor;
  source: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}): Promise<void> {
  const db = await getDb();
  await db.insert(evidenceEvents).values({
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType.slice(0, 60),
    description: input.description,
    actorType: input.actor.type,
    actorId: input.actor.id ?? null,
    actorLabel: input.actor.label.slice(0, 160),
    source: input.source.slice(0, 60),
    metadata: input.metadata ? sanitizeMetadata(input.metadata) : null,
    occurredAt: input.occurredAt ?? new Date(),
  });
}
