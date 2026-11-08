import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizationMembers,
  organizations,
  sessions,
  users,
} from "@/lib/db/schema";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { generateOpaqueToken, sha256 } from "./tokens";
import type { AuthContext } from "./rbac";

export const SESSION_COOKIE = "rp_session";
const SESSION_TTL_DAYS = 7;

export async function createSession(
  userId: string,
  organizationId: string | null,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const token = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    activeOrganizationId: organizationId,
    expiresAt,
    ip: meta.ip?.slice(0, 64),
    userAgent: meta.userAgent?.slice(0, 1000),
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { token, expiresAt };
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}

async function requestMetadata(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function getAppContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const tokenHash = sha256(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      activeOrganizationId: sessions.activeOrganizationId,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      name: users.name,
      disabled: users.disabled,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.revokedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.disabled) return null;

  const memberships = await db
    .select({
      memberId: organizationMembers.id,
      role: organizationMembers.role,
      vendorId: organizationMembers.vendorId,
      approvalLimitMinor: organizationMembers.approvalLimitMinor,
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      baseCurrency: organizations.baseCurrency,
      isDemo: organizations.isDemo,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId),
    )
    .where(
      and(
        eq(organizationMembers.userId, row.userId),
        eq(organizationMembers.status, "ACTIVE"),
      ),
    );

  if (memberships.length === 0) return null;
  const membership =
    memberships.find((m) => m.organizationId === row.activeOrganizationId) ??
    memberships[0]!;

  if (row.activeOrganizationId !== membership.organizationId) {
    await db
      .update(sessions)
      .set({ activeOrganizationId: membership.organizationId })
      .where(eq(sessions.id, row.sessionId));
  }

  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
  }

  const meta = await requestMetadata();

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
    },
    organization: {
      id: membership.organizationId,
      name: membership.organizationName,
      slug: membership.organizationSlug,
      baseCurrency: membership.baseCurrency,
      isDemo: membership.isDemo,
    },
    membership: {
      id: membership.memberId,
      role: membership.role,
      vendorId: membership.vendorId,
      approvalLimitMinor: membership.approvalLimitMinor,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  };
}

export async function requireAppContext(): Promise<AuthContext> {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requireApiContext(): Promise<AuthContext> {
  const ctx = await getAppContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export async function switchOrganization(organizationId: string): Promise<void> {
  const ctx = await requireApiContext();
  if (ctx.organization.id === organizationId) return;
  const db = await getDb();
  const rows = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, ctx.user.id),
        eq(organizationMembers.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new ForbiddenError("You are not an active member of that organization");
  }
  await db
    .update(sessions)
    .set({ activeOrganizationId: organizationId })
    .where(eq(sessions.id, ctx.sessionId));
}

export async function listUserOrganizations(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId),
    )
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "ACTIVE"),
      ),
    );
}
